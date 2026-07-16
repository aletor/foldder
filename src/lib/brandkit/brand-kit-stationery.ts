import type { BrandKitDocument, BrandKitStationeryContact, SourceRef } from "./brand-kit-types";

export type StationeryShowcaseSlice = {
  brandName: string;
  monogram: string;
  logoUrl?: string;
  tagline?: string;
  contactEmail?: string;
};

export type StationeryPieceId = "card" | "letterhead" | "envelope" | "signature" | "cover";

export type StationeryPieceMeta = {
  id: StationeryPieceId;
  label: string;
  sizeLabel: string;
};

export const STATIONERY_PIECES: StationeryPieceMeta[] = [
  { id: "card", label: "Tarjeta de visita", sizeLabel: "85 × 55 mm" },
  { id: "letterhead", label: "Papel de carta", sizeLabel: "A4" },
  { id: "envelope", label: "Sobre DL", sizeLabel: "220 × 110 mm" },
  { id: "signature", label: "Firma de email", sizeLabel: "HTML" },
  { id: "cover", label: "Portada de documento", sizeLabel: "A4" },
];

function websiteFromSources(sources: SourceRef[]): string | undefined {
  const urlSource = sources.find((source) => source.kind === "url" && source.ref.trim());
  if (!urlSource) return undefined;
  try {
    const raw = urlSource.ref.trim();
    const hostname = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./i, "");
    return hostname || undefined;
  } catch {
    return undefined;
  }
}

export function resolveStationeryContact(
  doc: BrandKitDocument,
  showcase?: Pick<StationeryShowcaseSlice, "contactEmail" | "brandName"> | null,
): Required<Pick<BrandKitStationeryContact, "personName" | "role" | "email">> &
  BrandKitStationeryContact {
  const brandName = doc.brandName?.value?.trim() || showcase?.brandName || "Marca";
  const stored = doc.stationeryContact ?? {};
  const website = stored.website?.trim() || websiteFromSources(doc.sources);

  return {
    personName: stored.personName?.trim() || "Nombre Apellido",
    role: stored.role?.trim() || "Cargo / Rol",
    email: stored.email?.trim() || showcase?.contactEmail || `hola@${website ?? "marca.com"}`,
    phone: stored.phone?.trim(),
    address: stored.address?.trim(),
    website,
  };
}

export function stationeryRequirementsMet(doc: BrandKitDocument, presentationMode: boolean): boolean {
  const confirmed = (slotId: keyof BrandKitDocument["slots"]) => {
    const slot = doc.slots[slotId];
    if (!slot?.value) return false;
    if (presentationMode) return Boolean(slot.locked);
    return Boolean(slot.locked || slot.status === "resolved");
  };
  return confirmed("logo") && confirmed("palette") && confirmed("typography");
}

export type BrandKitStationeryView = {
  brandName: string;
  monogram: string;
  logoUrl?: string;
  tagline?: string;
  contact: ReturnType<typeof resolveStationeryContact>;
};

export function buildBrandKitStationeryView(
  doc: BrandKitDocument,
  showcase: StationeryShowcaseSlice | null,
): BrandKitStationeryView | null {
  if (!showcase) return null;
  return {
    brandName: showcase.brandName,
    monogram: showcase.monogram,
    logoUrl: showcase.logoUrl,
    tagline: showcase.tagline,
    contact: resolveStationeryContact(doc, showcase),
  };
}
