/**
 * Recorrido de página: transiciones entre secciones consecutivas.
 * El orden lo marca el documento (`sourceRange`), no un array suelto.
 */
import { cloneBlueprint } from "./site-blueprint-validate";
import {
  isSiteSectionNode,
  RESPONSIVE_EDITABLE_BANDS,
  type SiteBlueprintScrollFlowBandV1,
  type SiteBlueprintSectionNode,
  type SiteBlueprintV1,
  type SiteSectionScrollBand,
  type SiteSectionScrollKind,
} from "./site-creator-types";

export const SECTION_SCROLL_KINDS: SiteSectionScrollKind[] = ["natural", "smooth", "snap"];

export const SECTION_SCROLL_LABEL: Record<SiteSectionScrollKind, string> = {
  natural: "Natural",
  smooth: "Suave",
  snap: "Fijo",
};

export const SECTION_SCROLL_HINT: Record<SiteSectionScrollKind, string> = {
  natural: "El visitante para donde quiera",
  smooth: "La rueda anima y deja el inicio de la siguiente sección",
  snap: "La rueda encaja de golpe en el inicio de la sección",
};

export type SectionScrollHop = {
  fromId: string | null;
  toId: string;
  kind: SiteSectionScrollKind;
};

export function isSectionScrollKind(value: unknown): value is SiteSectionScrollKind {
  return value === "natural" || value === "smooth" || value === "snap";
}

export function listDocumentSections(blueprint: SiteBlueprintV1): SiteBlueprintSectionNode[] {
  return Object.values(blueprint.nodes)
    .filter(isSiteSectionNode)
    .sort((a, b) => {
      if (Math.abs(a.sourceRange.top - b.sourceRange.top) > 4) {
        return a.sourceRange.top - b.sourceRange.top;
      }
      if (a.sectionType === "hero" && b.sectionType !== "hero") return -1;
      if (b.sectionType === "hero" && a.sectionType !== "hero") return 1;
      return a.id.localeCompare(b.id);
    });
}

export function sectionScrollHopKey(fromId: string, toId: string): string {
  return `${fromId}>${toId}`;
}

function flowForBand(
  blueprint: SiteBlueprintV1,
  band: SiteSectionScrollBand,
): SiteBlueprintScrollFlowBandV1 | undefined {
  if (band === "wide") return blueprint.scrollFlow;
  return blueprint.scrollFlow?.byBand?.[band];
}

export function resolveEntryScroll(
  blueprint: SiteBlueprintV1,
  band: SiteSectionScrollBand = "wide",
): SiteSectionScrollKind {
  const entry = flowForBand(blueprint, band)?.entry;
  return isSectionScrollKind(entry) && entry !== "natural" ? entry : "natural";
}

export function resolveSectionScrollHop(
  blueprint: SiteBlueprintV1,
  fromId: string,
  toId: string,
  band: SiteSectionScrollBand = "wide",
): SiteSectionScrollKind {
  const raw = flowForBand(blueprint, band)?.hops?.[sectionScrollHopKey(fromId, toId)];
  return isSectionScrollKind(raw) && raw !== "natural" ? raw : "natural";
}

export function listSectionScrollHops(
  blueprint: SiteBlueprintV1,
  band: SiteSectionScrollBand = "wide",
): SectionScrollHop[] {
  const sections = listDocumentSections(blueprint);
  if (sections.length === 0) return [];
  const hops: SectionScrollHop[] = [
    { fromId: null, toId: sections[0]!.id, kind: resolveEntryScroll(blueprint, band) },
  ];
  for (let i = 0; i < sections.length - 1; i += 1) {
    const fromId = sections[i]!.id;
    const toId = sections[i + 1]!.id;
    hops.push({ fromId, toId, kind: resolveSectionScrollHop(blueprint, fromId, toId, band) });
  }
  return hops;
}

function compactFlow(
  flow: SiteBlueprintScrollFlowBandV1,
): SiteBlueprintScrollFlowBandV1 | undefined {
  const hops: Record<string, SiteSectionScrollKind> = {};
  for (const [key, kind] of Object.entries(flow.hops ?? {})) {
    if (isSectionScrollKind(kind) && kind !== "natural") hops[key] = kind;
  }
  const entry = isSectionScrollKind(flow.entry) && flow.entry !== "natural" ? flow.entry : undefined;
  if (!entry && Object.keys(hops).length === 0) return undefined;
  return {
    ...(entry ? { entry } : {}),
    ...(Object.keys(hops).length > 0 ? { hops } : {}),
  };
}

function writeBandFlows(
  blueprint: SiteBlueprintV1,
  flows: Partial<Record<SiteSectionScrollBand, SiteBlueprintScrollFlowBandV1 | undefined>>,
): void {
  const wide = flows.wide;
  const byBand: NonNullable<SiteBlueprintV1["scrollFlow"]>["byBand"] = {};
  for (const band of RESPONSIVE_EDITABLE_BANDS) {
    if (flows[band]) byBand[band] = flows[band];
  }
  if (!wide && Object.keys(byBand).length === 0) {
    delete blueprint.scrollFlow;
    return;
  }
  blueprint.scrollFlow = {
    ...(wide ?? {}),
    ...(Object.keys(byBand).length > 0 ? { byBand } : {}),
  };
}

function snapshotFlows(
  blueprint: SiteBlueprintV1,
  band: SiteSectionScrollBand,
  compact: SiteBlueprintScrollFlowBandV1 | undefined,
): Partial<Record<SiteSectionScrollBand, SiteBlueprintScrollFlowBandV1 | undefined>> {
  return {
    wide: band === "wide" ? compact : compactFlow(blueprint.scrollFlow ?? {}),
    monitor:
      band === "monitor" ? compact : compactFlow(blueprint.scrollFlow?.byBand?.monitor ?? {}),
    tablet:
      band === "tablet" ? compact : compactFlow(blueprint.scrollFlow?.byBand?.tablet ?? {}),
    mobile:
      band === "mobile" ? compact : compactFlow(blueprint.scrollFlow?.byBand?.mobile ?? {}),
  };
}

function pruneBandFlow(
  flow: SiteBlueprintScrollFlowBandV1 | undefined,
  allowed: Set<string>,
  hasSections: boolean,
): SiteBlueprintScrollFlowBandV1 | undefined {
  const hops: Record<string, SiteSectionScrollKind> = {};
  for (const [key, kind] of Object.entries(flow?.hops ?? {})) {
    if (allowed.has(key) && isSectionScrollKind(kind) && kind !== "natural") hops[key] = kind;
  }
  const entry =
    hasSections && isSectionScrollKind(flow?.entry) && flow.entry !== "natural"
      ? flow.entry
      : undefined;
  return compactFlow({ entry, hops });
}

export function pruneScrollFlow(blueprint: SiteBlueprintV1): SiteBlueprintV1 {
  const next = cloneBlueprint(blueprint);
  const allowed = new Set<string>();
  const sections = listDocumentSections(next);
  for (let i = 0; i < sections.length - 1; i += 1) {
    allowed.add(sectionScrollHopKey(sections[i]!.id, sections[i + 1]!.id));
  }
  writeBandFlows(next, {
    wide: pruneBandFlow(next.scrollFlow, allowed, sections.length > 0),
    monitor: pruneBandFlow(next.scrollFlow?.byBand?.monitor, allowed, sections.length > 0),
    tablet: pruneBandFlow(next.scrollFlow?.byBand?.tablet, allowed, sections.length > 0),
    mobile: pruneBandFlow(next.scrollFlow?.byBand?.mobile, allowed, sections.length > 0),
  });
  return next;
}

export function setEntryScrollKind(
  blueprint: SiteBlueprintV1,
  kind: SiteSectionScrollKind,
  band: SiteSectionScrollBand = "wide",
): SiteBlueprintV1 {
  const next = pruneScrollFlow(blueprint);
  if (listDocumentSections(next).length === 0) return next;
  const flow: SiteBlueprintScrollFlowBandV1 = { ...(flowForBand(next, band) ?? {}) };
  if (kind === "natural") delete flow.entry;
  else flow.entry = kind;
  const compact = compactFlow(flow);
  writeBandFlows(next, snapshotFlows(next, band, compact));
  return next;
}

export function setSectionScrollHop(
  blueprint: SiteBlueprintV1,
  fromId: string,
  toId: string,
  kind: SiteSectionScrollKind,
  band: SiteSectionScrollBand = "wide",
): SiteBlueprintV1 {
  const next = pruneScrollFlow(blueprint);
  const sections = listDocumentSections(next);
  const fromIndex = sections.findIndex((section) => section.id === fromId);
  if (fromIndex < 0 || sections[fromIndex + 1]?.id !== toId) return next;
  const key = sectionScrollHopKey(fromId, toId);
  const currentFlow = flowForBand(next, band);
  const hops = { ...(currentFlow?.hops ?? {}) };
  if (kind === "natural") delete hops[key];
  else hops[key] = kind;
  const compact = compactFlow({ entry: currentFlow?.entry, hops });
  writeBandFlows(next, snapshotFlows(next, band, compact));
  return next;
}

export function scrollFlowUsesKind(
  blueprint: SiteBlueprintV1,
  kind: SiteSectionScrollKind,
  band?: SiteSectionScrollBand,
): boolean {
  const bands: SiteSectionScrollBand[] = band ? [band] : ["wide", "monitor", "tablet", "mobile"];
  return bands.some((item) =>
    listSectionScrollHops(blueprint, item).some((hop) => hop.kind === kind),
  );
}

export function destinationScrollKind(
  blueprint: SiteBlueprintV1,
  sectionId: string,
  band: SiteSectionScrollBand = "wide",
): SiteSectionScrollKind {
  const hop = listSectionScrollHops(blueprint, band).find((item) => item.toId === sectionId);
  return hop?.kind ?? "natural";
}
