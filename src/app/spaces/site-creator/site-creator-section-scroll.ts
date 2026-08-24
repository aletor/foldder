/**
 * Recorrido de página: transiciones entre secciones consecutivas.
 * El orden lo marca el documento (`sourceRange`), no un array suelto.
 */
import { cloneBlueprint } from "./site-blueprint-validate";
import {
  isSiteSectionNode,
  type SiteBlueprintScrollFlowV1,
  type SiteBlueprintSectionNode,
  type SiteBlueprintV1,
  type SiteSectionScrollKind,
} from "./site-creator-types";

export const SECTION_SCROLL_KINDS: SiteSectionScrollKind[] = ["natural", "smooth", "snap"];

export const SECTION_SCROLL_LABEL: Record<SiteSectionScrollKind, string> = {
  natural: "Natural",
  smooth: "Suave",
  snap: "Ancla",
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

export function resolveEntryScroll(blueprint: SiteBlueprintV1): SiteSectionScrollKind {
  const entry = blueprint.scrollFlow?.entry;
  return isSectionScrollKind(entry) && entry !== "natural" ? entry : "natural";
}

export function resolveSectionScrollHop(
  blueprint: SiteBlueprintV1,
  fromId: string,
  toId: string,
): SiteSectionScrollKind {
  const raw = blueprint.scrollFlow?.hops?.[sectionScrollHopKey(fromId, toId)];
  return isSectionScrollKind(raw) && raw !== "natural" ? raw : "natural";
}

export function listSectionScrollHops(blueprint: SiteBlueprintV1): SectionScrollHop[] {
  const sections = listDocumentSections(blueprint);
  if (sections.length === 0) return [];
  const hops: SectionScrollHop[] = [
    { fromId: null, toId: sections[0]!.id, kind: resolveEntryScroll(blueprint) },
  ];
  for (let i = 0; i < sections.length - 1; i += 1) {
    const fromId = sections[i]!.id;
    const toId = sections[i + 1]!.id;
    hops.push({ fromId, toId, kind: resolveSectionScrollHop(blueprint, fromId, toId) });
  }
  return hops;
}

function compactFlow(flow: SiteBlueprintScrollFlowV1): SiteBlueprintScrollFlowV1 | undefined {
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

export function pruneScrollFlow(blueprint: SiteBlueprintV1): SiteBlueprintV1 {
  const next = cloneBlueprint(blueprint);
  const allowed = new Set<string>();
  const sections = listDocumentSections(next);
  for (let i = 0; i < sections.length - 1; i += 1) {
    allowed.add(sectionScrollHopKey(sections[i]!.id, sections[i + 1]!.id));
  }
  const hops: Record<string, SiteSectionScrollKind> = {};
  for (const [key, kind] of Object.entries(next.scrollFlow?.hops ?? {})) {
    if (allowed.has(key) && isSectionScrollKind(kind) && kind !== "natural") hops[key] = kind;
  }
  const entry =
    sections.length > 0 && isSectionScrollKind(next.scrollFlow?.entry) && next.scrollFlow?.entry !== "natural"
      ? next.scrollFlow.entry
      : undefined;
  const flow = compactFlow({ entry, hops });
  if (flow) next.scrollFlow = flow;
  else delete next.scrollFlow;
  return next;
}

export function setEntryScrollKind(
  blueprint: SiteBlueprintV1,
  kind: SiteSectionScrollKind,
): SiteBlueprintV1 {
  const next = pruneScrollFlow(blueprint);
  if (listDocumentSections(next).length === 0) return next;
  const flow: SiteBlueprintScrollFlowV1 = { ...(next.scrollFlow ?? {}) };
  if (kind === "natural") delete flow.entry;
  else flow.entry = kind;
  const compact = compactFlow(flow);
  if (compact) next.scrollFlow = compact;
  else delete next.scrollFlow;
  return next;
}

export function setSectionScrollHop(
  blueprint: SiteBlueprintV1,
  fromId: string,
  toId: string,
  kind: SiteSectionScrollKind,
): SiteBlueprintV1 {
  const next = pruneScrollFlow(blueprint);
  const sections = listDocumentSections(next);
  const fromIndex = sections.findIndex((section) => section.id === fromId);
  if (fromIndex < 0 || sections[fromIndex + 1]?.id !== toId) return next;
  const key = sectionScrollHopKey(fromId, toId);
  const hops = { ...(next.scrollFlow?.hops ?? {}) };
  if (kind === "natural") delete hops[key];
  else hops[key] = kind;
  const flow = compactFlow({ entry: next.scrollFlow?.entry, hops });
  if (flow) next.scrollFlow = flow;
  else delete next.scrollFlow;
  return next;
}

export function scrollFlowUsesKind(
  blueprint: SiteBlueprintV1,
  kind: SiteSectionScrollKind,
): boolean {
  if (kind === "natural") return listSectionScrollHops(blueprint).some((hop) => hop.kind === "natural");
  return listSectionScrollHops(blueprint).some((hop) => hop.kind === kind);
}

/** Hay suave/ancla: hace falta poder alinear el inicio de una sección con el borde superior. */
export function sectionScrollNeedsViewportPad(blueprint: SiteBlueprintV1): boolean {
  if (listDocumentSections(blueprint).length < 2) return false;
  return scrollFlowUsesKind(blueprint, "smooth") || scrollFlowUsesKind(blueprint, "snap");
}

export function lastDocumentSection(blueprint: SiteBlueprintV1): SiteBlueprintSectionNode | null {
  const sections = listDocumentSections(blueprint);
  return sections[sections.length - 1] ?? null;
}

export function destinationScrollKind(
  blueprint: SiteBlueprintV1,
  sectionId: string,
): SiteSectionScrollKind {
  const hop = listSectionScrollHops(blueprint).find((item) => item.toId === sectionId);
  return hop?.kind ?? "natural";
}
