import { describe, expect, it } from "vitest";
import type { FreehandObject, GroupContainerObject } from "../FreehandStudio";
import {
  collectTreeIds,
  findInTree,
  flattenTreeForPanel,
  insertNodesIntoTree,
  isSelfOrDescendant,
  removeNodesFromTree,
  ungroupContainer,
  wrapSelectionInGroup,
} from "./group-container";

/** Hoja mínima (solo los campos que tocan los helpers de árbol). */
function leaf(id: string): FreehandObject {
  return { id, type: "rect", name: id } as unknown as FreehandObject;
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
