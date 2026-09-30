/**
 * Las páginas son una proyección del layout. No forman parte del documento ni de Story.
 * Un bloque puede ocupar más de una página sin partir su nodo.
 */

export const WRITER_PAGE_GAP = 28;

export type WriterViewMode = "paged" | "continuous";

export type PaginationKind = "script" | "prose";

export type WriterPageBox = {
  width: number;
  height: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
};

export type MeasuredLine = { from: number; to: number; height: number };

export type MeasuredBlock = {
  blockId: string;
  pos: number;
  type: string;
  lines: MeasuredLine[];
  marginBefore: number;
  marginAfter: number;
};

export type PageFragment = {
  blockId: string;
  from: number;
  to: number;
  pos: number;
};

export type PageLayout = {
  number: number;
  firstPos: number;
  lastPos: number;
  fragments: PageFragment[];
};

export type PageMap = {
  pages: PageLayout[];
  totalPages: number;
  layoutVersion: number;
};

export type PaginateResult = {
  map: PageMap;
  /** Primera página a partir de la cual el mapa anterior se pudo reutilizar. */
  stableFromPage: number | null;
};

const SCRIPT_KEEP_WITH_NEXT = new Set(["sceneHeading"]);
const SCRIPT_KEEP_TOGETHER = new Set(["character", "parenthetical", "transition"]);
const PROSE_KEEP_WITH_NEXT = new Set(["heading", "chapterTitle"]);
const PROSE_KEEP_TOGETHER = new Set(["transition"]);

export function writerPaginationBox(preset: string): WriterPageBox {
  if (preset === "letter" || preset === "a5") return writerPageBox(preset);
  return writerPageBox("a4");
}

export function writerPageBox(preset: "a4" | "letter" | "a5"): WriterPageBox {
  if (preset === "letter") return { width: 816, height: 1056, padTop: 72, padRight: 76, padBottom: 72, padLeft: 76 };
  if (preset === "a5") return { width: 559, height: 794, padTop: 48, padRight: 44, padBottom: 48, padLeft: 44 };
  return { width: 794, height: 1123, padTop: 72, padRight: 76, padBottom: 72, padLeft: 76 };
}

export function writerContentHeight(box: WriterPageBox): number {
  return box.height - box.padTop - box.padBottom;
}

export function writerGapHeight(box: WriterPageBox): number {
  return box.padBottom + WRITER_PAGE_GAP + box.padTop;
}

/** Distancia entre el inicio del texto de una hoja y el de la siguiente. */
export function writerPageStride(contentHeight: number, gapHeight: number): number {
  return contentHeight + gapHeight;
}

/**
 * El salto absorbe el espacio que la hoja no llenó.
 * Así el texto de la página siguiente empieza siempre en el folio, y el error no se acumula.
 */
export function alignedGapHeight(gapTop: number, pageIndex: number, stride: number): number {
  if (stride <= 0) return 0;
  return Math.max(0, (pageIndex + 1) * stride - gapTop);
}

export function writerLayoutHash(preset: string, kind: PaginationKind, box: WriterPageBox): string {
  return `${preset}:${kind}:${box.width}x${box.height}:${box.padTop},${box.padRight},${box.padBottom},${box.padLeft}`;
}

export function paginate(input: {
  blocks: MeasuredBlock[];
  contentHeight: number;
  kind: PaginationKind;
  previous?: PageMap | null;
  dirtyBlockId?: string | null;
  layoutVersion?: number;
}): PaginateResult {
  const height = Math.max(1, input.contentHeight);
  const previous = input.previous ?? null;
  const pages: PageLayout[] = [];
  let fragments: PageFragment[] = [];
  let used = 0;
  /** Margen inferior del bloque anterior ya contado en esta página. El siguiente lo colapsa. */
  let carriedMargin = 0;
  let lastBreak = false;
  let passedDirty = !input.dirtyBlockId;
  let stableFromPage: number | null = null;

  const finish = (source: PageFragment[]): PageLayout => {
    const first = source[0];
    const last = source[source.length - 1];
    return {
      number: pages.length + 1,
      firstPos: first?.pos ?? 0,
      lastPos: last ? last.pos + Math.max(0, last.to - last.from) : first?.pos ?? 0,
      fragments: source.slice(),
    };
  };

  const close = () => {
    pages.push(finish(fragments));
    fragments.length = 0;
    used = 0;
    carriedMargin = 0;
  };

  const samePage = (page: PageLayout, index: number): boolean => {
    const prior = previous?.pages[index];
    if (!prior || prior.fragments.length !== page.fragments.length) return false;
    return page.fragments.every((fragment, item) => {
      const other = prior.fragments[item];
      return other?.blockId === fragment.blockId && other.from === fragment.from && other.to === fragment.to;
    });
  };

  const reuseTail = (fromIndex: number) => {
    const byBlock = new Map(input.blocks.map((block) => [block.blockId, block]));
    for (let index = fromIndex; index < (previous?.pages.length ?? 0); index += 1) {
      const prior = previous?.pages[index];
      if (!prior) break;
      const nextFragments = prior.fragments.map((fragment) => {
        const block = byBlock.get(fragment.blockId);
        return { ...fragment, pos: block ? block.pos + 1 + fragment.from : fragment.pos };
      });
      pages.push({ ...finish(nextFragments), number: pages.length + 1 });
    }
  };

  const tryStop = () => {
    if (!passedDirty || !previous) return false;
    const page = finish(fragments);
    const index = pages.length;
    if (!samePage(page, index)) return false;
    pages.push({ ...page, number: pages.length + 1 });
    fragments.length = 0;
    used = 0;
    carriedMargin = 0;
    stableFromPage = page.number;
    reuseTail(index + 1);
    return true;
  };

  for (let index = 0; index < input.blocks.length; index += 1) {
    if (stableFromPage != null) break;
    const block = input.blocks[index]!;
    if (block.blockId === input.dirtyBlockId) passedDirty = true;
    if (block.type === "pageBreak") {
      if (fragments.length > 0) {
        if (tryStop()) break;
        close();
        lastBreak = true;
      } else if (lastBreak) {
        pages.push({
          number: pages.length + 1,
          firstPos: block.pos,
          lastPos: block.pos + 1,
          fragments: [{ blockId: block.blockId, from: 0, to: 0, pos: block.pos }],
        });
        lastBreak = true;
      } else {
        lastBreak = true;
      }
      continue;
    }
    lastBreak = false;
    if (block.lines.length === 0) continue;
    ensureFits(input.blocks, index, input.kind, height, () => used, () => {
      if (fragments.length > 0) close();
    });
    const stopped = placeBlock(block, input.kind, height, () => used, (value) => {
      used = value;
    }, () => carriedMargin, (value) => {
      carriedMargin = value;
    }, fragments, () => {
      if (tryStop()) return true;
      close();
      return false;
    });
    if (stopped) break;
    if (stableFromPage != null) break;
  }

  if (stableFromPage == null) {
    if (fragments.length > 0) close();
    else if (lastBreak && pages.length > 0) pages.push(finish([]));
    else if (pages.length === 0) pages.push(finish([]));
  }

  pages.forEach((page, index) => {
    page.number = index + 1;
  });

  return {
    map: {
      pages,
      totalPages: pages.length,
      layoutVersion: input.layoutVersion ?? previous?.layoutVersion ?? 1,
    },
    stableFromPage,
  };
}

export function getPageForPosition(map: PageMap, pos: number): number {
  let found = map.pages[0]?.number ?? 1;
  for (const page of map.pages) {
    if (page.fragments.length === 0) continue;
    if (page.firstPos <= pos) found = page.number;
  }
  return found;
}

export function getPagesForBlock(map: PageMap, blockId: string): number[] {
  return map.pages.filter((page) => page.fragments.some((fragment) => fragment.blockId === blockId)).map((page) => page.number);
}

export function getPageForBlock(map: PageMap, blockId: string): number | null {
  return getPagesForBlock(map, blockId)[0] ?? null;
}

export function getPositionForPage(map: PageMap, pageNumber: number): number | null {
  return getPageRange(map, pageNumber)?.from ?? null;
}

export function getPageRange(map: PageMap, pageNumber: number): { from: number; to: number } | null {
  const page = map.pages.find((item) => item.number === pageNumber);
  if (!page) return null;
  return { from: page.firstPos, to: page.lastPos };
}

export function getPageCount(map: PageMap): number {
  return map.totalPages;
}

export function getCurrentPage(map: PageMap, selectionPos: number): number {
  return getPageForPosition(map, selectionPos);
}

export function pageMapSignature(map: PageMap): string {
  return map.pages.map((page) => page.fragments.map((fragment) => `${fragment.blockId}:${fragment.from}:${fragment.to}`).join(",")).join("|");
}

function ensureFits(
  blocks: MeasuredBlock[],
  index: number,
  kind: PaginationKind,
  contentHeight: number,
  used: () => number,
  overflow: () => void,
) {
  const block = blocks[index];
  if (!block) return;
  const bundle = bundleHeight(blocks, index, kind);
  if (bundle <= 0) return;
  if (used() > 0 && used() + bundle > contentHeight) overflow();
}

function bundleHeight(blocks: MeasuredBlock[], index: number, kind: PaginationKind): number {
  const block = blocks[index];
  if (!block) return 0;
  if (kind === "script" && block.type === "character") {
    let height = fullHeight(block);
    let cursor = index + 1;
    while (blocks[cursor]?.type === "parenthetical") {
      height += fullHeight(blocks[cursor]!);
      cursor += 1;
    }
    const dialogue = blocks[cursor];
    if (dialogue?.type === "dialogue" && dialogue.lines[0]) height += dialogue.lines[0].height + dialogue.marginBefore;
    return height;
  }
  if (keepWithNext(block.type, kind)) {
    const next = blocks[index + 1];
    const follow = next && next.type !== "pageBreak" ? (next.lines[0]?.height ?? 0) + next.marginBefore : 0;
    return fullHeight(block) + follow;
  }
  if (keepTogether(block.type, kind)) return fullHeight(block);
  return 0;
}

function placeBlock(
  block: MeasuredBlock,
  kind: PaginationKind,
  contentHeight: number,
  used: () => number,
  setUsed: (value: number) => void,
  carriedMargin: () => number,
  setCarriedMargin: (value: number) => void,
  fragments: PageFragment[],
  overflow: () => boolean,
): boolean {
  const lines = unsplittable(block.type, kind) || block.lines.length === 1 ? [collapse(block)] : block.lines;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    const after = lineIndex === lines.length - 1 ? block.marginAfter : 0;
    // En la misma página los márgenes vecinos se quedan en el mayor. Al cruzar el hueco no colapsan.
    let before = lineIndex === 0 ? (used() === 0 ? block.marginBefore : Math.max(0, block.marginBefore - carriedMargin())) : 0;
    let cost = before + line.height + after;
    if (used() > 0 && used() + cost > contentHeight) {
      if (overflow()) return true;
      before = lineIndex === 0 ? block.marginBefore : 0;
      cost = before + line.height + after;
    }
    const current = fragments[fragments.length - 1];
    if (current && current.blockId === block.blockId && current.to === line.from) current.to = line.to;
    else pushFragment(fragments, block, line.from, line.to);
    setUsed(used() + cost);
    if (lineIndex === lines.length - 1) setCarriedMargin(block.marginAfter);
  }
  return false;
}

function collapse(block: MeasuredBlock): MeasuredLine {
  const first = block.lines[0]!;
  const last = block.lines[block.lines.length - 1]!;
  return {
    from: first.from,
    to: last.to,
    height: block.lines.reduce((sum, line) => sum + line.height, 0),
  };
}

function pushFragment(fragments: PageFragment[], block: MeasuredBlock, from: number, to: number) {
  fragments.push({ blockId: block.blockId, from, to, pos: block.pos + 1 + from });
}

function fullHeight(block: MeasuredBlock): number {
  return block.marginBefore + block.marginAfter + block.lines.reduce((sum, line) => sum + line.height, 0);
}

function unsplittable(type: string, kind: PaginationKind): boolean {
  return keepTogether(type, kind) || keepWithNext(type, kind);
}

function keepWithNext(type: string, kind: PaginationKind): boolean {
  return kind === "script" ? SCRIPT_KEEP_WITH_NEXT.has(type) : PROSE_KEEP_WITH_NEXT.has(type);
}

function keepTogether(type: string, kind: PaginationKind): boolean {
  return kind === "script" ? SCRIPT_KEEP_TOGETHER.has(type) : PROSE_KEEP_TOGETHER.has(type);
}
