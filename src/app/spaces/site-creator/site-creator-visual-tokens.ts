/** Tokens visuales Site Creator (gramática hover / selección / contexto). */

export const SC_VISUAL = {
  selection: "#A8FF32",
  selectionFill: "rgba(168, 255, 50, 0.06)",
  selectionGlow: "rgba(168, 255, 50, 0.18)",
  hover: "rgba(235, 242, 248, 0.78)",
  context: "rgba(168, 255, 50, 0.36)",
  chipBg: "rgba(13, 19, 28, 0.94)",
  chipBorder: "rgba(255, 255, 255, 0.12)",
  chipFg: "rgba(255, 255, 255, 0.92)",
  chipMuted: "rgba(255, 255, 255, 0.45)",
  marquee: "rgba(143, 204, 255, 0.90)",
  marqueeFill: "rgba(143, 204, 255, 0.08)",
  veil: "rgba(0, 0, 0, 0.07)",
  cornerLen: 8,
} as const;

export type SiteCreatorOutlineRole =
  | "hover-layer"
  | "hover-container"
  | "selection"
  | "context-ancestor"
  | "multi-hull";
