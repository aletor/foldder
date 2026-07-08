import * as cheerio from "cheerio";
import {
  brandNameFromPage,
  cssVarColors,
  fontFaceFamilies,
  fontFaces,
  fontLinks,
  headerLogoHeuristic,
  hexColorsFromCss,
  iconsFromHead,
  logoFromJsonLd,
  themeColorMeta,
} from "./parsers";
import { mergeFontFamilies } from "./color-utils";
import { buildPaletteValue, buildTypographyValue, rankLogoCandidates } from "./scoring";
import { extractInlineStyles, extractLinkedStylesheets } from "./url-utils";

/** Ejecuta parsers sobre HTML estático (fixtures/tests) sin red ni LLM. */
export function analyzeStaticHtml(html: string, pageUrl: string, cssTexts: string[] = []) {
  const $ = cheerio.load(html);
  const logoSignals = [...iconsFromHead($, pageUrl), ...logoFromJsonLd($, pageUrl), ...headerLogoHeuristic($, pageUrl)];
  const theme = themeColorMeta($, pageUrl);
  const paletteColors = [
    ...(theme ? [{ hex: theme.hex, provenance: theme.provenance, weight: 0.4 }] : []),
    ...cssTexts.flatMap((css) => [
      ...cssVarColors(css, pageUrl).map((c) => ({ ...c, weight: 0.5 })),
      ...hexColorsFromCss(css, pageUrl),
    ]),
  ];
  const fonts = mergeFontFamilies(
    fontLinks($, pageUrl),
    ...cssTexts.flatMap((css) => [fontFaceFamilies(css), fontFaces(css)]),
  );
  return {
    brand: brandNameFromPage($, pageUrl),
    logos: rankLogoCandidates(logoSignals),
    palette: buildPaletteValue(paletteColors),
    typography: buildTypographyValue(fonts),
  };
}
