/**
 * Fixtures 6B.1 — composiciones tipadas sin datos de escena real (IDs genéricos).
 */
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { buildDesignerSourceSnapshot } from "./designer-source-snapshot";
import {
  createButtonFromSelection,
  createLayoutGroupFromSelection,
  createSectionFromSelection,
} from "./site-blueprint-ops";
import { createEmptySiteBlueprintV1, type SiteBlueprintV1 } from "./site-creator-types";

export function makeLayer(
  partial: {
    id: string;
    type: FreehandObject["type"];
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    text?: string;
    fontSize?: number;
    fill?: string;
    src?: string;
    visible?: boolean;
  },
): FreehandObject {
  const base = {
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 40,
    height: partial.height ?? 40,
    rotation: 0,
    opacity: 1,
    visible: partial.visible !== false,
    locked: false,
    name: partial.name ?? partial.id,
    id: partial.id,
    type: partial.type,
  };
  if (partial.type === "text") {
    return {
      ...base,
      type: "text",
      fontSize: partial.fontSize ?? 48,
      lineHeight: 1.2,
      fontFamily: "sans-serif",
      fontWeight: "700",
      fill: partial.fill ?? "#ffffff",
      textMode: "area",
      text: partial.text ?? "Title",
    } as unknown as FreehandObject;
  }
  if (partial.type === "image") {
    return { ...base, type: "image", src: partial.src ?? "data:," } as unknown as FreehandObject;
  }
  if (partial.type === "rect") {
    return {
      ...base,
      type: "rect",
      fill: partial.fill ?? "#1e4fd6",
      stroke: "transparent",
      strokeWidth: 0,
    } as unknown as FreehandObject;
  }
  return base as unknown as FreehandObject;
}

export function makePage(objects: FreehandObject[], size = { w: 1920, h: 1080 }): DesignerPageState {
  return {
    id: "pg",
    format: "web169",
    customWidth: size.w,
    customHeight: size.h,
    objects,
  };
}

/** A — Hero: foto fondo + panel + título + Button sueltos (sin layoutGroup ni grupo Designer); Section gris debajo. */
export function fixtureHeroPanelButton(): {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  heroId: string;
  sectionId: string;
  buttonId: string;
} {
  const page = makePage([
    makeLayer({
      id: "photo",
      type: "image",
      x: 0,
      y: 0,
      width: 1920,
      height: 900,
    }),
    makeLayer({
      id: "panel",
      type: "rect",
      x: 420,
      y: 220,
      width: 1080,
      height: 420,
      fill: "#1e4fd6",
    }),
    makeLayer({
      id: "title",
      type: "text",
      x: 480,
      y: 280,
      width: 900,
      height: 100,
      text: "HOLAAAAa",
      fontSize: 64,
      fill: "#ffffff",
    }),
    makeLayer({
      id: "btn_shape",
      type: "rect",
      x: 480,
      y: 440,
      width: 220,
      height: 56,
      fill: "#0b1b3a",
    }),
    makeLayer({
      id: "btn_text",
      type: "text",
      x: 500,
      y: 450,
      width: 180,
      height: 36,
      text: "BOTOM",
      fontSize: 18,
      fill: "#ffffff",
    }),
    makeLayer({
      id: "sec_bg",
      type: "rect",
      x: 0,
      y: 940,
      width: 1920,
      height: 320,
      fill: "#c8c8c8",
    }),
    makeLayer({
      id: "sec_text",
      type: "text",
      x: 80,
      y: 1000,
      width: 600,
      height: 48,
      text: "Sección",
      fontSize: 28,
      fill: "#222222",
    }),
  ]);

  // Garantizar hermanos sueltos en la página (sin groupContainer).
  for (const o of page.objects ?? []) {
    if ((o as { children?: unknown }).children) {
      throw new Error("fixture must not contain Designer groups");
    }
  }

  const index = buildSiteSelectionIndex(page);
  const snap = buildDesignerSourceSnapshot("d1", page);
  const hero = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["photo", "panel", "title", "btn_shape", "btn_text"],
    index,
    committedPage: snap.page,
    sectionType: "hero",
  });
  if (!hero.ok) throw new Error(hero.message);
  const btn = createButtonFromSelection({
    blueprint: hero.blueprint,
    selectedLayerIds: ["btn_shape", "btn_text"],
    index,
    accessibleLabel: "BOTOM",
    labelLayerId: "btn_text",
    preferredParentId: hero.createdNodeId!,
  });
  if (!btn.ok) throw new Error(btn.message);
  const section = createSectionFromSelection({
    blueprint: btn.blueprint,
    selectedLayerIds: ["sec_bg", "sec_text"],
    index,
    committedPage: snap.page,
    sectionType: "generic",
  });
  if (!section.ok) throw new Error(section.message);

  // Sin layoutGroup en el Blueprint.
  for (const node of Object.values(section.blueprint.nodes)) {
    if (node.kind === "layoutGroup") {
      throw new Error("fixture must not contain layoutGroup");
    }
  }

  return {
    page,
    blueprint: section.blueprint,
    heroId: hero.createdNodeId!,
    sectionId: section.createdNodeId!,
    buttonId: btn.createdNodeId!,
  };
}

/** B — Hero con fondo + contenido sin panel. */
export function fixtureHeroBackgroundNoPanel(): {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  heroId: string;
} {
  const page = makePage([
    makeLayer({ id: "photo", type: "image", x: 0, y: 0, width: 1920, height: 1080 }),
    makeLayer({
      id: "title",
      type: "text",
      x: 200,
      y: 360,
      width: 800,
      height: 90,
      text: "Direct",
      fontSize: 56,
      fill: "#ffffff",
    }),
  ]);
  const index = buildSiteSelectionIndex(page);
  const snap = buildDesignerSourceSnapshot("d1", page);
  const hero = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["photo", "title"],
    index,
    committedPage: snap.page,
    sectionType: "hero",
  });
  if (!hero.ok) throw new Error(hero.message);
  return { page, blueprint: hero.blueprint, heroId: hero.createdNodeId! };
}

/** C — Section vertical simple. */
export function fixtureSimpleSection(): {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  sectionId: string;
} {
  const page = makePage([
    makeLayer({ id: "block", type: "rect", x: 100, y: 100, width: 800, height: 200, fill: "#ddd" }),
    makeLayer({
      id: "label",
      type: "text",
      x: 140,
      y: 160,
      width: 400,
      height: 40,
      text: "Simple",
      fontSize: 24,
      fill: "#111",
    }),
  ]);
  const index = buildSiteSelectionIndex(page);
  const snap = buildDesignerSourceSnapshot("d1", page);
  const section = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["block", "label"],
    index,
    committedPage: snap.page,
    sectionType: "generic",
  });
  if (!section.ok) throw new Error(section.message);
  return { page, blueprint: section.blueprint, sectionId: section.createdNodeId! };
}

/** E — Section con grupo de tres tarjetas horizontales (demo 6B.2). */
export function fixtureHorizontalCardsGroup(): {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  sectionId: string;
  groupId: string;
} {
  const page = makePage([
    makeLayer({
      id: "sec_bg",
      type: "rect",
      x: 0,
      y: 0,
      width: 1920,
      height: 520,
      fill: "#f3f4f6",
      name: "Section bg",
    }),
    makeLayer({ id: "card_a", type: "rect", x: 80, y: 120, width: 520, height: 280, fill: "#2563eb", name: "Card A" }),
    makeLayer({ id: "card_b", type: "rect", x: 640, y: 120, width: 520, height: 280, fill: "#7c3aed", name: "Card B" }),
    makeLayer({ id: "card_c", type: "rect", x: 1200, y: 120, width: 520, height: 280, fill: "#059669", name: "Card C" }),
  ]);
  const index = buildSiteSelectionIndex(page);
  const snap = buildDesignerSourceSnapshot("d1", page);
  const section = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["sec_bg", "card_a", "card_b", "card_c"],
    index,
    committedPage: snap.page,
    sectionType: "generic",
  });
  if (!section.ok) throw new Error(section.message);
  const group = createLayoutGroupFromSelection({
    blueprint: section.blueprint,
    selectedLayerIds: ["card_a", "card_b", "card_c"],
    index,
    preferredParentId: section.createdNodeId!,
    label: "Tarjetas",
  });
  if (!group.ok) throw new Error(group.message);
  return {
    page,
    blueprint: group.blueprint,
    sectionId: section.createdNodeId!,
    groupId: group.createdNodeId!,
  };
}

/** F — Contenido sin organizar: superficie + un texto (sin Group ni Section). */
export function fixtureUnorganizedSurfaceText(): {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
} {
  const page = makePage([
    makeLayer({
      id: "loose_panel",
      type: "rect",
      x: 400,
      y: 200,
      width: 720,
      height: 280,
      fill: "#1e4fd6",
      name: "Panel suelto",
    }),
    makeLayer({
      id: "loose_title",
      type: "text",
      x: 460,
      y: 280,
      width: 560,
      height: 80,
      text: "Sin organizar",
      fontSize: 48,
      fill: "#ffffff",
    }),
  ]);
  return { page, blueprint: createEmptySiteBlueprintV1() };
}

/** Section con una sola forma de fondo (no debe mostrar Adaptación). */
export function fixtureSectionBackgroundOnly(): {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  sectionId: string;
} {
  const page = makePage([
    makeLayer({
      id: "only_bg",
      type: "rect",
      x: 0,
      y: 0,
      width: 1920,
      height: 600,
      fill: "#d1d5db",
      name: "Fondo",
    }),
  ]);
  const index = buildSiteSelectionIndex(page);
  const snap = buildDesignerSourceSnapshot("d1", page);
  const section = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["only_bg"],
    index,
    committedPage: snap.page,
    sectionType: "generic",
  });
  if (!section.ok) throw new Error(section.message);
  return { page, blueprint: section.blueprint, sectionId: section.createdNodeId! };
}

/** D — Composición superpuesta ambigua → preserve. */
export function fixtureAmbiguousOverlap(): {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  sectionId: string;
} {
  const page = makePage([
    makeLayer({ id: "a", type: "image", x: 200, y: 200, width: 500, height: 400 }),
    makeLayer({ id: "b", type: "image", x: 350, y: 280, width: 480, height: 360 }),
    makeLayer({
      id: "t",
      type: "text",
      x: 320,
      y: 340,
      width: 300,
      height: 50,
      text: "Overlap",
      fontSize: 32,
    }),
  ]);
  const index = buildSiteSelectionIndex(page);
  const snap = buildDesignerSourceSnapshot("d1", page);
  const section = createSectionFromSelection({
    blueprint: createEmptySiteBlueprintV1(),
    selectedLayerIds: ["a", "b", "t"],
    index,
    committedPage: snap.page,
    sectionType: "generic",
  });
  if (!section.ok) throw new Error(section.message);
  return { page, blueprint: section.blueprint, sectionId: section.createdNodeId! };
}

/** Hotfix 6B — documento real: 1920×2027, 8 capas raíz sin Hero/Section/Grupo. */
export function fixtureRealEightLayersPage(): {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  layerIds: string[];
} {
  const page = makePage(
    [
      makeLayer({
        id: "hero_image",
        type: "image",
        x: 0,
        y: 0,
        width: 1920,
        height: 900,
        name: "Imagen hero",
      }),
      makeLayer({
        id: "white_card",
        type: "rect",
        x: 120,
        y: 720,
        width: 1680,
        height: 420,
        fill: "#ffffff",
        name: "Tarjeta blanca",
      }),
      makeLayer({
        id: "hero_claim",
        type: "text",
        x: 200,
        y: 820,
        width: 900,
        height: 120,
        text: "HERO CLAIM",
        fontSize: 96,
        fill: "#111827",
      }),
      makeLayer({
        id: "blue_panel",
        type: "rect",
        x: 200,
        y: 980,
        width: 1520,
        height: 280,
        fill: "#1e4fd6",
        name: "Panel azul",
      }),
      makeLayer({
        id: "web_title",
        type: "text",
        x: 280,
        y: 1060,
        width: 1200,
        height: 100,
        text: "Titular de la Web",
        fontSize: 72,
        fill: "#ffffff",
      }),
      makeLayer({
        id: "gray_bg",
        type: "rect",
        x: 0,
        y: 1180,
        width: 1920,
        height: 847,
        fill: "#e5e7eb",
        name: "Fondo gris",
      }),
      makeLayer({
        id: "btn_shape",
        type: "rect",
        x: 760,
        y: 1680,
        width: 400,
        height: 120,
        fill: "#7c3aed",
        name: "Forma botón",
      }),
      makeLayer({
        id: "btn_label",
        type: "text",
        x: 820,
        y: 1710,
        width: 280,
        height: 60,
        text: "BOTÓN",
        fontSize: 48,
        fill: "#ffffff",
      }),
    ],
    { w: 1920, h: 2027 },
  );
  const layerIds = [
    "hero_image",
    "white_card",
    "hero_claim",
    "blue_panel",
    "web_title",
    "gray_bg",
    "btn_shape",
    "btn_label",
  ];
  return { page, blueprint: createEmptySiteBlueprintV1(), layerIds };
}

/** Las 8 capas agrupadas en layoutGroup (composition-group). */
export function fixtureRealEightLayersGrouped(): {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  groupId: string;
  layerIds: string[];
} {
  const base = fixtureRealEightLayersPage();
  const index = buildSiteSelectionIndex(base.page);
  const snap = buildDesignerSourceSnapshot("d1", base.page);
  const group = createLayoutGroupFromSelection({
    blueprint: base.blueprint,
    selectedLayerIds: base.layerIds,
    index,
    committedPage: snap.page,
    label: "Composición libre",
  });
  if (!group.ok) throw new Error(group.message);
  return {
    page: base.page,
    blueprint: group.blueprint,
    groupId: group.createdNodeId!,
    layerIds: base.layerIds,
  };
}
