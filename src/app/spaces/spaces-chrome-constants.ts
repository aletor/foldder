import type { LucideIcon } from "lucide-react";
import { Layers, Workflow, Brain, Sparkles } from "lucide-react";
import { NODE_KEYS } from "./node-shortcuts";

/** Alineado con la barra inferior y con el `switch` de teclas del lienzo en `page.tsx`. */
export type EmptyCanvasShortcutNodeType =
  | "freehand"
  | "nanoBanana"
  | "geminiVideo"
  | "vfxGenerator"
  | "indesign";

/** Tras el splash «Bienvenido», si el lienzo sigue vacío: atajos visibles hasta el primer nodo. */
export const EMPTY_CANVAS_SHORTCUT_HINT: {
  label: string;
  keyLabel: string;
  nodeType: EmptyCanvasShortcutNodeType;
}[] = (
  [
    { label: "Vector", nodeType: "freehand" },
    { label: "Image", nodeType: "nanoBanana" },
    { label: "Video", nodeType: "geminiVideo" },
    { label: "VFX", nodeType: "vfxGenerator" },
    { label: "Layout", nodeType: "indesign" },
  ] as const
).map((row) => ({
  ...row,
  keyLabel: NODE_KEYS[row.nodeType].toUpperCase(),
}));

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
