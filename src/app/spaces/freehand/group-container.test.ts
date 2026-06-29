import { describe, expect, it } from "vitest";
import type { FreehandObject, GroupContainerObject } from "../FreehandStudio";
import {
  collectNodesByIds,
  collectTreeIds,
  dedupeTreeById,
  findInTree,
  flattenTreeForPanel,
  insertNodesIntoTree,
  insertLayerScopedEffectLayer,
  isSelfOrDescendant,
  removeNodesFromTree,
  resolveTreeSelection,
  ungroupContainer,
  wrapSelectionInGroup,
} from "./group-container";

/** Hoja mínima (solo los campos que tocan los helpers de árbol). */
function leaf(id: string, extra?: Partial<FreehandObject>): FreehandObject {
  return { id, type: "rect", name: id, ...extra } as unknown as FreehandObject;
}

function folder(id: string, children: FreehandObject[], collapsed = false): GroupContainerObject {
  return { id, type: "groupContainer", name: id, children, collapsed } as unknown as GroupContainerObject;
}

function makeFolder(children: FreehandObject[]): GroupContainerObject {
  return folder("G", children);
}

describe("group-container tree helpers", () => {
  it("findInTree localiza nodos anidados con padre/índice/path", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), leaf("c")])];
    const rootHit = findInTree(tree, "a")!;
    expect(rootHit.parent).toBeNull();
    expect(rootHit.index).toBe(0);

    const nested = findInTree(tree, "c")!;
    expect(nested.parent?.id).toBe("F");
    expect(nested.index).toBe(1);
    expect(nested.path).toEqual(["F"]);
  });

  it("collectTreeIds recorre carpetas en profundidad", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), folder("G", [leaf("d")])])];
    expect(collectTreeIds(tree)).toEqual(["a", "F", "b", "G", "d"]);
  });

  it("collectNodesByIds encuentra capas anidadas en orden de árbol", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), folder("G", [leaf("d"), leaf("e")])])];
    // Selección mixta: una raíz y dos anidadas a distinta profundidad.
    const got = collectNodesByIds(tree, new Set(["a", "d", "b"]));
    expect(got.map((o) => o.id)).toEqual(["a", "b", "d"]);
    // Documento plano: idéntico a un filter sobre la raíz.
    const flat = [leaf("x"), leaf("y"), leaf("z")];
    expect(collectNodesByIds(flat, new Set(["z", "x"])).map((o) => o.id)).toEqual(["x", "z"]);
    // La carpeta también es seleccionable como nodo.
    expect(collectNodesByIds(tree, new Set(["F"])).map((o) => o.id)).toEqual(["F"]);
  });

  it("collectNodesByIds devuelve como máximo un nodo por id aunque el árbol tenga ids duplicados", () => {
    // Documento corrupto: el id "dup" aparece dos veces (raíz y dentro de una carpeta).
    const tree = [leaf("dup"), folder("F", [leaf("dup"), leaf("b")])];
    const got = collectNodesByIds(tree, new Set(["dup", "b"]));
    // "dup" sólo una vez (la primera aparición en orden de árbol) → sin keys duplicadas.
    expect(got.map((o) => o.id)).toEqual(["dup", "b"]);
  });

  it("isSelfOrDescendant evita meter una carpeta en sí misma o un descendiente", () => {
    const tree = [folder("F", [leaf("b"), folder("G", [leaf("d")])])];
    expect(isSelfOrDescendant(tree, "F", "F")).toBe(true);
    expect(isSelfOrDescendant(tree, "F", "d")).toBe(true);
    expect(isSelfOrDescendant(tree, "G", "b")).toBe(false);
  });

  it("removeNodesFromTree extrae nodos de cualquier nivel", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), leaf("c")])];
    const { tree: next, removed } = removeNodesFromTree(tree, new Set(["b"]));
    expect(removed.map((o) => o.id)).toEqual(["b"]);
    expect(findInTree(next, "b")).toBeNull();
    expect((findInTree(next, "F")!.node as GroupContainerObject).children.map((c) => c.id)).toEqual(["c"]);
  });

  it("insertNodesIntoTree: into / before / after / root-end", () => {
    const tree = [leaf("a"), folder("F", [leaf("b")])];
    const into = insertNodesIntoTree(tree, [leaf("x")], { mode: "into", containerId: "F" });
    expect((findInTree(into, "F")!.node as GroupContainerObject).children.map((c) => c.id)).toEqual(["b", "x"]);

    const before = insertNodesIntoTree(tree, [leaf("y")], { mode: "before", refId: "b" });
    expect((findInTree(before, "F")!.node as GroupContainerObject).children.map((c) => c.id)).toEqual(["y", "b"]);

    const after = insertNodesIntoTree(tree, [leaf("z")], { mode: "after", refId: "a" });
    expect(after.map((o) => o.id)).toEqual(["a", "z", "F"]);

    const end = insertNodesIntoTree(tree, [leaf("w")], { mode: "root-end" });
    expect(end.map((o) => o.id)).toEqual(["a", "F", "w"]);
  });

  it("flattenTreeForPanel pinta z alto primero y respeta plegado", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), leaf("c")])];
    const rows = flattenTreeForPanel(tree);
    // Orden de panel (arriba→abajo): F (depth0), c (depth1), b (depth1), a (depth0)
    expect(rows.map((r) => r.obj.id)).toEqual(["F", "c", "b", "a"]);
    expect(rows.find((r) => r.obj.id === "c")!.depth).toBe(1);

    const collapsed = [leaf("a"), folder("F", [leaf("b")], true)];
    expect(flattenTreeForPanel(collapsed).map((r) => r.obj.id)).toEqual(["F", "a"]);
  });

  it("flattenTreeForPanel emite una sola fila por id aunque el árbol tenga ids duplicados", () => {
    // Documento corrupto: "dup" aparece en raíz y dentro de una carpeta → keys de React duplicadas.
    const tree = [leaf("dup"), folder("F", [leaf("dup"), leaf("b")])];
    const ids = flattenTreeForPanel(tree).map((r) => r.obj.id);
    // Cada id una sola vez; conserva la primera aparición en orden de panel (z alto primero).
    expect(ids).toEqual(["F", "b", "dup"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("wrapSelectionInGroup agrupa selección de raíz en la posición del más alto", () => {
    const tree = [leaf("a"), leaf("b"), leaf("c")];
    const res = wrapSelectionInGroup(tree, new Set(["a", "c"]), makeFolder)!;
    // a y c salen; la carpeta ocupa la posición del más alto (c, índice 2 → tras quitar a queda índice 1)
    expect(res.tree.map((o) => o.id)).toEqual(["b", "G"]);
    expect((findInTree(res.tree, "G")!.node as GroupContainerObject).children.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("wrapSelectionInGroup agrupa dentro de una carpeta cuando la selección vive ahí", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), leaf("c"), leaf("d")])];
    const res = wrapSelectionInGroup(tree, new Set(["b", "d"]), makeFolder)!;
    const f = findInTree(res.tree, "F")!.node as GroupContainerObject;
    expect(f.children.map((c) => c.id)).toEqual(["c", "G"]);
  });

  it("ungroupContainer disuelve la carpeta en su posición", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), leaf("c")])];
    const res = ungroupContainer(tree, "F")!;
    expect(res.tree.map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(res.childIds).toEqual(["b", "c"]);
  });
});

describe("dedupeTreeById — integridad del árbol", () => {
  it("devuelve la MISMA referencia si no hay duplicados", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), leaf("c")])];
    expect(dedupeTreeById(tree)).toBe(tree);
  });

  it("elimina duplicados a nivel raíz conservando la primera aparición", () => {
    const dupA = leaf("a");
    const tree = [dupA, leaf("b"), leaf("a")];
    const out = dedupeTreeById(tree);
    expect(out.map((o) => o.id)).toEqual(["a", "b"]);
    expect(out[0]).toBe(dupA);
  });

  it("elimina una capa que aparece a la vez en raíz y dentro de una carpeta", () => {
    // 'b' está duplicada: en la raíz y dentro de la carpeta F. La raíz aparece primero.
    const tree = [leaf("b"), folder("F", [leaf("b"), leaf("c")])];
    const out = dedupeTreeById(tree);
    expect(collectTreeIds(out)).toEqual(["b", "F", "c"]);
  });

  it("elimina duplicados dentro de carpetas anidadas", () => {
    const tree = [folder("F", [leaf("x"), folder("G", [leaf("x"), leaf("y")])])];
    const out = dedupeTreeById(tree);
    expect(collectTreeIds(out)).toEqual(["F", "x", "G", "y"]);
  });
});

describe("resolveTreeSelection — selección consciente del árbol", () => {
  it("selecciona una capa anidada (que find a nivel raíz no encontraría)", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), leaf("c")])];
    const sel = resolveTreeSelection(tree, "c", new Set(), false);
    expect([...sel]).toEqual(["c"]);
  });

  it("expande el grupo vectorial (groupId) aunque viva dentro de una carpeta", () => {
    const tree = [
      folder("F", [leaf("b", { groupId: "g1" }), leaf("c", { groupId: "g1" }), leaf("d")]),
    ];
    const sel = resolveTreeSelection(tree, "b", new Set(), false);
    expect([...sel].sort()).toEqual(["b", "c"]);
  });

  it("no expande el grupo en aislamiento vectorial", () => {
    const tree = [leaf("b", { groupId: "g1" }), leaf("c", { groupId: "g1" })];
    const sel = resolveTreeSelection(tree, "b", new Set(), false, { vectorIsolationGroupId: "g1" });
    expect([...sel]).toEqual(["b"]);
  });

  it("shift alterna la pertenencia de los miembros", () => {
    const tree = [leaf("a"), folder("F", [leaf("b"), leaf("c")])];
    const add = resolveTreeSelection(tree, "b", new Set(["a"]), true);
    expect([...add].sort()).toEqual(["a", "b"]);
    const remove = resolveTreeSelection(tree, "b", new Set(["a", "b"]), true);
    expect([...remove]).toEqual(["a"]);
  });

  it("id inexistente → copia segura de la selección actual", () => {
    const tree = [leaf("a")];
    const cur = new Set(["a"]);
    const sel = resolveTreeSelection(tree, "zzz", cur, false);
    expect([...sel]).toEqual(["a"]);
    expect(sel).not.toBe(cur);
  });

  it("insertLayerScopedEffectLayer coloca la capa fx dentro de la carpeta padre", () => {
    const target = leaf("img");
    const tree = [folder("F", [leaf("bg"), target])];
    const fx = { id: "fx-1", type: "adjustmentLayer", name: "fx" } as unknown as FreehandObject;
    const next = insertLayerScopedEffectLayer(tree, fx, "img");
    const folderNode = findInTree(next, "F")!.node as GroupContainerObject;
    expect(folderNode.children.map((c) => c.id)).toEqual(["bg", "img", "fx-1"]);
    expect(findInTree(next, "fx-1")?.parent?.id).toBe("F");
  });
});
