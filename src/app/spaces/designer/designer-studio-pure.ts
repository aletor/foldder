/**
 * Funciones puras del Designer Studio (sin React): claves de sesión, duplicado de página, helpers de texto.
 */
import type { FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import type { SpanStyle, StoryNode } from "../indesign/text-model";
import { flattenStoryContent } from "../indesign/text-model";

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

let _dpgSeq = 0;
export function dpgUid(): string {
  return `dpg_${Date.now()}_${++_dpgSeq}`;
}

function collectIdsFromFreehandObject(o: FreehandObject, ids: Set<string>): void {
  ids.add(o.id);
  if (o.type === "booleanGroup") {
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
    if (o.type === "booleanGroup") {
      for (const c of o.children) applyFreehandObject(c);
    } else if (o.type === "clippingContainer") {
      applyFreehandObject(o.mask as FreehandObject);
      for (const c of o.content) applyFreehandObject(c);
    }
  }

  const newPageId = map.get(raw.id);
  if (newPageId) raw.id = newPageId;

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
