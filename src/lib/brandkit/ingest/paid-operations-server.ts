import crypto from "node:crypto";

export function bufferContentSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
