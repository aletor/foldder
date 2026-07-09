import * as cheerio from "cheerio";
import { mergeFontFamilies } from "../src/lib/genoma/crawl/color-utils";
import { buildCopyCorpus } from "../src/lib/genoma/crawl/copy-corpus";
import { extractOnelinerDeterministic } from "../src/lib/genoma/crawl/copy-extract";
import {
  brandNameFromPage,
  cssVarColors,
  fontFaceFamilies,
  fontFaces,
  fontLinks,
  headerLogoHeuristic,
  hexColorsFromCss,
  iconsFromHead,
  imageHarvester,
  inlineFontFamilies,
  logoFromAltText,
  logoFromJsonLd,
  themeColorMeta,
} from "../src/lib/genoma/crawl/parsers";
import { fetchCrawlPages } from "../src/lib/genoma/crawl/run-crawl";
import { buildPaletteValue, buildTypographyValue, rankLogoCandidates, shouldAutoResolveLogo } from "../src/lib/genoma/crawl/scoring";
import { normalizeGenomaUrlInput } from "../src/lib/genoma/crawl/url-utils";

async function main() {
  const raw = process.argv[2]?.trim() || "coca-cola.com/es/es";
  const normalized = normalizeGenomaUrlInput(raw);
  if (!normalized.ok) {
    console.error(normalized.message);
    process.exit(1);
  }

  const url = normalized.url;
  const pages = await fetchCrawlPages(url);

  console.log("\n=== CRAWL ===");
  console.log("Input:", raw, "→", url);
  console.log("Pages:", pages.length);
  for (const page of pages) {
    console.log(`  ${page.url}`);
  }

  if (!pages.length) process.exit(1);

  const paletteEntries: Parameters<typeof buildPaletteValue>[0] = [];
  const fontGroups: string[][] = [];
  const logoSignals = [];
  let images = 0;

  for (const page of pages) {
    const $ = cheerio.load(page.html);
    logoSignals.push(
      ...iconsFromHead($, page.url),
      ...logoFromJsonLd($, page.url),
      ...headerLogoHeuristic($, page.url),
      ...logoFromAltText($, page.url),
    );
    fontGroups.push(fontLinks($, page.url), inlineFontFamilies($));
    images += imageHarvester($, page.url, page.url === url).length;

    const theme = themeColorMeta($, page.url);
    if (theme) paletteEntries.push({ hex: theme.hex, provenance: theme.provenance, weight: 0.6 });

    for (const css of page.cssTexts) {
      paletteEntries.push(
        ...cssVarColors(css, page.url).map((c) => ({ ...c, weight: 0.5 })),
        ...hexColorsFromCss(css, page.url),
      );
      fontGroups.push(fontFaceFamilies(css), fontFaces(css));
    }
  }

  const $0 = cheerio.load(pages[0].html);
  const brand = brandNameFromPage($0, pages[0].url);
  const palette = buildPaletteValue(paletteEntries);
  const typography = buildTypographyValue(mergeFontFamilies(...fontGroups));
  const logos = rankLogoCandidates(logoSignals);
  const logoDecision = shouldAutoResolveLogo(logos);
  const corpus = buildCopyCorpus(pages);
  const oneliner = extractOnelinerDeterministic(pages, brand?.value);

  console.log("\n=== EXTRACT ===");
  console.log("Brand:", brand?.value ?? "(none)");
  console.log("Palette:", palette?.value.colors.map((c) => `${c.role}=${c.hex}`).join(", ") ?? "(none)");
  console.log("Typography:", typography?.value.families.map((f) => `${f.role}=${f.family}`).join(", ") ?? "(none)");
  console.log("Logo auto:", logoDecision.auto, logoDecision.top?.value.previewUrl ?? logos[0]?.value.previewUrl ?? "(none)");
  console.log("Images:", images);
  console.log("Oneliner:", oneliner?.value.text ?? "(none)");
  console.log("Corpus chars:", corpus.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
