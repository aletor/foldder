import type { TextObject } from "../FreehandStudio";
import { sanitizeStoryLinkHref, type SpanStyle } from "../indesign/text-model";
import { escapeXmlAttr } from "./markup-escape";

function escapeHtmlStr(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"); }

export function richSpansToInlineHtml(
  spans: Array<{
    text: string;
    style?: {
      fontWeight?: string;
      fontStyle?: string;
      textUnderline?: boolean;
      textStrikethrough?: boolean;
      fontSize?: number;
      color?: string;
      fontFamily?: string;
      letterSpacing?: number;
      linkHref?: string;
    };
  }> | undefined,
  fallbackPlain: string,
): string {
  if (!spans || spans.length === 0) {
    const base = escapeHtmlStr(fallbackPlain || "");
    return `<div>${base || "<br>"}</div>`;
  }
  const wrapTag = (tag: string, inner: string) => `<${tag}>${inner}</${tag}>`;
  const out = spans
    .map((sp) => {
      let inner = escapeHtmlStr(sp.text || "");
      const st = sp.style;
      if (!st) return inner;
      if (st.textUnderline) inner = wrapTag("u", inner);
      if (st.textStrikethrough) inner = wrapTag("s", inner);
      if (st.fontStyle === "italic") inner = wrapTag("i", inner);
      if (st.fontWeight && (String(st.fontWeight) === "bold" || Number(st.fontWeight) >= 600)) inner = wrapTag("b", inner);
      const inlineStyles: string[] = [];
      if (typeof st.fontSize === "number") inlineStyles.push(`font-size:${st.fontSize}px`);
      if (typeof st.fontFamily === "string" && st.fontFamily) {
        inlineStyles.push(`font-family:${escapeXmlAttr(st.fontFamily)}`);
      }
      if (typeof st.letterSpacing === "number") inlineStyles.push(`letter-spacing:${st.letterSpacing}px`);
      if (st.color) {
        inlineStyles.push(`color:${escapeXmlAttr(st.color)}`);
        inlineStyles.push(`-webkit-text-fill-color:${escapeXmlAttr(st.color)}`);
      }
      if (inlineStyles.length > 0) {
        inner = `<span style="${inlineStyles.join(";")}">${inner}</span>`;
      }
      if (st.linkHref) {
        const href = sanitizeStoryLinkHref(st.linkHref);
        if (href) inner = `<a href="${href}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
      }
      return inner;
    })
    .join("");
  const base = out || escapeHtmlStr(fallbackPlain || "");
  return `<div>${base || "<br>"}</div>`;
}

export function normalizeInlineFrameRichHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const c = document.createElement("div");
  c.innerHTML = html || "";
  const children = Array.from(c.childNodes);
  if (children.length === 0) return "<div><br></div>";
  const hasBlock = children.some((n) => {
    if (n.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = (n as HTMLElement).tagName.toLowerCase();
    return tag === "div" || tag === "p" || tag === "ul" || tag === "ol";
  });
  if (!hasBlock) {
    c.innerHTML = `<div>${html || "<br>"}</div>`;
  }

  const isSoftEmptyBlock = (el: Element): boolean => {
    const tag = el.tagName.toLowerCase();
    if (tag !== "div" && tag !== "p") return false;
    const txt = (el.textContent ?? "").replace(/\u00a0/g, " ").trim();
    if (txt.length > 0) return false;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0) return false;
      if (node.nodeType === Node.ELEMENT_NODE) {
        const t = (node as Element).tagName.toLowerCase();
        if (t !== "br" && t !== "span") return false;
      }
    }
    return true;
  };

  // contentEditable suele añadir un último `<div><br></div>` para caret; no debe afectar el threading.
  while (c.children.length > 1) {
    const last = c.lastElementChild;
    if (!last || !isSoftEmptyBlock(last)) break;
    c.removeChild(last);
  }

  const last = c.lastElementChild;
  if (last && (last.tagName.toLowerCase() === "div" || last.tagName.toLowerCase() === "p")) {
    const childNodes = Array.from(last.childNodes);
    for (let i = childNodes.length - 1; i >= 0; i--) {
      const n = childNodes[i]!;
      if (n.nodeType === Node.TEXT_NODE) {
        const txt = n.textContent ?? "";
        const trimmed = txt.replace(/\n+$/g, "");
        if (trimmed !== txt) n.textContent = trimmed;
        if ((n.textContent ?? "").length === 0 && childNodes.length > 1) last.removeChild(n);
        if ((n.textContent ?? "").length > 0) break;
        continue;
      }
      if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName.toLowerCase() === "br") {
        const textWithoutBr = (last.textContent ?? "").replace(/\u00a0/g, " ").trim();
        if (textWithoutBr.length > 0) {
          last.removeChild(n);
        }
        break;
      }
      break;
    }
  }

  return c.innerHTML || "<div><br></div>";
}

export function simpleTextRichPayloadFromHtml(html: string): {
  plain: string;
  spans?: TextObject["_designerRichSpans"];
} {
  if (typeof document === "undefined") return { plain: html };
  const container = document.createElement("div");
  container.innerHTML = normalizeInlineFrameRichHtml(html);
  const spans: NonNullable<TextObject["_designerRichSpans"]> = [];
  const sameStyle = (a?: SpanStyle, b?: SpanStyle) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  const pushSpan = (text: string, style: SpanStyle) => {
    if (!text) return;
    const cleanedStyle = Object.fromEntries(
      Object.entries(style).filter(([, value]) => value != null && value !== ""),
    ) as SpanStyle;
    const nextStyle = Object.keys(cleanedStyle).length > 0 ? cleanedStyle : undefined;
    const prev = spans[spans.length - 1];
    if (prev && sameStyle(prev.style, nextStyle)) {
      prev.text += text;
      return;
    }
    spans.push({ text, ...(nextStyle ? { style: nextStyle } : {}) });
  };
  const walk = (node: Node, inherited: SpanStyle) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushSpan(node.textContent ?? "", inherited);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const style: SpanStyle = { ...inherited };
    if (tag === "b" || tag === "strong") style.fontWeight = "bold";
    if (tag === "i" || tag === "em") style.fontStyle = "italic";
    if (tag === "u") style.textUnderline = true;
    if (tag === "s" || tag === "strike" || tag === "del") style.textStrikethrough = true;
    if (tag === "a") {
      const href = sanitizeStoryLinkHref(el.getAttribute("href") ?? "");
      if (href) style.linkHref = href;
    }
    if (el.style.fontWeight) style.fontWeight = el.style.fontWeight;
    if (el.style.fontStyle) style.fontStyle = el.style.fontStyle;
    if (el.style.color) style.color = el.style.color;
    const webkitTextFill = (el.style as CSSStyleDeclaration & { webkitTextFillColor?: string }).webkitTextFillColor;
    if (webkitTextFill) style.color = webkitTextFill;
    if (tag === "br") {
      pushSpan("\n", style);
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child, style);
  };
  const nodes = Array.from(container.childNodes);
  nodes.forEach((node, idx) => {
    if (idx > 0 && node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as HTMLElement).tagName.toLowerCase();
      if (tag === "div" || tag === "p" || tag === "ul" || tag === "ol") pushSpan("\n", {});
    }
    walk(node, {});
  });
  const plain = spans.map((span) => span.text).join("");
  const hasStyledSpan = spans.some((span) => !!span.style && Object.keys(span.style).length > 0);
  return {
    plain,
    spans: hasStyledSpan ? spans : undefined,
  };
}

/** Texto copiado (ChatGPT, Word, etc.): espacios raros y caracteres invisibles / de formato. */
function normalizeClipboardPlainText(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/\u00a0/g, " ");
  t = t.replace(/[\u200b-\u200d\ufeff\u2060\u00ad]/g, "");
  return t;
}

/**
 * Solo caracteres visibles / saltos: nunca HTML ni estilos. Si hay `text/plain` se usa tal cual;
 * si solo viene `text/html`, se extrae texto (como verías al copiar a Notas).
 */
export function clipboardToPlainString(dt: DataTransfer): string {
  const plain = dt.getData("text/plain") ?? "";
  if (plain.length > 0) {
    return normalizeClipboardPlainText(plain);
  }
  const html = dt.getData("text/html") ?? "";
  if (html.trim().length === 0) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const t = (tmp.innerText ?? tmp.textContent ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalizeClipboardPlainText(t);
}

/**
 * Pega varias líneas como un `<div>` por línea (mismo efecto que pulsar Enter en el editor).
 * `insertText` con `\n` suele dejar **un solo** bloque; al aplicar lista el navegador genera **un solo** `<li>`
 * y el guardado no refleja ítems (o el layout pierde viñetas).
 */
export function insertPlainTextAsEditorBlocks(editableRoot: HTMLElement, text: string): void {
  const doc = editableRoot.ownerDocument;
  const lines = text.split("\n");
  const frag = doc.createDocumentFragment();
  let lastBlock: HTMLElement | null = null;
  for (const line of lines) {
    const div = doc.createElement("div");
    if (line.length === 0) div.appendChild(doc.createElement("br"));
    else div.textContent = line;
    frag.appendChild(div);
    lastBlock = div;
  }
  const sel = doc.getSelection();
  if (!sel?.rangeCount || !lastBlock) return;
  const range = sel.getRangeAt(0);
  if (!editableRoot.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  range.insertNode(frag);
  const nr = doc.createRange();
  nr.setStartAfter(lastBlock);
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
}
