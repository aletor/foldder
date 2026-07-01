/**
 * Funciones puras del Designer Studio (sin React): claves de sesión, duplicado de página, helpers de texto.
 */
import type { FreehandObject, RectObject } from "../FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import type { SpanStyle, StoryNode } from "../indesign/text-model";
import { flattenStoryContent } from "../indesign/text-model";
import { getPageDimensions } from "../indesign/page-formats";

/** Dimensiones intrínsecas del archivo local (evita diferencias S3/CORS/EXIF vs `<Image>` remota). */
export async function readImageFilePixelSize(file: File): Promise<{ w: number; h: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      const w = bmp.width;
      const h = bmp.height;
      bmp.close();
      if (w > 0 && h > 0) return { w, h };
    } catch {
      /* fallback */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new window.Image();
  img.decoding = "async";
  img.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image-decode"));
    });
    const w = img.naturalWidth || 100;
    const h = img.naturalHeight || 100;
    return { w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Debe coincidir con `getExportSessionKey` en FreehandStudio (miniatura, PDF multipágina). */
export function designerCanvasSessionKey(
  instanceKey: string,
  pageId: string,
  width: number,
  height: number,
): string {
  return `designer-fh-${instanceKey}__${pageId}__${Math.round(width)}_${Math.round(height)}`;
}

/** Huella del contenido visible de una página; invalida miniaturas raster cuando cambia el diseño. */
/** Páginas cuyo raster del rail falta o no coincide con el contenido actual. */
export function designerPagesNeedingRailThumbnails(
  pages: DesignerPageState[],
  thumbnails: Record<string, string>,
  contentKeys: Record<string, string>,
  targetPageIds?: string[] | null,
): string[] {
  const targetSet = targetPageIds && targetPageIds.length > 0 ? new Set(targetPageIds) : null;
  const out: string[] = [];
  for (const p of pages) {
    if (targetSet && !targetSet.has(p.id)) continue;
    const key = designerPageThumbContentKey(p);
    if (thumbnails[p.id] && contentKeys[p.id] === key) continue;
    out.push(p.id);
  }
  return out;
}

export function designerPageThumbContentKey(page: DesignerPageState): string {
  const pd = getPageDimensions(page);
  const objs = page.objects ?? [];
  let acc = `${Math.round(pd.width)}x${Math.round(pd.height)}|${page.pageBackground ?? ""}|${objs.length}`;
  for (const o of objs) {
    if (!o.visible || o.isClipMask) continue;
    acc += `|${o.id}:${o.type}`;
    const geom = o as { x?: number; y?: number; width?: number; height?: number; text?: string; fill?: unknown };
    acc += `:${Math.round(geom.x ?? 0)},${Math.round(geom.y ?? 0)},${Math.round(geom.width ?? 0)},${Math.round(geom.height ?? 0)}`;
    if (typeof geom.text === "string") acc += `:t${geom.text.length}:${geom.text.slice(0, 48)}`;
    if (o.type === "rect" && o.isImageFrame) {
      const ifc = (o as RectObject).imageFrameContent;
      acc += `:if${ifc?.src?.slice(-32) ?? ""}:${ifc?.offsetX ?? 0},${ifc?.offsetY ?? 0},${ifc?.scaleX ?? 1},${ifc?.scaleY ?? 1}`;
    }
    if (o.type === "image") {
      const im = o as { src?: string };
      acc += `:im${im.src?.slice(-32) ?? ""}`;
    }
  }
  return acc;
}

let _dpgSeq = 0;
export function dpgUid(): string {
  return `dpg_${Date.now()}_${++_dpgSeq}`;
}

let _slkSeq = 0;
/** Genera una clave de slide estable y única (independiente del `id` de la página). */
export function slideUid(): string {
  return `slk_${Date.now()}_${++_slkSeq}`;
}

/**
 * Identidad estable de una slide. Si la página declara `slideKey` se usa; si no, se cae a su `id`
 * (determinista y estable salvo en clon, donde el `id` se regenera). Es el ancla por la que
 * Loop nombra columnas del Dataset por slide.
 */
export function resolveSlideKey(page: DesignerPageState): string {
  return page.slideKey && page.slideKey.trim() ? page.slideKey : page.id;
}

function collectIdsFromFreehandObject(o: FreehandObject, ids: Set<string>): void {
  ids.add(o.id);
  if (o.type === "booleanGroup" || o.type === "groupContainer") {
    for (const c of o.children) collectIdsFromFreehandObject(c, ids);
  } else if (o.type === "clippingContainer") {
    collectIdsFromFreehandObject(o.mask as FreehandObject, ids);
    for (const c of o.content) collectIdsFromFreehandObject(c, ids);
  }
}

function collectIdsFromStoryNodes(nodes: StoryNode[] | undefined, ids: Set<string>): void {
  if (!nodes) return;
  for (const n of nodes) {
    if (n.type === "paragraph") {
      ids.add(n.id);
      for (const sp of n.spans) ids.add(sp.id);
    }
  }
}

/** Copia profunda de una página con IDs nuevos (objetos, historias, marcos, guías). */
export function duplicateDesignerPageState(page: DesignerPageState): DesignerPageState {
  const raw = JSON.parse(JSON.stringify(page)) as DesignerPageState;
  const ids = new Set<string>();

  ids.add(raw.id);
  for (const o of raw.objects ?? []) collectIdsFromFreehandObject(o, ids);
  for (const s of raw.stories ?? []) {
    ids.add(s.id);
    collectIdsFromStoryNodes(s.content, ids);
    for (const fid of s.frames) ids.add(fid);
  }
  for (const tf of raw.textFrames ?? []) {
    ids.add(tf.id);
    ids.add(tf.storyId);
  }
  for (const im of raw.imageFrames ?? []) {
    ids.add(im.id);
    if (im.imageContent?.id) ids.add(im.imageContent.id);
  }
  for (const g of raw.layoutGuides ?? []) ids.add(g.id);

  const map = new Map<string, string>();
  for (const old of ids) {
    map.set(old, dpgUid());
  }

  const remap = (s: string | undefined | null): string | undefined => {
    if (s == null || s === "") return s ?? undefined;
    return map.get(s) ?? s;
  };

  function applyFreehandObject(o: FreehandObject): void {
    const nid = map.get(o.id);
    if (nid) o.id = nid;
    if (o.groupId) {
      const g = remap(o.groupId);
      if (g != null) o.groupId = g;
    }
    if (o.clipMaskId) {
      const m = remap(o.clipMaskId);
      if (m != null) o.clipMaskId = m;
    }
    if (o.storyId) {
      const sid = remap(o.storyId);
      if (sid != null) o.storyId = sid;
    }
    if (o.type === "textOnPath" && o.guidePathId) {
      const gid = remap(o.guidePathId);
      if (gid != null) o.guidePathId = gid;
    }
    if (o.type === "adjustmentLayer") {
      const adj = o as FreehandObject & {
        effectTargetFolderId?: string;
        effectTargetLayerId?: string;
      };
      if (adj.effectTargetFolderId) {
        const fid = remap(adj.effectTargetFolderId);
        if (fid != null) adj.effectTargetFolderId = fid;
      }
      if (adj.effectTargetLayerId) {
        const lid = remap(adj.effectTargetLayerId);
        if (lid != null) adj.effectTargetLayerId = lid;
      }
    }
    if (o.type === "booleanGroup" || o.type === "groupContainer") {
      for (const c of o.children) applyFreehandObject(c);
    } else if (o.type === "clippingContainer") {
      applyFreehandObject(o.mask as FreehandObject);
      for (const c of o.content) applyFreehandObject(c);
    }
  }

  const newPageId = map.get(raw.id);
  if (newPageId) raw.id = newPageId;

  // El clon genérico es "duplicar una página": es una slide NUEVA, así que su identidad estable
  // debe regenerarse (cae al nuevo `id` vía `resolveSlideKey`) para no colisionar con el original.
  // El clon de documento por fila de Loop re-estampa explícitamente el `slideKey` de plantilla.
  delete (raw as { slideKey?: string }).slideKey;

  for (const o of raw.objects ?? []) applyFreehandObject(o);

  for (const s of raw.stories ?? []) {
    const nsid = map.get(s.id);
    if (nsid) s.id = nsid;
    s.frames = s.frames.map((fid) => map.get(fid) ?? fid);
    for (const node of s.content) {
      if (node.type === "paragraph") {
        const np = map.get(node.id);
        if (np) node.id = np;
        for (const sp of node.spans) {
          const nsp = map.get(sp.id);
          if (nsp) sp.id = nsp;
        }
      }
    }
  }

  for (const tf of raw.textFrames ?? []) {
    const tid = map.get(tf.id);
    if (tid) tf.id = tid;
    const sid = map.get(tf.storyId);
    if (sid) tf.storyId = sid;
  }

  for (const im of raw.imageFrames ?? []) {
    const iid = map.get(im.id);
    if (iid) im.id = iid;
    if (im.imageContent?.id) {
      const cid = map.get(im.imageContent.id);
      if (cid) im.imageContent.id = cid;
    }
  }

  for (const g of raw.layoutGuides ?? []) {
    const gid = map.get(g.id);
    if (gid) g.id = gid;
  }

  return raw;
}

export function buildRichSpansForFrame(
  contentNodes: StoryNode[],
): Array<{ text: string; style?: SpanStyle }> {
  const runs = flattenStoryContent(contentNodes);
  const spans: Array<{ text: string; style?: SpanStyle }> = [];
  for (const run of runs) {
    const hasStyle = run.style && Object.keys(run.style).length > 0;
    spans.push({ text: run.text, ...(hasStyle ? { style: run.style } : {}) });
  }
  return spans;
}

/** Snapshot de páginas para export `.de`, fusionando el lienzo vivo de la página activa. */
export function designerPagesSnapshotForDeExport(
  pages: DesignerPageState[],
  activePageIndex: number,
  liveObjects: FreehandObject[] | null | undefined,
): DesignerPageState[] {
  const clone = JSON.parse(JSON.stringify(pages)) as DesignerPageState[];
  if (!liveObjects?.length) return clone;
  const idx = Math.max(0, Math.min(activePageIndex, clone.length - 1));
  const page = clone[idx];
  if (!page) return clone;
  clone[idx] = {
    ...page,
    objects: JSON.parse(JSON.stringify(liveObjects)) as FreehandObject[],
  };
  return clone;
}
