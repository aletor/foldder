const BRAND_MANUAL_NAME_RE =
  /charte|brand.?book|brand.?manual|manual de marca|identidad visual|style guide|libro de marca|guidelines|normas gr[aá]ficas|brand identity/i;

const BRAND_MANUAL_TEXT_SIGNALS = [
  /\bcharte graphique\b/i,
  /\bidentit[eé].{0,20}marque\b/i,
  /\blogotype?s?\b/i,
  /\bpantone\b/i,
  /typograph/i,
  /\bmise en couleur/i,
  /\bcouleurs tricolor/i,
  /\bmanual de marca\b/i,
  /\bbrand manual\b/i,
  /\bnormas gr[aá]ficas\b/i,
];

export function isLikelyBrandManualPdf(fileName: string, textSample = ""): boolean {
  if (BRAND_MANUAL_NAME_RE.test(fileName)) return true;
  const sample = textSample.slice(0, 16_000);
  let hits = 0;
  for (const re of BRAND_MANUAL_TEXT_SIGNALS) {
    if (re.test(sample)) hits += 1;
  }
  return hits >= 2;
}
