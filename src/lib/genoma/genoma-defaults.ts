import type {
  EssenceValue,
  GalleryValue,
  GenomaDocument,
  LogoValue,
  PaletteValue,
  Provenance,
  SlotId,
  SlotState,
  TypographyValue,
  VoiceValue,
} from "./genoma-types";
import { GENOMA_SLOT_IDS } from "./genoma-types";
import { hasLegacyGenomaSlots, migrateGenomaDocument } from "./genoma-migrate-v2";
import { enrichGenomaDocument } from "./genoma-enrich";
import { validateGenomaContentQuality } from "./genoma-content-quality";

const NOW = () => new Date().toISOString();

export function createEmptySlot<T>(id: SlotId): SlotState<T> {
  return {
    id,
    status: "empty",
    candidates: [],
    confidence: 0,
    locked: false,
    history: [],
    updatedAt: NOW(),
  };
}

export function createEmptyGenoma(): GenomaDocument {
  const slots = Object.fromEntries(GENOMA_SLOT_IDS.map((id) => [id, createEmptySlot(id)])) as Record<
    SlotId,
    SlotState<unknown>
  >;
  return {
    sources: [],
    slots,
    compiled: null,
    updatedAt: NOW(),
  };
}

function prov(type: Provenance["type"], detail: string, sourceUrl?: string): Provenance {
  return { type, detail, sourceUrl };
}

type CandidateTypography = { value: TypographyValue; score: number; provenance: Provenance };

/** Fixture G1: muestra estados visuales en el board v2. */
export function createDemoGenomaFixture(): GenomaDocument {
  const logoValue: LogoValue = {
    assetId: "demo-logo-main",
    previewUrl: "/nodes/layerizer-mark.png",
    format: "png",
    width: 512,
    height: 512,
    background: "transparent",
    variants: [{ kind: "icono", assetId: "demo-logo-icon", previewUrl: "/nodes/layerizer-mark.png" }],
  };

  const paletteValue: PaletteValue = {
    colors: [
      { hex: "#6B4C9A", role: "primary", usageWeight: 0.42 },
      { hex: "#E07A5F", role: "accent", usageWeight: 0.18 },
      { hex: "#F4F1EE", role: "background", usageWeight: 0.22 },
      { hex: "#1F2328", role: "text", usageWeight: 0.12 },
      { hex: "#8B8F96", role: "neutral", usageWeight: 0.06 },
    ],
  };

  const typographyCandidates: CandidateTypography[] = [
    {
      value: {
        families: [
          {
            family: "DM Sans",
            role: "heading",
            source: "google",
            fallbacks: ["Helvetica Neue", "sans-serif"],
            weights: [500, 700],
          },
          {
            family: "Inter",
            role: "body",
            source: "google",
            fallbacks: ["system-ui", "sans-serif"],
            weights: [400, 600],
          },
        ],
      },
      score: 0.82,
      provenance: prov("font_link", "fonts.googleapis.com/css2?family=DM+Sans", "https://example.com"),
    },
    {
      value: {
        families: [
          {
            family: "Arial",
            role: "body",
            source: "system",
            fallbacks: ["Helvetica", "sans-serif"],
            weights: [400, 700],
          },
        ],
      },
      score: 0.55,
      provenance: prov("computed_style", "font-family en body", "https://example.com"),
    },
  ];

  const voiceValue: VoiceValue = {
    summary: "Habla de forma cercana y clara, con frases cortas que priorizan la comprensión inmediata.",
    descriptors: ["cercano", "claro", "profesional"],
    rules: ["tuteo", "frases cortas", "evitar jerga técnica"],
    avoid: ["tecnicismos innecesarios"],
    evidence: [
      { quote: "Hacemos que tu marca se entienda en segundos.", sourceUrl: "https://example.com" },
      { quote: "Todo editable, todo tuyo.", sourceUrl: "https://example.com/about" },
    ],
  };

  const galleryValue: GalleryValue = {
    harvested: [
      {
        assetId: "g1",
        previewUrl: "/nodes/layerizer-bg.png",
        included: true,
        provenance: prov("header_img", "hero /about", "https://example.com/about"),
      },
      {
        assetId: "g2",
        previewUrl: "/assets/nodes/presenter-empty-yellow.jpg",
        included: true,
        provenance: prov("og_meta", "og:image", "https://example.com"),
      },
    ],
    generated: [],
    stylePromptVersion: 0,
  };

  const slots: Record<SlotId, SlotState<unknown>> = {
    logo: {
      id: "logo",
      status: "resolved",
      value: logoValue,
      candidates: [],
      confidence: 0.95,
      provenance: prov("link_icon", "apple-touch-icon 512×512", "https://example.com"),
      locked: true,
      history: [],
      updatedAt: NOW(),
    },
    palette: {
      id: "palette",
      status: "resolved",
      value: paletteValue,
      candidates: [],
      confidence: 0.88,
      provenance: prov("css_var", "--brand-primary", "https://example.com"),
      locked: false,
      history: [],
      updatedAt: NOW(),
    },
    typography: {
      id: "typography",
      status: "candidates",
      candidates: typographyCandidates,
      confidence: 0.72,
      locked: false,
      history: [],
      updatedAt: NOW(),
    },
    voice: {
      id: "voice",
      status: "resolved",
      value: voiceValue,
      candidates: [],
      confidence: 0.76,
      provenance: prov("llm_synthesis", "corpus web ≤6k tok", "https://example.com"),
      locked: false,
      history: [],
      updatedAt: NOW(),
    },
    essence: {
      id: "essence",
      status: "candidates",
      candidates: [
        {
          value: {
            summary: "Desglosa la marca en bloques editables para equipos creativos.",
            headline: "Tu marca, desglosada.",
            headlineOrigin: "extracted",
            beliefs: [{ label: "Claridad" }, { label: "Cercanía" }],
            evidence: [],
          } satisfies EssenceValue,
          score: 0.7,
          provenance: prov("og_meta", "og:title", "https://example.com"),
        },
        {
          value: {
            summary: "Identidad clara y accionable para equipos que necesitan coherencia visual y verbal.",
            headline: "Identidad clara para equipos creativos.",
            headlineOrigin: "generated",
            beliefs: [{ label: "Calidad" }],
            evidence: [],
          } satisfies EssenceValue,
          score: 0.55,
          provenance: prov("llm_synthesis", "fallback generado"),
        },
      ],
      confidence: 0.45,
      locked: false,
      history: [],
      updatedAt: NOW(),
    },
    visualWorld: {
      id: "visualWorld",
      status: "empty",
      candidates: [],
      confidence: 0,
      locked: false,
      history: [],
      updatedAt: NOW(),
    },
    gallery: {
      id: "gallery",
      status: "resolved",
      value: galleryValue,
      candidates: [],
      confidence: 0.8,
      provenance: prov("header_img", "cosecha web", "https://example.com"),
      locked: false,
      history: [],
      updatedAt: NOW(),
    },
  };

  return {
    brandName: { value: "Acme Studio", provenance: prov("jsonld", "Organization.name", "https://example.com") },
    sources: [{ kind: "url", ref: "https://example.com", ts: NOW() }],
    slots,
    compiled: null,
    updatedAt: NOW(),
  };
}

export function isGenomaEmpty(doc: GenomaDocument | undefined): boolean {
  if (!doc) return true;
  return GENOMA_SLOT_IDS.every((id) => doc.slots[id]?.status === "empty");
}

export function mergeGenomaDocument(raw: unknown): GenomaDocument {
  if (!raw || typeof raw !== "object") return createEmptyGenoma();
  const input = raw as Partial<GenomaDocument>;
  const base = createEmptyGenoma();
  const inputSlots =
    input.slots && typeof input.slots === "object"
      ? (input.slots as Record<string, SlotState<unknown>>)
      : {};

  const slots = { ...base.slots };
  for (const id of GENOMA_SLOT_IDS) {
    const incoming = inputSlots[id];
    if (incoming) {
      slots[id] = { ...base.slots[id], ...incoming, id };
    }
  }

  return {
    ...base,
    ...input,
    brandName: input.brandName ?? base.brandName,
    sources: Array.isArray(input.sources) ? input.sources : base.sources,
    slots,
    compiled: input.compiled ?? null,
    compiledHash: typeof input.compiledHash === "string" ? input.compiledHash : undefined,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : base.updatedAt,
  };
}

export function normalizeGenomaDocument(raw: unknown): GenomaDocument {
  const merged = mergeGenomaDocument(raw);
  const migrated = hasLegacyGenomaSlots(raw)
    ? migrateGenomaDocument(
        merged,
        raw && typeof raw === "object" && (raw as Partial<GenomaDocument>).slots
          ? ((raw as Partial<GenomaDocument>).slots as Record<string, SlotState<unknown>>)
          : {},
      )
    : merged;
  return enrichGenomaDocument(validateGenomaContentQuality(migrated));
}

export function pendingGenomaSlotIds(doc: GenomaDocument): SlotId[] {
  return GENOMA_SLOT_IDS.filter((id) => {
    const status = doc.slots[id]?.status;
    return status === "pending" || status === "candidates" || status === "needs_user";
  });
}

export function computeGenomaCompleteness(doc: GenomaDocument | undefined): {
  resolved: number;
  total: number;
  percent: number;
} {
  const total = GENOMA_SLOT_IDS.length;
  if (!doc) return { resolved: 0, total, percent: 0 };
  const resolved = GENOMA_SLOT_IDS.filter((id) => doc.slots[id]?.status === "resolved").length;
  return { resolved, total, percent: Math.round((resolved / total) * 100) };
}

export function extractPaletteSwatches(doc: GenomaDocument | undefined): string[] {
  const palette = doc?.slots.palette?.value as PaletteValue | undefined;
  if (!palette?.colors?.length) return ["#6B4C9A", "#E07A5F", "#F4F1EE", "#1F2328", "#8B8F96"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const color of palette.colors) {
    const hex = color.hex.toUpperCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
    if (out.length >= 5) break;
  }
  return out.length ? out : ["#6B4C9A", "#E07A5F", "#F4F1EE", "#1F2328", "#8B8F96"];
}

export function extractLogoPreviewUrl(doc: GenomaDocument | undefined): string | null {
  const logo = doc?.slots.logo?.value as LogoValue | undefined;
  return logo?.previewUrl?.trim() || null;
}

export function extractBrandTitle(doc: GenomaDocument | undefined, fallback = "Genoma"): string {
  return doc?.brandName?.value?.trim() || fallback;
}

export function hasPendingMicroAsks(doc: GenomaDocument | undefined): boolean {
  return pendingGenomaSlotIds(doc ?? createEmptyGenoma()).length > 0;
}

export function extractEssenceBeliefLabels(doc: GenomaDocument | undefined): string[] {
  const essence = doc?.slots.essence?.value as EssenceValue | undefined;
  return essence?.beliefs?.map((belief) => belief.label).filter(Boolean) ?? [];
}
