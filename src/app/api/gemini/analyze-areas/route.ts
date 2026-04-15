import { NextRequest, NextResponse } from "next/server";
import { parseGeminiUsageMetadata, recordApiUsage } from "@/lib/api-usage";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import sharp from "sharp";

// Cheapest Gemini model with vision capability (text output only)
const VISION_MODEL = "gemini-2.5-flash";

interface AreaChange {
  color: string;
  description: string;
  posX?: number | null;
  posY?: number | null;
  bboxX1?: number | null;
  bboxY1?: number | null;
  bboxX2?: number | null;
  bboxY2?: number | null;
  areaPct?: number | null;
  quadrant?: string | null;
  paintData?: string | null;
  assignedColorHex?: string;
  referenceImageData?: string | null;
  isGlobal?: boolean;
}

function buildSpatialDescription(c: AreaChange): string {
  const parts: string[] = [];

  if (c.quadrant) parts.push(c.quadrant);

  if (c.posX != null && c.posY != null) {
    parts.push(`centroide ${c.posX}% desde la izquierda, ${c.posY}% desde arriba`);
  }

  if (c.bboxX1 != null && c.bboxY1 != null && c.bboxX2 != null && c.bboxY2 != null) {
    parts.push(`bbox del ${c.bboxX1}%-${c.bboxX2}% horizontal, ${c.bboxY1}%-${c.bboxY2}% vertical`);
  }

  if (c.areaPct != null) {
    if (c.areaPct < 0.15) {
      parts.push(
        "trazo mínimo; la forma y posición exactas son las del color en REF 2 (los % son orientativos)",
      );
    } else {
      const sizeLabel =
        c.areaPct < 3 ? "zona muy pequeña" : c.areaPct < 10 ? "zona pequeña" : c.areaPct < 30 ? "zona mediana" : "zona amplia";
      parts.push(`${sizeLabel}, ~${c.areaPct}% de la imagen`);
    }
  }

  return parts.length > 0 ? ` (${parts.join('; ')})` : '';
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
    const composite = sharp(baseBuffer).ensureAlpha();

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
    const typedChanges = changes as AreaChange[];
    const zoneChanges = typedChanges.filter((c) => !c.isGlobal);
    const globalChanges = typedChanges.filter((c) => c.isGlobal);
    const globalOnly = typedChanges.length > 0 && globalChanges.length === typedChanges.length;
    const hasZones = zoneChanges.length > 0;

    // 1. Base image
    const parsedBase = baseImage ? await parseReferenceImageForGemini(baseImage) : null;
    if (parsedBase) {
      parts.push({ inline_data: { mime_type: parsedBase.mimeType, data: parsedBase.data } });
    }

    // 2. Marked image / map — solo para cambios por zona (trazos). Los globales no llevan máscara.
    let useMarked = false;
    let markedImgData: string | null = null;
    if (parsedBase && hasZones) {
      markedImgData = await buildMarkedImageWithSharp(
        parsedBase.data,
        parsedBase.mimeType,
        zoneChanges as AreaChange[]
      );
      if (markedImgData) {
        parts.push({ inline_data: { mime_type: "image/png", data: markedImgData } });
        useMarked = true;
        console.log("[analyze-areas] Using marked image approach (zones)");
      }
    }

    // Fallback si hay zonas pero sharp falló: mapa de color del cliente (no duplicar base en modo solo-global)
    if (!useMarked && hasZones && colorMapImage) {
      const parsedMap = await parseReferenceImageForGemini(colorMapImage);
      if (parsedMap) {
        parts.push({ inline_data: { mime_type: parsedMap.mimeType, data: parsedMap.data } });
        console.log("[analyze-areas] Using color map fallback");
      }
    }

    // 3. Prompt
    const hasAnyRef = typedChanges.some((c) => c.referenceImageData);

    let systemPrompt: string;

    if (globalOnly) {
      const changeList = globalChanges
        .map((c) => `- ${c.description.trim()}`)
        .join("\n");
      systemPrompt = `Eres un asistente experto en prompts para edición de imágenes con IA.

Se te proporciona UNA sola imagen: la escena original (REFERENCIA 1).

Cambios solicitados — aplican a TODA la imagen (iluminación, hora del día, atmósfera, color general, cielo, ambiente):
${changeList}

Tu tarea:
1. Redacta UN único prompt de edición claro y detallado para un modelo de imagen. Describe cómo debe verse la escena final (p. ej. escena nocturna, luz de luna, farolas, sombras profundas, ventanas iluminadas, etc.).
2. Si el usuario pide "de noche", "atardecer", etc., sé explícito sobre la luz, las fuentes de luz, el cielo y el balance de color; no te limites a una frase vaga.
3. Mantén la composición y los sujetos reconocibles salvo que el cambio global los altere de forma inevitable (p. ej. siluetas de noche).

Devuelve SOLO el prompt, sin texto adicional.`;
    } else {
      const changeList = typedChanges
        .map((c) => {
          if (c.isGlobal) {
            return `- CAMBIO GLOBAL (toda la escena): ${c.description.trim()}`;
          }
          const spatial = buildSpatialDescription(c);
          const refNote = c.referenceImageData
            ? ` [TIENE REFERENCIA VISUAL: celda ${c.color.toUpperCase()} en la IMAGEN 3 (grid de referencias)]`
            : "";
          return `- Área / trazo ${c.color}${spatial}: ${c.description}${refNote}`;
        })
        .join("\n");

      const zoneColorNames = zoneChanges.map((c) => c.color).join(", ");
      const zoneIntegrityBlock =
        zoneChanges.length > 0
          ? `

OBLIGATORIO — INTEGRIDAD DE ZONAS: En «Cambios solicitados» hay exactamente ${zoneChanges.length} zona(s) con trazo (${zoneColorNames}). Tu prompt final DEBE incluir un párrafo o bloque explícito por CADA color de esa lista (mismo nombre de color que en la lista). NO omitas ninguna zona aunque el texto sea largo; NO resumas en una sola frase varias zonas. Si falta una zona en el texto, la edición fallará en el espacio (p. ej. un objeto aparecerá donde no toca).`
          : "";

      const imagenDesc = useMarked
        ? "- IMAGEN 2: la imagen original con trazos de pintura en colores sólidos superpuestos. Los trazos indican EXACTAMENTE los elementos que el usuario quiere modificar."
        : hasZones
          ? "- IMAGEN 2: mapa abstracto de colores sobre fondo negro. Las manchas de color indican las áreas seleccionadas."
          : "";

      const imagen3Desc = hasAnyRef
        ? "\n- IMAGEN 3: grid de referencias visuales. Cada celda tiene una cabecera del color del cambio y la imagen de referencia visual que el usuario quiere usar como guía de estilo."
        : "";

      const referenceOutputLine = hasAnyRef
        ? "\nREFERENCIA 3: grid de referencias visuales — cada celda etiquetada con el color del cambio."
        : "";

      const imageCountHint = hasAnyRef ? "tres" : hasZones ? "dos" : "una";
      const imageList =
        hasZones && hasAnyRef
          ? `- IMAGEN 1: la imagen original/base
${imagenDesc}${imagen3Desc}`
          : hasZones
            ? `- IMAGEN 1: la imagen original/base
${imagenDesc}`
            : `- IMAGEN 1: la imagen original/base`;

      systemPrompt = `Eres un asistente experto en prompts para generación de imágenes con IA.

Se te proporcionan ${imageCountHint} imágenes:
${imageList}

Cambios solicitados:
${changeList}
${zoneIntegrityBlock}

PRIORIDAD (zonas con trazo / mapa de color):
- REF 2 define DÓNDE editar. Los porcentajes y cuadrantes son APOYO; si discrepan con lo visible en el trazo de ese color en REF 2, prevalece REF 2 (forma y posición del color). El modelo de imagen no debe contradecir el trazo.
- Izquierda y derecha: en fotos y retratos usa SIEMPRE el marco de la imagen (vista de frente): "lado izquierdo del encuadre", "tercio derecho del cuadro". NO uses "ojo izquierdo/derecho del sujeto" ni anatomía ambigua si choca con el trazo. Si el usuario escribió "ojo izquierdo" pero el trazo cae en el otro lado del rostro, prioriza el TRAZO y describe la zona como posición en el encuadre.

DATOS ESPACIALES que recibes por zona (úsalos TODOS en el prompt de salida para máxima precisión):
- **cuadrante**: sector semántico de la imagen (p.ej. "tercio superior-izquierdo", "centro de la imagen").
- **centroide**: punto central del trazo en % desde izquierda y desde arriba.
- **bbox**: rectángulo envolvente del trazo (rango horizontal y vertical en %).
- **tamaño relativo**: superficie pintada como % del total de la imagen + etiqueta (muy pequeña / pequeña / mediana / amplia).

Tu tarea:
1. Para cada cambio que NO sea global, identifica el elemento bajo el trazo ${useMarked ? "en la IMAGEN 2" : "del mapa en la IMAGEN 2"} y redacta la instrucción incluyendo:
   a) "En la zona del trazo [color] en REF 2"
   b) cuadrante ("ubicada en el tercio …")
   c) centroide y bbox ("centroide ~X% desde la izquierda, ~Y% desde arriba; abarcando del X1%-X2% horizontal, Y1%-Y2% vertical")
   d) tamaño ("zona pequeña / mediana / amplia, ~N% de la imagen")
   e) la acción a realizar.
2. Para cada CAMBIO GLOBAL, integra la instrucción como afectación a toda la escena (luz, ambiente, hora del día), sin limitarla a una máscara.
3. En zonas, sé específico respecto al PLANO (encuadre), no solo anatomía del personaje.
4. Si un cambio tiene REFERENCIA VISUAL (nota [TIENE REFERENCIA VISUAL] en la lista), añade: "siguiendo el estilo visual de la celda [COLOR] de la REFERENCIA 3".
5. Genera el prompt con este formato exacto:

REFERENCIA 1: imagen base. Mantén todo lo que no se indica cambiar, conservando composición donde aplique.
REFERENCIA 2: zonas marcadas en color (trazos reales del usuario) — respetar la posición, forma y extensión espacial de cada trazo al aplicar el cambio.${referenceOutputLine}

[Para zonas: ancla con cuadrante + centroide + bbox + tamaño + acción. Si el lenguaje natural del usuario y el trazo discrepan en izquierda/derecha, manda la versión alineada al trazo.]
[Para globales: párrafos sobre iluminación/atmósfera de toda la escena.]

CRÍTICO: El trazo señala el sitio exacto y su extensión. Si descripción y trazo discrepan, gana el trazo y el encuadre. Incluye SIEMPRE cuadrante, centroide, bbox y tamaño en cada instrucción de zona.
ANTES DE ENVIAR: cuenta las zonas con trazo en tu respuesta; deben ser exactamente ${zoneChanges.length} (una por color: ${zoneColorNames || "N/A"}).

SALIDA DEL MODELO DE IMAGEN (obligatorio al final de tu prompt): Añade un párrafo que indique que la imagen final NO debe reproducir trazos de color, círculos de guía, líneas de delineación ni marcas superpuestas de REF 2; esas formas son solo referencia espacial y el resultado debe verse limpio y fotorrealista.

Devuelve SOLO el prompt, sin texto adicional.`;
    }


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
