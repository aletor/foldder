/**
 * Client-side S3 deletion helpers are intentionally no-ops.
 *
 * Product policy:
 * - removing a document/image from a project only removes the reference;
 * - media is physically deleted when the whole project is deleted, except objects
 *   still referenced by another project or a global dataset catalog entry;
 * - manual object deletion lives in the protected admin manager.
 */

export function fireAndForgetDeleteS3Keys(keys: string[]): void {
  void keys;
}

/** Kept for compatibility with older call sites; it never deletes media. */
export function deleteSupersededS3Key(
  previousKey: unknown,
  nextKey: unknown,
): void {
  void previousKey;
  void nextKey;
}
