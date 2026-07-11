import type { LucideIcon } from "lucide-react";
import {
  Aperture,
  CaseSensitive,
  Fingerprint,
  ImageIcon,
  MessageCircle,
  Palette,
  Sparkles,
} from "lucide-react";
import type { SlotId } from "@/lib/brandkit/brand-kit-types";

export const BRAND_KIT_SLOT_ICONS: Partial<Record<SlotId, LucideIcon>> = {
  typography: CaseSensitive,
  palette: Palette,
  logo: Fingerprint,
  essence: Sparkles,
  voice: MessageCircle,
  visualWorld: Aperture,
  gallery: ImageIcon,
};

export function BrandKitSlotIcon({ slotId, size = 18 }: { slotId?: SlotId; size?: number }) {
  const Icon = slotId ? BRAND_KIT_SLOT_ICONS[slotId] : undefined;
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={1.75} className="brandKit-v2-block__icon" aria-hidden />;
}
