/**
 * Motor de recorrido entre secciones (rueda / teclado).
 * Natural no intercepta. Suave anima. Ancla encaja al instante.
 */
import type { SiteSectionScrollKind } from "./site-creator-types";
import type { SectionScrollHop } from "./site-creator-section-scroll";

export type ScrollStation = { id: string; y: number };

export type PlannedScrollStep = {
  kind: Exclude<SiteSectionScrollKind, "natural">;
  toId: string;
  targetY: number;
};

const AT_STATION = 16;

export function maxScrollTopForScroller(scroller: HTMLElement | Window): number {
  if (scroller === window) {
    const root = document.documentElement;
    return Math.max(0, (root?.scrollHeight ?? 0) - window.innerHeight);
  }
  const el = scroller as HTMLElement;
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

export function reachableScrollTop(scroller: HTMLElement | Window, top: number): number {
  return Math.min(Math.max(0, top), maxScrollTopForScroller(scroller));
}

export function stationIndexAtY(stations: ScrollStation[], scrollY: number): number {
  if (stations.length === 0) return -1;
  let index = 0;
  for (let i = 0; i < stations.length; i += 1) {
    if (stations[i]!.y <= scrollY + AT_STATION) index = i;
  }
  return index;
}

export function hopKindBetween(
  hops: SectionScrollHop[],
  fromId: string | null,
  toId: string,
): SiteSectionScrollKind {
  const hop = hops.find((item) => item.fromId === fromId && item.toId === toId);
  return hop?.kind ?? "natural";
}

function topForStation(
  stations: ScrollStation[],
  toId: string,
  y: number,
  maxScrollTop?: number,
): number {
  if (maxScrollTop == null) return y;
  const last = stations[stations.length - 1];
  if (last && toId === last.id) return Math.min(y, maxScrollTop);
  return y;
}

export function planScrollStep(args: {
  stations: ScrollStation[];
  hops: SectionScrollHop[];
  scrollY: number;
  direction: 1 | -1;
  /** Tope real del scroller: la última sección no inventa altura extra. */
  maxScrollTop?: number;
}): PlannedScrollStep | null {
  const stations = [...args.stations].sort((a, b) => a.y - b.y);
  if (stations.length < 1) return null;
  const index = stationIndexAtY(stations, args.scrollY);
  if (args.direction > 0) {
    const from = stations[index];
    const to = stations[index + 1];
    if (!from || !to) return null;
    const kind = hopKindBetween(args.hops, from.id, to.id);
    if (kind === "natural") return null;
    return { kind, toId: to.id, targetY: topForStation(stations, to.id, to.y, args.maxScrollTop) };
  }
  const current = stations[index] ?? stations[0]!;
  const prev = stations[index - 1];
  if (!prev) return null;
  const kind = hopKindBetween(args.hops, prev.id, current.id);
  if (kind === "natural") return null;
  return { kind, toId: prev.id, targetY: topForStation(stations, prev.id, prev.y, args.maxScrollTop) };
}

export function scrollBehaviorForKind(kind: SiteSectionScrollKind): ScrollBehavior {
  return kind === "smooth" ? "smooth" : "auto";
}

export function bindSectionScroller(args: {
  scroller: HTMLElement | Window;
  hops: SectionScrollHop[];
  stations: () => ScrollStation[];
  /** En edición, la rueda basta; las flechas no deben pelear con el lienzo. */
  bindKeyboard?: boolean;
}): () => void {
  let locked = false;
  let lockedDirection: 1 | -1 | null = null;
  let unlockTimer = 0;
  let anchoredId: string | null = null;
  const isWindow = args.scroller === window;
  const target = isWindow ? window : (args.scroller as HTMLElement);
  const readY = () => (isWindow ? window.scrollY : (args.scroller as HTMLElement).scrollTop);
  const go = (
    top: number,
    kind: Exclude<SiteSectionScrollKind, "natural">,
    toId: string,
    direction: 1 | -1,
  ) => {
    locked = true;
    lockedDirection = direction;
    anchoredId = toId;
    window.clearTimeout(unlockTimer);
    target.scrollTo({ top: reachableScrollTop(args.scroller, top), behavior: scrollBehaviorForKind(kind) });
    unlockTimer = window.setTimeout(() => {
      locked = false;
      lockedDirection = null;
      realignAnchored();
    }, kind === "smooth" ? 900 : 120);
  };
  const interceptDelta = (delta: number): boolean => {
    if (!(Math.abs(delta) > 0.5)) return false;
    const direction: 1 | -1 = delta > 0 ? 1 : -1;
    if (locked) {
      if (lockedDirection === direction) return true;
      window.clearTimeout(unlockTimer);
      locked = false;
      lockedDirection = null;
      anchoredId = null;
      return false;
    }
    const planned = planScrollStep({
      stations: args.stations(),
      hops: args.hops,
      scrollY: readY(),
      direction,
      maxScrollTop: maxScrollTopForScroller(args.scroller),
    });
    if (!planned) {
      anchoredId = null;
      return false;
    }
    const nextTop = reachableScrollTop(args.scroller, planned.targetY);
    if (Math.abs(nextTop - readY()) < 1) {
      anchoredId = null;
      return false;
    }
    go(nextTop, planned.kind, planned.toId, direction);
    return true;
  };
  const realignAnchored = () => {
    if (locked) return;
    const list = args.stations();
    if (list.length === 0) return;
    const y = readY();
    let id = anchoredId;
    if (!id) {
      const index = stationIndexAtY(list, y);
      const station = list[index];
      if (!station || Math.abs(y - station.y) > AT_STATION) return;
      id = station.id;
    }
    const station = list.find((item) => item.id === id);
    if (!station) return;
    const nextTop = reachableScrollTop(args.scroller, station.y);
    if (Math.abs(y - nextTop) < 1) return;
    target.scrollTo({ top: nextTop, behavior: "auto" });
  };
  const onWheel = (event: Event) => {
    if (!(event instanceof WheelEvent)) return;
    if (event.ctrlKey) return;
    if (!interceptDelta(event.deltaY)) return;
    event.preventDefault();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable ||
        Boolean(target.closest("[contenteditable='true'], input, textarea, select"));
      if (typing) return;
    }
    const down = event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ";
    const up = event.key === "ArrowUp" || event.key === "PageUp";
    if (!down && !up) return;
    if (!interceptDelta(down ? 40 : -40)) return;
    event.preventDefault();
  };
  const onScroll = () => {
    if (locked || !anchoredId) return;
    const station = args.stations().find((item) => item.id === anchoredId);
    if (!station || Math.abs(readY() - station.y) > AT_STATION * 4) anchoredId = null;
  };
  const wheelTarget: EventTarget = args.scroller;
  wheelTarget.addEventListener("wheel", onWheel, { passive: false, capture: true });
  if (args.bindKeyboard !== false) {
    window.addEventListener("keydown", onKey, { capture: true });
  }
  (target as EventTarget).addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", realignAnchored);
  window.visualViewport?.addEventListener("resize", realignAnchored);
  let resizeObserver: ResizeObserver | null = null;
  if (!isWindow && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => realignAnchored());
    resizeObserver.observe(args.scroller as HTMLElement);
  }
  return () => {
    window.clearTimeout(unlockTimer);
    wheelTarget.removeEventListener("wheel", onWheel, true);
    if (args.bindKeyboard !== false) {
      window.removeEventListener("keydown", onKey, true);
    }
    (target as EventTarget).removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", realignAnchored);
    window.visualViewport?.removeEventListener("resize", realignAnchored);
    resizeObserver?.disconnect();
  };
}

export type PublishedScrollFlows = {
  wide: SectionScrollHop[];
  tablet: SectionScrollHop[];
  mobile: SectionScrollHop[];
  tabletMax: number;
  mobileMax: number;
};

export function compilePublishedScrollScript(
  hops: SectionScrollHop[],
  responsive?: PublishedScrollFlows,
): string {
  const flows = responsive ?? {
    wide: hops,
    tablet: hops,
    mobile: hops,
    tabletMax: Number.POSITIVE_INFINITY,
    mobileMax: Number.NEGATIVE_INFINITY,
  };
  const active = [...flows.wide, ...flows.tablet, ...flows.mobile].filter(
    (hop) => hop.kind === "smooth" || hop.kind === "snap",
  );
  if (active.length === 0) return `"use strict";\n`;
  const payload = JSON.stringify({
    wide: flows.wide.map((hop) => ({ fromId: hop.fromId, toId: hop.toId, kind: hop.kind })),
    tablet: flows.tablet.map((hop) => ({ fromId: hop.fromId, toId: hop.toId, kind: hop.kind })),
    mobile: flows.mobile.map((hop) => ({ fromId: hop.fromId, toId: hop.toId, kind: hop.kind })),
  });
  return `"use strict";
(function () {
  var flows = ${payload};
  var tabletMax = ${Number.isFinite(flows.tabletMax) ? flows.tabletMax : 1e9};
  var mobileMax = ${Number.isFinite(flows.mobileMax) ? flows.mobileMax : -1};
  var locked = false;
  var lockedDirection = 0;
  var unlockTimer = 0;
  var anchoredId = null;
  function activeHops() {
    var width = document.documentElement.clientWidth || window.innerWidth;
    if (width <= mobileMax) return flows.mobile;
    if (width <= tabletMax) return flows.tablet;
    return flows.wide;
  }
  function stations() {
    return Array.prototype.slice
      .call(document.querySelectorAll("[data-section]"))
      .map(function (el) {
        var box = el.getBoundingClientRect();
        return { id: el.getAttribute("data-section"), y: box.top + window.scrollY };
      })
      .filter(function (s) { return s.id; })
      .sort(function (a, b) { return a.y - b.y; });
  }
  function hopKind(fromId, toId) {
    var hops = activeHops();
    for (var i = 0; i < hops.length; i++) {
      if (hops[i].fromId === fromId && hops[i].toId === toId) return hops[i].kind;
    }
    return "natural";
  }
  function indexAt(list, y) {
    var index = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].y <= y + 16) index = i;
    }
    return index;
  }
  function plan(direction) {
    var list = stations();
    if (list.length < 1) return null;
    var y = window.scrollY;
    var index = indexAt(list, y);
    if (direction > 0) {
      var from = list[index];
      var to = list[index + 1];
      if (!from || !to) return null;
      var kind = hopKind(from.id, to.id);
      if (kind === "natural") return null;
      return { kind: kind, id: to.id, y: to.y };
    }
    var current = list[index] || list[0];
    var prev = list[index - 1];
    if (!prev) return null;
    var upKind = hopKind(prev.id, current.id);
    if (upKind === "natural") return null;
    return { kind: upKind, id: prev.id, y: prev.y };
  }
  function go(top, kind, toId, direction) {
    locked = true;
    lockedDirection = direction;
    anchoredId = toId;
    window.clearTimeout(unlockTimer);
    window.scrollTo({ top: Math.max(0, top), behavior: kind === "smooth" ? "smooth" : "auto" });
    unlockTimer = window.setTimeout(function () {
      locked = false;
      lockedDirection = 0;
      realign();
    }, kind === "smooth" ? 900 : 120);
  }
  function intercept(delta) {
    if (Math.abs(delta) <= 0.5) return false;
    var direction = delta > 0 ? 1 : -1;
    if (locked) {
      if (lockedDirection === direction) return true;
      window.clearTimeout(unlockTimer);
      locked = false;
      lockedDirection = 0;
      anchoredId = null;
      return false;
    }
    var next = plan(direction);
    if (!next) {
      anchoredId = null;
      return false;
    }
    var limit = Math.max(0, (document.documentElement ? document.documentElement.scrollHeight : 0) - window.innerHeight);
    var top = Math.max(0, Math.min(next.y, limit));
    if (Math.abs(top - window.scrollY) < 1) {
      anchoredId = null;
      return false;
    }
    go(top, next.kind, next.id, direction);
    return true;
  }
  function realign() {
    if (locked) return;
    var list = stations();
    if (!list.length) return;
    var y = window.scrollY;
    var id = anchoredId;
    if (!id) {
      var index = indexAt(list, y);
      var near = list[index];
      if (!near || Math.abs(y - near.y) > 16) return;
      id = near.id;
    }
    var station = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) station = list[i];
    }
    if (!station || Math.abs(y - station.y) < 1) return;
    var limit = Math.max(0, (document.documentElement ? document.documentElement.scrollHeight : 0) - window.innerHeight);
    window.scrollTo({ top: Math.max(0, Math.min(station.y, limit)), behavior: "auto" });
  }
  window.addEventListener("wheel", function (event) {
    if (event.ctrlKey) return;
    if (!intercept(event.deltaY)) return;
    event.preventDefault();
  }, { passive: false, capture: true });
  window.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    var down = event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ";
    var up = event.key === "ArrowUp" || event.key === "PageUp";
    if (!down && !up) return;
    if (!intercept(down ? 40 : -40)) return;
    event.preventDefault();
  }, true);
  window.addEventListener("scroll", function () {
    if (locked || !anchoredId) return;
    var list = stations();
    var station = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === anchoredId) station = list[i];
    }
    if (!station || Math.abs(window.scrollY - station.y) > 64) anchoredId = null;
  }, { passive: true });
  window.addEventListener("resize", realign);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", realign);
})();
`;
}
