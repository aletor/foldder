import type { Candidate, Provenance } from "../genoma-types";
import type { LogoValue } from "../genoma-types";
import { shouldAutoResolveLogo as shouldAutoResolveLogoPolicy } from "../genoma-logo-policy";
import type { LogoCandidateSignal } from "./types";
import { rankPaletteColors, sanitizeFontFamily, isNearNeutralHex } from "./color-utils";

export function rankLogoCandidates(signals: LogoCandidateSignal[]): Candidate<LogoValue>[] {
  const byUrl = new Map<string, LogoCandidateSignal>();
  for (const signal of signals) {
    const prev = byUrl.get(signal.url);
    if (!prev || signal.score > prev.score) byUrl.set(signal.url, signal);
  }
  const ranked = [...byUrl.values()]
    .filter((s) => s.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return ranked.map((signal) => ({
    score: signal.score,
    provenance: signal.provenance,
    value: {
      assetId: signal.url,
      previewUrl: signal.url,
      format: signal.format,
      width: signal.widthHint ?? 256,
      height: signal.heightHint ?? 256,
      background: signal.format === "svg" || signal.format === "png" ? "transparent" : "solid",
      variants: [],
    },
  }));
}

export function shouldAutoResolveLogo(candidates: Candidate<LogoValue>[]): {
  auto: boolean;
  top?: Candidate<LogoValue>;
} {
  return shouldAutoResolveLogoPolicy(candidates);
}

function scoreFontFamilyPriority(name: string): number {
  if (/fanta|sprite|fuze|aquarius|powerade|icomoon|videojs|better with/i.test(name)) return -20;
  if (/unity|grotesk|brand|sans|inter|helvetica|roboto/i.test(name)) return 20;
  return 0;
}

export function buildPaletteValue(
  colors: { hex: string; provenance: Provenance; weight?: number; varName?: string }[],
): { value: { colors: { hex: string; role: "primary" | "secondary" | "accent" | "background" | "text" | "neutral"; usageWeight?: number }[] }; provenance: Provenance } | null {
  const ranked = rankPaletteColors(colors);
  if (!ranked.length) return null;

  const roles: Array<"primary" | "secondary" | "accent" | "background" | "text" | "neutral"> = [
    "primary",
    "accent",
    "secondary",
    "background",
    "text",
    "neutral",
  ];
  const picked = ranked
    .map((entry, index) => ({
      hex: entry.hex,
      role: roles[index] ?? "neutral",
      usageWeight: entry.weight,
    }))
    .filter((entry, index) => index === 0 || !(isNearNeutralHex(entry.hex) && index < 3));
  return {
    value: { colors: picked },
    provenance: ranked[0].provenance,
  };
}

export function buildTypographyValue(families: string[]): {
  value: {
    families: {
      family: string;
      role: "display" | "heading" | "body";
      source: "google" | "adobe" | "custom" | "system";
      fallbacks: string[];
      weights: number[];
    }[];
  };
  provenance: Provenance;
} | null {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of families) {
    const family = sanitizeFontFamily(raw);
    if (!family || seen.has(family.toLowerCase())) continue;
    seen.add(family.toLowerCase());
    unique.push(family);
  }
  unique.sort((a, b) => scoreFontFamilyPriority(b) - scoreFontFamilyPriority(a));
  if (!unique.length) return null;
  const [first, second] = unique;
  const isGoogle = (name: string) => !/arial|helvetica|system-ui|segoe|roboto|times|georgia|sans-serif|serif/i.test(name);
  const familiesOut: {
    family: string;
    role: "display" | "heading" | "body";
    source: "google" | "adobe" | "custom" | "system";
    fallbacks: string[];
    weights: number[];
  }[] = [
    {
      family: first,
      role: "heading",
      source: isGoogle(first) ? "google" : "custom",
      fallbacks: ["Helvetica Neue", "sans-serif"],
      weights: [500, 700],
    },
  ];
  if (second) {
    familiesOut.push({
      family: second,
      role: "body",
      source: isGoogle(second) ? "google" : /arial|helvetica|system-ui|segoe|roboto/i.test(second) ? "system" : "custom",
      fallbacks: ["system-ui", "sans-serif"],
      weights: [400, 600],
    });
  }
  return {
    value: { families: familiesOut },
    provenance: { type: "font_link", detail: first },
  };
}
