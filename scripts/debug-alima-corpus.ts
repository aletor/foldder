import * as cheerio from "cheerio";
import { buildCopyCorpus } from "../src/lib/genoma/crawl/copy-corpus";
import { fetchCrawlPages } from "../src/lib/genoma/crawl/run-crawl";

async function main() {
  const pages = await fetchCrawlPages("https://alimafilms.com/");
  for (const label of ["home", "about", "contact"]) {
    const page = pages.find((p) => (label === "home" ? p.url.endsWith("/") || p.url.endsWith(".com") : p.url.includes(label)));
    if (!page) continue;
    const $ = cheerio.load(page.html);
    console.log("\n===", label, page.url);
    console.log("h1:", $("h1").length, JSON.stringify($("h1").first().text().trim().slice(0, 100)));
    console.log("h2:", $("h2").length, $("h2").first().text().trim().slice(0, 80));
    console.log("h3:", $("h3").length);
    console.log("p:", $("p").length);
    console.log("[class*='text']:", $("[class*='text'], [class*='desc'], [class*='content']").length);
    const body = $("body").text().replace(/\s+/g, " ").trim();
    console.log("body chars:", body.length);
    console.log("sample:", body.slice(200, 700));
  }

  const corpus = buildCopyCorpus(pages);
  console.log("\n=== CORPUS ===");
  console.log("length:", corpus.length);
  console.log(corpus.slice(0, 2000));
}

main().catch(console.error);
