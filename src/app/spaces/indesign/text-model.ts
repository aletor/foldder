/**
 * Fuente de verdad del texto: Story + TextFrame (geometría).
 * Cada SpanNode puede tener overrides de estilo para rich text (negrita, cursiva, etc.).
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
  paragraphIndent: number;
  fontKerning: "auto" | "none";
  fontVariantCaps: "normal" | "small-caps";
  textUnderline: boolean;
  textStrikethrough: boolean;
  fontFeatureSettings: string;
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
  paragraphIndent: 0,
  fontKerning: "auto",
  fontVariantCaps: "normal",
  textUnderline: false,
  textStrikethrough: false,
  fontFeatureSettings: '"kern" 1, "liga" 1, "calt" 1',
};

/** Per-span style overrides. Only set properties override Story.typography. */
export type SpanStyle = {
  fontWeight?: string;
  fontStyle?: string;
  textUnderline?: boolean;
  textStrikethrough?: boolean;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  letterSpacing?: number;
  /** Hipervínculo (persistido como <a href> en HTML). */
  linkHref?: string;
};

export type SpanNode = {
  id: string;
  text: string;
  style?: SpanStyle;
};

export type ParagraphNode = {
  type: "paragraph";
  id: string;
  spans: SpanNode[];
};

export type StoryNode = ParagraphNode;

export type Story = {
  id: string;
  content: StoryNode[];
  frames: string[];
  typography: Typography;
};

export type TextFrame = {
  id: string;
  storyId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
  opacity?: number;
};

/** Resolve effective typography for a span, merging overrides onto base. */
export function resolveSpanTypography(base: Typography, span: SpanNode): Typography {
  if (!span.style) return base;
  const s = span.style;
  return {
    ...base,
    ...(s.fontWeight != null ? { fontWeight: s.fontWeight } : {}),
    ...(s.fontStyle != null ? { fontStyle: s.fontStyle } : {}),
    ...(s.textUnderline != null ? { textUnderline: s.textUnderline } : {}),
    ...(s.textStrikethrough != null ? { textStrikethrough: s.textStrikethrough } : {}),
    ...(s.fontSize != null ? { fontSize: s.fontSize } : {}),
    ...(s.color != null ? { color: s.color } : {}),
    ...(s.fontFamily != null ? { fontFamily: s.fontFamily } : {}),
    ...(s.letterSpacing != null ? { letterSpacing: s.letterSpacing } : {}),
  };
}

/** Serialización estable para medición y rangos [start,end). */
export function serializeStoryContent(nodes: StoryNode[]): string {
  return nodes
    .filter((n): n is ParagraphNode => n.type === "paragraph")
    .map((p) => p.spans.map((s) => s.text).join(""))
    .join("\n");
}

/**
 * Flat list of styled text runs from Story content, suitable for layout.
 * Each run is { text, style? } where text never contains \n.
 * Paragraph breaks are represented as { text: "\n" }.
 */
export type FlatRun = { text: string; style?: SpanStyle };

export function flattenStoryContent(nodes: StoryNode[]): FlatRun[] {
  const runs: FlatRun[] = [];
  const paragraphs = nodes.filter((n): n is ParagraphNode => n.type === "paragraph");
  for (let pi = 0; pi < paragraphs.length; pi++) {
    if (pi > 0) runs.push({ text: "\n" });
    for (const span of paragraphs[pi]!.spans) {
      if (span.text.length > 0) {
        runs.push({ text: span.text, style: span.style });
      }
    }
  }
  return runs;
}

export function plainTextToStoryNodes(plain: string): StoryNode[] {
  const parts = plain.split("\n");
  return parts.map((line, i) => ({
    type: "paragraph" as const,
    id: `p_${i}_${Math.random().toString(36).slice(2, 7)}`,
    spans: [{ id: `s_${i}_${Math.random().toString(36).slice(2, 7)}`, text: line }],
  }));
}

/**
 * Convert HTML from a contentEditable to StoryNodes preserving inline styles.
 * Handles <b>, <strong>, <i>, <em>, <u>, <s>, <a href>, <span style="...">.
 */
export function htmlToStoryNodes(html: string): StoryNode[] {
  if (typeof document === "undefined") return plainTextToStoryNodes(html);
  const container = document.createElement("div");
  container.innerHTML = html;

  const paragraphs: ParagraphNode[] = [];
  const blocks = container.childNodes.length === 0
    ? [container]
    : Array.from(container.childNodes);

  function extractSpans(node: Node): SpanNode[] {
    const spans: SpanNode[] = [];
    function walk(n: Node, inherited: SpanStyle) {
      if (n.nodeType === Node.TEXT_NODE) {
        const text = n.textContent ?? "";
        if (text.length > 0) {
          const hasStyle = Object.keys(inherited).length > 0;
          spans.push({
            id: uid("s"),
            text,
            ...(hasStyle ? { style: { ...inherited } } : {}),
          });
        }
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const style: SpanStyle = { ...inherited };
      if (tag === "b" || tag === "strong") style.fontWeight = "bold";
      if (tag === "i" || tag === "em") style.fontStyle = "italic";
      if (tag === "u") style.textUnderline = true;
      if (tag === "s" || tag === "strike" || tag === "del") style.textStrikethrough = true;
      if (tag === "a") {
        const raw = el.getAttribute("href") ?? "";
        const href = sanitizeStoryLinkHref(raw);
        if (href) style.linkHref = href;
      }
      if (el.style.fontWeight) style.fontWeight = el.style.fontWeight;
      if (el.style.fontStyle) style.fontStyle = el.style.fontStyle;
      if (el.style.color) style.color = el.style.color;
      if (el.style.fontSize) {
        const px = parseFloat(el.style.fontSize);
        if (Number.isFinite(px) && px > 0) style.fontSize = px;
      }
      for (const child of Array.from(n.childNodes)) walk(child, style);
    }
    walk(node, {});
    return spans;
  }

  function processBlock(node: Node) {
    const spans = extractSpans(node);
    if (spans.length === 0) spans.push({ id: uid("s"), text: "" });
    paragraphs.push({
      type: "paragraph",
      id: uid("p"),
      spans,
    });
  }

  for (const block of blocks) {
    if (block.nodeType === Node.TEXT_NODE) {
      const text = block.textContent ?? "";
      const lines = text.split("\n");
      for (const line of lines) {
        paragraphs.push({
          type: "paragraph",
          id: uid("p"),
          spans: [{ id: uid("s"), text: line }],
        });
      }
      continue;
    }
    const el = block as HTMLElement;
    const tag = el.tagName?.toLowerCase();
    if (tag === "br") {
      paragraphs.push({
        type: "paragraph",
        id: uid("p"),
        spans: [{ id: uid("s"), text: "" }],
      });
      continue;
    }
    if (tag === "div" || tag === "p") {
      processBlock(el);
    } else {
      processBlock(el);
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push({
      type: "paragraph",
      id: uid("p"),
      spans: [{ id: uid("s"), text: "" }],
    });
  }

  return paragraphs;
}

/** Convert StoryNodes to HTML string for contentEditable. */
export function storyNodesToHtml(nodes: StoryNode[], baseTypo: Typography): string {
  return nodes
    .filter((n): n is ParagraphNode => n.type === "paragraph")
    .map((p) => {
      const inner = p.spans
        .map((span) => {
          const text = escapeHtml(span.text);
          if (!span.style) return text;
          const s = span.style;
          const tags: string[] = [];
          const closeTags: string[] = [];
          if (s.fontWeight === "bold" || s.fontWeight === "700") {
            tags.push("<b>");
            closeTags.unshift("</b>");
          }
          if (s.fontStyle === "italic") {
            tags.push("<i>");
            closeTags.unshift("</i>");
          }
          if (s.textUnderline) {
            tags.push("<u>");
            closeTags.unshift("</u>");
          }
          if (s.textStrikethrough) {
            tags.push("<s>");
            closeTags.unshift("</s>");
          }
          const inlineStyles: string[] = [];
          if (s.fontSize != null && s.fontSize !== baseTypo.fontSize) {
            inlineStyles.push(`font-size:${s.fontSize}px`);
          }
          if (s.color != null && s.color !== baseTypo.color) {
            inlineStyles.push(`color:${s.color}`);
          }
          if (s.fontFamily != null && s.fontFamily !== baseTypo.fontFamily) {
            inlineStyles.push(`font-family:${s.fontFamily}`);
          }
          if (inlineStyles.length > 0) {
            tags.push(`<span style="${inlineStyles.join(";")}">`);
            closeTags.unshift("</span>");
          }
          let piece = tags.join("") + text + closeTags.join("");
          if (s.linkHref) {
            const href = sanitizeStoryLinkHref(s.linkHref);
            if (href) {
              piece = `<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer">${piece}</a>`;
            }
          }
          return piece;
        })
        .join("");
      return `<div>${inner || "<br>"}</div>`;
    })
    .join("");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Evita javascript:/data: y normaliza URLs sueltas para guardar en historia. */
export function sanitizeStoryLinkHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) return "";
  if (/^https?:\/\//i.test(t) || /^mailto:/i.test(t) || t.startsWith("#") || t.startsWith("/") || t.startsWith("./")) return t;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) return `https://${t}`;
  return t;
}

/**
 * Slice story content by character range, preserving span styles.
 * Used by the threading/layout system to assign content ranges to frames.
 */
export function sliceStoryContent(nodes: StoryNode[], start: number, end: number): StoryNode[] {
  const flat = flattenStoryContent(nodes);
  let pos = 0;
  const result: { text: string; style?: SpanStyle }[] = [];
  for (const run of flat) {
    const runEnd = pos + run.text.length;
    if (runEnd <= start) { pos = runEnd; continue; }
    if (pos >= end) break;
    const sliceStart = Math.max(0, start - pos);
    const sliceEnd = Math.min(run.text.length, end - pos);
    result.push({ text: run.text.slice(sliceStart, sliceEnd), style: run.style });
    pos = runEnd;
  }

  const paragraphs: ParagraphNode[] = [];
  let currentSpans: SpanNode[] = [];
  for (const r of result) {
    if (r.text === "\n") {
      paragraphs.push({ type: "paragraph", id: uid("p"), spans: currentSpans.length > 0 ? currentSpans : [{ id: uid("s"), text: "" }] });
      currentSpans = [];
      continue;
    }
    const lines = r.text.split("\n");
    for (let li = 0; li < lines.length; li++) {
      if (li > 0) {
        paragraphs.push({ type: "paragraph", id: uid("p"), spans: currentSpans.length > 0 ? currentSpans : [{ id: uid("s"), text: "" }] });
        currentSpans = [];
      }
      if (lines[li]!.length > 0) {
        currentSpans.push({ id: uid("s"), text: lines[li]!, ...(r.style ? { style: r.style } : {}) });
      }
    }
  }
  if (currentSpans.length > 0 || paragraphs.length === 0) {
    paragraphs.push({ type: "paragraph", id: uid("p"), spans: currentSpans.length > 0 ? currentSpans : [{ id: uid("s"), text: "" }] });
  }
  return paragraphs;
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}
