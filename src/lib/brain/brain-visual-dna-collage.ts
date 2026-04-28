import type { AggregatedVisualPatterns, BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import {
  contributesToVisualAggregate,
  getEffectiveClassification,
  isExcludedFromVisualDna,
  type BrainVisualAssetRef,
} from "@/lib/brain/brain-visual-analysis";

export type BrainVisualDnaCollageSlotId =
  | "hero"
  | "people1"
  | "people2"
  | "people3"
  | "people4"
  | "env1"
  | "env2"
  | "tex1"
  | "tex2"
  | "obj1"
  | "obj2";

export type BrainVisualDnaCollageSlot = {
  id: BrainVisualDnaCollageSlotId;
  caption: string;
  imageUrl: string | null;
};

export type BrainVisualDnaCollageModel = {
  /** Hex dominantes (hasta 6) para la franja tipo mood board. */
  palette: string[];
  slots: BrainVisualDnaCollageSlot[];
  /** Filas con URL y análisis analizado que alimentaron el collage (puede incluir mock). */
  sourceCount: number;
};

export type BrainVisualCollageInventoryRow = {
  ref: BrainVisualAssetRef;
  analysis: BrainVisualImageAnalysis | null;
};

function refImageUrl(ref: BrainVisualAssetRef): string | null {
  const u = ref.imageUrlForVision?.trim() ?? "";
  if (!u) return null;
  if (u.startsWith("data:image") || /^https:\/\//i.test(u)) return u;
  return null;
}

function isCollageUsableRow(
  row: BrainVisualCollageInventoryRow,
): row is BrainVisualCollageInventoryRow & { analysis: BrainVisualImageAnalysis } {
  if (!row.analysis || row.analysis.analysisStatus !== "analyzed" || isExcludedFromVisualDna(row.analysis)) {
    return false;
  }
  return Boolean(refImageUrl(row.ref));
}

function heroScore(a: BrainVisualImageAnalysis): number {
  let s = 0;
  if (contributesToVisualAggregate(a)) s += 80;
  if (getEffectiveClassification(a) === "CORE_VISUAL_DNA") s += 40;
  const c = typeof a.coherenceScore === "number" ? a.coherenceScore : 0.55;
  s += c * 35;
  if (a.peopleDetail?.present) s += 8;
  if ((a.mood?.length ?? 0) > 0) s += 6;
  if ((a.visualStyle?.length ?? 0) > 0) s += 4;
  return s;
}

const PEOPLE_HINT = /\b(persona|personas|gente|retrato|retratos|rostro|modelo|equipo|familia|pareja|grupo|sonrisa|community|friends|portrait|people|faces?)\b/i;
const ENV_HINT =
  /\b(interior|exterior|paisaje|paisajes|oficina|estudio|habitaci[oó]n|sal[oó]n|cocina|restaurante|cafeter[ií]a|playa|monta[ñn]a|ciudad|arquitectura|naturaleza|jard[ií]n|urbano|rural|paisaje|landscape|outdoor|indoor|workspace|living\s*room|loft|cafe|coffee)\b/i;
const TEX_HINT =
  /\b(textura|texturas|madera|metal|tela|lienzo|piedra|papel|rugos|granito|hormig[oó]n|concreto|tejido|fibra|cer[aá]mica|brass|cuero|lino|yute)\b/i;
const OBJ_HINT =
  /\b(producto|objeto|packaging|botella|bolsa|dispositivo|libro|still|bodeg[oó]n|minimal|watch|reloj|bowl|taza|objetos?)\b/i;

function textBlob(a: BrainVisualImageAnalysis): string {
  return [
    a.subject,
    ...(a.subjectTags ?? []),
    ...(a.composition ?? []),
    ...(a.possibleUse ?? []),
    a.people,
    a.graphicStyle,
    a.clothingStyle,
    ...(a.brandSignals ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function isPeopleRow(a: BrainVisualImageAnalysis): boolean {
  if (a.peopleDetail?.present) return true;
  const t = `${a.people} ${a.subject}`.trim();
  return t.length > 2 && PEOPLE_HINT.test(t);
}

function isEnvironmentRow(a: BrainVisualImageAnalysis): boolean {
  return ENV_HINT.test(textBlob(a));
}

function isTextureRow(a: BrainVisualImageAnalysis): boolean {
  const gd = a.graphicDetail?.texture?.length ?? 0;
  const cd = a.clothingDetail?.textures?.length ?? 0;
  if (gd + cd > 0) return true;
  return TEX_HINT.test(textBlob(a));
}

function isObjectRow(a: BrainVisualImageAnalysis): boolean {
  if (a.peopleDetail?.present) return false;
  return OBJ_HINT.test(textBlob(a));
}

const SLOT_ORDER: BrainVisualDnaCollageSlotId[] = [
  "hero",
  "people1",
  "people2",
  "people3",
  "people4",
  "env1",
  "env2",
  "tex1",
  "tex2",
  "obj1",
  "obj2",
];

const SLOT_CAPTION: Record<BrainVisualDnaCollageSlotId, string> = {
  hero: "Conclusión general",
  people1: "Personas / interacción",
  people2: "Personas / interacción",
  people3: "Personas / interacción",
  people4: "Personas / interacción",
  env1: "Entorno",
  env2: "Entorno",
  tex1: "Textura",
  tex2: "Textura",
  obj1: "Objeto",
  obj2: "Objeto",
};

/**
 * Construye un mood board fijo (1 héroe, 4 interacciones, 2 entornos, 2 texturas, 2 objetos)
 * a partir del inventario + análisis. Huecos sin imagen → `imageUrl: null` (UI gris).
 */
export function buildBrainVisualDnaCollageModel(
  rows: BrainVisualCollageInventoryRow[],
  aggregated: AggregatedVisualPatterns | null,
): BrainVisualDnaCollageModel {
  const palette = (aggregated?.dominantPalette ?? []).filter(Boolean).slice(0, 6);

  const emptySlots = (): BrainVisualDnaCollageSlot[] =>
    SLOT_ORDER.map((id) => ({ id, caption: SLOT_CAPTION[id], imageUrl: null }));

  const usable = rows.filter(isCollageUsableRow);
  const sourceCount = usable.length;

  if (!usable.length) {
    return { palette, slots: emptySlots(), sourceCount: 0 };
  }

  const used = new Set<string>();

  const takeFrom = (pred: (a: BrainVisualImageAnalysis) => boolean, n: number): string[] => {
    const urls: string[] = [];
    const scored = usable
      .filter((r) => pred(r.analysis))
      .sort((a, b) => heroScore(b.analysis) - heroScore(a.analysis));
    for (const r of scored) {
      if (urls.length >= n) break;
      const id = r.ref.id;
      if (used.has(id)) continue;
      const url = refImageUrl(r.ref);
      if (!url) continue;
      used.add(id);
      urls.push(url);
    }
    return urls;
  };

  const heroCandidates = [...usable].sort((a, b) => heroScore(b.analysis) - heroScore(a.analysis));
  let heroUrl: string | null = null;
  for (const r of heroCandidates) {
    const url = refImageUrl(r.ref);
    if (!url) continue;
    used.add(r.ref.id);
    heroUrl = url;
    break;
  }

  const people = takeFrom(isPeopleRow, 4);
  const environments = takeFrom(isEnvironmentRow, 2);
  const textures = takeFrom(isTextureRow, 2);
  const objects = takeFrom(isObjectRow, 2);

  const fillRemaining = (need: number, into: string[]) => {
    const rest = [...usable].sort((a, b) => heroScore(b.analysis) - heroScore(a.analysis));
    for (const r of rest) {
      if (into.length >= need) break;
      if (used.has(r.ref.id)) continue;
      const url = refImageUrl(r.ref);
      if (!url) continue;
      used.add(r.ref.id);
      into.push(url);
    }
  };

  fillRemaining(4, people);
  fillRemaining(2, environments);
  fillRemaining(2, textures);
  fillRemaining(2, objects);

  const pad = (arr: string[], n: number) => {
    while (arr.length < n) arr.push("");
    return arr.slice(0, n);
  };

  const [p1, p2, p3, p4] = pad(people, 4);
  const [e1, e2] = pad(environments, 2);
  const [t1, t2] = pad(textures, 2);
  const [o1, o2] = pad(objects, 2);

  const urlOrNull = (u: string) => (u ? u : null);

  const slots: BrainVisualDnaCollageSlot[] = [
    { id: "hero", caption: SLOT_CAPTION.hero, imageUrl: heroUrl },
    { id: "people1", caption: SLOT_CAPTION.people1, imageUrl: urlOrNull(p1) },
    { id: "people2", caption: SLOT_CAPTION.people2, imageUrl: urlOrNull(p2) },
    { id: "people3", caption: SLOT_CAPTION.people3, imageUrl: urlOrNull(p3) },
    { id: "people4", caption: SLOT_CAPTION.people4, imageUrl: urlOrNull(p4) },
    { id: "env1", caption: SLOT_CAPTION.env1, imageUrl: urlOrNull(e1) },
    { id: "env2", caption: SLOT_CAPTION.env2, imageUrl: urlOrNull(e2) },
    { id: "tex1", caption: SLOT_CAPTION.tex1, imageUrl: urlOrNull(t1) },
    { id: "tex2", caption: SLOT_CAPTION.tex2, imageUrl: urlOrNull(t2) },
    { id: "obj1", caption: SLOT_CAPTION.obj1, imageUrl: urlOrNull(o1) },
    { id: "obj2", caption: SLOT_CAPTION.obj2, imageUrl: urlOrNull(o2) },
  ];

  return { palette, slots, sourceCount };
}
