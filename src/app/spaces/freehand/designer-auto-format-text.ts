/**
 * Auto-formato determinista de texto (Designer / Freehand).
 * Sin LLM ni APIs de pago.
 *
 * Jerarquía objetivo (presupuesto / alcance):
 * - Título: negrita, al margen.
 * - Encabezados de sección `N. Título — precio`: negrita, al margen (NO lista numerada).
 * - Viñetas: sangradas bajo la sección (sangría literal en HTML/plain; no depende de `<ul>`).
 * - Tras subtítulo: un blanco antes de la primera viñeta.
 * - Entre viñetas: un salto simple.
 * - Entre secciones: un blanco (doble salto).
 */

export type DesignerAutoFormatSpan = {
  text: string;
  style?: { fontWeight?: string };
};

export type DesignerAutoFormatResult = {
  plainText: string;
  spans: DesignerAutoFormatSpan[];
  html: string;
  changed: boolean;
};

const BULLET_RE = /^\s*(?:\u2003+)?(?:[-*•–—]|\u2022)\s+/;
const NUMBERED_RE = /^\s*(?:\u2003+)?(\d+)[.)]\s+/;
/** Encabezado de partida/sección: "1. Título — 450 €" */
const SECTION_HEADING_RE =
  /^\s*(?:\u2003+)?(\d+)[.)]\s+(.+?)(?:\s*[—–-]\s*(.+))?$/;
const PRICE_HINT_RE = /\d[\d.,]*\s*€|\bEUR\b/i;
const ABBREVIATION_RE =
  /(?:^|[\s([{])(?:Sr|Sra|Dr|Dra|Prof|Ud|Uds|etc|ej|p\.?\s*ej|núm|tel|aprox|vs|EE\.?\s*UU|Excmo|Ilmo|n\.|vol|cap)\.?$/i;

/** Sangría de viñetas (margen izquierdo). */
const LIST_INDENT = "\u2003\u2003";

export type FormatBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string; label?: { label: string; rest: string } }
  | { kind: "bullet"; items: string[] }
  | { kind: "numbered"; items: string[]; start: number }
  | { kind: "spacer" };

function collapseSpaces(s: string): string {
  return s.replace(/[ \t\u00a0\u2003]+/g, " ").trim();
}

function looksLikeTitle(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 72) return false;
  if (/[.!?…]$/.test(t)) return false;
  if (BULLET_RE.test(t) || NUMBERED_RE.test(t)) return false;
  if (t.includes(":")) return false;
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (letters.length < 2) return false;
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "").length;
  if (upper / letters.length >= 0.85) return true;
  return t.length <= 56 && !/[.!?…]/.test(t);
}

function splitLabelColon(line: string): { label: string; rest: string } | null {
  const idx = line.indexOf(":");
  if (idx <= 0) return null;
  const before = line.slice(0, idx).trim();
  const after = line.slice(idx + 1).trim();
  if (!before || !after) return null;
  if (/^\d{1,2}$/.test(before) && /^\d{2}\b/.test(after)) return null;
  if (before.length > 48) return null;
  return { label: `${before}:`, rest: after };
}

/** ¿Esta línea numerada es encabezado de sección (no ítem de lista)? */
export function isSectionHeadingLine(line: string, nextLine?: string): boolean {
  const t = collapseSpaces(line);
  const m = t.match(SECTION_HEADING_RE);
  if (!m) return false;
  const body = collapseSpaces(m[2] ?? "");
  const pricePart = collapseSpaces(m[3] ?? "");
  if (PRICE_HINT_RE.test(t) || PRICE_HINT_RE.test(pricePart)) return true;
  if (/[—–]/.test(t)) return true;
  // Seguido de viñetas → encabezado de bloque
  if (nextLine && BULLET_RE.test(collapseSpaces(nextLine))) return true;
  // Título de sección sustancial (no "1. item corto de lista")
  if (body.length >= 18) return true;
  return false;
}

export function splitIntoSentences(text: string): string[] {
  const t = collapseSpaces(text);
  if (!t) return [];

  const parts: string[] = [];
  let buf = "";
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i]!;
    buf += ch;
    if (!/[.!?…]/.test(ch)) continue;

    const nextNonSpace = t.slice(i + 1).match(/^\s*(.)/);
    const afterChar = nextNonSpace?.[1] ?? "";
    const before = buf.slice(0, -1);

    if (/\d$/.test(before) && /^\d$/.test(afterChar)) continue;
    if (ABBREVIATION_RE.test(before.trimEnd() + ch)) continue;
    if (ch === "." && t[i + 1] === ".") continue;

    const rest = t.slice(i + 1);
    if (rest.length === 0) {
      parts.push(collapseSpaces(buf));
      buf = "";
      continue;
    }
    if (!/^\s+/.test(rest)) continue;
    const after = rest.trimStart();
    if (!after) continue;
    if (!/^["«»„“”¿¡A-ZÁÉÍÓÚÑ]/.test(after)) continue;

    parts.push(collapseSpaces(buf));
    buf = "";
    while (i + 1 < t.length && /\s/.test(t[i + 1]!)) i += 1;
  }
  const tail = collapseSpaces(buf);
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts : [t];
}

export function shouldStartNewParagraph(prevSentence: string, nextSentence: string): boolean {
  const prev = prevSentence.trim();
  const next = nextSentence.trim();
  if (!prev || !next) return false;
  if (!/[.!?…]"?$/.test(prev)) return false;
  if (ABBREVIATION_RE.test(prev.replace(/[.!?…]"?$/, (m) => m[0] ?? "."))) return false;

  if (BULLET_RE.test(next) || NUMBERED_RE.test(next) || isSectionHeadingLine(next)) return true;
  if (looksLikeTitle(next)) return true;
  if (splitLabelColon(next)) return true;
  if (/^[¿¡]/.test(next)) return true;
  if (/[?!…]"?$/.test(prev) && /^["«A-ZÁÉÍÓÚÑ]/.test(next)) return true;
  if (prev.length >= 55 && /^["«A-ZÁÉÍÓÚÑ]/.test(next)) return true;
  return false;
}

function groupSentencesIntoParagraphs(sentences: string[]): string[][] {
  if (sentences.length === 0) return [];
  const groups: string[][] = [];
  let current: string[] = [sentences[0]!];
  for (let i = 1; i < sentences.length; i += 1) {
    const prev = current[current.length - 1]!;
    const next = sentences[i]!;
    if (shouldStartNewParagraph(prev, next)) {
      groups.push(current);
      current = [next];
    } else {
      current.push(next);
    }
  }
  groups.push(current);
  return groups;
}

type RawLine =
  | { type: "blank" }
  | { type: "bullet"; text: string }
  | { type: "heading"; text: string }
  | { type: "numbered"; n: number; text: string }
  | { type: "prose"; text: string };

function parseSourceLines(raw: string): RawLine[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const chunks = normalized.split("\n");
  const stripped = chunks.map((c) => collapseSpaces(c));

  const lines: RawLine[] = [];
  for (let i = 0; i < stripped.length; i += 1) {
    const line = stripped[i]!;
    if (!line) {
      lines.push({ type: "blank" });
      continue;
    }
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      lines.push({ type: "bullet", text: collapseSpaces(line.slice(bullet[0].length)) });
      continue;
    }
    const nextNonBlank = stripped.slice(i + 1).find((l) => l.length > 0);
    if (isSectionHeadingLine(line, nextNonBlank)) {
      const m = line.match(SECTION_HEADING_RE);
      const body = collapseSpaces(m?.[2] ?? line);
      const price = collapseSpaces(m?.[3] ?? "");
      const headingText = price ? `${body} — ${price}` : body;
      lines.push({ type: "heading", text: headingText });
      continue;
    }
    const numbered = line.match(NUMBERED_RE);
    if (numbered) {
      lines.push({
        type: "numbered",
        n: Number(numbered[1]),
        text: collapseSpaces(line.slice(numbered[0].length)),
      });
      continue;
    }
    lines.push({ type: "prose", text: line });
  }
  return lines;
}

function pushSpacer(blocks: FormatBlock[]) {
  if (blocks.length === 0) return;
  if (blocks[blocks.length - 1]!.kind === "spacer") return;
  blocks.push({ kind: "spacer" });
}

/** Agrupa líneas crudas en bloques tipográficos. */
export function buildFormatBlocks(raw: string): FormatBlock[] {
  const lines = parseSourceLines(raw);
  const blocks: FormatBlock[] = [];
  let sectionIndex = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (line.type === "blank") {
      let j = i;
      while (j < lines.length && lines[j]!.type === "blank") j += 1;
      // Solo spacer entre bloques de distinto “capítulo”, no entre viñetas.
      if (blocks.length > 0 && j < lines.length) {
        const prev = blocks[blocks.length - 1]!;
        const nextType = lines[j]!.type;
        // Tras viñetas / numeradas / heading / title → el siguiente bloque mayor lleva spacer
        if (prev.kind === "bullet" || prev.kind === "numbered" || prev.kind === "heading" || prev.kind === "title") {
          if (nextType === "heading" || nextType === "prose" || nextType === "numbered") {
            pushSpacer(blocks);
          }
        } else if (prev.kind === "paragraph" || prev.kind === "title") {
          pushSpacer(blocks);
        }
      }
      i = j;
      continue;
    }

    if (line.type === "heading") {
      sectionIndex += 1;
      // Blanco antes de cada sección (salvo justo tras el título, donde también queremos blanco)
      if (blocks.length > 0) pushSpacer(blocks);
      blocks.push({ kind: "heading", text: `${sectionIndex}. ${line.text}` });
      i += 1;
      continue;
    }

    if (line.type === "bullet") {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.type === "bullet") {
        items.push((lines[i] as { text: string }).text);
        i += 1;
      }
      // Tras encabezado: sin spacer (solo salto simple). Tras otro bloque: spacer.
      if (blocks.length > 0 && blocks[blocks.length - 1]!.kind !== "heading") {
        pushSpacer(blocks);
      }
      blocks.push({ kind: "bullet", items });
      continue;
    }

    if (line.type === "numbered") {
      const items: string[] = [];
      const start = line.n;
      while (i < lines.length && lines[i]!.type === "numbered") {
        items.push((lines[i] as { text: string }).text);
        i += 1;
      }
      if (blocks.length > 0) pushSpacer(blocks);
      blocks.push({ kind: "numbered", items, start });
      continue;
    }

    // Prose
    const proseBuf: string[] = [];
    while (i < lines.length && lines[i]!.type === "prose") {
      proseBuf.push((lines[i] as { text: string }).text);
      i += 1;
    }

    if (proseBuf.length === 1 && looksLikeTitle(proseBuf[0]!) && blocks.length === 0) {
      blocks.push({ kind: "title", text: proseBuf[0]! });
      continue;
    }

    const joined = proseBuf.join(" ");
    const label = splitLabelColon(joined);
    if (label && proseBuf.length === 1 && !joined.slice(0, joined.indexOf(":")).includes(".")) {
      if (blocks.length > 0) pushSpacer(blocks);
      blocks.push({
        kind: "paragraph",
        text: `${label.label} ${label.rest}`,
        label: { label: label.label, rest: label.rest },
      });
      continue;
    }

    if (proseBuf.length === 1 && looksLikeTitle(proseBuf[0]!)) {
      if (blocks.length > 0) pushSpacer(blocks);
      blocks.push({ kind: "title", text: proseBuf[0]! });
      continue;
    }

    const sentences = splitIntoSentences(joined);
    const groups = groupSentencesIntoParagraphs(sentences);
    for (let g = 0; g < groups.length; g += 1) {
      if (blocks.length > 0) pushSpacer(blocks);
      blocks.push({ kind: "paragraph", text: groups[g]!.join(" ") });
    }
  }

  while (blocks[0]?.kind === "spacer") blocks.shift();
  while (blocks[blocks.length - 1]?.kind === "spacer") blocks.pop();
  return blocks;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Relación de saltos entre bloques:
 * - heading → viñetas/lista: blanco (`\n\n`) — aire tras el subtítulo
 * - bullet item → bullet item: salto simple (dentro del bloque)
 * - resto de bloques mayores: blanco (`\n\n`) vía spacer / double
 */
function breakBefore(prev: FormatBlock | undefined, next: FormatBlock): "none" | "single" | "double" {
  if (!prev) return "none";
  if (next.kind === "spacer" || prev.kind === "spacer") return "none";
  // Ítems dentro del mismo bloque se separan en buildSpansAndPlain / buildHtml
  return "double";
}

function buildSpansAndPlain(blocks: FormatBlock[]): { plainText: string; spans: DesignerAutoFormatSpan[] } {
  const spans: DesignerAutoFormatSpan[] = [];
  const plainParts: string[] = [];

  const push = (text: string, bold?: boolean) => {
    if (!text) return;
    plainParts.push(text);
    spans.push(bold ? { text, style: { fontWeight: "bold" } } : { text });
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.kind === "spacer") {
      push("\n\n");
      continue;
    }
    const prev = i > 0 ? blocks[i - 1] : undefined;
    if (prev && prev.kind !== "spacer") {
      const br = breakBefore(prev, block);
      if (br === "single") push("\n");
      else if (br === "double") push("\n\n");
    }

    if (block.kind === "title" || block.kind === "heading") {
      push(block.text, true);
      continue;
    }
    if (block.kind === "paragraph") {
      if (block.label) {
        push(block.label.label, true);
        if (block.label.rest) push(` ${block.label.rest}`);
      } else {
        push(block.text);
      }
      continue;
    }
    if (block.kind === "bullet") {
      block.items.forEach((item, idx) => {
        if (idx > 0) push("\n");
        push(`${LIST_INDENT}•\u00a0\u00a0${item}`);
      });
      continue;
    }
    if (block.kind === "numbered") {
      block.items.forEach((item, idx) => {
        if (idx > 0) push("\n");
        const n = block.start + idx;
        push(`${LIST_INDENT}${n}.\u00a0\u00a0${item}`);
      });
    }
  }

  return { plainText: plainParts.join(""), spans };
}

function buildHtml(blocks: FormatBlock[]): string {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.kind === "spacer") {
      out.push("<div></div>");
      continue;
    }
    const prev = i > 0 ? blocks[i - 1] : undefined;
    if (prev && prev.kind !== "spacer") {
      const br = breakBefore(prev, block);
      if (br === "double") out.push("<div></div>");
    }

    if (block.kind === "title" || block.kind === "heading") {
      out.push(`<div><b>${escapeHtml(block.text)}</b></div>`);
      continue;
    }
    if (block.kind === "paragraph") {
      if (block.label) {
        out.push(
          `<div><b>${escapeHtml(block.label.label)}</b>${
            block.label.rest ? ` ${escapeHtml(block.label.rest)}` : ""
          }</div>`,
        );
      } else {
        out.push(`<div>${escapeHtml(block.text)}</div>`);
      }
      continue;
    }
    /**
     * Viñetas/numeración como `<div>` con sangría literal (no `<ul>`/`<ol>`).
     * Así el lienzo muestra margen al primer clic: no depende de `listStyle` + flatten
     * (que en la práctica obligaba a pulsar Auto-formato dos veces).
     */
    if (block.kind === "bullet") {
      for (const item of block.items) {
        out.push(`<div>${escapeHtml(`${LIST_INDENT}•\u00a0\u00a0${item}`)}</div>`);
      }
      continue;
    }
    if (block.kind === "numbered") {
      block.items.forEach((item, idx) => {
        const n = block.start + idx;
        out.push(`<div>${escapeHtml(`${LIST_INDENT}${n}.\u00a0\u00a0${item}`)}</div>`);
      });
    }
  }
  return out.length > 0 ? out.join("") : "<div><br></div>";
}

/** Firma visual para decidir si el texto ya está en la forma canónica. */
function visualSignature(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\u2003+/g, "\u2003\u2003")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Formatea texto plano al patrón título / secciones / viñetas sangradas. */
export function autoFormatDesignerText(raw: string): DesignerAutoFormatResult {
  const source = (raw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmedSource = source.trim();
  if (!trimmedSource) {
    return { plainText: "", spans: [], html: "<div><br></div>", changed: false };
  }

  const blocks = buildFormatBlocks(source);
  const { plainText, spans } = buildSpansAndPlain(blocks);
  const html = buildHtml(blocks);
  const changed =
    visualSignature(plainText) !== visualSignature(trimmedSource) ||
    spans.some((s) => s.style?.fontWeight === "bold");

  return { plainText, spans, html, changed };
}

/** @deprecated Prefer splitIntoSentences */
export function splitTextIntoVisualLines(block: string): string[] {
  return splitIntoSentences(block);
}
