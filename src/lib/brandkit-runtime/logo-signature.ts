import { isPhashNearRejected } from "@/lib/brandkit/logo-phash";

/** Firma estable de URL de logo para rechazo L6. */
export function logoUrlSignature(url: string | null | undefined): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed, "https://local.invalid");
    return `${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

export function isLogoSignatureRejected(
  url: string | null | undefined,
  rejectedSignatures: string[] | undefined,
): boolean {
  if (!rejectedSignatures?.length) return false;
  const sig = logoUrlSignature(url);
  if (sig && rejectedSignatures.includes(sig)) return true;
  return false;
}

export function isLogoPhashRejected(
  phash: string | null | undefined,
  rejectedSignatures: string[] | undefined,
): boolean {
  return isPhashNearRejected(phash ?? "", rejectedSignatures);
}
