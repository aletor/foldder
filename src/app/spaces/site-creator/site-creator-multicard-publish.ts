/**
 * Plan de publicación MultiCard: viewport + track, no clip-path por capa.
 * El índice del carrusel lo mueve el JS publicado; el compile resuelve en 0.
 */
import type { FreehandObject } from "../FreehandStudio";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import { parseMultiCardInstanceId } from "./site-creator-multicard-ids";
import type { MultiCardContainerLayout } from "./site-creator-multicard-layout";
import { MULTICARD_SCROLL_DURATION_MS } from "./site-creator-multicard-layout";
import type { SiteCreatorResponsiveResolveResult } from "./site-creator-responsive";
import { isSiteMultiCardNode, type SiteBlueprintV1 } from "./site-creator-types";

export type MultiCardPublishBandName = "wide" | "tablet" | "mobile";

export type MultiCardPublishBandSpec = {
  nodeId: string;
  layoutRect: { x: number; y: number; width: number; height: number };
  axis: "h" | "v" | null;
  step: number;
  overflow: boolean;
  count: number;
  visibleCount: number;
  pageWidth: number;
  navVisibility: "auto" | "hidden";
  navStyle: "arrows" | "dots";
};

export type MultiCardPublishPlan = {
  nodeIds: string[];
  layerToNode: Map<string, string>;
  byBand: Record<MultiCardPublishBandName, MultiCardPublishBandSpec[]>;
};

function visitOwnedLayers(
  objects: FreehandObject[] | undefined,
  coverage: Set<string>,
  nodeId: string,
  into: Set<string>,
  inside = false,
): void {
  for (const obj of objects ?? []) {
    const inst = parseMultiCardInstanceId(obj.id);
    const owned = inside || coverage.has(obj.id) || inst?.nodeId === nodeId;
    if (owned) into.add(obj.id);
    if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
      visitOwnedLayers((obj as { children?: FreehandObject[] }).children, coverage, nodeId, into, owned);
    } else if (obj.type === "clippingContainer") {
      const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
      if (clip.mask) visitOwnedLayers([clip.mask], coverage, nodeId, into, owned);
      visitOwnedLayers(clip.content, coverage, nodeId, into, owned);
    }
  }
}

function specsFromResult(result: SiteCreatorResponsiveResolveResult): MultiCardPublishBandSpec[] {
  const pageWidth = result.layout.layoutWidth;
  return (result.multiCard?.containers ?? []).map((container) => specFromContainer(container, pageWidth));
}

function specFromContainer(container: MultiCardContainerLayout, pageWidth: number): MultiCardPublishBandSpec {
  return {
    nodeId: container.nodeId,
    layoutRect: { ...container.layoutRect },
    axis: container.axis,
    step: container.step,
    overflow: container.overflow,
    count: container.count,
    visibleCount: container.visibleCount,
    pageWidth,
    navVisibility: container.nav.visibility,
    navStyle: container.nav.style,
  };
}

export function buildMultiCardPublishPlan(args: {
  blueprint: SiteBlueprintV1;
  wide: SiteCreatorResponsiveResolveResult;
  tablet: SiteCreatorResponsiveResolveResult;
  mobile: SiteCreatorResponsiveResolveResult;
}): MultiCardPublishPlan {
  const nodeIds: string[] = [];
  const layerToNode = new Map<string, string>();
  for (const node of Object.values(args.blueprint.nodes)) {
    if (!isSiteMultiCardNode(node)) continue;
    nodeIds.push(node.id);
    const coverage = new Set(collectSemanticCoverageLayerIds(args.blueprint, node.id));
    const owned = new Set<string>();
    visitOwnedLayers(args.wide.displayPage.objects, coverage, node.id, owned);
    visitOwnedLayers(args.tablet.displayPage.objects, coverage, node.id, owned);
    visitOwnedLayers(args.mobile.displayPage.objects, coverage, node.id, owned);
    for (const id of owned) {
      if (!layerToNode.has(id)) layerToNode.set(id, node.id);
    }
  }
  return {
    nodeIds,
    layerToNode,
    byBand: {
      wide: specsFromResult(args.wide),
      tablet: specsFromResult(args.tablet),
      mobile: specsFromResult(args.mobile),
    },
  };
}

export function compilePublishedMultiCardScript(
  plan: MultiCardPublishPlan,
  media: { tabletMax: number; mobileMax: number },
): string {
  if (plan.nodeIds.length === 0) return "";
  const payload = {
    wide: Object.fromEntries(plan.byBand.wide.map((spec) => [spec.nodeId, spec])),
    tablet: Object.fromEntries(plan.byBand.tablet.map((spec) => [spec.nodeId, spec])),
    mobile: Object.fromEntries(plan.byBand.mobile.map((spec) => [spec.nodeId, spec])),
  };
  return `(function () {
  var flows = ${JSON.stringify(payload)};
  var tabletMax = ${Number.isFinite(media.tabletMax) ? media.tabletMax : 1e9};
  var mobileMax = ${Number.isFinite(media.mobileMax) ? media.mobileMax : -1};
  var lockedUntil = 0;
  function bandSpecs() {
    var width = document.documentElement.clientWidth || window.innerWidth;
    if (width <= mobileMax) return flows.mobile;
    if (width <= tabletMax) return flows.tablet;
    return flows.wide;
  }
  function specFor(id) {
    if (!id) return null;
    return bandSpecs()[id] || null;
  }
  function bind(root) {
    var id = root.getAttribute("data-mc");
    var track = root.querySelector(".s-mc-track");
    if (!track) return;
    var index = 0;
    function clamp(count, value, visible) {
      var vis = Math.max(1, Math.min(count || 1, visible || 1));
      var max = Math.max(0, (count || 1) - vis);
      if (!isFinite(value)) return 0;
      return Math.min(max, Math.max(0, Math.round(value)));
    }
    function apply() {
      var spec = specFor(id);
      var buttons = root.querySelectorAll(".s-mc-btn, .s-mc-dot");
      if (!spec || !spec.overflow || !spec.axis) {
        track.style.transform = "";
        root.setAttribute("data-nav", "0");
        root.setAttribute("data-axis", "none");
        for (var h = 0; h < buttons.length; h++) buttons[h].setAttribute("hidden", "");
        return;
      }
      index = clamp(spec.count, index, spec.visibleCount);
      var showNav = spec.navVisibility !== "hidden";
      root.setAttribute("data-nav", showNav ? "1" : "0");
      root.setAttribute("data-nav-style", spec.navStyle || "arrows");
      root.setAttribute("data-axis", spec.axis || "none");
      for (var b = 0; b < buttons.length; b++) {
        if (showNav) buttons[b].removeAttribute("hidden");
        else buttons[b].setAttribute("hidden", "");
      }
      var amount = spec.step * 100 / Math.max(1, spec.pageWidth);
      var t = spec.axis === "h"
        ? "translateX(calc(" + amount + "cqw * " + (-index) + "))"
        : "translateY(calc(" + amount + "cqw * " + (-index) + "))";
      track.style.transform = t;
      var dots = root.querySelectorAll(".s-mc-dot");
      for (var i = 0; i < dots.length; i++) {
        if (i === index) dots[i].setAttribute("aria-current", "true");
        else dots[i].removeAttribute("aria-current");
      }
    }
    function go(next) {
      var spec = specFor(id);
      if (!spec || !spec.overflow) return;
      index = clamp(spec.count, next, spec.visibleCount);
      apply();
    }
    function takeWheel(event) {
      var spec = specFor(id);
      if (!spec || !spec.overflow || !spec.axis) return false;
      var delta = 0;
      if (spec.axis === "h") {
        if (event.shiftKey) delta = event.deltaY || event.deltaX;
        else if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) delta = event.deltaX;
      } else if (!event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
        delta = event.deltaY;
      }
      if (Math.abs(delta) < 4) return false;
      var dir = delta > 0 ? 1 : -1;
      var next = clamp(spec.count, index + dir, spec.visibleCount);
      if (next === index) return false;
      var now = Date.now();
      if (now < lockedUntil) return true;
      lockedUntil = now + ${MULTICARD_SCROLL_DURATION_MS};
      go(next);
      return true;
    }
    root.__sMcTakeWheel = takeWheel;
    var prev = root.querySelector(".s-mc-prev");
    var next = root.querySelector(".s-mc-next");
    if (prev) prev.addEventListener("click", function (event) {
      event.preventDefault();
      go(index - 1);
    });
    if (next) next.addEventListener("click", function (event) {
      event.preventDefault();
      go(index + 1);
    });
    var dots = root.querySelectorAll(".s-mc-dot");
    for (var d = 0; d < dots.length; d++) {
      (function (dotIndex) {
        dots[dotIndex].addEventListener("click", function (event) {
          event.preventDefault();
          go(dotIndex);
        });
      })(d);
    }
    root.addEventListener("wheel", function (event) {
      if (!takeWheel(event)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });
    apply();
    window.addEventListener("resize", apply);
  }
  var roots = document.querySelectorAll("[data-mc]");
  for (var r = 0; r < roots.length; r++) bind(roots[r]);
  window.__sMcConsumeWheel = function (event) {
    var el = event.target;
    while (el && el !== document && el !== document.body) {
      if (el.getAttribute && el.getAttribute("data-mc") && typeof el.__sMcTakeWheel === "function") {
        return el.__sMcTakeWheel(event);
      }
      el = el.parentNode;
    }
    return false;
  };
})();
`;
}
