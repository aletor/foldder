import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  alignedGapHeight,
  pageMapSignature,
  paginate,
  writerPageStride,
  type MeasuredBlock,
  type MeasuredLine,
  type PageFragment,
  type PageMap,
  type PaginationKind,
} from "./writer-pagination";

export type WriterPaginationStorage = {
  enabled: boolean;
  contentHeight: number;
  gapHeight: number;
  kind: PaginationKind;
  layoutHash: string;
  scale: number;
  getScroller: () => HTMLElement | null;
  onMap: (map: PageMap) => void;
  onFallback: () => void;
};

declare module "@tiptap/core" {
  interface Storage {
    writerPagination: WriterPaginationStorage;
  }
}

const paginationKey = new PluginKey<DecorationSet>("writer-pagination");

export const WriterPagination = Extension.create<object, WriterPaginationStorage>({
  name: "writerPagination",
  addStorage() {
    return {
      enabled: false,
      contentHeight: 979,
      gapHeight: 172,
      kind: "prose",
      layoutHash: "",
      scale: 1,
      getScroller: () => null,
      onMap: () => {},
      onFallback: () => {},
    };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    const cache = new Map<string, { key: string; block: MeasuredBlock }>();
    let previous: PageMap | null = null;
    let previousHash = "";
    let signature = "";
    let frame = 0;
    let failedHash = "";
    let needsMeasure = false;
    let appliedConfig = "";

    const clearFrame = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const applyMap = (view: EditorView) => {
      frame = 0;
      if (view.isDestroyed || !storage.enabled) return;
      if (view.dom.clientWidth < 10) return;
      if (failedHash === storage.layoutHash) return;
      try {
        const measured = collectBlocks(view, storage, cache);
        if (measured.failed) {
          failedHash = storage.layoutHash;
          console.error("Writer no ha podido medir las páginas. La vista pasa a continuo en esta sesión.");
          storage.onFallback();
          return;
        }
        const layoutChanged = previousHash !== storage.layoutHash;
        const result = paginate({
          blocks: measured.blocks,
          contentHeight: storage.contentHeight,
          kind: storage.kind,
          previous: layoutChanged ? null : previous,
          dirtyBlockId: layoutChanged ? null : measured.dirtyBlockId,
          layoutVersion: layoutChanged ? (previous?.layoutVersion ?? 0) + 1 : previous?.layoutVersion,
        });
        previous = result.map;
        previousHash = storage.layoutHash;
        appliedConfig = `${storage.layoutHash}:${storage.contentHeight}:${storage.kind}`;
        const nextSignature = `${storage.layoutHash}|${pageMapSignature(result.map)}`;
        if (nextSignature !== signature) {
          const anchor = captureAnchor(view);
          const decorations = pageDecorations(view.state.doc, result.map, storage.gapHeight);
          signature = nextSignature;
          view.dispatch(view.state.tr.setMeta(paginationKey, decorations).setMeta("addToHistory", false));
          alignPageGaps(view, storage);
          restoreAnchor(view, anchor, storage.getScroller());
          storage.onMap(result.map);
        } else {
          alignPageGaps(view, storage);
        }
      } catch (error) {
        failedHash = storage.layoutHash;
        console.error(error);
        storage.onFallback();
      }
    };

    const schedule = (view: EditorView) => {
      clearFrame();
      frame = requestAnimationFrame(() => applyMap(view));
    };

    const scheduleClear = (view: EditorView) => {
      clearFrame();
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (view.isDestroyed) return;
        if ((paginationKey.getState(view.state)?.find().length ?? 0) === 0) return;
        const anchor = captureAnchor(view);
        view.dispatch(view.state.tr.setMeta(paginationKey, DecorationSet.empty).setMeta("addToHistory", false));
        restoreAnchor(view, anchor, storage.getScroller());
      });
    };

    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, value) {
            if (tr.getMeta("writer-pagination-refresh") || tr.docChanged) needsMeasure = true;
            const next = tr.getMeta(paginationKey) as DecorationSet | undefined;
            if (next) return next;
            if (tr.docChanged) return value.map(tr.mapping, tr.doc);
            return value;
          },
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state) ?? DecorationSet.empty;
          },
        },
        view(editorView) {
          let seenWidth = 0;
          let observer: ResizeObserver | null = null;
          try {
            if (typeof ResizeObserver !== "undefined") {
              observer = new ResizeObserver(() => {
                const width = editorView.dom.clientWidth;
                if (!storage.enabled || editorView.isDestroyed || width < 10 || width === seenWidth) return;
                seenWidth = width;
                needsMeasure = true;
                schedule(editorView);
              });
              observer.observe(editorView.dom);
            }
          } catch {
            observer = null;
          }
          return {
            update(view) {
              const config = `${storage.layoutHash}:${storage.contentHeight}:${storage.kind}`;
              if (!storage.enabled) {
                appliedConfig = "";
                if ((paginationKey.getState(view.state)?.find().length ?? 0) > 0) {
                  signature = "";
                  scheduleClear(view);
                }
                return;
              }
              if (!needsMeasure && config === appliedConfig) return;
              needsMeasure = false;
              schedule(view);
            },
            destroy() {
              observer?.disconnect();
              clearFrame();
            },
          };
        },
      }),
    ];
  },
});

function collectBlocks(
  view: EditorView,
  storage: WriterPaginationStorage,
  cache: Map<string, { key: string; block: MeasuredBlock }>,
): { blocks: MeasuredBlock[]; dirtyBlockId: string | null; failed: boolean } {
  const blocks: MeasuredBlock[] = [];
  let dirtyBlockId: string | null = null;
  let positive = false;
  let empty = false;
  const scale = storage.scale > 0 ? storage.scale : 1;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "pageBreak") {
      blocks.push({ blockId: `break:${pos}`, pos, type: "pageBreak", lines: [], marginBefore: 0, marginAfter: 0 });
      return false;
    }
    if (!node.isTextblock) return;
    const id = typeof node.attrs.blockId === "string" && node.attrs.blockId ? node.attrs.blockId : `pos:${pos}`;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) {
      empty = true;
      return false;
    }
    const style = window.getComputedStyle(dom);
    const chrome = boxChrome(style);
    const inner = Math.round(contentInner(dom, scale, chrome));
    const key = `${hashText(node.textContent)}:${storage.layoutHash}:${node.type.name}:${inner}`;
    const cached = cache.get(id);
    if (cached?.key === key) {
      blocks.push({ ...cached.block, pos });
      if (cached.block.lines.some((line) => line.height > 0)) positive = true;
      else empty = true;
      return false;
    }
    const lines = measureLines(dom, scale, lineStep(style), inner);
    const block: MeasuredBlock = {
      blockId: id,
      pos,
      type: node.type.name,
      lines,
      marginBefore: cssPx(style.marginTop) + chrome.before,
      marginAfter: cssPx(style.marginBottom) + chrome.after,
    };
    cache.set(id, { key, block });
    blocks.push(block);
    dirtyBlockId ??= id;
    if (lines.some((line) => line.height > 0)) positive = true;
    else empty = true;
    return false;
  });
  return { blocks, dirtyBlockId, failed: empty && !positive };
}

function measureLines(dom: HTMLElement, scale: number, step: number, inner: number): MeasuredLine[] {
  const lines: MeasuredLine[] = [];
  let offset = 0;
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const text = textNode.data;
      for (const line of splitTextLines(textNode, scale, step)) {
        lines.push({ from: offset + line.from, to: offset + line.to, height: line.height });
      }
      offset += text.length;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.classList.contains("writer-page-gap") || node.classList.contains("writer-sp-paren")) return;
    if (node.tagName === "BR") {
      offset += 1;
      return;
    }
    for (const child of node.childNodes) visit(child);
  };
  visit(dom);
  const usable = lines.filter((line) => line.to > line.from);
  const measured = usable.length > 0 ? usable : inner > 0 ? [{ from: 0, to: 0, height: inner }] : [];
  return fitLineHeights(measured, inner);
}

function splitTextLines(textNode: Text, scale: number, step: number): MeasuredLine[] {
  const text = textNode.data;
  if (!text) return [];
  const lines: MeasuredLine[] = [];
  const range = textNode.ownerDocument.createRange();
  let start = 0;
  let lineTop: number | null = null;
  for (let index = 0; index < text.length; index += 1) {
    range.setStart(textNode, index);
    range.setEnd(textNode, index + 1);
    const rect = range.getClientRects()[0];
    if (!rect || rect.height <= 0) continue;
    const top = rect.top / scale;
    if (lineTop == null) {
      lineTop = top;
      continue;
    }
    if (Math.abs(top - lineTop) > 1) {
      lines.push({ from: start, to: index, height: Math.max(step, top - lineTop) });
      start = index;
      lineTop = top;
    }
  }
  if (lineTop != null) lines.push({ from: start, to: text.length, height: step });
  return lines;
}

function fitLineHeights(lines: MeasuredLine[], inner: number): MeasuredLine[] {
  if (lines.length === 0) return lines;
  const sum = lines.reduce((total, line) => total + line.height, 0);
  if (inner <= sum + 0.5 || sum <= 0) return lines;
  const scale = inner / sum;
  return lines.map((line) => ({ ...line, height: line.height * scale }));
}

function pageDecorations(doc: EditorView["state"]["doc"], map: PageMap, gapHeight: number): DecorationSet {
  const widgets = map.pages.slice(1).flatMap((page) => {
    const fragment = page.fragments[0];
    const pos = fragment ? gapAnchor(doc, fragment) : page.firstPos;
    if (pos == null || pos <= 0 || pos > doc.content.size) return [];
    return [
      Decoration.widget(
        pos,
        () => {
          const element = document.createElement("span");
          element.className = "writer-page-gap";
          element.setAttribute("aria-hidden", "true");
          element.setAttribute("contenteditable", "false");
          element.style.cssText = `display:block;height:${gapHeight}px;width:100%;margin:0;padding:0;clear:both;line-height:0;font-size:0;`;
          return element;
        },
        {
          side: -1,
          ignoreSelection: true,
          key: `writer-page-${page.number}`,
          stopEvent: () => true,
        },
      ),
    ];
  });
  return DecorationSet.create(doc, widgets);
}

/** Un corte al inicio del bloque va entre párrafos. Dentro de un <p> el hueco no empuja el texto. */
function gapAnchor(doc: EditorView["state"]["doc"], fragment: PageFragment): number | null {
  if (fragment.from !== 0) return fragment.pos > 0 ? fragment.pos : null;
  if (fragment.pos <= 0 || fragment.pos > doc.content.size) return null;
  const $pos = doc.resolve(fragment.pos);
  if (!$pos.parent.isTextblock || $pos.parentOffset !== 0) return fragment.pos;
  const before = $pos.before($pos.depth);
  return before > 0 ? before : null;
}

/** Fija el final de cada salto en el inicio real de la hoja siguiente. */
function alignPageGaps(view: EditorView, storage: WriterPaginationStorage) {
  const gaps = view.dom.querySelectorAll(".writer-page-gap");
  if (gaps.length === 0) return;
  const scale = storage.scale > 0 ? storage.scale : 1;
  const padTop = cssPx(getComputedStyle(view.dom).paddingTop);
  const origin = view.dom.getBoundingClientRect().top + padTop * scale;
  const stride = writerPageStride(storage.contentHeight, storage.gapHeight) * scale;
  gaps.forEach((node, index) => {
    if (!(node instanceof HTMLElement)) return;
    const top = node.getBoundingClientRect().top - origin;
    node.style.height = `${alignedGapHeight(top, index, stride) / scale}px`;
  });
}

function captureAnchor(view: EditorView): { pos: number; top: number } | null {
  try {
    return { pos: view.state.selection.from, top: view.coordsAtPos(view.state.selection.from).top };
  } catch {
    return null;
  }
}

function restoreAnchor(view: EditorView, anchor: { pos: number; top: number } | null, scroller: HTMLElement | null) {
  if (!anchor || !scroller) return;
  try {
    const top = view.coordsAtPos(Math.min(anchor.pos, view.state.doc.content.size)).top;
    scroller.scrollTop += top - anchor.top;
  } catch {
    /* El caret sigue en el documento aunque el ancla no se pueda leer. */
  }
}

function cssPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineStep(style: CSSStyleDeclaration): number {
  const fontSize = cssPx(style.fontSize) || 16;
  if (!style.lineHeight || style.lineHeight === "normal") return fontSize * 1.2;
  const parsed = cssPx(style.lineHeight);
  return parsed > 0 ? parsed : fontSize * 1.2;
}

function boxChrome(style: CSSStyleDeclaration): { before: number; after: number } {
  return {
    before: cssPx(style.paddingTop) + cssPx(style.borderTopWidth),
    after: cssPx(style.paddingBottom) + cssPx(style.borderBottomWidth),
  };
}

function contentInner(dom: HTMLElement, scale: number, chrome: { before: number; after: number }): number {
  const box = dom.getBoundingClientRect().height / (scale > 0 ? scale : 1);
  let gaps = 0;
  dom.querySelectorAll(".writer-page-gap").forEach((node) => {
    if (node instanceof HTMLElement) gaps += node.getBoundingClientRect().height / (scale > 0 ? scale : 1);
  });
  return Math.max(0, box - chrome.before - chrome.after - gaps);
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
