import { normalizeBrandKitDocument } from "@/lib/brandkit/brand-kit-defaults";
import type { BrandKitDocument, BrandKitNodeData, EssenceValue, VoiceValue } from "@/lib/brandkit/brand-kit-types";
import type { GuionistaBrainContext } from "./guionista-types";

function coerceBrandKitRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function trimList(items: string[], limit: number): string[] {
  return items
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function beliefLabels(essence: EssenceValue | undefined): string[] {
  if (!essence?.beliefs?.length) return [];
  return essence.beliefs
    .map((belief) => belief.label?.trim())
    .filter((label): label is string => Boolean(label));
}

function evidenceSnippets(doc: BrandKitDocument, limit: number): string[] {
  const quotes: string[] = [];
  for (const slotId of ["voice", "essence"] as const) {
    const evidence = doc.slots[slotId]?.value?.evidence;
    if (!Array.isArray(evidence)) continue;
    for (const row of evidence) {
      const quote = typeof row?.quote === "string" ? row.quote.trim() : "";
      if (quote) quotes.push(quote);
      if (quotes.length >= limit) return quotes;
    }
  }
  return quotes;
}

function hasUsableBrandSignal(context: GuionistaBrainContext): boolean {
  return Boolean(
    context.projectContext ||
      context.tone?.length ||
      context.approvedClaims?.length ||
      context.avoidPhrases?.length ||
      context.notes?.length ||
      context.editorialStyle?.length ||
      context.references?.length,
  );
}

/** Construye el contexto editorial de Guionista desde `node.data` de un BrandKit conectado. */
export function guionistaBrainFromBrandKitData(data: unknown): {
  context: GuionistaBrainContext;
  hints: string[];
} {
  const row = (data && typeof data === "object" ? data : null) as BrandKitNodeData | null;
  const doc = normalizeBrandKitDocument(coerceBrandKitRaw(row?.brandKit));
  const voice = doc.slots.voice?.value as VoiceValue | undefined;
  const essence = doc.slots.essence?.value as EssenceValue | undefined;
  const brandName = doc.brandName?.value?.trim() || "";

  const projectParts = [
    brandName,
    essence?.summary?.trim(),
    essence?.purpose?.trim(),
    essence?.promise?.trim(),
    essence?.brandContext?.trim(),
  ].filter(Boolean);

  const tone = trimList(
    [
      ...(voice?.descriptors ?? []),
      ...(voice?.summary ? [voice.summary] : []),
    ],
    8,
  );

  const approvedClaims = trimList(
    [
      ...(essence?.headline ? [essence.headline] : []),
      ...beliefLabels(essence),
    ],
    10,
  );

  const avoidPhrases = trimList(voice?.avoid ?? [], 12);
  const notes = trimList(voice?.rules ?? [], 8);
  const editorialStyle = trimList(
    [voice?.summary?.trim() ?? "", ...(voice?.rules ?? [])].filter(Boolean),
    8,
  );
  const references = trimList(evidenceSnippets(doc, 6), 6);

  const context: GuionistaBrainContext = {
    enabled: false,
    projectContext: projectParts.join(" · ").slice(0, 900) || undefined,
    tone: tone.length ? tone : undefined,
    approvedClaims: approvedClaims.length ? approvedClaims : undefined,
    avoidPhrases: avoidPhrases.length ? avoidPhrases : undefined,
    notes: notes.length ? notes : undefined,
    editorialStyle: editorialStyle.length ? editorialStyle : undefined,
    references: references.length ? references : undefined,
  };
  context.enabled = hasUsableBrandSignal(context);

  const hints: string[] = [];
  if (context.tone?.length) hints.push(`Tono: ${context.tone.slice(0, 3).join(", ")}`);
  if (context.projectContext) hints.push(context.projectContext.slice(0, 120));
  if (context.approvedClaims?.length) hints.push(`Claims: ${context.approvedClaims.slice(0, 2).join("; ")}`);
  if (context.avoidPhrases?.length) hints.push(`Evitar: ${context.avoidPhrases.slice(0, 2).join("; ")}`);
  if (context.notes?.length) hints.push(`Reglas: ${context.notes.slice(0, 2).join("; ")}`);
  if (context.editorialStyle?.length && hints.length < 5) {
    hints.push(`Estilo: ${context.editorialStyle[0]}`);
  }

  return {
    context,
    hints: hints.slice(0, 7),
  };
}
