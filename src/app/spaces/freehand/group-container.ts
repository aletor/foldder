/**
 * Carpetas del panel de capas (groupContainer) — operaciones de árbol puras.
 *
 * El documento del Designer es un array de `FreehandObject` cuyo orden es el z-order. Una carpeta
 * (`groupContainer`) introduce anidamiento: sus hijos viven en `children` y se renderizan/seleccionan
 * recursivamente. Este módulo concentra las operaciones de árbol (sin React ni estado) que usan el
 * panel y las acciones de agrupar/mover, para no salpicar el archivo gigante de FreehandStudio.
 *
 * Convención de orden: igual que el array raíz, `children[i]` por debajo de `children[i+1]` en z. El
 * panel pinta de arriba a abajo el array invertido, así que el último hijo es el más alto.
 */

import type { FreehandObject, GroupContainerObject } from "../FreehandStudio";

export function isGroupContainer(o: FreehandObject): o is GroupContainerObject {
  return o.type === "groupContainer";
}

/** Hijos de una carpeta, o `null` si el objeto no es una carpeta. */
export function getGroupChildren(o: FreehandObject): FreehandObject[] | null {
  return isGroupContainer(o) ? o.children : null;
}

/** Devuelve una copia del objeto con `children` reemplazados (no muta el original). */
export function withGroupChildren(
  o: GroupContainerObject,
  children: FreehandObject[],
): GroupContainerObject {
  return { ...o, children };
}

/**
 * Mapea en profundidad cada objeto del árbol (post-orden: primero hijos, luego el nodo). `fn` recibe
 * el nodo ya con sus hijos transformados y devuelve el nodo a colocar (o el mismo). Inmutable.
 */
export function mapTree(
  objects: FreehandObject[],
  fn: (o: FreehandObject) => FreehandObject,
): FreehandObject[] {
  return objects.map((o) => {
    if (isGroupContainer(o)) {
      const next = withGroupChildren(o, mapTree(o.children, fn));
      return fn(next);
    }
    return fn(o);
  });
}

/** Recorre en profundidad todos los nodos (raíz→hojas, padre antes que hijos). */
export function forEachTree(
  objects: FreehandObject[],
  fn: (o: FreehandObject, depth: number, parent: GroupContainerObject | null) => void,
  depth = 0,
  parent: GroupContainerObject | null = null,
): void {
  for (const o of objects) {
    fn(o, depth, parent);
    if (isGroupContainer(o)) forEachTree(o.children, fn, depth + 1, o);
  }
}

/** Aplana el árbol a una lista de ids (incluye carpetas y descendientes). */
export function collectTreeIds(objects: FreehandObject[]): string[] {
  const ids: string[] = [];
  forEachTree(objects, (o) => ids.push(o.id));
  return ids;
}

/**
 * Devuelve los nodos cuyo id está en `ids`, buscando en CUALQUIER nivel (también dentro de carpetas),
 * en orden de árbol (padre antes que hijos). Es el equivalente "consciente del árbol" de
 * `objects.filter((o) => ids.has(o.id))`: para documentos planos da exactamente el mismo resultado, pero
 * además encuentra capas anidadas en carpetas (grupos tipo Photoshop) para poder seleccionarlas y
 * editarlas sin tener que "entrar" en la carpeta.
 */
export function collectNodesByIds(
  objects: FreehandObject[],
  ids: ReadonlySet<string>,
): FreehandObject[] {
  const out: FreehandObject[] = [];
  // Devuelve como máximo un nodo por id. Si el documento tuviera ids
  // duplicados (datos corruptos), evitamos colecciones con duplicados que
  // romperían keys de React y la selección.
  const seen = new Set<string>();
  forEachTree(objects, (o) => {
    if (ids.has(o.id) && !seen.has(o.id)) {
      seen.add(o.id);
      out.push(o);
    }
  });
  return out;
}

export interface TreeLocation {
  node: FreehandObject;
  /** Carpeta contenedora, o `null` si está en la raíz. */
  parent: GroupContainerObject | null;
  /** Índice dentro de su array (raíz o `parent.children`). */
  index: number;
  /** Cadena de ids de carpetas desde la raíz hasta el nodo (excluido). */
  path: string[];
}

/** Localiza un nodo por id en cualquier nivel del árbol. */
export function findInTree(
  objects: FreehandObject[],
  id: string,
  parent: GroupContainerObject | null = null,
  path: string[] = [],
): TreeLocation | null {
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i]!;
    if (o.id === id) return { node: o, parent, index: i, path };
    if (isGroupContainer(o)) {
      const found = findInTree(o.children, id, o, [...path, o.id]);
      if (found) return found;
    }
  }
  return null;
}

/** True si `ancestorId` es la propia carpeta o un ancestro de `id` (evita meter una carpeta en sí misma). */
export function isSelfOrDescendant(
  objects: FreehandObject[],
  ancestorId: string,
  id: string,
): boolean {
  if (ancestorId === id) return true;
  const loc = findInTree(objects, ancestorId);
  if (!loc || !isGroupContainer(loc.node)) return false;
  return findInTree(loc.node.children, id) != null;
}

export interface RemoveResult {
  tree: FreehandObject[];
  removed: FreehandObject[];
}

/**
 * Quita nodos por id de cualquier nivel, devolviendo el árbol resultante y los nodos extraídos
 * (en su orden de aparición en profundidad). No desciende dentro de un nodo ya extraído.
 */
export function removeNodesFromTree(
  objects: FreehandObject[],
  ids: ReadonlySet<string>,
): RemoveResult {
  const removed: FreehandObject[] = [];
  const walk = (list: FreehandObject[]): FreehandObject[] => {
    const out: FreehandObject[] = [];
    for (const o of list) {
      if (ids.has(o.id)) {
        removed.push(o);
        continue;
      }
      if (isGroupContainer(o)) out.push(withGroupChildren(o, walk(o.children)));
      else out.push(o);
    }
    return out;
  };
  return { tree: walk(objects), removed };
}

export type InsertTarget =
  | { mode: "into"; containerId: string; /** Índice dentro de children; por defecto al final (arriba). */ index?: number }
  | { mode: "before"; refId: string }
  | { mode: "after"; refId: string }
  | { mode: "root-end" }
  | { mode: "root-start" };

/** Inserta nodos en el árbol según el destino. Inmutable; ignora destinos no encontrados (devuelve igual). */
export function insertNodesIntoTree(
  objects: FreehandObject[],
  nodes: FreehandObject[],
  target: InsertTarget,
): FreehandObject[] {
  if (nodes.length === 0) return objects;

  if (target.mode === "root-end") return [...objects, ...nodes];
  if (target.mode === "root-start") return [...nodes, ...objects];

  if (target.mode === "into") {
    return mapTree(objects, (o) => {
      if (o.id !== target.containerId || !isGroupContainer(o)) return o;
      const at = target.index ?? o.children.length;
      const next = [...o.children];
      next.splice(Math.max(0, Math.min(at, next.length)), 0, ...nodes);
      return withGroupChildren(o, next);
    });
  }

  // before / after a un nodo de referencia (en su mismo nivel)
  const insertRelative = (list: FreehandObject[]): { list: FreehandObject[]; done: boolean } => {
    const idx = list.findIndex((o) => o.id === target.refId);
    if (idx >= 0) {
      const at = target.mode === "before" ? idx : idx + 1;
      const next = [...list];
      next.splice(at, 0, ...nodes);
      return { list: next, done: true };
    }
    let done = false;
    const mapped = list.map((o) => {
      if (done || !isGroupContainer(o)) return o;
      const res = insertRelative(o.children);
      if (res.done) {
        done = true;
        return withGroupChildren(o, res.list);
      }
      return o;
    });
    return { list: mapped, done };
  };
  return insertRelative(objects).list;
}

export interface PanelRow {
  obj: FreehandObject;
  depth: number;
  parentId: string | null;
  isContainer: boolean;
  /** True si es carpeta plegada (sus hijos no se listan). */
  collapsed: boolean;
}

/**
 * Aplana el árbol para el panel de capas, de ARRIBA a ABAJO (z-order alto primero): invierte cada
 * nivel y desciende en carpetas no plegadas. Respeta `collapsed`.
 */
export function flattenTreeForPanel(objects: FreehandObject[]): PanelRow[] {
  const rows: PanelRow[] = [];
  // Emite como máximo una fila por id. Si el documento tuviera ids duplicados (misma capa en raíz +
  // dentro de una carpeta, o duplicada por una operación) el panel produciría dos filas con la misma
  // `key` de React. Dedupar aquí garantiza keys únicas ya en el PRIMER render, sin depender del
  // efecto asíncrono que sana el estado.
  const seen = new Set<string>();
  const walk = (list: FreehandObject[], depth: number, parentId: string | null) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i]!;
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const container = isGroupContainer(o);
      const collapsed = container ? !!o.collapsed : false;
      rows.push({ obj: o, depth, parentId, isContainer: container, collapsed });
      if (container && !collapsed) walk(o.children, depth + 1, o.id);
    }
  };
  walk(objects, 0, null);
  return rows;
}

/**
 * Determina el contenedor (raíz o una carpeta) donde se hará la agrupación: el del seleccionado que
 * aparezca primero en profundidad. Devuelve su id (`null` = raíz). Helper de `wrapSelectionInGroup`.
 */
function resolveGroupingParentId(
  objects: FreehandObject[],
  selectedIds: ReadonlySet<string>,
): { found: boolean; parentId: string | null } {
  for (const o of objects) {
    if (selectedIds.has(o.id)) return { found: true, parentId: null };
  }
  let result: { found: boolean; parentId: string | null } = { found: false, parentId: null };
  forEachTree(objects, (o, _depth, parent) => {
    if (result.found || !parent) return;
    if (selectedIds.has(o.id)) result = { found: true, parentId: parent.id };
  });
  return result;
}

/** Lista de hijos de un contenedor por id (raíz si `parentId` es null). */
function childrenOf(objects: FreehandObject[], parentId: string | null): FreehandObject[] | null {
  if (parentId == null) return objects;
  const loc = findInTree(objects, parentId);
  return loc && isGroupContainer(loc.node) ? loc.node.children : null;
}

/**
 * Envuelve los nodos seleccionados en una carpeta nueva. v1: agrupa los seleccionados que comparten
 * el contenedor del primer seleccionado (en profundidad); la carpeta se coloca en la posición del
 * miembro más ALTO en z. `makeFolder` recibe los hijos extraídos (en su orden de z) y devuelve la
 * carpeta completa. Devuelve el árbol nuevo y la carpeta creada, o `null` si no hay nada que agrupar.
 */
export function wrapSelectionInGroup(
  objects: FreehandObject[],
  selectedIds: ReadonlySet<string>,
  makeFolder: (children: FreehandObject[]) => GroupContainerObject,
): { tree: FreehandObject[]; folder: GroupContainerObject } | null {
  const anchor = resolveGroupingParentId(objects, selectedIds);
  if (!anchor.found) return null;
  const siblings = childrenOf(objects, anchor.parentId);
  if (!siblings) return null;

  const memberIdxs = siblings
    .map((o, i) => (selectedIds.has(o.id) ? i : -1))
    .filter((i) => i >= 0);
  if (memberIdxs.length === 0) return null;

  const members = memberIdxs.map((i) => siblings[i]!);
  const insertAt = memberIdxs[memberIdxs.length - 1]!; // el más alto en z
  const folder = makeFolder(members);

  const removedBelowAnchor = memberIdxs.filter((i) => i < insertAt).length;
  const finalAt = insertAt - removedBelowAnchor;
  const nextSiblings = siblings.filter((o) => !selectedIds.has(o.id));
  nextSiblings.splice(Math.max(0, Math.min(finalAt, nextSiblings.length)), 0, folder);

  if (anchor.parentId == null) return { tree: nextSiblings, folder };
  const tree = mapTree(objects, (o) =>
    o.id === anchor.parentId && isGroupContainer(o) ? withGroupChildren(o, nextSiblings) : o,
  );
  return { tree, folder };
}

/**
 * Integridad del árbol: elimina cualquier objeto cuyo `id` ya haya aparecido antes (en cualquier
 * nivel), conservando la primera aparición. Sirve para sanar documentos corruptos donde una capa
 * quedó referenciada dos veces (raíz + dentro de una carpeta, o duplicada por una operación), lo que
 * rompe las `key` de React en el panel y hace que "se creen capas fantasma" / "empiece a fallar todo".
 * Devuelve el mismo array si no había duplicados (estabilidad referencial → sin renders extra).
 */
export function dedupeTreeById(objects: FreehandObject[]): FreehandObject[] {
  const seen = new Set<string>();
  let changed = false;
  const walk = (list: FreehandObject[]): FreehandObject[] => {
    const out: FreehandObject[] = [];
    for (const o of list) {
      if (seen.has(o.id)) {
        changed = true;
        continue;
      }
      seen.add(o.id);
      if (isGroupContainer(o)) {
        const kids = walk(o.children);
        const sameKids =
          kids.length === o.children.length && kids.every((c, i) => c === o.children[i]);
        out.push(sameKids ? o : withGroupChildren(o, kids));
      } else {
        out.push(o);
      }
    }
    return out;
  };
  const result = walk(objects);
  return changed ? result : objects;
}

/** Ids de todos los nodos del árbol con un `groupId` concreto (grupo vectorial; pueden vivir anidados). */
export function collectTreeIdsWithGroupId(objects: FreehandObject[], groupId: string): string[] {
  const ids: string[] = [];
  forEachTree(objects, (o) => {
    if ((o as { groupId?: string }).groupId === groupId) ids.push(o.id);
  });
  return ids;
}

/**
 * Resuelve la selección al clicar un objeto del árbol (panel o lienzo), buscándolo en CUALQUIER
 * nivel (no solo en la raíz). Expande el grupo vectorial (`groupId`) salvo que sea el grupo en
 * aislamiento. Con `shiftKey` alterna la pertenencia de los miembros; sin él, reemplaza. Si el id no
 * existe en el árbol, devuelve una copia de la selección actual (no-op seguro).
 */
export function resolveTreeSelection(
  objects: FreehandObject[],
  objId: string,
  currentSel: ReadonlySet<string>,
  shiftKey: boolean,
  options?: { vectorIsolationGroupId?: string | null },
): Set<string> {
  const loc = findInTree(objects, objId);
  if (!loc) return new Set(currentSel);
  const gid = (loc.node as { groupId?: string }).groupId;
  const vecIso = options?.vectorIsolationGroupId ?? null;
  const expandGroup = Boolean(gid && !(vecIso && gid === vecIso));
  const members = expandGroup ? collectTreeIdsWithGroupId(objects, gid!) : [objId];

  if (shiftKey) {
    const s = new Set(currentSel);
    const allIn = members.every((id) => s.has(id));
    if (allIn) members.forEach((id) => s.delete(id));
    else members.forEach((id) => s.add(id));
    return s;
  }
  return new Set(members);
}

/** Disuelve una carpeta: sustituye el `groupContainer` por sus hijos en su posición. Inmutable. */
export function ungroupContainer(
  objects: FreehandObject[],
  containerId: string,
): { tree: FreehandObject[]; childIds: string[] } | null {
  const loc = findInTree(objects, containerId);
  if (!loc || !isGroupContainer(loc.node)) return null;
  const childIds = loc.node.children.map((c) => c.id);
  const splice = (list: FreehandObject[]): { list: FreehandObject[]; done: boolean } => {
    const idx = list.findIndex((o) => o.id === containerId);
    if (idx >= 0) {
      const next = [...list];
      next.splice(idx, 1, ...(list[idx] as GroupContainerObject).children);
      return { list: next, done: true };
    }
    let done = false;
    const mapped = list.map((o) => {
      if (done || !isGroupContainer(o)) return o;
      const res = splice(o.children);
      if (res.done) {
        done = true;
        return withGroupChildren(o, res.list);
      }
      return o;
    });
    return { list: mapped, done };
  };
  return { tree: splice(objects).list, childIds };
}
