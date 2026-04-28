/**
 * Fuente de verdad del texto: Story + TextFrame (geometría).
 * Cada SpanNode puede tener overrides de estilo para rich text (negrita, cursiva, etc.).
 */

import { DEFAULT_DOCUMENT_FONT_FAMILY, DEFAULT_DOCUMENT_FONT_WEIGHT } from "../freehand/google-fonts";

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
  fontFamily: DEFAULT_DOCUMENT_FONT_FAMILY,
  fontSize: 16,
  lineHeight: 1.25,
  letterSpacing: 0,
  align: "left",
  color: "#111827",
  fontWeight: String(DEFAULT_DOCUMENT_FONT_WEIGHT),
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

export type ListStyleKind = "disc" | "decimal";

export type ParagraphNode = {
  type: "paragraph";
  id: string;
  spans: SpanNode[];
  /** `<ul><li>` viñetas o `<ol><li>` numeración. */
  listStyle?: ListStyleKind;
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
    const p = paragraphs[pi]!;
    if (p.listStyle === "disc") {
      runs.push({ text: "\u2022  " });
    } else if (p.listStyle === "decimal") {
      let start = pi;
      while (start > 0 && paragraphs[start - 1]!.listStyle === "decimal") start--;
      const n = pi - start + 1;
      runs.push({ text: `${n}.  ` });
    }
    for (const span of p.spans) {
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
 * Chrome (y otros) envuelven el HTML del contentEditable en un `<div>` que contiene varios bloques,
 * p. ej. `<div>intro</div><ul><li>…</ul>`. Si solo vemos el `div` exterior y hacemos `processBlock` +
 * `extractSpans` sobre él, el `<ul>` se recorre como nodos genéricos y **no** se asigna `listStyle`:
 * al guardar la historia pierde el listado (una sola línea en el lienzo / al reabrir).
 */
function unwrapEditorContentEditableBlocks(topLevel: Node[]): Node[] {
  let nodes = topLevel;
  for (let depth = 0; depth < 12; depth++) {
    if (nodes.length !== 1) break;
    const one = nodes[0];
    if (!one || one.nodeType !== Node.ELEMENT_NODE) break;
    const el = one as HTMLElement;
    if (el.tagName.toLowerCase() !== "div") break;
    const kids = Array.from(el.childNodes);
    if (kids.length === 0) break;
    const hasDirectList = Array.from(el.children).some((c) => {
      const t = c.tagName.toLowerCase();
      return t === "ul" || t === "ol";
    });
    const meaningfulElements = kids.filter((k) => k.nodeType === Node.ELEMENT_NODE);
    const multipleBlocks = meaningfulElements.length >= 2;
    if (hasDirectList || multipleBlocks) {
      nodes = kids;
      continue;
    }
    /** Un solo hijo elemento `<div>`: envoltorio redundante (p. ej. `<div><div><ul>…</ul></div></div>`). */
    if (el.children.length === 1 && el.children[0].tagName.toLowerCase() === "div") {
      nodes = Array.from(el.children[0].childNodes);
      continue;
    }
    break;
  }
  return nodes;
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
  const blocksRaw =
    container.childNodes.length === 0 ? [container] : Array.from(container.childNodes);
  const blocks = unwrapEditorContentEditableBlocks(blocksRaw);

  const isInlineTopLevel = (n: Node): boolean => {
    if (n.nodeType === Node.TEXT_NODE) return true;
    if (n.nodeType !== Node.ELEMENT_NODE) return true;
    const tag = (n as HTMLElement).tagName.toLowerCase();
    return !["div", "p", "ul", "ol", "li"].includes(tag);
  };

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
      /** Enter dentro de un bloque → `<br>`; sin esto se pierden saltos y solo se ve un renglón. */
      if (tag === "br") {
        spans.push({
          id: uid("s"),
          text: "\n",
          ...(Object.keys(style).length > 0 ? { style: { ...style } } : {}),
        });
        return;
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

  /** Ítems desde `<ul>` o `<ol>` (misma lógica que el bloque `tag === ul|ol` del bucle principal). */
  function appendItemsFromListElement(listEl: HTMLElement, listStyle: ListStyleKind) {
    for (const li of Array.from(listEl.querySelectorAll(":scope > li"))) {
      const blockKids = Array.from(li.children).filter((c) => {
        const n = c.nodeName.toLowerCase();
        return n === "div" || n === "p";
      });
      if (blockKids.length > 1) {
        for (const blk of blockKids) {
          let spans = extractSpans(blk);
          if (spans.length === 0) spans.push({ id: uid("s"), text: "" });
          paragraphs.push({
            type: "paragraph",
            id: uid("p"),
            spans,
            listStyle,
          });
        }
      } else {
        let spans = extractSpans(li);
        if (spans.length === 0) spans.push({ id: uid("s"), text: "" });
        paragraphs.push({
          type: "paragraph",
          id: uid("p"),
          spans,
          listStyle,
        });
      }
    }
  }

  /**
   * Robustez para contentEditable inline:
   * si la raíz queda como secuencia de nodos inline (`text`, `<b>`, `<i>`, `<span>`, `<a>`, `<br>`),
   * deben parsearse como UN solo párrafo (no un párrafo por nodo), o aparecen saltos de línea espurios.
   */
  if (blocks.length > 0 && blocks.every(isInlineTopLevel)) {
    processBlock(container);
  } else {
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
    if (tag === "ul") {
      appendItemsFromListElement(el, "disc");
      continue;
    }
    if (tag === "ol") {
      appendItemsFromListElement(el, "decimal");
      continue;
    }
    if (tag === "div" || tag === "p") {
      /**
       * Muy frecuente: `<div>intro</div><div><ul>…</ul></div>`. El segundo bloque no es `<ul>` en la raíz;
       * si hacemos `processBlock` sobre el `div`, el `<ul>` se aplana y se pierde `listStyle`.
       */
      if (el.children.length === 1) {
        const only = el.children[0]!;
        const onlyTag = only.tagName.toLowerCase();
        if (onlyTag === "ul") {
          appendItemsFromListElement(only as HTMLElement, "disc");
          continue;
        }
        if (onlyTag === "ol") {
          appendItemsFromListElement(only as HTMLElement, "decimal");
          continue;
        }
      }
      processBlock(el);
      } else {
        processBlock(el);
      }
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

/**
 * Un fragmento ya escapado con los mismos envoltorios que el span (negrita, enlace, etc.).
 * Los saltos de línea van en `<br>` para que el contentEditable los respete al reabrir.
 */
function renderEscapedChunkWithSpanStyle(escapedChunk: string, span: SpanNode, baseTypo: Typography): string {
  if (!span.style) return escapedChunk;
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
  let piece = tags.join("") + escapedChunk + closeTags.join("");
  if (s.linkHref) {
    const href = sanitizeStoryLinkHref(s.linkHref);
    if (href) {
      piece = `<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer">${piece}</a>`;
    }
  }
  return piece;
}

function renderSpansToHtml(spans: SpanNode[], baseTypo: Typography): string {
  return spans
    .map((span) => {
      const chunks = span.text.split("\n");
      return chunks
        .map((chunk) => renderEscapedChunkWithSpanStyle(escapeHtml(chunk), span, baseTypo))
        .join("<br>");
    })
    .join("");
}

/** Convert StoryNodes to HTML string for contentEditable. */
export function storyNodesToHtml(nodes: StoryNode[], baseTypo: Typography): string {
  const pars = nodes.filter((n): n is ParagraphNode => n.type === "paragraph");
  const parts: string[] = [];
  let i = 0;
  while (i < pars.length) {
    const p = pars[i]!;
    if (p.listStyle === "disc") {
      const items: string[] = [];
      while (i < pars.length && pars[i]!.listStyle === "disc") {
        const inner = renderSpansToHtml(pars[i]!.spans, baseTypo);
        items.push(`<li>${inner || "<br>"}</li>`);
        i++;
      }
      parts.push(`<ul>${items.join("")}</ul>`);
    } else if (p.listStyle === "decimal") {
      const items: string[] = [];
      while (i < pars.length && pars[i]!.listStyle === "decimal") {
        const inner = renderSpansToHtml(pars[i]!.spans, baseTypo);
        items.push(`<li>${inner || "<br>"}</li>`);
        i++;
      }
      parts.push(`<ol>${items.join("")}</ol>`);
    } else {
      const inner = renderSpansToHtml(p.spans, baseTypo);
      parts.push(`<div>${inner || "<br>"}</div>`);
      i++;
    }
  }
  return parts.join("");
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

/** Índice 1-based del ítem dentro de un bloque contiguo de párrafos `listStyle === "decimal"`. */
function orderedItemIndex1Based(paragraphs: ParagraphNode[], pi: number): number {
  let start = pi;
  while (start > 0 && paragraphs[start - 1]!.listStyle === "decimal") start--;
  return pi - start + 1;
}

/** Longitud en caracteres del prefijo de lista en el plano `flattenStoryContent` (viñeta o `n. `). */
function listPrefixFlatLength(paragraphs: ParagraphNode[], pi: number): number {
  const p = paragraphs[pi]!;
  if (p.listStyle === "disc") return 3;
  if (p.listStyle === "decimal") return `${orderedItemIndex1Based(paragraphs, pi)}.  `.length;
  return 0;
}

/**
 * Recorta un párrafo según índices en el mismo espacio que `flattenStoryContent`:
 * prefijo de lista (viñeta o numeración) no forma parte de `p.spans`.
 */
function sliceParagraphNodeByLocalRange(p: ParagraphNode, localFrom: number, localTo: number, prefixLen: number): ParagraphNode {
  if (localFrom >= localTo) {
    return { type: "paragraph", id: uid("p"), spans: [{ id: uid("s"), text: "" }] };
  }

  const listKind =
    (p.listStyle === "disc" || p.listStyle === "decimal") && localFrom === 0 && localTo > 0 ? p.listStyle : undefined;

  const spanOut: SpanNode[] = [];
  let pos = prefixLen;
  for (const sp of p.spans) {
    const spStart = pos;
    const spEnd = pos + sp.text.length;
    const lo = Math.max(localFrom, spStart);
    const hi = Math.min(localTo, spEnd);
    if (lo < hi) {
      spanOut.push({
        id: uid("s"),
        text: sp.text.slice(lo - spStart, hi - spStart),
        ...(sp.style ? { style: { ...sp.style } } : {}),
      });
    }
    pos = spEnd;
  }

  if (listKind && localTo <= prefixLen) {
    return {
      type: "paragraph",
      id: uid("p"),
      spans: [{ id: uid("s"), text: "" }],
      listStyle: listKind,
    };
  }

  return {
    type: "paragraph",
    id: uid("p"),
    spans: spanOut.length > 0 ? spanOut : [{ id: uid("s"), text: "" }],
    ...(listKind ? { listStyle: listKind } : {}),
  };
}

/**
 * Slice story content by character range, preserving span styles and `listStyle` (viñetas).
 * Used by the threading/layout system to assign content ranges to frames.
 *
 * La implementación anterior reconstruía párrafos desde runs planos y **perdía `listStyle`**,
 * así que tras `syncTextFrameLayouts` el lienzo recibía `_designerRichSpans` sin "• ".
 */
export function sliceStoryContent(nodes: StoryNode[], start: number, end: number): StoryNode[] {
  const paragraphs = nodes.filter((n): n is ParagraphNode => n.type === "paragraph");
  if (paragraphs.length === 0) {
    return [{ type: "paragraph", id: uid("p"), spans: [{ id: uid("s"), text: "" }] }];
  }

  const flat = flattenStoryContent(nodes);
  const totalLen = flat.map((r) => r.text).join("").length;
  const s = Math.max(0, start);
  const e = Math.min(end, totalLen);
  if (s >= e) {
    return [{ type: "paragraph", id: uid("p"), spans: [{ id: uid("s"), text: "" }] }];
  }

  /** Marco único / historia completa en un frame: evita pérdida de metadatos. */
  if (s === 0 && e === totalLen) {
    return paragraphs.map((p) => ({
      type: "paragraph" as const,
      id: uid("p"),
      spans: p.spans.map((sp) => ({
        id: uid("s"),
        text: sp.text,
        ...(sp.style ? { style: { ...sp.style } } : {}),
      })),
      ...(p.listStyle === "disc"
        ? { listStyle: "disc" as const }
        : p.listStyle === "decimal"
          ? { listStyle: "decimal" as const }
          : {}),
    }));
  }

  const out: ParagraphNode[] = [];
  let pos = 0;
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const p = paragraphs[pi]!;
    if (pi > 0) pos += 1;
    const flatStart = pos;
    const prefixLen = listPrefixFlatLength(paragraphs, pi);
    pos += prefixLen;
    for (const sp of p.spans) pos += sp.text.length;
    const flatEnd = pos;

    const a = Math.max(s, flatStart);
    const b = Math.min(e, flatEnd);
    if (a >= b) continue;

    out.push(sliceParagraphNodeByLocalRange(p, a - flatStart, b - flatStart, prefixLen));
  }

  return out.length > 0 ? out : [{ type: "paragraph", id: uid("p"), spans: [{ id: uid("s"), text: "" }] }];
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}
