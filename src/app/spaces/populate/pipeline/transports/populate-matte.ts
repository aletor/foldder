"use client";

/**
 * Transporte cliente para Background Remover dentro de una tubería de Populate.
 * Llama a `/api/spaces/matte` (misma ruta que el nodo en el lienzo).
 */

export async function matteImageForPopulate(args: {
  image: string;
  threshold?: number;
  expansion?: number;
  feather?: number;
}): Promise<{ rgbaImage: string; rgbaUrl?: string; rgbaS3Key?: string }> {
  const res = await fetch("/api/spaces/matte", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: args.image,
      threshold: args.threshold ?? 0.9,
      expansion: args.expansion ?? 0,
      feather: args.feather ?? 0.6,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    rgba_image?: string;
    rgba_url?: string;
    rgba_s3_key?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json?.error || `matte_failed_${res.status}`);
  }
  const rgbaImage = typeof json.rgba_image === "string" ? json.rgba_image.trim() : "";
  if (!rgbaImage) throw new Error("Background Remover no devolvió un recorte.");
  const rgbaUrl = typeof json.rgba_url === "string" ? json.rgba_url.trim() : "";
  const rgbaS3Key = typeof json.rgba_s3_key === "string" ? json.rgba_s3_key.trim() : "";
  return {
    rgbaImage,
    rgbaUrl: rgbaUrl || undefined,
    rgbaS3Key: rgbaS3Key || undefined,
  };
}
