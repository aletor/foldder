/**
 * Almacén S3 de PDFs fuente de Genoma — clave determinista por contentSha256.
 * Permite re-rasterizar el logo a alta resolución en vectorize sin depender del crop detector.
 */

import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { buildUserAssetObjectKey } from "@/lib/spaces-access-control";

export function buildGenomaSourcePdfObjectKey(userEmail: string, contentSha256: string): string {
  const sha = contentSha256.trim().toLowerCase();
  return buildUserAssetObjectKey({
    userEmail,
    folder: `genoma/sources/${sha.slice(0, 16)}`,
    filename: `${sha}.pdf`,
    unique: false,
  });
}

export async function persistGenomaSourcePdf(
  userEmail: string,
  contentSha256: string,
  buffer: Buffer,
): Promise<string> {
  const key = buildGenomaSourcePdfObjectKey(userEmail, contentSha256);
  try {
    await getFromS3(key);
    return key;
  } catch {
    await uploadBufferToS3Key(key, buffer, "application/pdf");
    return key;
  }
}

export async function loadGenomaSourcePdf(
  userEmail: string,
  contentSha256: string,
): Promise<Buffer | null> {
  const key = buildGenomaSourcePdfObjectKey(userEmail, contentSha256);
  try {
    return await getFromS3(key);
  } catch {
    return null;
  }
}
