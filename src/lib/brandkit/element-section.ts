import type { ElementKey, SectionId } from "./types";
import { BRANDKIT_REF_CATEGORIES } from "./types";

export function elementKeyToSection(key: ElementKey): SectionId | null {
  if (key.startsWith("logo.")) return "logo";
  if (key.startsWith("palette.")) return "palette";
  if (key.startsWith("typography.")) return "typography";
  if (key.startsWith("messages.")) return "messages";
  if (key === "tone") return "tone";
  for (const category of BRANDKIT_REF_CATEGORIES) {
    if (key === `references.${category}.rule` || key.startsWith(`references.${category}.item.`)) {
      return `references.${category}`;
    }
  }
  return null;
}

export function sectionLabelEs(section: SectionId): string {
  if (section === "logo") return "Logo";
  if (section === "palette") return "Paleta";
  if (section === "typography") return "Tipografía";
  if (section === "messages") return "Mensajes";
  if (section === "tone") return "Tono";
  if (section.startsWith("references.")) {
    const cat = section.replace("references.", "");
    const labels: Record<string, string> = {
      people: "Personas",
      textures: "Texturas",
      objects: "Objetos",
      environment: "Entornos",
      protagonist: "Protagonista",
    };
    return labels[cat] ?? cat;
  }
  return section;
}
