/**
 * Fuente de verdad del texto: Story + TextFrame (geometría).
 * Fabric solo renderiza el resultado de layoutStory().
 */

export type Typography = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  align: "left" | "center" | "right" | "justify";
  color: string;
  fontWeight: string;
  fontStyle: string;
};

export const DEFAULT_TYPOGRAPHY: Typography = {
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 16,
  lineHeight: 1.25,
  letterSpacing: 0,
  align: "left",
  color: "#111827",
  fontWeight: "normal",
  fontStyle: "normal",
};

/** Span preparado para overrides futuros (negrita, color por tramo). */
export type SpanNode = {
  id: string;
  text: string;
};

export type ParagraphNode = {
  type: "paragraph";
  id: string;
  spans: SpanNode[];
};

export type StoryNode = ParagraphNode;

export type Story = {
  id: string;
  /** Bloques con estilo propio (ahora uniforme vía Story.typography en layout). */
  content: StoryNode[];
  /** IDs de TextFrame en orden de flujo. */
  frames: string[];
  typography: Typography;
};

/** Solo geometría; el texto visible lo calcula el layout. */
export type TextFrame = {
  id: string;
  storyId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
};

/** Serialización estable para medición y rangos [start,end). */
export function serializeStoryContent(nodes: StoryNode[]): string {
  return nodes
    .filter((n): n is ParagraphNode => n.type === "paragraph")
    .map((p) => p.spans.map((s) => s.text).join(""))
    .join("\n");
}

export function plainTextToStoryNodes(plain: string): StoryNode[] {
  const parts = plain.split("\n");
  return parts.map((line, i) => ({
    type: "paragraph" as const,
    id: `p_${i}_${Math.random().toString(36).slice(2, 7)}`,
    spans: [{ id: `s_${i}_${Math.random().toString(36).slice(2, 7)}`, text: line }],
  }));
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}
