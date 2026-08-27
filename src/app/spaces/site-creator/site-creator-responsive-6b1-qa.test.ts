/**
 * QA cierre 6B.1 — clusters efímeros, clip de fondos, altura editorial Hero.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { buildDesignerSourceSnapshot } from "./designer-source-snapshot";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import {
  buildSiteCreatorPresentationTree,
  presentationDirectChildren,
} from "./site-creator-presentation-tree";
import {
  analyzeSectionVisualPresentation,
  findDisplayObject,
  resolveAutomaticHeroMinHeight,
  resolveSiteCreatorResponsiveDisplay,
} from "./site-creator-responsive";
import { fixtureHeroPanelButton } from "./site-creator-responsive-fixtures";
import { scaledDesignedSectionGap } from "./site-creator-section-height";

describe("site-creator-responsive 6B.1 QA", () => {
  beforeEach(() => {
    resetSiteBlueprintIdSeqForTests();
  });

  it("cluster efímero surface+title+Button sin layoutGroup ni grupo Designer", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const heroNode = fx.blueprint.nodes[fx.heroId]!;
    expect(heroNode.childIds).toEqual([fx.buttonId]);
    expect(Object.values(fx.blueprint.nodes).every((n) => n.kind !== "layoutGroup")).toBe(true);
    expect((fx.page.objects ?? []).every((o) => o.type !== "groupContainer")).toBe(true);

    // 4 unidades inmediatas de presentación: Button + panel + title + photo
    const treeBefore = buildSiteCreatorPresentationTree({
      page: fx.page,
      blueprint: fx.blueprint,
      selectionIndex: index,
      snapshot: buildDesignerSourceSnapshot("d1", fx.page),
    });
    const kidsBefore = presentationDirectChildren(
      { kind: "blueprintNode", nodeId: fx.heroId },
      treeBefore,
    );
    expect(kidsBefore).toHaveLength(4);
    expect(kidsBefore.every((k) => !/Grupo/i.test(k.label) || k.kind === "semantic")).toBe(true);
    expect(kidsBefore.some((k) => k.kind === "semantic" && k.nodeId === fx.buttonId)).toBe(true);
    expect(kidsBefore.filter((k) => k.kind === "semantic" && k.label.startsWith("Grupo")).length).toBe(
      0,
    );

    const analysis = analyzeSectionVisualPresentation({
      blueprint: fx.blueprint,
      sectionId: fx.heroId,
      index,
    })!;
    expect(analysis.background.backgroundLayerIds).toEqual(["photo"]);
    const surface = analysis.clusters.find((c) => c.kind === "surface");
    expect(surface).toBeTruthy();
    if (surface?.kind === "surface") {
      expect(surface.surfaceLayerId).toBe("panel");
      expect(surface.members.some((m) => m.kind === "button")).toBe(true);
      expect(surface.members.some((m) => m.layerIds.includes("title"))).toBe(true);
    }

    const bpBefore = JSON.stringify(fx.blueprint);
    const pageBefore = JSON.stringify(fx.page);
    const snapBefore = buildDesignerSourceSnapshot("d1", fx.page);

    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });

    expect(JSON.stringify(fx.blueprint)).toBe(bpBefore);
    expect(JSON.stringify(fx.page)).toBe(pageBefore);
    const snapAfter = buildDesignerSourceSnapshot("d1", fx.page);
    expect(snapAfter.contentHash).toBe(snapBefore.contentHash);
    expect(JSON.stringify(snapAfter.page)).toBe(JSON.stringify(snapBefore.page));
    expect(JSON.stringify(fx.blueprint).includes('"responsive"')).toBe(false);

    // Cluster solo en ResolvedResponsiveSiteLayout
    expect(mobile.resolvedLayout).toBeTruthy();
    const heroRegion = mobile.resolvedLayout!.regions.find((r) => r.sectionId === fx.heroId)!;
    expect(heroRegion.ephemeralClusters.some((c) => c.kind === "surface")).toBe(true);
    expect(Object.values(mobile.resolvedLayout!.regions.flatMap((r) => r.ephemeralClusters))).toBeTruthy();

    // Árbol sigue con 4 unidades; sin Grupo nuevo
    const displayIndex = buildSiteSelectionIndex(mobile.displayPage);
    const treeAfter = buildSiteCreatorPresentationTree({
      page: mobile.displayPage,
      blueprint: fx.blueprint,
      selectionIndex: displayIndex,
      snapshot: buildDesignerSourceSnapshot("d1", fx.page),
    });
    const kidsAfter = presentationDirectChildren(
      { kind: "blueprintNode", nodeId: fx.heroId },
      treeAfter,
    );
    expect(kidsAfter).toHaveLength(4);
    expect(kidsAfter.filter((k) => /Grupo ·/.test(k.label)).length).toBe(0);

    // Mismos nodeIds / sin reparent
    expect(fx.blueprint.nodes[fx.heroId]!.childIds).toEqual([fx.buttonId]);
    expect(fx.blueprint.nodes[fx.buttonId]!.parentId).toBe(fx.heroId);
  });

  it("viewport no crea/borra/reparenta nodos; Hero mantiene 4 unidades", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const nodeIdsBefore = Object.keys(fx.blueprint.nodes).sort();
    const parentsBefore = Object.fromEntries(
      Object.values(fx.blueprint.nodes).map((n) => [n.id, n.parentId]),
    );

    for (const width of [768, 390, 1920]) {
      resolveSiteCreatorResponsiveDisplay({
        page: fx.page,
        blueprint: fx.blueprint,
        referenceIndex: index,
        viewportWidth: width,
      });
      expect(Object.keys(fx.blueprint.nodes).sort()).toEqual(nodeIdsBefore);
      for (const [id, parent] of Object.entries(parentsBefore)) {
        expect(fx.blueprint.nodes[id]!.parentId).toBe(parent);
      }
      const tree = buildSiteCreatorPresentationTree({
        page: fx.page,
        blueprint: fx.blueprint,
        selectionIndex: index,
        snapshot: null,
      });
      expect(
        presentationDirectChildren({ kind: "blueprintNode", nodeId: fx.heroId }, tree),
      ).toHaveLength(4);
    }
  });

  it("clipRect de fondos: Hero no invade Section; Section cubre su región; sin franja residual", () => {
    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const resolved = mobile.resolvedLayout!;
    const hero = resolved.regions.find((r) => r.sectionType === "hero")!;
    const section = resolved.regions.find((r) => r.sectionId === fx.sectionId)!;

    expect(hero.backgroundLayerIds).toContain("photo");
    expect(hero.clipRect).toEqual(hero.layoutRect);
    expect(section.clipRect).toEqual(section.layoutRect);

    const photo = findDisplayObject(mobile.displayPage, "photo")!;
    expect(photo.y + photo.height).toBeLessThanOrEqual(hero.layoutRect.y + hero.layoutRect.height + 0.01);
    expect(photo.y).toBeGreaterThanOrEqual(hero.layoutRect.y - 0.01);
    expect(resolved.objectClipById.photo).toEqual(hero.clipRect);

    // Conserva el hueco de diseño entre secciones (escala de la banda)
    const heroNode = fx.blueprint.nodes[fx.heroId];
    const sectionNode = fx.blueprint.nodes[fx.sectionId];
    const designedGap =
      heroNode?.kind === "section" && sectionNode?.kind === "section"
        ? scaledDesignedSectionGap(heroNode, sectionNode, 390, 1920)
        : 0;
    expect(section.layoutRect.y).toBe(hero.layoutRect.y + hero.layoutRect.height + designedGap);

    expect(section.backgroundLayerIds).toContain("sec_bg");
    const secBg = findDisplayObject(mobile.displayPage, "sec_bg")!;
    expect(secBg.x).toBe(0);
    expect(secBg.width).toBe(390);
    expect(secBg.y).toBe(section.layoutRect.y);
    expect(secBg.height).toBe(section.layoutRect.height);
    expect(resolved.objectClipById.sec_bg).toEqual(section.clipRect);

    // Página termina en la última región (sin franja residual artificial)
    const lastBottom = section.layoutRect.y + section.layoutRect.height;
    expect(resolved.pageRect.height).toBe(lastBottom);
    expect(mobile.layout.layoutHeight).toBe(lastBottom);
  });

  it("altura editorial mínima del Hero en mobile/tablet", () => {
    expect(resolveAutomaticHeroMinHeight(390, "mobile")).toBe(
      Math.min(680, Math.max(520, 390 * 1.35)),
    );
    expect(resolveAutomaticHeroMinHeight(768, "tablet")).toBe(
      Math.min(720, Math.max(540, 768 * 0.75)),
    );
    expect(resolveAutomaticHeroMinHeight(1920, "wide")).toBe(0);

    const fx = fixtureHeroPanelButton();
    const index = buildSiteSelectionIndex(fx.page);
    const mobile = resolveSiteCreatorResponsiveDisplay({
      page: fx.page,
      blueprint: fx.blueprint,
      referenceIndex: index,
      viewportWidth: 390,
    });
    const hero = mobile.resolvedLayout!.regions.find((r) => r.sectionType === "hero")!;
    expect(hero.layoutRect.height).toBeGreaterThanOrEqual(
      resolveAutomaticHeroMinHeight(390, "mobile"),
    );
    expect(mobile.layout.layoutHeight).toBeGreaterThan(600);
  });
});
