import { describe, expect, it } from "vitest";
import type { FreehandObject, GroupContainerObject } from "../FreehandStudio";
import { deepCloneFreehandObject, deepCloneFreehandObjectKeepIds } from "./clone-object";

function leaf(id: string): FreehandObject {
  return { id, type: "rect", name: id } as unknown as FreehandObject;
}
function folder(id: string, children: FreehandObject[]): GroupContainerObject {
  return { id, type: "groupContainer", name: id, children } as unknown as GroupContainerObject;
}

/** Ids del subárbol en pre-orden (padre antes que hijos). */
function ids(o: FreehandObject): string[] {
  const out: string[] = [];
  const walk = (n: FreehandObject) => {
    out.push(n.id);
    const kids = (n as { children?: FreehandObject[] }).children;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  walk(o);
  return out;
}

describe("clone-object", () => {
  it("deepCloneFreehandObjectKeepIds conserva el id PROPIO de cada nodo (regresión: hijos NO heredan el id de la carpeta)", () => {
    const tree = folder("F", [leaf("a"), folder("G", [leaf("b"), leaf("c")])]);
    const clone = deepCloneFreehandObjectKeepIds(tree);
    // El bug antiguo daba a TODOS los nodos el id de la raíz ("F"). Cada nodo debe conservar el suyo.
    expect(ids(clone)).toEqual(["F", "a", "G", "b", "c"]);
    // Copia profunda real: referencias distintas, mismos ids.
    expect(clone).not.toBe(tree);
    const cloneChildren = (clone as GroupContainerObject).children;
    const treeChildren = (tree as GroupContainerObject).children;
    expect(cloneChildren[0]).not.toBe(treeChildren[0]);
    expect(cloneChildren[1]).not.toBe(treeChildren[1]);
  });

  it("deepCloneFreehandObject asigna ids nuevos y únicos a todo el subárbol", () => {
    const tree = folder("F", [leaf("a"), folder("G", [leaf("b")])]);
    let n = 0;
    const clone = deepCloneFreehandObject(tree, () => `new_${n++}`);
    const got = ids(clone);
    expect(new Set(got).size).toBe(got.length);
    expect(got.every((id) => id.startsWith("new_"))).toBe(true);
    expect(got.length).toBe(4);
  });

  it("newId se invoca una vez por nodo y recibe ese nodo (política por nodo)", () => {
    const tree = folder("F", [leaf("a")]);
    const seen: string[] = [];
    deepCloneFreehandObject(tree, (node) => {
      seen.push(node.id);
      return node.id;
    });
    expect(seen).toEqual(["F", "a"]);
  });
});
