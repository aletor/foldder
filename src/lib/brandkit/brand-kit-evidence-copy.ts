import type { Provenance, ProvenanceType, SlotReconciliation } from "./brand-kit-types";

export type BrandKitEvidenceCopy = {
  step: string;
  confidence: string;
  signals: string[];
};

const PROVENANCE_LABEL: Record<ProvenanceType, string> = {
  css_var: "Declarado en el código de tu web",
  computed_style: "Declarado en el código de tu web",
  link_icon: "Extraído del icono de tu web",
  manifest: "Declarado en el manifest de tu web",
  jsonld: "Declarado en los metadatos de tu web",
  og_meta: "Extraído de los metadatos sociales de tu web",
  header_img: "Extraído de una imagen destacada de tu web",
  site_repetition: "Repetido en varias páginas de tu web",
  font_face: "Declarado en las fuentes de tu web",
  font_link: "Enlazado desde tu web",
  pdf_font_dict: "Detectado en un PDF de tu material",
  pdf_xobject: "Detectado en un PDF de tu material",
  pdf_vector_fill: "Detectado en un PDF de tu material",
  file_upload: "Subido por ti",
  llm_synthesis: "Redactado por IA a partir de tu material",
  user_input: "Introducido por ti",
  seed_form: "Indicado al iniciar el brandKit",
};

const DETAIL_PATTERNS: Array<{ test: RegExp; format: (match: RegExpMatchArray, detail: string) => string }> = [
  {
    test: /(\d+)\s*[/de]\s*(\d+)\s*p[aá]g/i,
    format: (m) => `Aparece en ${m[1]} de ${m[2]} páginas`,
  },
  {
    test: /p[aá]g(?:ina|\.)?\s*(\d+)/i,
    format: (m, detail) => {
      const file = detail.split("·")[0]?.trim() || "tu material";
      return `Detectado en ${file}, pág. ${m[1]}`;
    },
  },
  {
    test: /repetid[oa]\s*(\d+)/i,
    format: (m) => `Aparece en ${m[1]} páginas de tu web`,
  },
];

const RANK_SIGNAL_LABELS: Array<{ test: RegExp; label: string | ((m: RegExpMatchArray) => string) }> = [
  { test: /manifest/i, label: "coincide con el manifest" },
  { test: /schema oficial/i, label: "coincide con el manifest" },
  { test: /fuente autoritativa|authoritative/i, label: "confirmado por fuente prioritaria" },
  { test: /varios métodos coinciden/i, label: "confirmado por varios métodos" },
  { test: /repetid[oa]\s*(\d+)/i, label: (m) => `repetido en ${m[1]} páginas` },
  { test: /document probe|visión por página|vision/i, label: "detectado en documento" },
  { test: /manual de marca/i, label: "proviene de manual de marca" },
  { test: /svg/i, label: "formato vectorial preferido" },
];

function translateDetail(provenance: Provenance): string | null {
  const detail = provenance.detail?.trim() ?? "";
  if (!detail) return null;
  for (const pattern of DETAIL_PATTERNS) {
    const match = detail.match(pattern.test);
    if (match) return pattern.format(match, detail);
  }
  if (provenance.sourceUrl) {
    try {
      const host = new URL(provenance.sourceUrl).hostname.replace(/^www\./i, "");
      return `Extraído de ${host}`;
    } catch {
      /* ignore */
    }
  }
  if (/p[aá]g/i.test(detail) || /\.pdf/i.test(detail)) {
    return `Detectado en ${detail}`;
  }
  return null;
}

export function translateProvenanceStep(provenance?: Provenance): string {
  if (!provenance) return "Extraído de tu material";
  const fromDetail = translateDetail(provenance);
  if (fromDetail) return fromDetail;
  return PROVENANCE_LABEL[provenance.type] ?? "Extraído de tu material";
}

export function translateConfidenceLabel(confidence?: number): string {
  const value = confidence ?? 0;
  if (value >= 0.75) return "evidencia fuerte";
  if (value >= 0.45) return "evidencia media";
  return "evidencia débil";
}

function translateRankSignal(signal: string): string | null {
  const trimmed = signal.trim();
  if (!trimmed) return null;
  for (const entry of RANK_SIGNAL_LABELS) {
    const match = trimmed.match(entry.test);
    if (match) {
      return typeof entry.label === "function" ? entry.label(match) : entry.label;
    }
  }
  if (/^p[aá]g\.\s*\d+/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^\d+\s*×/.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function translateReconciliationSignal(reconciliation?: SlotReconciliation): string | null {
  if (!reconciliation) return null;
  if (reconciliation.outcome === "reinforcement") return "refuerza lo que ya tenías";
  if (reconciliation.outcome === "extension") return "amplía lo confirmado con material nuevo";
  if (reconciliation.outcome === "identical") return "coincide con lo confirmado";
  return null;
}

export function translateRankSignals(
  rankSignals?: string[],
  reconciliation?: SlotReconciliation,
): string[] {
  const out: string[] = [];
  const reconciliationLine = translateReconciliationSignal(reconciliation);
  if (reconciliationLine) out.push(reconciliationLine);

  for (const signal of rankSignals ?? []) {
    const label = translateRankSignal(signal);
    if (label && !out.includes(label)) out.push(label);
  }

  if (rankSignals && rankSignals.length >= 2 && !out.some((line) => line.includes("fuentes"))) {
    out.push(`confirmado por ${Math.min(rankSignals.length, 3)} señales`);
  }

  return out.slice(0, 3);
}

export function buildBrandKitEvidenceCopy(input: {
  provenance?: Provenance;
  confidence?: number;
  rankSignals?: string[];
  reconciliation?: SlotReconciliation;
}): BrandKitEvidenceCopy {
  return {
    step: translateProvenanceStep(input.provenance),
    confidence: translateConfidenceLabel(input.confidence),
    signals: translateRankSignals(input.rankSignals, input.reconciliation),
  };
}

export function formatConfirmedDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
