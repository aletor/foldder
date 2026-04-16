/**
 * Descarga una URL remota (p. ej. S3 prefirmada) vía `/api/spaces/proxy` usando POST
 * para no superar límites del query string en GET.
 */
export async function fetchBlobViaSpacesProxy(url: string): Promise<Blob> {
  const res = await fetch("/api/spaces/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) detail = `: ${j.error}`;
    } catch {
      if (res.statusText) detail = `: ${res.statusText}`;
    }
    throw new Error(`proxy ${res.status}${detail}`);
  }
  return res.blob();
}
