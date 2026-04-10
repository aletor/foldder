import type { LucideIcon } from "lucide-react";
import {
  Type,
  Sparkles,
  Film,
  Download,
  Layers,
  Workflow,
  Brain,
} from "lucide-react";

/** Tras el splash «Bienvenido», si el lienzo sigue vacío: atajos visibles hasta el primer nodo. */
export const EMPTY_CANVAS_SHORTCUT_HINT: {
  label: string;
  keyLabel: string;
  Icon: LucideIcon;
}[] = [
  { label: "Prompt", keyLabel: "P", Icon: Type },
  { label: "Nano Banana", keyLabel: "N", Icon: Sparkles },
  { label: "Video", keyLabel: "V", Icon: Film },
  { label: "Export", keyLabel: "E", Icon: Download },
];

export const AUTH_HIGHLIGHTS: {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: Layers,
    title: "Your Entire Creative Stack. Rebuilt.",
    description: "Photoshop, Illustrator, DaVinci… now inside one canvas.",
  },
  {
    icon: Workflow,
    title: "From Tools to Systems",
    description: "Design the full creative process as a connected flow.",
  },
  {
    icon: Brain,
    title: "AI That Works Like You Do",
    description: "Not prompts. Pipelines. Fully visual and reusable.",
  },
  {
    icon: Sparkles,
    title: "Create What Didn't Exist Before",
    description: "Image, video and logic combined into new workflows.",
  },
];
