import { describe, expect, it } from "vitest";
import { applyBrandKitStreamEvent } from "@/app/spaces/brandKit/brand-kit-api";
import { applySlotAction } from "./brand-kit-slot-actions";
import { compileBrandKit } from "./compile-brand-kit";
import { createEmptyBrandKit, pendingBrandKitSlotIds } from "./brand-kit-defaults";
import {
  extractOnelinerDeterministic,
  extractValuesDeterministic,
  extractVoiceDeterministic,
} from "./crawl/copy-extract";
import type { CrawlPageSnapshot } from "./crawl/types";
import { BRAND_KIT_SLOT_IDS } from "./brand-kit-types";

const ALIMA_ABOUT_HTML = `
<html><head><title>Alima Producciones</title></head><body>
<main>
<p>Somos directores de cine frustrados, guionistas creativos y un poco sabelotodo que nos metimos en publicidad sin manual de instrucciones.</p>
<p>Declaración de principios:</p>
<p>Hacemos cine</p>
<p>y publicidad</p>
<p>No tenemos clientes:</p>
<p>tenemos cómplices</p>
<p>Vamos muy en serio</p>
<p>no grabamos en vertical</p>
</main></body></html>`;

const ALIMA_HOME_HTML = `
<html><head><title>Alima Producciones</title>
<meta name="description" content="Productora audiovisual en Madrid" /></head><body>
<p>¿Quieres contar una buena historia?</p>
<p>¿Una buena historia?</p>
</body></html>`;

function page(url: string, html: string): CrawlPageSnapshot {
  return { url, html, cssTexts: [] };
}

function applyDeterministicCopyBoard(doc: ReturnType<typeof createEmptyBrandKit>, pages: CrawlPageSnapshot[]) {
  const brandName = "Alima Producciones";
  const extractedOneliner = extractOnelinerDeterministic(pages, brandName);
  const deterministicVoice = extractVoiceDeterministic(pages, brandName);
  const deterministicValues = extractValuesDeterministic(pages);
  const beliefs =
    deterministicValues?.values.map((item) => ({ label: item.label, evidence: item.evidence })) ?? [];
  const pageUrl = pages[0]?.url;

  let next = applyBrandKitStreamEvent(doc, {
    type: "brand_name",
    value: brandName,
    provenance: { type: "jsonld", detail: "Organization.name", sourceUrl: pageUrl },
  });

  if (deterministicVoice) {
    next = applyBrandKitStreamEvent(next, {
      type: "slot_update",
      slotId: "voice",
      patch: {
        status: "resolved",
        value: deterministicVoice,
        provenance: { type: "file_upload", detail: "manifesto web", sourceUrl: pageUrl },
        confidence: 0.62,
      },
    });
  }

  if (extractedOneliner) {
    next = applyBrandKitStreamEvent(next, {
      type: "slot_update",
      slotId: "essence",
      patch: {
        status: "resolved",
        value: {
          headline: extractedOneliner.value.text,
          headlineOrigin: "extracted",
          beliefs,
        },
        provenance: { type: "og_meta", detail: extractedOneliner.sourceDetail, sourceUrl: pageUrl },
        confidence: 0.82,
      },
    });
  }

  for (const id of BRAND_KIT_SLOT_IDS) {
    if (next.slots[id].status === "pending") {
      next = applyBrandKitStreamEvent(next, {
        type: "slot_update",
        slotId: id,
        patch: { status: "empty", confidence: 0 },
      });
    }
  }

  return next;
}

describe("brandKit board integration (alima-like deterministic)", () => {
  const pages = [
    page("https://alimafilms.com/", ALIMA_HOME_HTML),
    page("https://alimafilms.com/about", ALIMA_ABOUT_HTML),
  ];

  it("fills essence and voice without eternal pending slots", () => {
    const doc = applyDeterministicCopyBoard(createEmptyBrandKit(), pages);
    expect(doc.slots.essence.status).toBe("resolved");
    expect(doc.slots.voice.status).toBe("resolved");
    expect(pendingBrandKitSlotIds(doc).filter((id) => doc.slots[id].status === "pending")).toHaveLength(0);
  });

  it("preserves locked logo when a second stream tries to reset it", () => {
    let doc = createEmptyBrandKit();
    doc = applyBrandKitStreamEvent(doc, {
      type: "slot_update",
      slotId: "logo",
      patch: {
        status: "candidates",
        candidates: [
          {
            value: {
              assetId: "logo-a",
              previewUrl: "/a.png",
              format: "png",
              width: 100,
              height: 100,
              background: "transparent",
              variants: [],
            },
            score: 0.9,
            provenance: { type: "header_img", detail: "logo" },
          },
        ],
        confidence: 0.9,
      },
    });
    doc = applySlotAction(doc, "logo", { action: "choose_candidate", candidateIndex: 0, lock: true });
    expect(doc.slots.logo.locked).toBe(true);
    expect(doc.slots.logo.status).toBe("resolved");

    doc = applyBrandKitStreamEvent(
      doc,
      {
        type: "slot_update",
        slotId: "logo",
        patch: { status: "pending", confidence: 0 },
      },
      { respectLocks: true },
    );
    expect(doc.slots.logo.locked).toBe(true);
    expect(doc.slots.logo.status).toBe("resolved");

    doc = applyBrandKitStreamEvent(doc, {
      type: "slot_update",
      slotId: "palette",
      patch: {
        status: "candidates",
        candidates: [
          {
            value: { colors: [{ hex: "#112233", role: "primary" }] },
            score: 0.8,
            provenance: { type: "css_var", detail: "--brand" },
          },
        ],
        confidence: 0.8,
      },
    });
    doc = applySlotAction(doc, "palette", { action: "choose_candidate", candidateIndex: 0, lock: true });
    expect(doc.slots.palette.locked).toBe(true);

    const reloaded = JSON.parse(JSON.stringify(doc));
    expect(reloaded.slots.logo.locked).toBe(true);
    expect(reloaded.slots.palette.locked).toBe(true);
  });

  it("compiles after deterministic fill for exports", async () => {
    const doc = applyDeterministicCopyBoard(createEmptyBrandKit(), pages);
    const { compiled, compiledHash } = await compileBrandKit(doc);
    expect(compiled.paletteTokens).toBeTruthy();
    expect(compiled.copyRules.length).toBeGreaterThan(0);
    expect(compiledHash).toHaveLength(64);
  });
});
