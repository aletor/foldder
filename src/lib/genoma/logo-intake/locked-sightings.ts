import { box2dToBBoxPage, isValidBox2d, type BBoxPage } from "@/lib/genoma/logo-intake/bbox";
import { cropLogoFromFrame, cropLogoFromImageDoc } from "@/lib/genoma/logo-intake/crop";
import { mapPool } from "@/lib/genoma/logo-intake/concurrency";
import { computeDHashHex, phashNear } from "@/lib/genoma/logo-intake/phash";
import type { IntakeDocInput } from "@/lib/genoma/logo-intake/render";
import { renderIntakeFrames } from "@/lib/genoma/logo-intake/render";
import type { BrandLogoState } from "@/lib/genoma/logo-intake/types";
import type { ParsedVisionLogo } from "@/lib/genoma/logo-intake/vision-schema";
import { invokeLogoIntakeVision } from "@/lib/genoma/logo-intake/vision-invoker";

const SIGHTING_CROP_CONCURRENCY = 12;

function sightingKey(docId: string, page: number): string {
  return `${docId}:${page}`;
}

export async function registerLockedSightings(input: {
  docs: IntakeDocInput[];
  lockedPHash: string;
  existing: BrandLogoState["sightings"];
  userEmail?: string;
}): Promise<{ sightings: BrandLogoState["sightings"]; newCount: number }> {
  const frames = await renderIntakeFrames(input.docs);
  const { parsed } = await invokeLogoIntakeVision({
    frames,
    userEmail: input.userEmail,
    route: "/api/genoma/logo-intake/analyze",
  });

  const docById = new Map(input.docs.map((d) => [d.docId, d]));
  const frameByKey = new Map(frames.map((f) => [`${f.docIndex}:${f.page}`, f]));
  const known = new Set(input.existing.map((s) => sightingKey(s.docId, s.page)));
  const sightings = [...input.existing];
  let newCount = 0;
  const now = new Date().toISOString();

  type Job = {
    frame: (typeof frames)[number];
    doc: IntakeDocInput;
    bboxPage: BBoxPage;
  };
  const jobs: Job[] = [];

  for (const image of parsed.images ?? []) {
    const frame = frameByKey.get(`${image.docIndex}:${image.pageNumber}`);
    if (!frame) continue;
    const doc = docById.get(frame.docId);
    if (!doc) continue;
    for (const logo of image.logos ?? []) {
      if (!isValidBox2d((logo as ParsedVisionLogo).box_2d)) continue;
      const bboxPage = box2dToBBoxPage((logo as ParsedVisionLogo).box_2d);
      if (!bboxPage) continue;
      jobs.push({ frame, doc, bboxPage });
    }
  }

  const hits = await mapPool(jobs, SIGHTING_CROP_CONCURRENCY, async ({ frame, doc, bboxPage }) => {
    try {
      const cropped =
        doc.kind === "image"
          ? await cropLogoFromImageDoc({ doc, bboxPage })
          : await cropLogoFromFrame({
              jpegBase64: frame.jpegBase64,
              frameWidth: frame.width,
              frameHeight: frame.height,
              bboxPage,
            });
      const pHash = await computeDHashHex(cropped.thumbJpeg);
      if (!phashNear(pHash, input.lockedPHash)) return null;
      return { docId: frame.docId, page: frame.page };
    } catch {
      return null;
    }
  });

  for (const hit of hits) {
    if (!hit) continue;
    const key = sightingKey(hit.docId, hit.page);
    if (known.has(key)) continue;
    known.add(key);
    sightings.push({ docId: hit.docId, page: hit.page, at: now });
    newCount += 1;
  }

  return { sightings, newCount };
}
