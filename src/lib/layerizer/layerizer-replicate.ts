/**
 * Layerizer — matting vía Replicate (host actual). Reutiliza el modelo de /api/spaces/matte.
 * Devuelve la máscara (alfa del sujeto) del recorte que se le pasa. NO genera píxeles.
 */

import Replicate from "replicate";

/** Mismo modelo y versión que el Background Remover existente. */
const MATTE_MODEL =
  "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

/**
 * Ejecuta matting sobre una imagen (data URL o URL) y devuelve el PNG de la máscara
 * en escala de grises (blanco = sujeto). El llamador la redimensiona/recorta según necesite.
 */
export async function runReplicateMatteMask(
  imageInput: string,
  threshold = 0.9,
): Promise<Buffer> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not configured");
  const replicate = new Replicate({ auth: token });

  const output = await replicate.run(MATTE_MODEL, {
    input: { image: imageInput, threshold: Number(threshold), reverse: false },
  });
  const maskUrl = Array.isArray(output) ? output[0] : output?.toString();
  if (!maskUrl) throw new Error("Replicate matte returned no mask");

  const res = await fetch(String(maskUrl), { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Mask download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
