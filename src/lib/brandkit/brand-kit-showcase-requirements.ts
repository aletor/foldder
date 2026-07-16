import type { BrandKitDocument, GalleryValue, SlotId } from "./brand-kit-types";
import { resolveShowcaseGalleryImage } from "./brand-kit-gallery-image-state";

export type ShowcaseRequirementId =
  | "logo"
  | "palette"
  | "typography"
  | "essence_or_voice"
  | "gallery_image";

export type ShowcaseRequirement = {
  id: ShowcaseRequirementId;
  label: string;
  met: boolean;
};

function slotConfirmed(doc: BrandKitDocument, slotId: SlotId, presentationMode: boolean): boolean {
  const slot = doc.slots[slotId];
  if (!slot?.value) return false;
  if (presentationMode) return Boolean(slot.locked);
  return Boolean(slot.locked || slot.status === "resolved");
}

function hasApprovedGalleryImage(doc: BrandKitDocument, presentationMode: boolean): boolean {
  const gallerySlot = doc.slots.gallery;
  if (presentationMode && !gallerySlot?.locked) return false;
  const gallery = gallerySlot?.value as GalleryValue | undefined;
  if (!gallery) return false;
  const url = resolveShowcaseGalleryImage(gallery, Boolean(gallerySlot?.locked));
  if (!url) return false;
  const approved = gallery.generated?.some(
    (item) => item.previewUrl && item.verdict !== "down" && (item.userApproved || gallerySlot?.locked),
  );
  return Boolean(approved || (gallerySlot?.locked && url));
}

export function resolveShowcaseRequirements(
  doc: BrandKitDocument,
  presentationMode: boolean,
): ShowcaseRequirement[] {
  return [
    {
      id: "logo",
      label: "Logo confirmado",
      met: slotConfirmed(doc, "logo", presentationMode),
    },
    {
      id: "palette",
      label: "Paleta confirmada",
      met: slotConfirmed(doc, "palette", presentationMode),
    },
    {
      id: "typography",
      label: "Tipografía confirmada",
      met: slotConfirmed(doc, "typography", presentationMode),
    },
    {
      id: "essence_or_voice",
      label: "Esencia o voz confirmada",
      met:
        slotConfirmed(doc, "essence", presentationMode) || slotConfirmed(doc, "voice", presentationMode),
    },
    {
      id: "gallery_image",
      label: "Imagen aprobada para aplicaciones",
      met: hasApprovedGalleryImage(doc, presentationMode),
    },
  ];
}

export function showcaseRequirementsMet(requirements: ShowcaseRequirement[]): boolean {
  return requirements.every((item) => item.met);
}

export function showcaseRequirementsProgress(requirements: ShowcaseRequirement[]): {
  met: number;
  total: number;
} {
  const met = requirements.filter((item) => item.met).length;
  return { met, total: requirements.length };
}
