"use client";

/**
 * Transporte cliente para el executor de Image Describer dentro de una tubería de Populate.
 * Llama a la MISMA ruta que el nodo Media Describer (`/api/spaces/describe`), que factura por
 * su propio gate de wallet. Aislado en su módulo para poder mockearlo en tests del executor.
 */

export async function describeImageForPopulate(args: {
  url: string;
  s3Key?: string;
}): Promise<string> {
  const res = await fetch("/api/spaces/describe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: args.url, type: "image", s3Key: args.s3Key }),
  });
  const json = (await res.json().catch(() => ({}))) as { description?: string; error?: string };
  if (!res.ok) {
    throw new Error(json?.error || `describe_failed_${res.status}`);
  }
  const text = typeof json.description === "string" ? json.description.trim() : "";
  if (!text) throw new Error("Image Describer devolvió una descripción vacía.");
  return text;
}
