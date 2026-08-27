/**
 * Tests Fase 6B.2 — excepciones responsive por contenedor.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  createBlueprintHistory,
  pushBlueprintHistory,
  redoBlueprintHistory,
  undoBlueprintHistory,
} from "./site-blueprint-history";
import { cloneBlueprint } from "./site-blueprint-validate";
import { resolveSiteBlueprintReferenceState } from "./site-creator-blueprint-refs";
import {
  assertNoHorizontalOverflow,
  findDisplayObject,
  resolveSiteCreatorResponsiveDisplay,
} from "./site-creator-responsive";
import {
  fixtureHeroPanelButton,
  fixtureHorizontalCardsGroup,
} from "./site-creator-responsive-fixtures";
import {
  isAdaptationEligibleUnit,
  listBrokenResponsiveTargets,
  resolveEffectiveResponsiveMode,
  resolveResponsiveOverride,
  resolveResponsiveTarget,
  setResponsiveOverride,
  treeOverrideDotState,
} from "./site-creator-responsive-overrides";
import { buildDesignerSourceSnapshot } from "./designer-source-snapshot";
import { scaledDesignedSectionGap } from "./site-creator-section-height";

describe("site-creator-responsive-overrides 6B.2", () => {
  beforeEach(() => {
    resetSiteBlueprintIdSeqForTests();
  });

  it("A — Auto no genera persistencia", () => {
    const fx = fixtureHeroPanelButton();
    const r = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "auto",
    });
    expect(r.changed).toBe(false);
    expect(r.blueprint.responsive).toBeUndefined();
  });

  it("Monitor sin regla usa composición, y Automática sí se guarda", () => {
    const fx = fixtureHeroPanelButton();
    expect(
      resolveEffectiveResponsiveMode({
        blueprint: fx.blueprint,
        target: { kind: "blueprintNode", nodeId: fx.heroId },
        band: "monitor",
      }).mode,
    ).toBe("preserve");
    const auto = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "monitor",
      mode: "auto",
    });
    expect(auto.changed).toBe(true);
    expect(auto.blueprint.responsive?.rules[0]?.byBand).toEqual({ monitor: "auto" });
    expect(
      resolveEffectiveResponsiveMode({
        blueprint: auto.blueprint,
        target: { kind: "blueprintNode", nodeId: fx.heroId },
        band: "monitor",
      }).mode,
    ).toBe("auto");
  });

  it("B — Preserve se guarda solo en Tablet", () => {
    const fx = fixtureHeroPanelButton();
    const r = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    });
    expect(r.changed).toBe(true);
    expect(r.blueprint.responsive).toEqual({
      version: 1,
      rules: [
        {
          target: { kind: "blueprintNode", nodeId: fx.heroId },
          byBand: { tablet: "preserve" },
        },
      ],
    });
    expect(resolveResponsiveOverride(r.blueprint, { kind: "blueprintNode", nodeId: fx.heroId }, "mobile")).toBeNull();
  });

  it("C — Stack se guarda solo en Móvil", () => {
    const fx = fixtureHeroPanelButton();
    const r = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "stack",
    });
    expect(r.blueprint.responsive?.rules[0]?.byBand).toEqual({ mobile: "stack" });
    expect(resolveResponsiveOverride(r.blueprint, { kind: "blueprintNode", nodeId: fx.heroId }, "tablet")).toBeNull();
  });

  it("D — Tablet y Móvil son independientes", () => {
    const fx = fixtureHeroPanelButton();
    let bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    }).blueprint;
    bp = setResponsiveOverride({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    expect(bp.responsive?.rules[0]?.byBand).toEqual({ tablet: "preserve", mobile: "stack" });
  });

  it("E/F/G — Auto elimina banda, regla vacía y responsive", () => {
    const fx = fixtureHeroPanelButton();
    let bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    }).blueprint;
    bp = setResponsiveOverride({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    bp = setResponsiveOverride({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "auto",
    }).blueprint;
    expect(bp.responsive?.rules[0]?.byBand).toEqual({ tablet: "preserve" });
    bp = setResponsiveOverride({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "auto",
    }).blueprint;
    expect(bp.responsive).toBeUndefined();
  });

  it("H — Undo/Redo de override", () => {
    const fx = fixtureHeroPanelButton();
    let history = createBlueprintHistory(fx.blueprint);
    const next = setResponsiveOverride({
      blueprint: history.present,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    });
    history = pushBlueprintHistory(history, next.blueprint);
    expect(history.present.responsive?.rules[0]?.byBand.tablet).toBe("preserve");
    const undone = undoBlueprintHistory(history)!;
    expect(undone.present.responsive).toBeUndefined();
    const redone = redoBlueprintHistory(undone)!;
    expect(redone.present.responsive?.rules[0]?.byBand.tablet).toBe("preserve");
  });

  it("I — Persistencia tras clone (recarga)", () => {
    const fx = fixtureHeroPanelButton();
    const withRule = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    }).blueprint;
    const cloned = cloneBlueprint(withRule);
    expect(cloned.responsive).toEqual(withRule.responsive);
  });

  it("J — Original sigue siendo identidad", () => {
    const fx = fixtureHeroPanelButton();
    const withRule = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    }).blueprint;
    const index = buildSiteSelectionIndex(fx.page);
    const before = JSON.stringify(fx.page.objects);
    const result = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: withRule,
      referenceIndex: index,
      viewportWidth: 1920,
    });
    expect(result.strategy).toBe("identity");
    expect(JSON.stringify(result.displayPage.objects)).toBe(before);
  });

  it("K — Auto mantiene geometría 6B.1 (sin override = mismo resultado)", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const auto = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const withEmpty = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: { ...fx.blueprint },
      referenceIndex: index,
      viewportWidth: 390,
    });
    expect(JSON.stringify(auto.displayPage.objects)).toBe(JSON.stringify(withEmpty.displayPage.objects));
  });

  it("L — Preserve conserva relaciones y evita overflow", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    }).blueprint;
    const result = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 768,
    });
    const panel = findDisplayObject(result.displayPage, "panel")!;
    const title = findDisplayObject(result.displayPage, "title")!;
    expect(title.x).toBeGreaterThanOrEqual(panel.x - 1);
    expect(title.x + title.width).toBeLessThanOrEqual(panel.x + panel.width + 2);
    assertNoHorizontalOverflow(result.displayPage, 768);
  });

  it("M/N — Stack ordena verticalmente; fondo fuera del stack", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    const result = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const photo = findDisplayObject(result.displayPage, "photo")!;
    const panel = findDisplayObject(result.displayPage, "panel")!;
    const hero = result.resolvedLayout!.regions.find((r) => r.sectionType === "hero")!;
    expect(result.resolvedLayout!.objectClipById.photo).toEqual(hero.clipRect);
    expect(photo.width).toBeGreaterThanOrEqual(390);
    expect(panel.y).toBeGreaterThanOrEqual(hero.layoutRect.y);
    assertNoHorizontalOverflow(result.displayPage, 390);
  });

  it("O/P — Button atómico; surface con contenido (auto path intacto)", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const result = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const btn = findDisplayObject(result.displayPage, "btn_shape")!;
    const panel = findDisplayObject(result.displayPage, "panel")!;
    expect(btn.y).toBeGreaterThanOrEqual(panel.y - 1);
    expect(btn.y + btn.height).toBeLessThanOrEqual(panel.y + panel.height + 8);
  });

  it("Q — Hero y Section continúan contiguos con override", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "preserve",
    }).blueprint;
    const result = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const hero = result.resolvedLayout!.regions.find((r) => r.sectionType === "hero")!;
    const section = result.resolvedLayout!.regions.find((r) => r.sectionId === fx.sectionId)!;
    const heroNode = fx.blueprint.nodes[fx.heroId];
    const sectionNode = fx.blueprint.nodes[fx.sectionId];
    const designedGap =
      heroNode?.kind === "section" && sectionNode?.kind === "section"
        ? scaledDesignedSectionGap(heroNode, sectionNode, 390, 1920)
        : 0;
    expect(section.layoutRect.y).toBeCloseTo(hero.layoutRect.y + hero.layoutRect.height + designedGap, 0);
  });

  it("R/S — Ancestro Preserve controla; Auto reactiva descendiente", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    let bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    bp = setResponsiveOverride({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "mobile",
      mode: "preserve",
    }).blueprint;
    const controlled = resolveEffectiveResponsiveMode({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "mobile",
      index,
    });
    expect(controlled.source).toBe("ancestor");
    expect(controlled.mode).toBe("preserve");
    expect(controlled.controller).toEqual({ kind: "blueprintNode", nodeId: fx.sectionId });
    // Override descendiente no se borra
    expect(resolveResponsiveOverride(bp, { kind: "blueprintNode", nodeId: fx.groupId }, "mobile")).toBe(
      "stack",
    );
    bp = setResponsiveOverride({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.sectionId },
      band: "mobile",
      mode: "auto",
    }).blueprint;
    const reactivated = resolveEffectiveResponsiveMode({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "mobile",
      index,
    });
    expect(reactivated).toEqual({
      mode: "stack",
      source: "explicit",
      controller: { kind: "blueprintNode", nodeId: fx.groupId },
    });
  });

  it("T/U — Cluster efímero y capa individual no son target", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    expect(
      resolveResponsiveTarget({ kind: "layer", layerId: "panel" }, fx.blueprint, index),
    ).toBeNull();
    expect(
      isAdaptationEligibleUnit({ kind: "layer", layerId: "title" }, fx.blueprint, index, "mobile"),
    ).toBe(false);
    expect(
      isAdaptationEligibleUnit(
        { kind: "blueprintNode", nodeId: fx.heroId },
        fx.blueprint,
        index,
        "mobile",
      ),
    ).toBe(true);
    expect(
      isAdaptationEligibleUnit(
        { kind: "blueprintNode", nodeId: fx.heroId },
        fx.blueprint,
        index,
        "wide",
      ),
    ).toBe(false);
  });

  it("V — Cambio de viewport no escribe Blueprint (resolver puro)", () => {
    const fx = fixtureHeroPanelButton();
    const bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    }).blueprint;
    const before = JSON.stringify(bp);
    const index = buildSiteSelectionIndex(fx.page);
    resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 390,
    });
    resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 768,
    });
    expect(JSON.stringify(bp)).toBe(before);
  });

  it("W — No-op si misma opción (no escribir)", () => {
    const fx = fixtureHeroPanelButton();
    const first = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    });
    const second = setResponsiveOverride({
      blueprint: first.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    });
    expect(second.changed).toBe(false);
    expect(second.blueprint).toBe(first.blueprint);
  });

  it("X — Regla rota permanece; canal POR REVISAR", () => {
    const fx = fixtureHeroPanelButton();
    const bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: "ghost-node" },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    const broken = listBrokenResponsiveTargets(bp, buildSiteSelectionIndex(fx.page));
    expect(broken).toEqual([{ kind: "blueprintNode", nodeId: "ghost-node" }]);
    const snap = buildDesignerSourceSnapshot("d1", fx.page);
    const refs = resolveSiteBlueprintReferenceState(bp, snap);
    expect(refs.missingLayerIds).toEqual([]);
    // Regla no se borra
    expect(bp.responsive?.rules).toHaveLength(1);
  });

  it("Y — Designer page / sourceSnapshot no mutan", () => {
    const fx = fixtureHeroPanelButton();
    const pageBefore = JSON.stringify(fx.page);
    const index = buildSiteSelectionIndex(fx.page);
    const bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: bp,
      referenceIndex: index,
      viewportWidth: 390,
    });
    expect(JSON.stringify(fx.page)).toBe(pageBefore);
  });

  it("Fixture horizontal — Auto / Preserve / Stack diferencian", () => {
    const fx = fixtureHorizontalCardsGroup();
    const index = buildSiteSelectionIndex(fx.page);
    const auto = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const preserveBp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "mobile",
      mode: "preserve",
    }).blueprint;
    const preserve = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: preserveBp,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const stackBp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    const stack = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: stackBp,
      referenceIndex: index,
      viewportWidth: 390,
    });

    const a = findDisplayObject(preserve.displayPage, "card_a")!;
    const b = findDisplayObject(preserve.displayPage, "card_b")!;
    const c = findDisplayObject(preserve.displayPage, "card_c")!;
    // Preserve: fila relativa (b a la derecha de a)
    expect(b.x).toBeGreaterThan(a.x);
    expect(Math.abs(b.y - a.y)).toBeLessThan(8);

    const sa = findDisplayObject(stack.displayPage, "card_a")!;
    const sb = findDisplayObject(stack.displayPage, "card_b")!;
    const sc = findDisplayObject(stack.displayPage, "card_c")!;
    expect(sb.y).toBeGreaterThan(sa.y + sa.height - 1);
    expect(sc.y).toBeGreaterThan(sb.y + sb.height - 1);

    expect(treeOverrideDotState({
      blueprint: preserveBp,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      currentBand: "mobile",
    })).toBe("current");
    expect(treeOverrideDotState({
      blueprint: preserveBp,
      target: { kind: "blueprintNode", nodeId: fx.groupId },
      currentBand: "tablet",
    })).toBe("other");

    assertNoHorizontalOverflow(auto.displayPage, 390);
    assertNoHorizontalOverflow(preserve.displayPage, 390);
    assertNoHorizontalOverflow(stack.displayPage, 390);
  });

  it("520→mobile / 768→tablet band mapping", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    let bp = setResponsiveOverride({
      blueprint: fx.blueprint,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "mobile",
      mode: "stack",
    }).blueprint;
    bp = setResponsiveOverride({
      blueprint: bp,
      target: { kind: "blueprintNode", nodeId: fx.heroId },
      band: "tablet",
      mode: "preserve",
    }).blueprint;
    expect(
      resolveEffectiveResponsiveMode({
        blueprint: bp,
        target: { kind: "blueprintNode", nodeId: fx.heroId },
        band: "mobile",
        index,
      }).mode,
    ).toBe("stack");
    expect(
      resolveEffectiveResponsiveMode({
        blueprint: bp,
        target: { kind: "blueprintNode", nodeId: fx.heroId },
        band: "tablet",
        index,
      }).mode,
    ).toBe("preserve");
  });
});
