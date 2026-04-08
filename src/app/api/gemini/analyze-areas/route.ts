import { NextRequest, NextResponse } from "next/server";
import { parseGeminiUsageMetadata, recordApiUsage } from "@/lib/api-usage";
import sharp from "sharp";

// Cheapest Gemini model with vision capability (text output only)
const VISION_MODEL = "gemini-2.5-flash";

interface AreaChange {
  color: string;
  description: string;
  posX?: number | null;
  posY?: number | null;
  paintData?: string | null;         // data:image/png;base64,...
  assignedColorHex?: string;         // e.g. "#ff0000"
  referenceImageData?: string | null; // data URL of visual reference uploaded by user
}

async function parseImage(image: string): Promise<{ data: string; mimeType: string } | null> {
  if (!image) return null;
  if (image.startsWith("data:")) {
    const [meta, data] = image.split(";base64,");
    return { data, mimeType: meta.split(":")[1] };
  }
  if (image.startsWith("http")) {
    try {
      const res = await fetch(image, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) { console.warn("[analyze-areas] Failed to fetch image:", res.status); return null; }
      const buffer = await res.arrayBuffer();
      const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
      const mimeType =
        headerMime ||
        (image.toLowerCase().includes(".png") ? "image/png" : "image/jpeg");
      return {
        data: Buffer.from(buffer).toString("base64"),
        mimeType,
      };
    } catch (e: any) {
      console.warn("[analyze-areas] Error fetching image URL:", e.message);
      return null;
    }
  }
  return null;
}

// Server-side composite using sharp: base image + colored paint stroke overlays
async function buildMarkedImageWithSharp(
  baseData: string,
  baseType: string,
  changes: AreaChange[]
): Promise<string | null> {
  try {
    const baseBuffer = Buffer.from(baseData, "base64");
    const baseMeta = await sharp(baseBuffer).metadata();
    const W = baseMeta.width || 1280;
    const H = baseMeta.height || 720;

    // Start with the base image (converted to PNG for compositing)
    let composite = sharp(baseBuffer).ensureAlpha();

    const overlays: sharp.OverlayOptions[] = [];

    for (const change of changes) {
      if (!change.paintData || !change.assignedColorHex) continue;
      try {
        const [, b64] = change.paintData.split(";base64,");
        const strokeBuffer = Buffer.from(b64, "base64");

        // Get stroke as raw RGBA pixels, resize to match base
        const { data: raw, info } = await sharp(strokeBuffer)
          .resize(W, H, { fit: "fill" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const hex = change.assignedColorHex.replace("#", "");
        const cr = parseInt(hex.slice(0, 2), 16);
        const cg = parseInt(hex.slice(2, 4), 16);
        const cb = parseInt(hex.slice(4, 6), 16);

        // Tint: replace non-transparent pixels with the assigned color
        for (let i = 0; i < raw.length; i += 4) {
          if (raw[i + 3] > 30) {
            raw[i] = cr; raw[i + 1] = cg; raw[i + 2] = cb;
            raw[i + 3] = Math.min(220, raw[i + 3] * 3);
          }
        }

        // Convert raw back to PNG overlay
        const overlayBuf = await sharp(raw, { raw: { width: W, height: H, channels: 4 } })
          .png()
          .toBuffer();

        overlays.push({ input: overlayBuf, top: 0, left: 0 });
      } catch (e) {
        console.warn("[analyze-areas] Failed to process stroke for", change.color, e);
      }
    }

    if (overlays.length === 0) return null;

    // PNG lossless — avoid JPEG recompression drift between Studio iterations
    const resultBuffer = await composite
      .composite(overlays)
      .png({ compressionLevel: 6, adaptiveFiltering: true })
      .toBuffer();
    console.log("[analyze-areas] Marked image built (PNG lossless), size:", resultBuffer.length);
    return resultBuffer.toString("base64");
  } catch (e: any) {
    console.warn("[analyze-areas] Sharp compositing failed:", e.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { baseImage, colorMapImage, changes } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key not configured" }, { status: 500 });
    if (!changes?.length) return NextResponse.json({ error: "No changes provided" }, { status: 400 });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${apiKey}`;

    const parts: any[] = [];

    // 1. Base image
    const parsedBase = baseImage ? await parseImage(baseImage) : null;
    if (parsedBase) {
      parts.push({ inline_data: { mime_type: parsedBase.mimeType, data: parsedBase.data } });
    }

    // 2. Try to build server-side marked image (base + colored paint overlays via sharp)
    let useMarked = false;
    let markedImgData: string | null = null;
    if (parsedBase) {
      markedImgData = await buildMarkedImageWithSharp(
        parsedBase.data,
        parsedBase.mimeType,
        changes as AreaChange[]
      );
      if (markedImgData) {
        parts.push({ inline_data: { mime_type: "image/png", data: markedImgData } });
        useMarked = true;
        console.log("[analyze-areas] Using marked image approach");
      }
    }

    // Fallback if marked build failed: use color map
    if (!useMarked && colorMapImage) {
      const parsedMap = await parseImage(colorMapImage);
      if (parsedMap) parts.push({ inline_data: { mime_type: parsedMap.mimeType, data: parsedMap.data } });
      console.log("[analyze-areas] Using color map fallback");
    }

    // 3. Build prompt
    const typedChanges = changes as AreaChange[];
    const hasAnyRef = typedChanges.some(c => c.referenceImageData);
    const changeList = typedChanges
      .map(c => {
        const pos = (c.posX != null && c.posY != null)
          ? ` (posición: ${c.posX}% horizontal, ${c.posY}% vertical desde arriba)`
          : "";
        const refNote = c.referenceImageData
          ? ` [TIENE REFERENCIA VISUAL: celda ${c.color.toUpperCase()} en la IMAGEN 3 (grid de referencias)]`
          : "";
        return `- Trazo de color ${c.color}${pos}: ${c.description}${refNote}`;
      })
      .join("\n");

    const imagenDesc = useMarked
      ? "- IMAGEN 2: la imagen original con trazos de pintura en colores sólidos superpuestos. Los trazos indican EXACTAMENTE los elementos que el usuario quiere modificar."
      : "- IMAGEN 2: mapa abstracto de colores sobre fondo negro. Las manchas de color indican las áreas seleccionadas.";

    const imagen3Desc = hasAnyRef
      ? "\n- IMAGEN 3: grid de referencias visuales. Cada celda tiene una cabecera del color del cambio y la imagen de referencia visual que el usuario quiere usar como guía de estilo."
      : "";

    const referenceOutputLine = hasAnyRef
      ? "\nREFERENCIA 3: grid de referencias visuales — cada celda etiquetada con el color del cambio."
      : "";

    const systemPrompt = `Eres un asistente experto en prompts para generación de imágenes con IA.

Se te proporcionan ${hasAnyRef ? "tres" : "dos"} imágenes:
- IMAGEN 1: la imagen original/base
${imagenDesc}${imagen3Desc}

Cambios solicitados:
${changeList}

Tu tarea:
1. Para cada trazo de color, identifica en la IMAGEN 1 el objeto ESPECÍFICO que está ${useMarked ? "DEBAJO/ENCIMA del trazo pintado en la IMAGEN 2" : "en esa posición según el mapa de la IMAGEN 2"}.
2. Sé EXTREMADAMENTE específico. Nunca digas "el sujeto", "la persona", "el objeto". Di: "la persona tumbada en la arena con ropa de baño azul a la izquierda", "el chico rubio en skate", "la hamaca vacía roja sobre la arena", etc.
3. Si un cambio tiene REFERENCIA VISUAL (nota [TIENE REFERENCIA VISUAL] en la lista), añade en esa instrucción: "siguiendo el estilo visual de la celda [COLOR] de la REFERENCIA 3".
4. Genera el prompt con este formato exacto:

REFERENCIA 1: imagen base. Mantén todo lo que no se indica cambiar, conservando composición, iluminación y estilo.
REFERENCIA 2: mapa de colores con áreas de cambio.${referenceOutputLine}

[Para cada cambio: "En el área [color] de la referencia 2 (donde está [descripción muy específica del objeto]): [instrucción][, siguiendo el estilo visual de la celda [COLOR] de la REFERENCIA 3 si aplica]"]

CRÍTICO: El trazo de pintura señala un elemento CONCRETO. Si hay elementos grandes y pequeños en la misma zona, el trazo está sobre el elemento PEQUEÑO/ESPECÍFICO que se quiere cambiar. No elijas el elemento más dominante de la escena.

Devuelve SOLO el prompt, sin texto adicional.`;


    parts.push({ text: systemPrompt });

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.15 },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("[analyze-areas] Gemini status:", response.status, "| marked:", useMarked);
    if (data.error) {
      console.error("[analyze-areas] Gemini error:", JSON.stringify(data.error));
      return NextResponse.json({ error: data.error.message || "Gemini error" }, { status: 500 });
    }

    const text = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || "";
    if (!text) return NextResponse.json({ error: "No text response from AI" }, { status: 500 });

    const usage = parseGeminiUsageMetadata(data);
    if (usage) {
      await recordApiUsage({
        provider: "gemini",
        serviceId: "gemini-analyze",
        route: "/api/gemini/analyze-areas",
        model: VISION_MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });
    } else {
      await recordApiUsage({
        provider: "gemini",
        serviceId: "gemini-analyze",
        route: "/api/gemini/analyze-areas",
        model: VISION_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0.02,
        note: "analyze-areas sin usageMetadata (estimado)",
      });
    }

    return NextResponse.json({
      prompt: text.trim(),
      // Return the marked image so the client uses it as REFERENCIA 2 in generation
      markedImageData: useMarked && markedImgData ? markedImgData : null,
      markedImageMime: useMarked && markedImgData ? "image/png" : null,
    });

  } catch (error: any) {
    console.error("[analyze-areas] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
