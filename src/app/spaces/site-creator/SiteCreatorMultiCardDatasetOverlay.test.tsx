import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { SiteCreatorMultiCardDatasetOverlay } from "./SiteCreatorMultiCardDatasetOverlay";
import type { MultiCardContainerLayout } from "./site-creator-multicard-layout";
import type { SiteBlueprintV1, SiteBlueprintMultiCardNode } from "./site-creator-types";

const container: MultiCardContainerLayout = {
  nodeId: "scmc_one",
  layoutMode: "grid",
  layoutRect: { x: 10, y: 20, width: 400, height: 300 },
  clipRect: { x: 10, y: 20, width: 400, height: 300 },
  cardRects: [
    { x: 10, y: 20, width: 180, height: 260 },
    { x: 214, y: 20, width: 180, height: 260 },
  ],
  gap: 24,
  scale: 1,
  count: 2,
  nav: { visibility: "auto", style: "arrows" },
  axis: null,
  step: 0,
  overflow: false,
  scrollIndex: 0,
  visibleCount: 2,
};

function dataset(): Dataset {
  return {
    id: "ds1",
    name: "Catálogo",
    scope: "local",
    lists: [
      {
        id: "list_products",
        name: "Productos",
        key: "productos",
        schema: [
          { id: "f_title", key: "titulo", label: "Título", type: "text", required: false },
          { id: "f_size", key: "talla", label: "Talla", type: "text", required: false },
        ],
        cards: Array.from({ length: 26 }, (_, i) => ({
          id: `row_${i + 1}`,
          values: { f_title: { type: "text", value: `Pieza ${i + 1}` } },
        })),
      },
      {
        id: "list_team",
        name: "Equipo",
        key: "equipo",
        schema: [{ id: "f_name", key: "nombre", label: "Nombre", type: "text", required: false }],
        cards: [{ id: "p1", values: { f_name: { type: "text", value: "Ana" } } }],
      },
    ],
    constants: {
      fields: [{ id: "c_brand", key: "marca", label: "Marca", type: "text", required: false }],
      values: { c_brand: { type: "text", value: "Foldder" } },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
}

function unboundBlueprint(): SiteBlueprintV1 {
  const node: SiteBlueprintMultiCardNode = {
    id: "scmc_one",
    kind: "multicard",
    label: "MultiCard",
    parentId: null,
    childIds: [],
    layerIds: ["title"],
    count: 3,
    layoutMode: "grid",
    gap: 24,
    cards: [
      { id: "scmcc_a", overrides: {} },
      { id: "scmcc_b", overrides: {} },
      { id: "scmcc_c", overrides: {} },
    ],
  };
  return { schemaVersion: 1, rootChildIds: ["scmc_one"], nodes: { scmc_one: node } };
}

function boundBlueprint(): SiteBlueprintV1 {
  const base = unboundBlueprint();
  const node = base.nodes.scmc_one as SiteBlueprintMultiCardNode;
  return {
    ...base,
    nodes: {
      scmc_one: {
        ...node,
        count: 24,
        dataset: { kind: "dataset", listId: "list_products", listKey: "productos" },
        slotBindings: { title: { source: "list", fieldId: "f_title", fieldKey: "titulo" } },
        cards: [
          { id: "scmcc_a", datasetRowId: "row_1", overrides: { title: { text: "Excepción" } } },
          ...Array.from({ length: 23 }, (_, i) => ({
            id: `scmcc_${i + 2}`,
            datasetRowId: `row_${i + 2}`,
            overrides: {},
          })),
        ],
      },
    },
  };
}

describe("SiteCreatorMultiCardDatasetOverlay", () => {
  it("muestra hojas si el MultiCard aún no reclamó lista", () => {
    const onClaim = vi.fn();
    render(
      <SiteCreatorMultiCardDatasetOverlay
        containers={[container]}
        blueprint={unboundBlueprint()}
        dataset={dataset()}
        armed={null}
        onClaimList={onClaim}
        onArmChip={() => undefined}
        onUnbindLayer={() => undefined}
      />,
    );
    expect(screen.getByTestId("site-creator-dataset-sheet-list_products")).toHaveTextContent("Productos");
    expect(screen.getByTestId("site-creator-dataset-sheet-list_team")).toHaveTextContent("Equipo");
    fireEvent.click(screen.getByTestId("site-creator-dataset-sheet-list_products"));
    expect(onClaim).toHaveBeenCalledWith("scmc_one", "list_products");
  });

  it("muestra recortes libres, pastilla enlazada, excepción y +n", () => {
    const onUnbind = vi.fn();
    render(
      <SiteCreatorMultiCardDatasetOverlay
        containers={[{ ...container, count: 24 }]}
        blueprint={boundBlueprint()}
        dataset={dataset()}
        armed={null}
        onClaimList={() => undefined}
        onArmChip={() => undefined}
        onUnbindLayer={onUnbind}
      />,
    );
    expect(screen.getByTestId("site-creator-dataset-chip-list-f_size")).toHaveTextContent("Talla");
    expect(screen.getByTestId("site-creator-dataset-chip-constant-c_brand")).toHaveTextContent("Marca");
    expect(screen.getByTestId("site-creator-dataset-bound-title")).toHaveTextContent("Título");
    expect(screen.getByTestId("site-creator-dataset-overflow")).toHaveTextContent("+2 en la lista");
    expect(screen.getByTestId("site-creator-dataset-exception-scmcc_a")).toHaveTextContent("excepción");
    fireEvent.click(screen.getByTestId("site-creator-dataset-bound-title"));
    expect(onUnbind).toHaveBeenCalledWith("scmc_one", "title");
  });

  it("no pinta nada sin Dataset", () => {
    const { container: root } = render(
      <SiteCreatorMultiCardDatasetOverlay
        containers={[container]}
        blueprint={unboundBlueprint()}
        dataset={null}
        armed={null}
        onClaimList={() => undefined}
        onArmChip={() => undefined}
        onUnbindLayer={() => undefined}
      />,
    );
    expect(root.querySelector("[data-testid='site-creator-dataset-layer']")).toBeNull();
  });
});
