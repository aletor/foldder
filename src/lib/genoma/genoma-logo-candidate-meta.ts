import type { Candidate, LogoDetectionMethod, LogoValue } from "./genoma-types";
import { genomaLocaleEs } from "./genoma-locale.es";

export function logoDetectionMethodLabel(method?: LogoDetectionMethod): string {
  switch (method) {
    case "vision_bbox":
      return "visión IA";
    case "heuristic":
      return "heurística";
    case "adjusted":
      return "ajustado por ti";
    case "upload":
      return "archivo subido";
    case "web":
      return "web";
    default:
      return "detección automática";
  }
}

export function buildLogoCandidateExplanation(candidate: Candidate<LogoValue>): string {
  const value = candidate.value;
  const parts: string[] = [];

  if (value.detectionMethod === "adjusted") {
    parts.push("recorte confirmado manualmente");
  } else if (value.detectionMethod === "vision_bbox") {
    parts.push("detectado por visión en el documento");
  } else if (value.detectionMethod === "heuristic") {
    parts.push("región de alto contraste en la plancheta");
  } else if (value.detectionMethod === "upload") {
    parts.push("logo subido como imagen");
  }

  const signal = candidate.rankSignals?.find((row) => /principal|variante|visión|heurística|brand board/i.test(row));
  if (signal) parts.push(signal.toLowerCase());

  const provenance = candidate.provenance.detail?.trim();
  if (provenance && !parts.some((row) => provenance.toLowerCase().includes(row))) {
    parts.push(provenance.toLowerCase());
  }

  return parts[0] ?? "candidato automático";
}

export type LogoCandidateMeta = {
  methodLabel: string;
  scorePercent: number;
  pageLabel: string | null;
  explanation: string;
};

export function logoCandidateMeta(candidate: Candidate<LogoValue>): LogoCandidateMeta {
  const value = candidate.value;
  const pageLabel =
    value.sourcePageNumber != null
      ? genomaLocaleEs.logoPageSignal(value.sourcePageNumber, value.totalDocPages ?? 0)
      : null;

  return {
    methodLabel: logoDetectionMethodLabel(value.detectionMethod),
    scorePercent: Math.round(Math.max(0, Math.min(1, candidate.score)) * 100),
    pageLabel,
    explanation: buildLogoCandidateExplanation(candidate),
  };
}
