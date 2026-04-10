/**
 * Client-side helpers to remove superseded or deleted S3 objects (server route enforces prefix).
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
