import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCopyCorpus } from "../src/lib/genoma/crawl/copy-corpus";
import { fetchCrawlPages } from "../src/lib/genoma/crawl/run-crawl";
import { synthesizeValues, synthesizeVoice } from "../src/lib/genoma/llm/genoma-llm-synthesis";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

async function main() {
  loadEnvLocal();
  const hasKey = Boolean((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim());
  console.log("GEMINI configured:", hasKey);

  const pages = await fetchCrawlPages("https://alimafilms.com/");
  const corpus = buildCopyCorpus(pages);
  console.log("corpus chars:", corpus.length);

  if (!hasKey) return;

  const voice = await synthesizeVoice({ corpus, brandName: "Alima Producciones", route: "/test" });
  const values = await synthesizeValues({ corpus, brandName: "Alima Producciones", route: "/test" });
  console.log("voice:", voice ? { descriptors: voice.descriptors, evidence: voice.evidence.map((e) => e.quote.slice(0, 60)) } : null);
  console.log("values:", values ? values.values.map((v) => v.label) : null);
}

main().catch(console.error);
