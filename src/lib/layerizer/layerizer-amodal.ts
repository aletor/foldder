/**
 * Layerizer — Paso E: completado amodal (opt-in por objeto, generativo).
 *
 * Reconstruye las zonas ocultas/recortadas de un objeto ya extraído (RGBA con alfa real).
 * Es GENERATIVO (Gemini image edit): sólo se invoca cuando el usuario lo marca por objeto.
 * Tras generar, se re-aplica matting para recuperar un alfa limpio y se devuelve un PNG RGBA
 * del mismo tamaño que la capa original (cae en el mismo bbox del montaje).
 */

import sharp from "sharp";
import { runReplicateMatteMask } from "@/lib/layerizer/layerizer-replicate";
import { matteOutputToRgba } from "@/lib/layerizer/layerizer-matte-utils";

const IMAGE_MODEL = "gemini-2.5-flash-image";

async function callGeminiImageEdit(image: Buffer, prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: "image/png", data: image.toString("base64") } },
            { text: prompt },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini amodal failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inline_data?: { data?: string }; inlineData?: { data?: string } }> } }>;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const data = p.inline_data?.data || p.inlineData?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Gemini amodal returned no image");
}

export interface AmodalCompleteArgs {
  /** PNG RGBA del objeto recortado (alfa real). */
  layerRgba: Buffer;
  label: string;
}

/** Completa zonas ocultas. Devuelve PNG RGBA al mismo tamaño que la capa de entrada. */
export async function amodalCompleteLayer(args: AmodalCompleteArgs): Promise<Buffer> {
  const meta = await sharp(args.layerRgba).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (!w || !h) throw new Error("amodal: could not read layer dimensions");

  // El modelo trabaja mejor sobre fondo plano: componer la capa sobre blanco.
  const onWhite = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: args.layerRgba, blend: "over" }])
    .png()
    .toBuffer();

  const prompt = [
    `This image shows a single ${args.label} that is partially occluded or cropped.`,
    "Redraw the COMPLETE object: fill in only the missing / hidden parts so the object looks whole,",
    "keeping every currently visible pixel, color, lighting and texture identical.",
    "Do not add any other objects, text, shadows or background decorations.",
    "Output the whole object on a plain solid white background, same framing and scale.",
  ].join(" ");

  const generated = await callGeminiImageEdit(onWhite, prompt);

  // Normaliza tamaño y re-extrae alfa limpio con matting.
  const normalized = await sharp(generated).resize(w, h, { fit: "fill" }).png().toBuffer();
  const dataUrl = `data:image/png;base64,${normalized.toString("base64")}`;
  const matteOut = await runReplicateMatteMask(dataUrl, 0.9);
  const { rgba } = await matteOutputToRgba(matteOut, normalized, w, h);
  return rgba;
}
