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
import type { SlotId } from "@/lib/genoma/genoma-types";

export const GENOMA_SLOT_ICONS: Partial<Record<SlotId, LucideIcon>> = {
  typography: CaseSensitive,
  palette: Palette,
  logo: Fingerprint,
  essence: Sparkles,
  voice: MessageCircle,
  visualWorld: Aperture,
  gallery: ImageIcon,
};

export function GenomaSlotIcon({ slotId, size = 18 }: { slotId?: SlotId; size?: number }) {
  const Icon = slotId ? GENOMA_SLOT_ICONS[slotId] : undefined;
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={1.75} className="genoma-v2-block__icon" aria-hidden />;
}
