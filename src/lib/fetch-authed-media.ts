/** Añade el modo que vuelve a emitir bytes desde la Function si el redirect firmado no se puede leer. */
export function appendMediaStreamParam(url: string): string {
  if (!url.includes("/api/spaces/s3-file") && !url.includes("/api/spaces/s3-download") && !url.includes("/api/populate-share/")) {
    return url;
  }
  if (url.includes("stream=1")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}stream=1`;
}

/**
 * Lee un medio same-origin. Si la ruta responde 302 a S3 y el navegador no puede seguirlo,
 * reintenta pidiendo el stream por la Function.
 */
export async function fetchAuthedMedia(url: string): Promise<Response> {
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (response.ok || response.status === 401 || response.status === 403 || response.status === 404) {
      return response;
    }
  } catch {
    // El redirect a S3 puede fallar por CORS en fetch(); el stream same-origin no.
  }
  if (url.includes("stream=1")) {
    throw new Error("media_fetch_failed");
  }
  return fetch(appendMediaStreamParam(url), { credentials: "same-origin" });
}
