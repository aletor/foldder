import type { Edge, Node } from "@xyflow/react";
import { NODE_REGISTRY } from "./nodeRegistry";

function parseStylePx(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/px/gi, "").trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/**
 * Alineado con `getNodeLayoutDimensions` en page.tsx: measured, style (resize), y defaults por tipo.
 * Necesario para que el marco del grupo encoja al mover nodos (evita quedarse con 300×240 genéricos).
 */
function layoutDimsForBounds(n: Node): { w: number; h: number } {
  const style = n.style as { width?: number | string; height?: number | string } | undefined;
  const sw = parseStylePx(style?.width);
  const sh = parseStylePx(style?.height);
  const anyN = n as {
    measured?: { width?: number; height?: number };
    width?: number;
    height?: number;
    initialWidth?: number;
    initialHeight?: number;
  };
  const mw = anyN.measured?.width ?? anyN.width ?? anyN.initialWidth;
  const mh = anyN.measured?.height ?? anyN.height ?? anyN.initialHeight;
  const hasW = typeof mw === "number" && mw > 0;
  const hasH = typeof mh === "number" && mh > 0;
  let w = hasW ? mw : 300;
  let h = hasH ? mh : 280;
  if (!hasW || !hasH) {
    const t = n.type ?? "";
    if (t === "geminiVideo" || t === "vfxGenerator") {
      if (!hasW) w = sw ?? 380;
      if (!hasH) h = sh ?? 560;
    } else if (t === "nanoBanana" || t === "imageComposer" || t === "grokProcessor") {
      if (!hasW) w = sw ?? 400;
      if (!hasH) h = sh ?? 420;
    } else if (t === "promptInput" || t === "mediaInput") {
      if (!hasW) w = sw ?? 320;
      if (!hasH) h = sh ?? 240;
    } else {
      if (!hasW) w = sw ?? w;
      if (!hasH) h = sh ?? h;
    }
  }
  return { w: Math.max(96, w), h: Math.max(72, h) };
}

/**
 * Mismos límites que el layout interno del marco de grupo (`recomputeCanvasGroupFrames`).
 * Exportado para auto-layout en el lienzo (evita solapes y respeta resize + `canvasGroup`).
 */
export function nodeBoundsForLayout(n: Node): { w: number; h: number } {
  return layoutDimsForBounds(n);
}

export const CG_SEP = "@@";

/** Proxy target: external → member input */
export function encodeCanvasGroupInHandle(memberId: string, handleId: string): string {
  return `g_in_${memberId.replace(/@/g, "_")}${CG_SEP}${handleId}`;
}

/** Proxy source: member output → external */
export function encodeCanvasGroupOutHandle(memberId: string, handleId: string): string {
  return `g_out_${memberId.replace(/@/g, "_")}${CG_SEP}${handleId}`;
}

export function parseCanvasGroupInHandle(
  id: string | null | undefined
): { memberId: string; handleId: string } | null {
  if (!id || !id.startsWith("g_in_")) return null;
  const rest = id.slice("g_in_".length);
  const i = rest.indexOf(CG_SEP);
  if (i === -1) return null;
  return { memberId: rest.slice(0, i), handleId: rest.slice(i + CG_SEP.length) };
}

export function parseCanvasGroupOutHandle(
  id: string | null | undefined
): { memberId: string; handleId: string } | null {
  if (!id || !id.startsWith("g_out_")) return null;
  const rest = id.slice("g_out_".length);
  const i = rest.indexOf(CG_SEP);
  if (i === -1) return null;
  return { memberId: rest.slice(0, i), handleId: rest.slice(i + CG_SEP.length) };
}

/**
 * `data.value` del nodo que alimenta una arista (texto prompt, URL de imagen, etc.).
 * Si el origen es un `canvasGroup` plegado, la arista usa `sourceHandle` `g_out_*` apuntando al
 * miembro; el nodo grupo no tiene `value` — hay que leer del hijo.
 */
export function resolvePromptValueFromEdgeSource(
  edge: Pick<Edge, "source" | "sourceHandle">,
  nodes: Node[]
): string {
  const src = nodes.find((n) => n.id === edge.source);
  if (!src) return "";
  if (src.type === "canvasGroup" && edge.sourceHandle?.startsWith("g_out_")) {
    const p = parseCanvasGroupOutHandle(edge.sourceHandle);
    if (!p) return "";
    const inner = nodes.find((n) => n.id === p.memberId);
    if (!inner?.data) return "";
    const v = (inner.data as { value?: unknown }).value;
    return typeof v === "string" ? v : "";
  }
  const v = (src.data as { value?: unknown })?.value;
  return typeof v === "string" ? v : "";
}

/**
 * Escribe `data.value` en el nodo que alimenta la arista (mismo criterio que
 * `resolvePromptValueFromEdgeSource`), para editar el prompt desde Studio y verlo en el grafo.
 */
export function applyPromptValueToEdgeSource(
  edge: Pick<Edge, "source" | "sourceHandle">,
  nodes: Node[],
  newValue: string
): Node[] {
  const src = nodes.find((n) => n.id === edge.source);
  if (!src) return nodes;
  if (src.type === "canvasGroup" && edge.sourceHandle?.startsWith("g_out_")) {
    const p = parseCanvasGroupOutHandle(edge.sourceHandle);
    if (!p) return nodes;
    const memberId = p.memberId;
    return nodes.map((n) =>
      n.id === memberId
        ? {
            ...n,
            data: {
              ...(typeof n.data === "object" && n.data !== null ? n.data : {}),
              value: newValue,
            },
          }
        : n
    );
  }
  return nodes.map((n) =>
    n.id === edge.source
      ? {
          ...n,
          data: {
            ...(typeof n.data === "object" && n.data !== null ? n.data : {}),
            value: newValue,
          },
        }
      : n
  );
}

export type CanvasGroupBackup = {
  /** Aristas originales (cruce + internas) antes del colapso */
  crossingEdges: Edge[];
  internalEdges: Edge[];
  expandedStyle: { width?: number; height?: number };
};

export function sortNodesParentBeforeChildren(nodes: Node[]): Node[] {
  const childMap = new Map<string, Node[]>();
  for (const n of nodes) {
    if (n.parentId) {
      if (!childMap.has(n.parentId)) childMap.set(n.parentId, []);
      childMap.get(n.parentId)!.push(n);
    }
  }
  const roots = nodes.filter((n) => !n.parentId);
  const out: Node[] = [];
  for (const p of roots) {
    out.push(p);
    const ch = childMap.get(p.id);
    if (ch) out.push(...ch);
  }
  return out;
}

/** Mismos márgenes que `createCanvasGroupFromNodeIds` (marco + franja de cabecera del nodo). */
const CG_FRAME_PAD = 28;
const CG_FRAME_HEADER = 40;

/**
 * Quita `zIndex` del **style** del marco del grupo. El orden debe ir en la propiedad **`node.zIndex`**
 * (nivel superior): XY Flow calcula `internals.z` con eso, y si `style.zIndex` existe lo aplica **después**
 * y sustituye el valor interno (+1000 al seleccionar), lo que vuelve a romper el apilado.
 */
export function ensureCanvasGroupZIndex(style: object | undefined): object | undefined {
  if (!style || typeof style !== "object") return style;
  if (typeof (style as { zIndex?: number }).zIndex !== "number") return style;
  const s = { ...style } as { zIndex?: number };
  delete s.zIndex;
  return s;
}

/**
 * Migra `style.zIndex` → `node.zIndex` y elimina `zIndex` del style (cualquier tipo de nodo).
 * El wrapper de XY Flow aplica `...node.style` **después** de `internals.z`; un `style.zIndex`
 * lo sustituye y rompe el apilado padre/hijo (p. ej. hijos del `canvasGroup` quedan detrás del marco).
 */
export function normalizeNodeZIndexForXYFlow(n: Node): Node {
  const st = n.style as { zIndex?: number } | undefined;
  const sz = st?.zIndex;
  const baseTop =
    typeof (n as Node & { zIndex?: number }).zIndex === "number"
      ? (n as Node & { zIndex?: number }).zIndex!
      : 0;

  if (typeof sz !== "number") return n;

  const { zIndex: _, ...rest } = st as { zIndex?: number };
  const nextStyle = Object.keys(rest).length ? { ...rest } : undefined;

  if (sz > 0) {
    return {
      ...n,
      zIndex: Math.max(baseTop, sz),
      style: nextStyle as Node["style"],
    };
  }
  return { ...n, style: nextStyle as Node["style"] };
}

/** Solo marcos de grupo: mismo saneado + quitar zIndex residual del style del marco. */
export function normalizeCanvasGroupNodeZ(n: Node): Node {
  if (n.type !== "canvasGroup") return n;
  const m = normalizeNodeZIndexForXYFlow(n);
  const cleaned = ensureCanvasGroupZIndex(m.style);
  if (cleaned === m.style) return m;
  return { ...m, style: cleaned as Node["style"] };
}

/** Un nodo antes de guardar o tras cargar: `zIndex` solo en propiedad del nodo, no en `style`. */
export function normalizeNodeForPersistence(n: Node): Node {
  return n.type === "canvasGroup" ? normalizeCanvasGroupNodeZ(n) : normalizeNodeZIndexForXYFlow(n);
}

export function normalizeNodesForPersistence(nodes: Node[]): Node[] {
  return nodes.map(normalizeNodeForPersistence);
}

/** Todos los espacios del proyecto: mismo criterio de apilado al persistir en disco. */
export function normalizeSpacesMapNodesForPersistence(
  spaces: Record<string, { nodes?: Node[] } | undefined> | null | undefined
): Record<string, unknown> {
  if (!spaces || typeof spaces !== "object") return {};
  const out: Record<string, unknown> = { ...spaces };
  for (const key of Object.keys(out)) {
    const sp = out[key] as { nodes?: Node[] } | undefined;
    if (!sp || !Array.isArray(sp.nodes)) continue;
    out[key] = { ...sp, nodes: normalizeNodesForPersistence(sp.nodes as Node[]) };
  }
  return out;
}

/**
 * Si un `canvasGroup` no tiene ningún hijo (`parentId`), eliminar el marco y aristas colgantes.
 */
export function removeEmptyCanvasGroups(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const emptyGroupIds = new Set<string>();
  for (const n of nodes) {
    if (n.type !== "canvasGroup") continue;
    const hasChild = nodes.some((c) => c.parentId === n.id);
    if (!hasChild) emptyGroupIds.add(n.id);
  }
  if (emptyGroupIds.size === 0) return { nodes, edges };

  const nextNodes = nodes.filter((n) => !emptyGroupIds.has(n.id));
  const nextEdges = edges.filter(
    (e) => !emptyGroupIds.has(e.source) && !emptyGroupIds.has(e.target)
  );
  return { nodes: nextNodes, edges: nextEdges };
}

/**
 * Sincroniza `data.memberIds` con los hijos reales (`parentId`) y ajusta ancho/alto del marco
 * del grupo expandido al bounding box de los miembros; en colapsado recalcula el tamaño compacto.
 */
export function recomputeCanvasGroupFrames(nodes: Node[]): Node[] {
  const parentType = new Map(nodes.map((x) => [x.id, x.type as string | undefined]));
  const withFixedExpand = nodes.map((n) => {
    if (!n.parentId) return n;
    if (parentType.get(n.parentId) !== "canvasGroup") return n;
    if ((n as { expandParent?: boolean }).expandParent === false) return n;
    return { ...n, expandParent: false } as Node;
  });

  return withFixedExpand.map((node) => {
    if (node.type !== "canvasGroup") return node;
    let n = normalizeCanvasGroupNodeZ(node);

    const gid = n.id;
    const children = withFixedExpand
      .filter((c) => c.parentId === gid)
      .sort((a, b) =>
        a.position.y !== b.position.y ? a.position.y - b.position.y : a.position.x - b.position.x
      );
    const memberIds = children.map((c) => c.id);

    const prevMembers = Array.isArray((n.data as { memberIds?: string[] })?.memberIds)
      ? ((n.data as { memberIds: string[] }).memberIds ?? [])
      : [];
    const membersMatch =
      prevMembers.length === memberIds.length && prevMembers.every((id, i) => id === memberIds[i]);

    const collapsed = Boolean((n.data as { collapsed?: boolean })?.collapsed);
    const prevW = Number((n.style as { width?: number })?.width ?? NaN);
    const prevH = Number((n.style as { height?: number })?.height ?? NaN);

    const nextData = { ...(n.data as object), memberIds };

    if (collapsed) {
      const collapsedW = Math.max(200, Math.min(400, 120 + memberIds.length * 44));
      const collapsedH = 90;
      if (membersMatch && prevW === collapsedW && prevH === collapsedH) {
        const zi = (n.style as { zIndex?: number })?.zIndex;
        if (typeof zi === "number" && zi <= 0) {
          return { ...n, style: ensureCanvasGroupZIndex(n.style) as Node["style"] };
        }
        return n;
      }
      return {
        ...n,
        data: nextData,
        style: { ...ensureCanvasGroupZIndex(n.style), width: collapsedW, height: collapsedH } as Node["style"],
      };
    }

    if (children.length === 0) {
      const w = Math.max(200, Number.isFinite(prevW) ? prevW : 200);
      const h = Math.max(120, Number.isFinite(prevH) ? prevH : 120);
      if (membersMatch && prevW === w && prevH === h) {
        const zi = (n.style as { zIndex?: number })?.zIndex;
        if (typeof zi === "number" && zi <= 0) {
          return { ...n, style: ensureCanvasGroupZIndex(n.style) as Node["style"] };
        }
        return n;
      }
      return {
        ...n,
        data: nextData,
        style: { ...ensureCanvasGroupZIndex(n.style), width: w, height: h } as Node["style"],
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ch of children) {
      const { w, h } = layoutDimsForBounds(ch);
      minX = Math.min(minX, ch.position.x);
      minY = Math.min(minY, ch.position.y);
      maxX = Math.max(maxX, ch.position.x + w);
      maxY = Math.max(maxY, ch.position.y + h);
    }
    const groupW = Math.max(200, maxX - minX + CG_FRAME_PAD * 2);
    const groupH = Math.max(120, maxY - minY + CG_FRAME_PAD * 2 + CG_FRAME_HEADER);

    if (membersMatch && prevW === groupW && prevH === groupH) {
      const zi = (n.style as { zIndex?: number })?.zIndex;
      if (typeof zi === "number" && zi <= 0) {
        return { ...n, style: ensureCanvasGroupZIndex(n.style) as Node["style"] };
      }
      return n;
    }
    return {
      ...n,
      data: nextData,
      style: { ...ensureCanvasGroupZIndex(n.style), width: groupW, height: groupH } as Node["style"],
    };
  });
}

/**
 * Con el grupo colapsado, los miembros van con `hidden: true`. Las aristas solo internas
 * (ambos extremos dentro del mismo grupo) siguen en el estado del grafo para poder expandir
 * sin perder datos, pero React Flow no puede medir bien los handles de nodos ocultos: las
 * curvas y los botones X de `ButtonEdge` quedan en coordenadas basura. No las pintamos hasta
 * que el usuario expanda el marco.
 */
export function filterEdgesForCollapsedCanvasGroups(nodes: Node[], edges: Edge[]): Edge[] {
  const collapsedMemberSets: Set<string>[] = [];
  for (const n of nodes) {
    if (n.type !== "canvasGroup") continue;
    if (!(n.data as { collapsed?: boolean })?.collapsed) continue;
    const members = new Set<string>();
    const mids = (n.data as { memberIds?: string[] })?.memberIds;
    if (Array.isArray(mids)) for (const id of mids) members.add(id);
    for (const c of nodes) {
      if (c.parentId === n.id) members.add(c.id);
    }
    if (members.size > 0) collapsedMemberSets.push(members);
  }
  if (collapsedMemberSets.length === 0) return edges;

  return edges.filter((e) => {
    for (const members of collapsedMemberSets) {
      if (members.has(e.source) && members.has(e.target)) return false;
    }
    return true;
  });
}

export function applyCanvasGroupCollapse(
  groupId: string,
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } | null {
  const group = nodes.find((n) => n.id === groupId && n.type === "canvasGroup");
  if (!group) return null;
  /** Fuente de verdad: hijos en el árbol: `data.memberIds` puede desincronizarse tras refit / ediciones. */
  const fromTree = nodes.filter((n) => n.parentId === groupId).map((n) => n.id);
  const fromData = Array.isArray((group.data as { memberIds?: string[] })?.memberIds)
    ? ((group.data as { memberIds: string[] }).memberIds ?? [])
    : [];
  const memberIds = new Set<string>([...fromTree, ...fromData]);
  if (memberIds.size === 0) return null;

  const crossingIn: Edge[] = [];
  const crossingOut: Edge[] = [];
  const internal: Edge[] = [];

  for (const e of edges) {
    const s = memberIds.has(e.source);
    const t = memberIds.has(e.target);
    if (s && t) internal.push(e);
    else if (!s && t) crossingIn.push(e);
    else if (s && !t) crossingOut.push(e);
  }

  const unrelated = edges.filter((e) => {
    const s = memberIds.has(e.source);
    const t = memberIds.has(e.target);
    return !s && !t;
  });

  /** Mantener aristas puramente internas (ambos miembros) para no romper flujos dentro del grupo. */
  const newEdges: Edge[] = [...unrelated, ...internal];

  for (const e of crossingIn) {
    const th = encodeCanvasGroupInHandle(e.target, e.targetHandle ?? "prompt");
    newEdges.push({
      ...e,
      id: `${e.id}__cgin`,
      target: groupId,
      targetHandle: th,
    });
  }
  for (const e of crossingOut) {
    const sh = encodeCanvasGroupOutHandle(e.source, e.sourceHandle ?? "prompt");
    newEdges.push({
      ...e,
      id: `${e.id}__cgout`,
      source: groupId,
      sourceHandle: sh,
    });
  }

  const gw = Number((group.style as { width?: number })?.width ?? 320);
  const gh = Number((group.style as { height?: number })?.height ?? 240);
  const backup: CanvasGroupBackup = {
    crossingEdges: [...crossingIn, ...crossingOut],
    internalEdges: internal,
    expandedStyle: { width: gw, height: gh },
  };

  const collapsedW = Math.max(200, Math.min(400, 120 + memberIds.size * 44));
  const collapsedH = 90;

  const newNodes = nodes.map((n) => {
    if (n.id === groupId) {
      return {
        ...n,
        data: {
          ...n.data,
          memberIds: Array.from(memberIds),
          collapsed: true,
          collapseBackup: backup,
        },
        style: { ...ensureCanvasGroupZIndex(n.style), width: collapsedW, height: collapsedH } as Node["style"],
      };
    }
    if (memberIds.has(n.id)) {
      return { ...n, hidden: true };
    }
    return n;
  });

  return { nodes: newNodes, edges: newEdges };
}

export function applyCanvasGroupExpand(
  groupId: string,
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } | null {
  const group = nodes.find((n) => n.id === groupId && n.type === "canvasGroup");
  if (!group) return null;
  const backup = (group.data as { collapseBackup?: CanvasGroupBackup })?.collapseBackup;
  if (!backup) return null;
  const fromTree = nodes.filter((n) => n.parentId === groupId).map((n) => n.id);
  const fromData = Array.isArray((group.data as { memberIds?: string[] })?.memberIds)
    ? ((group.data as { memberIds: string[] }).memberIds ?? [])
    : [];
  const memberIds = new Set<string>([...fromTree, ...fromData]);

  const stripProxy = edges.filter((e) => {
    if (e.target === groupId && e.targetHandle?.startsWith("g_in_")) return false;
    if (e.source === groupId && e.sourceHandle?.startsWith("g_out_")) return false;
    return true;
  });

  /** Las internas ya siguen en el grafo durante el colapso; solo reponer cruces originales. */
  const restored = [...stripProxy, ...backup.crossingEdges];

  const w = backup.expandedStyle.width ?? 320;
  const h = backup.expandedStyle.height ?? 240;

  const newNodes = nodes.map((n) => {
    if (n.id === groupId) {
      const { collapseBackup: _b, ...restData } = n.data as Record<string, unknown>;
      return {
        ...n,
        data: {
          ...restData,
          collapsed: false,
        },
        style: { ...ensureCanvasGroupZIndex(n.style), width: w, height: h } as Node["style"],
      };
    }
    if (memberIds.has(n.id)) {
      const { hidden: _h, ...rest } = n as Node & { hidden?: boolean };
      return { ...rest, hidden: false };
    }
    return n;
  });

  return { nodes: newNodes, edges: restored };
}

/** Tipos de datos para validar conexión a través de un proxy */
export function resolveHandleDataType(
  nodeType: string | undefined,
  flow: "in" | "out",
  handleId: string
): string | undefined {
  if (!nodeType) return undefined;
  const meta = NODE_REGISTRY[nodeType];
  if (!meta) return undefined;
  const list = flow === "in" ? meta.inputs : meta.outputs;
  const h = list.find((x) => x.id === handleId);
  if (h) return h.type;
  if (
    /^p\d+$/.test(handleId) &&
    (nodeType === "listado" || nodeType === "concatenator" || nodeType === "enhancer")
  ) {
    return "prompt";
  }
  if (flow === "in" && handleId.startsWith("layer_") && nodeType === "imageComposer") {
    return "image";
  }
  return undefined;
}

export function createCanvasGroupFromNodeIds(
  selectedIds: string[],
  nodes: Node[],
  defaultLabel = "Grupo"
): { nodes: Node[] } | null {
  if (selectedIds.length < 2) return null;
  const selected = nodes.filter((n) => selectedIds.includes(n.id));
  if (selected.length !== selectedIds.length) return null;
  if (selected.some((n) => n.type === "canvasGroup")) return null;
  if (selected.some((n) => n.parentId)) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of selected) {
    const { w, h } = layoutDimsForBounds(n);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }

  const pad = 28;
  const header = 40;
  const groupPos = { x: minX - pad, y: minY - pad - header };
  const groupW = maxX - minX + pad * 2;
  const groupH = maxY - minY + pad * 2 + header;

  const gid = `canvasGroup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const groupNode: Node = {
    id: gid,
    type: "canvasGroup",
    position: groupPos,
    style: { width: groupW, height: groupH },
    data: {
      label: defaultLabel,
      collapsed: false,
      memberIds: selected.map((n) => n.id),
    },
    draggable: true,
    selectable: true,
  };

  const repositioned: Node[] = selected.map((n) => ({
    ...n,
    parentId: gid,
    position: {
      x: n.position.x - groupPos.x,
      y: n.position.y - groupPos.y,
    },
    extent: "parent" as const,
    /** Si es true, XY Flow solo agranda el padre y no lo encoge; el tamaño lo controla `recomputeCanvasGroupFrames`. */
    expandParent: false,
  }));

  const others = nodes.filter((n) => !selectedIds.includes(n.id));
  return {
    nodes: sortNodesParentBeforeChildren([...others, groupNode, ...repositioned]),
  };
}

export function ungroupCanvasGroup(groupId: string, nodes: Node[]): { nodes: Node[] } | null {
  const group = nodes.find((n) => n.id === groupId && n.type === "canvasGroup");
  if (!group) return null;
  const gpos = group.position;

  /**
   * Fuente de verdad: hijos en el árbol (`parentId`). `data.memberIds` puede desincronizarse tras refits;
   * si solo filtrábamos por memberIds, el nodo grupo desaparecía y los hijos seguían con `parentId`
   * al id borrado — el marco “fantasma” o el grafo quedaban incoherentes.
   */
  const next = nodes
    .filter((n) => n.id !== groupId)
    .map((n) => {
      if (n.parentId !== groupId) return n;
      const { parentId: _p, extent: _e, expandParent: _x, hidden: _h, ...rest } = n as Node & {
        parentId?: string;
        extent?: string;
        expandParent?: boolean;
        hidden?: boolean;
      };
      return {
        ...rest,
        hidden: false,
        position: {
          x: n.position.x + gpos.x,
          y: n.position.y + gpos.y,
        },
      };
    });

  return { nodes: next };
}
