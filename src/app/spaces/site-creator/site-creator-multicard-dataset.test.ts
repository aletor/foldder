import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import {
  createMultiCardFromSelection,
  createSectionFromSelection,
  setMultiCardCount,
  setMultiCardSlotBinding,
  claimMultiCardDatasetList,
} from "./site-blueprint-ops";
import {
  autoBindMoldSlots,
  collectMoldSlots,
  datasetListHiddenRowCount,
  freezeBlueprintDatasetMultiCards,
  isMultiCardDatasetBound,
  mergedOverridesForCard,
  syncBlueprintDatasetMultiCards,
  unusedDatasetFields,
} from "./site-creator-multicard-dataset";
import { compilePublishedSite, collectPublishImageRefs, publishAssetPlaceholder } from "./site-creator-publish-compile";
import { encodeMultiCardInstanceId, parseMultiCardInstanceId } from "./site-creator-multicard-ids";
import { findDisplayObject, resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import {
  createEmptySiteBlueprintV1,
  isSiteMultiCardNode,
  parseSiteCreatorNodeData,
  type SiteBlueprintMultiCardNode,
} from "./site-creator-types";

function layer(partial: Partial<FreehandObject> & { id: string; type: FreehandObject["type"] }): FreehandObject {
  const base = {
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: partial.id,
    ...partial,
  };
  if (partial.type === "text") {
    return {
      fontSize: 16,
      lineHeight: 1.2,
      fontFamily: "sans-serif",
      fontWeight: "400",
      textMode: "area",
      ...base,
    } as FreehandObject;
  }
  return base as FreehandObject;
}

function collectDisplayObjects(objects: FreehandObject[] | undefined): FreehandObject[] {
  const out: FreehandObject[] = [];
  const visit = (list: FreehandObject[] | undefined) => {
    for (const obj of list ?? []) {
      out.push(obj);
      if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
        visit((obj as { children?: FreehandObject[] }).children);
      } else if (obj.type === "clippingContainer") {
        const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
        if (clip.mask) visit([clip.mask]);
        visit(clip.content);
      }
    }
  };
  visit(objects);
  return out;
}

function page(objects: FreehandObject[]): DesignerPageState {
  return { id: "pg", format: "web169", objects };
}

function field(partial: Partial<FieldDef> & Pick<FieldDef, "id" | "key" | "label" | "type">): FieldDef {
  return { required: false, ...partial };
}

function catalog(args?: { extraList?: boolean; rows?: number; extraTextField?: boolean }): Dataset {
  const rowCount = args?.rows ?? 2;
  const schema: FieldDef[] = [
    field({ id: "f_photo", key: "foto", label: "Foto", type: "image" }),
    field({ id: "f_title", key: "titulo", label: "Título", type: "text" }),
    ...(args?.extraTextField
      ? [field({ id: "f_price", key: "precio", label: "Precio", type: "text" })]
      : []),
    field({ id: "f_flag", key: "nuevo", label: "Nuevo", type: "boolean" }),
  ];
  const cards = Array.from({ length: rowCount }, (_, i) => ({
    id: `row_${i + 1}`,
    values: {
      f_photo: {
        type: "image" as const,
        assetId: `asset_${i + 1}`,
        url: `https://cdn.example/p${i + 1}.png`,
      },
      f_title: { type: "text" as const, value: `Pieza ${i + 1}` },
      ...(args?.extraTextField ? { f_price: { type: "text" as const, value: `${10 + i} €` } } : {}),
      f_flag: { type: "boolean" as const, value: i === 0 },
    },
  }));
  const lists = [
    {
      id: "list_products",
      name: "Productos",
      key: "productos",
      schema,
      cards,
    },
  ];
  if (args?.extraList) {
    lists.push({
      id: "list_other",
      name: "Otros",
      key: "otros",
      schema: [field({ id: "f_name", key: "nombre", label: "Nombre", type: "text" })],
      cards: [{ id: "other_1", values: { f_name: { type: "text", value: "Otro" } } }],
    });
  }
  return {
    id: "ds1",
    name: "Catálogo",
    scope: "local",
    lists,
    constants: {
      fields: [field({ id: "c_brand", key: "marca", label: "Marca", type: "text" })],
      values: { c_brand: { type: "text", value: "Foldder" } },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
}

function heroWithCard(image = true) {
  const committed = page([
    layer({ id: "bg", type: "rect", x: 0, y: 0, width: 800, height: 400 }),
    image
      ? layer({
          id: "photo",
          type: "image",
          x: 40,
          y: 80,
          width: 240,
          height: 160,
          src: "https://cdn.example/mold.png",
        })
      : layer({ id: "photo", type: "rect", x: 40, y: 80, width: 240, height: 160, fill: "#888" }),
    layer({ id: "title", type: "text", x: 40, y: 260, width: 200, height: 32, text: "Card" }),
    layer({ id: "price", type: "text", x: 40, y: 300, width: 80, height: 20, text: "0 €" }),
  ]);
  const index = buildSiteSelectionIndex(committed);
  const hero = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["bg", "photo", "title", "price"],
    index,
    committedPage: committed,
    sectionType: "hero",
  });
  return { committed, index, hero };
}

function createCatalogMultiCard() {
  const { committed, index, hero } = heroWithCard();
  if (!hero.ok || !hero.createdNodeId) throw new Error("hero");
  const created = createMultiCardFromSelection({
    blueprint: hero.blueprint,
    selectedLayerIds: ["photo", "title", "price"],
    index,
    preferredParentId: hero.createdNodeId,
  });
  if (!created.ok || !created.createdNodeId) throw new Error("multicard");
  return { committed, index, nodeId: created.createdNodeId, blueprint: created.blueprint };
}

describe("MultiCard × Dataset", () => {
  it("auto-enlaza imagen y texto únicos y deja boolean y constantes sueltos", () => {
    const { index, nodeId, blueprint } = createCatalogMultiCard();
    const node = blueprint.nodes[nodeId];
    if (!node || !isSiteMultiCardNode(node)) throw new Error("node");
    const coverage = node.layerIds;
    const slots = collectMoldSlots(coverage, index);
    const dataset = catalog();
    const bindings = autoBindMoldSlots(slots, dataset.lists[0]!.schema, "list");
    expect(bindings.photo).toEqual({ source: "list", fieldId: "f_photo", fieldKey: "foto" });
    expect(bindings.title).toEqual({ source: "list", fieldId: "f_title", fieldKey: "titulo" });
    expect(bindings.price).toBeUndefined();
    const unused = unusedDatasetFields({
      dataset,
      listId: "list_products",
      bindings,
    });
    expect(unused.list.map((item) => item.id).sort()).toEqual(["f_flag"]);
    expect(unused.constants.map((item) => item.id)).toEqual(["c_brand"]);
  });

  it("enlaza precio al texto pequeño cuando hay dos columnas de texto", () => {
    const slots = [
      { layerId: "title", kind: "text" as const, area: 12000, sampleText: "Producto largo" },
      { layerId: "price", kind: "text" as const, area: 1600, sampleText: "12 €" },
    ];
    const bindings = autoBindMoldSlots(
      slots,
      catalog({ extraTextField: true }).lists[0]!.schema,
      "list",
    );
    expect(bindings.title?.fieldId).toBe("f_title");
    expect(bindings.price?.fieldId).toBe("f_price");
  });

  it("al reclamar una lista el count iguala las filas y rellena cada card", () => {
    const { committed, index, nodeId, blueprint } = createCatalogMultiCard();
    const dataset = catalog({ rows: 2 });
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset,
      listId: "list_products",
      index,
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok || !claimed.blueprint) return;
    const node = claimed.blueprint.nodes[nodeId];
    if (!node || !isSiteMultiCardNode(node)) return;
    expect(isMultiCardDatasetBound(node)).toBe(true);
    expect(node.count).toBe(2);
    expect(node.cards).toHaveLength(2);
    expect(node.cards[0]?.datasetRowId).toBe("row_1");
    expect(node.cards[1]?.datasetRowId).toBe("row_2");

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: claimed.blueprint,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
      dataset,
    });
    const moldTitle = findDisplayObject(resolved.displayPage, "title");
    expect((moldTitle as { text?: string } | undefined)?.text).toBe("Pieza 1");
    const moldPhoto = findDisplayObject(resolved.displayPage, "photo");
    expect((moldPhoto as { src?: string } | undefined)?.src).toBe("https://cdn.example/p1.png");
    const titleCopies = collectDisplayObjects(resolved.displayPage.objects).filter(
      (obj) => parseMultiCardInstanceId(obj.id)?.moldLayerId === "title",
    );
    expect(titleCopies).toHaveLength(1);
    expect((titleCopies[0] as { text?: string }).text).toBe("Pieza 2");
  });

  it("la excepción de una card gana al valor de la fila", () => {
    const { index, nodeId, blueprint } = createCatalogMultiCard();
    const dataset = catalog({ rows: 2 });
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset,
      listId: "list_products",
      index,
    });
    if (!claimed.ok || !claimed.blueprint) return;
    const node = claimed.blueprint.nodes[nodeId] as SiteBlueprintMultiCardNode;
    const card = node.cards[1]!;
    const withOverride: SiteBlueprintMultiCardNode = {
      ...node,
      cards: node.cards.map((item) =>
        item.id === card.id ? { ...item, overrides: { title: { text: "Excepción" } } } : item,
      ),
    };
    const merged = mergedOverridesForCard({
      dataset,
      node: withOverride,
      card: withOverride.cards[1]!,
      cardIndex: 1,
    });
    expect(merged.title?.text).toBe("Excepción");
    expect(merged.photo?.mediaRef?.src).toBe("https://cdn.example/p2.png");
  });

  it("al desconectar congela los valores en overrides y el sitio no se vacía", () => {
    const { committed, index, nodeId, blueprint } = createCatalogMultiCard();
    const dataset = catalog({ rows: 2 });
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset,
      listId: "list_products",
      index,
    });
    if (!claimed.ok || !claimed.blueprint) return;
    const frozen = freezeBlueprintDatasetMultiCards(claimed.blueprint, dataset);
    const node = frozen.nodes[nodeId];
    if (!node || !isSiteMultiCardNode(node)) return;
    expect(node.dataset).toBeUndefined();
    expect(node.slotBindings).toBeUndefined();
    expect(node.cards[0]?.overrides.title?.text).toBe("Pieza 1");
    expect(node.cards[1]?.overrides.title?.text).toBe("Pieza 2");
    expect(node.cards[0]?.datasetRowId).toBeUndefined();

    const resolved = resolveSiteCreatorResponsiveDisplay({
      page: committed,
      blueprint: frozen,
      referenceIndex: index,
      viewportWidth: 1920,
      band: "wide",
    });
    expect((findDisplayObject(resolved.displayPage, "title") as { text?: string } | undefined)?.text).toBe(
      "Pieza 1",
    );
  });

  it("no reclama un MultiCard manual cuando el Dataset cambia de filas", () => {
    const { nodeId, blueprint } = createCatalogMultiCard();
    const next = syncBlueprintDatasetMultiCards(blueprint, catalog({ rows: 2 }));
    const node = next.nodes[nodeId];
    if (!node || !isSiteMultiCardNode(node)) return;
    expect(node.dataset).toBeUndefined();
    expect(node.count).toBe(3);
  });

  it("al añadir filas conserva el id de la card 1", () => {
    const { index, nodeId, blueprint } = createCatalogMultiCard();
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset: catalog({ rows: 2 }),
      listId: "list_products",
      index,
    });
    if (!claimed.ok || !claimed.blueprint) return;
    const firstId = (claimed.blueprint.nodes[nodeId] as SiteBlueprintMultiCardNode).cards[0]!.id;
    const synced = syncBlueprintDatasetMultiCards(claimed.blueprint, catalog({ rows: 3 }));
    const node = synced.nodes[nodeId] as SiteBlueprintMultiCardNode;
    expect(node.count).toBe(3);
    expect(node.cards[0]?.id).toBe(firstId);
    expect(node.cards.map((card) => card.datasetRowId)).toEqual(["row_1", "row_2", "row_3"]);
  });

  it("rechaza cambiar el count a mano si hay lista enlazada", () => {
    const { index, nodeId, blueprint } = createCatalogMultiCard();
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset: catalog({ rows: 2 }),
      listId: "list_products",
      index,
    });
    if (!claimed.ok || !claimed.blueprint) return;
    const result = setMultiCardCount(claimed.blueprint, nodeId, 8);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("multicard_dataset");
  });

  it("enlaza y desenlaza una capa concreta", () => {
    const { index, nodeId, blueprint } = createCatalogMultiCard();
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset: catalog({ rows: 2 }),
      listId: "list_products",
      index,
    });
    if (!claimed.ok || !claimed.blueprint) return;
    const bound = setMultiCardSlotBinding({
      blueprint: claimed.blueprint,
      nodeId,
      moldLayerId: "price",
      binding: { source: "list", fieldId: "f_flag", fieldKey: "nuevo" },
    });
    expect(bound.ok).toBe(true);
    const node = bound.blueprint?.nodes[nodeId] as SiteBlueprintMultiCardNode;
    expect(node.slotBindings?.price?.fieldId).toBe("f_flag");
    const unbound = setMultiCardSlotBinding({
      blueprint: bound.blueprint!,
      nodeId,
      moldLayerId: "price",
      binding: null,
    });
    expect((unbound.blueprint?.nodes[nodeId] as SiteBlueprintMultiCardNode).slotBindings?.price).toBeUndefined();
  });

  it("parsea dataset, slotBindings y datasetRowId", () => {
    const parsed = parseSiteCreatorNodeData({
      schemaVersion: 1,
      blueprint: {
        schemaVersion: 1,
        rootChildIds: ["scmc_one"],
        nodes: {
          scmc_one: {
            id: "scmc_one",
            kind: "multicard",
            label: "MultiCard",
            parentId: null,
            childIds: [],
            layerIds: ["title"],
            count: 1,
            layoutMode: "grid",
            gap: 24,
            dataset: { kind: "dataset", listId: "list_products", listKey: "productos" },
            slotBindings: { title: { source: "list", fieldId: "f_title", fieldKey: "titulo" } },
            cards: [{ id: "scmcc_a", datasetRowId: "row_1", overrides: {} }],
          },
        },
      },
    });
    const node = parsed.blueprint.nodes.scmc_one as SiteBlueprintMultiCardNode;
    expect(node.dataset).toEqual({ kind: "dataset", listId: "list_products", listKey: "productos" });
    expect(node.slotBindings?.title?.fieldId).toBe("f_title");
    expect(node.cards[0]?.datasetRowId).toBe("row_1");
  });

  it("capea a 24 filas y reporta las que quedan en la lista", () => {
    const dataset = catalog({ rows: 26 });
    expect(datasetListHiddenRowCount(dataset, "list_products", 24)).toBe(2);
    const { index, nodeId, blueprint } = createCatalogMultiCard();
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset,
      listId: "list_products",
      index,
    });
    expect(claimed.ok).toBe(true);
    const node = claimed.blueprint?.nodes[nodeId] as SiteBlueprintMultiCardNode;
    expect(node.count).toBe(24);
    expect(datasetListHiddenRowCount(dataset, node.dataset!.listId, node.count)).toBe(2);
  });

  it("si la lista desaparece, congela el MultiCard y deja de estar enlazado", () => {
    const { index, nodeId, blueprint } = createCatalogMultiCard();
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset: catalog({ rows: 2 }),
      listId: "list_products",
      index,
    });
    if (!claimed.ok || !claimed.blueprint) return;
    const orphan = catalog({ extraList: true });
    orphan.lists = orphan.lists.filter((list) => list.id !== "list_products");
    const next = syncBlueprintDatasetMultiCards(claimed.blueprint, orphan);
    const node = next.nodes[nodeId];
    expect(node && isSiteMultiCardNode(node) && node.dataset).toBeFalsy();
  });

  it("publica el HTML con los textos de cada fila", () => {
    const { committed, index, nodeId, blueprint } = createCatalogMultiCard();
    const dataset = catalog({ rows: 2 });
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset,
      listId: "list_products",
      index,
    });
    if (!claimed.ok || !claimed.blueprint) return;
    const compiled = compilePublishedSite({
      page: committed,
      blueprint: claimed.blueprint,
      title: "Tienda",
      imageHrefByLayerId: {},
      dataset,
    });
    expect(compiled.html).toContain("Pieza 1");
    expect(compiled.html).toContain("Pieza 2");
  });

  it("copia las fotos del Dataset al publicar, no solo los textos", () => {
    const { committed, index, nodeId, blueprint } = createCatalogMultiCard();
    const dataset = catalog({ rows: 2 });
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset,
      listId: "list_products",
      index,
    });
    if (!claimed.ok || !claimed.blueprint) return;
    const node = claimed.blueprint.nodes[nodeId];
    if (!node || !isSiteMultiCardNode(node)) return;

    const refs = collectPublishImageRefs(committed, claimed.blueprint, dataset);
    const card1PhotoId = encodeMultiCardInstanceId({
      nodeId,
      cardId: node.cards[0]!.id,
      moldLayerId: "photo",
    });
    const card2PhotoId = encodeMultiCardInstanceId({
      nodeId,
      cardId: node.cards[1]!.id,
      moldLayerId: "photo",
    });
    expect(refs.find((ref) => ref.layerId === card1PhotoId)?.src).toBe("https://cdn.example/p1.png");
    expect(refs.find((ref) => ref.layerId === card2PhotoId)?.src).toBe("https://cdn.example/p2.png");

    const hrefMap = Object.fromEntries(
      refs.map((ref) => [ref.layerId, publishAssetPlaceholder(ref.layerId)]),
    );
    const compiled = compilePublishedSite({
      page: committed,
      blueprint: claimed.blueprint,
      title: "Tienda",
      imageHrefByLayerId: hrefMap,
      dataset,
    });
    expect(compiled.html).toContain(publishAssetPlaceholder(card1PhotoId));
    expect(compiled.html).toContain(publishAssetPlaceholder(card2PhotoId));
    expect(compiled.html).not.toMatch(/https:\/\/cdn\.example\/p[12]\.png/);
  });

  it("publica fotos de Dataset con s3Key aunque la preview sea un blob local", () => {
    const { committed, index, nodeId, blueprint } = createCatalogMultiCard();
    const dataset = catalog({ rows: 1 });
    const photo = dataset.lists[0]!.cards[0]!.values.f_photo;
    if (photo?.type === "image") {
      photo.url = "blob:http://localhost/preview";
      photo.s3Key = "knowledge-files/catalog/p1.png";
    }
    const claimed = claimMultiCardDatasetList({
      blueprint,
      nodeId,
      dataset,
      listId: "list_products",
      index,
    });
    if (!claimed.ok || !claimed.blueprint) return;
    const node = claimed.blueprint.nodes[nodeId];
    if (!node || !isSiteMultiCardNode(node)) return;
    const card1PhotoId = encodeMultiCardInstanceId({
      nodeId,
      cardId: node.cards[0]!.id,
      moldLayerId: "photo",
    });
    const refs = collectPublishImageRefs(committed, claimed.blueprint, dataset);
    const photoRef = refs.find((ref) => ref.layerId === card1PhotoId);
    expect(photoRef?.s3Key).toBe("knowledge-files/catalog/p1.png");
    expect(photoRef?.src).toBeUndefined();
  });
});
