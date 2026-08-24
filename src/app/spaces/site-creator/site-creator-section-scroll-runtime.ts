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

export function planScrollStep(args: {
  stations: ScrollStation[];
  hops: SectionScrollHop[];
  scrollY: number;
  direction: 1 | -1;
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
    return { kind, toId: to.id, targetY: to.y };
  }
  const current = stations[index] ?? stations[0]!;
  if (args.scrollY > current.y + AT_STATION) {
    const kind = hopKindBetween(args.hops, stations[index - 1]?.id ?? null, current.id);
    if (kind === "natural") return null;
    return { kind, toId: current.id, targetY: current.y };
  }
  const prev = stations[index - 1];
  if (!prev) return null;
  const kind = hopKindBetween(args.hops, prev.id, current.id);
  if (kind === "natural") return null;
  return { kind, toId: prev.id, targetY: prev.y };
}

export function scrollBehaviorForKind(kind: SiteSectionScrollKind): ScrollBehavior {
  return kind === "smooth" ? "smooth" : "auto";
}

export type SectionScrollCue = {
  sectionId: string;
  kind: Exclude<SiteSectionScrollKind, "natural">;
  token: number;
};

export function bindSectionScroller(args: {
  scroller: HTMLElement | Window;
  hops: SectionScrollHop[];
  stations: () => ScrollStation[];
}): () => void {
  let locked = false;
  let unlockTimer = 0;
  let anchoredId: string | null = null;
  const isWindow = args.scroller === window;
  const target = isWindow ? window : (args.scroller as HTMLElement);
  const readY = () => (isWindow ? window.scrollY : (args.scroller as HTMLElement).scrollTop);
  const go = (top: number, kind: Exclude<SiteSectionScrollKind, "natural">, toId: string) => {
    locked = true;
    anchoredId = toId;
    window.clearTimeout(unlockTimer);
    target.scrollTo({ top: Math.max(0, top), behavior: scrollBehaviorForKind(kind) });
    unlockTimer = window.setTimeout(() => {
      locked = false;
      realignAnchored();
    }, kind === "smooth" ? 900 : 120);
  };
  const interceptDelta = (delta: number): boolean => {
    if (!(Math.abs(delta) > 0.5)) return false;
    if (locked) return true;
    const planned = planScrollStep({
      stations: args.stations(),
      hops: args.hops,
      scrollY: readY(),
      direction: delta > 0 ? 1 : -1,
    });
    if (!planned) {
      anchoredId = null;
      return false;
    }
    go(planned.targetY, planned.kind, planned.toId);
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
    if (Math.abs(y - station.y) < 1) return;
    target.scrollTo({ top: Math.max(0, station.y), behavior: "auto" });
  };
  const onWheel = (event: Event) => {
    if (!(event instanceof WheelEvent)) return;
    if (event.ctrlKey) return;
    if (!interceptDelta(event.deltaY)) return;
    event.preventDefault();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
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
  window.addEventListener("keydown", onKey, { capture: true });
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
    window.removeEventListener("keydown", onKey, true);
    (target as EventTarget).removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", realignAnchored);
    window.visualViewport?.removeEventListener("resize", realignAnchored);
    resizeObserver?.disconnect();
  };
}

export function compilePublishedScrollScript(hops: SectionScrollHop[]): string {
  const active = hops.filter((hop) => hop.kind === "smooth" || hop.kind === "snap");
  if (active.length === 0) return `"use strict";\n`;
  const payload = JSON.stringify(
    hops.map((hop) => ({ fromId: hop.fromId, toId: hop.toId, kind: hop.kind })),
  );
  return `"use strict";
(function () {
  var hops = ${payload};
  var locked = false;
  var unlockTimer = 0;
  var anchoredId = null;
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
    if (y > current.y + 16) {
      var backKind = hopKind(index > 0 ? list[index - 1].id : null, current.id);
      if (backKind === "natural") return null;
      return { kind: backKind, id: current.id, y: current.y };
    }
    var prev = list[index - 1];
    if (!prev) return null;
    var upKind = hopKind(prev.id, current.id);
    if (upKind === "natural") return null;
    return { kind: upKind, id: prev.id, y: prev.y };
  }
  function go(top, kind, toId) {
    locked = true;
    anchoredId = toId;
    window.clearTimeout(unlockTimer);
    window.scrollTo({ top: Math.max(0, top), behavior: kind === "smooth" ? "smooth" : "auto" });
    unlockTimer = window.setTimeout(function () { locked = false; realign(); }, kind === "smooth" ? 900 : 120);
  }
  function intercept(delta) {
    if (Math.abs(delta) <= 0.5) return false;
    if (locked) return true;
    var next = plan(delta > 0 ? 1 : -1);
    if (!next) {
      anchoredId = null;
      return false;
    }
    go(next.y, next.kind, next.id);
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
    window.scrollTo({ top: Math.max(0, station.y), behavior: "auto" });
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
