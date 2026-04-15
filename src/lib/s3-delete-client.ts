/**
 * Client-side helpers to delete S3 objects under `knowledge-files/` (server route enforces prefix).
 *
 * Política del producto: no borrar objetos al sustituir generaciones o quitar una imagen del lienzo;
 * los assets se eliminan en bloque al borrar el proyecto (`DELETE /api/spaces` + `deleteFromS3`).
 * Estas funciones se mantienen por si en el futuro se expone un “papelera / purge” explícito.
 */

const PREFIX = "knowledge-files/";

export function fireAndForgetDeleteS3Keys(keys: string[]): void {
  const valid = keys.filter((k) => typeof k === "string" && k.startsWith(PREFIX));
  if (valid.length === 0) return;
  void fetch("/api/spaces/s3-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys: [...new Set(valid)] }),
  }).catch(() => {});
}

/** After replacing `data.s3Key` with a new upload, delete the old object if it is no longer referenced. */
export function deleteSupersededS3Key(
  previousKey: unknown,
  nextKey: unknown,
): void {
  if (typeof previousKey !== "string" || !previousKey.startsWith(PREFIX)) return;
  if (typeof nextKey === "string" && nextKey === previousKey) return;
  fireAndForgetDeleteS3Keys([previousKey]);
}
