import type { BrainNodeType } from "./brain-telemetry";

/** Forma mínima de nodo/edge del canvas para derivar enlaces de marca. */
export type BrainFlowNodeLite = {
  id: string;
  type?: string;
  data?: { label?: string; title?: string; name?: string };
};

export type BrainFlowEdgeLite = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type BrainDownstreamClient = {
  id: string;
  canvasType: string;
  brainNodeType: BrainNodeType | "OTHER";
  label: string;
};

const BRAND_KIT_BRAND_OUT = "brand";

function pickLabel(n: BrainFlowNodeLite): string {
  const d = n.data;
  const a =
    (typeof d?.label === "string" && d.label.trim()) ||
    (typeof d?.title === "string" && d.title.trim()) ||
    (typeof d?.name === "string" && d.name.trim());
  if (a) return a;
  if (n.type) return humanizeCanvasType(n.type);
  return n.id;
}

function humanizeCanvasType(t: string): string {
  const map: Record<string, string> = {
    designer: "Designer",
    photoRoom: "Photoroom",
    articleWriter: "Article Writer",
    brandKit: "BrandKit",
    nanoBanana: "Imagen",
    presentation: "Presentación",
  };
  return map[t] ?? t;
}

function toBrainNodeType(canvasType: string | undefined): BrainNodeType | "OTHER" {
  switch (canvasType) {
    case "designer":
      return "DESIGNER";
    case "articleWriter":
      return "ARTICLE_WRITER";
    case "photoRoom":
      return "PHOTOROOM";
    case "presentation":
      return "PRESENTATION_NODE";
    case "nanoBanana":
      return "IMAGE_GENERATOR";
    case "videoNode":
    case "grokProcessor":
      return "VIDEO_NODE";
    default:
      return "CUSTOM";
  }
}

/** Ids de nodos BrandKit en el grafo. */
export function findBrandKitNodeIds(nodes: BrainFlowNodeLite[]): string[] {
  return nodes.filter((n) => n.type === "brandKit").map((n) => n.id);
}

/** @deprecated Use findBrandKitNodeIds */
export function findProjectBrainNodeIds(nodes: BrainFlowNodeLite[]): string[] {
  return findBrandKitNodeIds(nodes);
}

/** Nodos que reciben salida de marca (arista desde brandKit con handle `brand`). */
export function listDownstreamBrainClients(
  nodes: BrainFlowNodeLite[] | undefined,
  edges: BrainFlowEdgeLite[] | undefined,
): BrainDownstreamClient[] {
  if (!nodes?.length || !edges?.length) return [];
  const brandKitIds = new Set(findBrandKitNodeIds(nodes));
  if (brandKitIds.size === 0) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const out: BrainDownstreamClient[] = [];
  for (const e of edges) {
    if (!brandKitIds.has(e.source)) continue;
    if (e.sourceHandle !== BRAND_KIT_BRAND_OUT) continue;
    if (e.targetHandle !== "brain" && e.targetHandle !== "adn") continue;
    if (seen.has(e.target)) continue;
    const target = byId.get(e.target);
    if (!target) continue;
    seen.add(e.target);
    const ct = target.type ?? "unknown";
    out.push({
      id: e.target,
      canvasType: ct,
      brainNodeType: toBrainNodeType(ct),
      label: pickLabel(target),
    });
  }
  return out;
}
