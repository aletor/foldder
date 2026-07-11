import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCopyCorpus } from "../src/lib/brandKit/crawl/copy-corpus";
import { fetchCrawlPages } from "../src/lib/brandKit/crawl/run-crawl";
import {
  parseVoiceLlmResponse,
  validateVoiceAgainstCorpus,
} from "../src/lib/brandKit/llm/brandKit-llm-validate";
import { GoogleGenAI } from "@google/genai";
import { parseJsonObjectFromVisionModelText } from "../src/lib/brain/brain-vision-json-from-text";

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
  const pages = await fetchCrawlPages("https://alimafilms.com/");
  const corpus = buildCopyCorpus(pages);
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) return;

  const ai = new GoogleGenAI({ apiKey });
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: corpus }] }],
    config: {
      systemInstruction: "Devuelve SOLO JSON voice analysis",
      responseMimeType: "application/json",
    },
  });

  const raw = parseVoiceLlmResponse(parseJsonObjectFromVisionModelText(result.text ?? ""));
  console.log("parsed:", raw);
  if (raw) {
    for (const e of raw.evidence) {
      console.log("quote match:", validateVoiceAgainstCorpus(corpus, raw) ? "voice ok" : "voice fail", e.quote.slice(0, 80));
      console.log("  in corpus:", corpus.includes(e.quote.slice(0, 40)));
    }
  }
}

main().catch(console.error);
