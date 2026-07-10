import type { GenomaDocumentProbeResult } from "@/lib/genoma/studio/document-probe-types";

export async function probeGenomaDocument(
  file: File,
): Promise<{ ok: true; result: GenomaDocumentProbeResult } | { ok: false; message: string }> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/spaces/genoma/document-probe", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep default
    }
    return { ok: false, message };
  }

  const body = (await res.json()) as { ok?: boolean; result?: GenomaDocumentProbeResult };
  if (!body.result) return { ok: false, message: "Respuesta vacía" };
  return { ok: true, result: body.result };
}
