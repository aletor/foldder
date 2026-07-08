import fs from "node:fs";
import path from "node:path";
import type { PageVisionPassRunAudit } from "@/lib/genoma/ingest/page-vision-pass-runner";
import { GENOMA_PAGE_VISION_NIVEL1_VERSION } from "@/lib/genoma/ingest/page-vision-pass-version";
import { visionCacheDir } from "@/lib/genoma/logo-lab/golden/paths";

export type VisionCacheSource = "gemini_live" | "fixture_seed" | "upload_replay" | "legacy_raw";

export type VisionCacheEnvelope = {
  version: 1;
  contentSha256: string;
  pipelineVersion: string;
  source: VisionCacheSource;
  cachedAt: string;
  audit: PageVisionPassRunAudit;
};

export function visionCacheKey(contentSha256: string): string {
  return `${contentSha256.trim().slice(0, 64)}__${GENOMA_PAGE_VISION_NIVEL1_VERSION}.audit.json`;
}

export function visionCachePath(contentSha256: string): string {
  return path.join(visionCacheDir(), visionCacheKey(contentSha256));
}

function parseVisionCacheFile(raw: string): VisionCacheEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as VisionCacheEnvelope | PageVisionPassRunAudit;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      parsed.version === 1 &&
      "audit" in parsed &&
      "contentSha256" in parsed
    ) {
      return parsed as VisionCacheEnvelope;
    }
    const audit = parsed as PageVisionPassRunAudit;
    if (!audit.contentSha256) return null;
    return {
      version: 1,
      contentSha256: audit.contentSha256,
      pipelineVersion: audit.nivel1Contract ?? GENOMA_PAGE_VISION_NIVEL1_VERSION,
      source: "legacy_raw",
      cachedAt: audit.generatedAt ?? "unknown",
      audit,
    };
  } catch {
    return null;
  }
}

export function readVisionCacheEnvelope(contentSha256: string): VisionCacheEnvelope | null {
  const expected = contentSha256.trim().slice(0, 64);
  const filePath = visionCachePath(expected);
  if (!fs.existsSync(filePath)) return null;
  const envelope = parseVisionCacheFile(fs.readFileSync(filePath, "utf8"));
  if (!envelope) return null;
  if (envelope.contentSha256 !== expected) {
    throw new Error(
      `vision_cache_sha256_mismatch: key=${expected.slice(0, 12)} file=${envelope.contentSha256.slice(0, 12)}`,
    );
  }
  if (envelope.audit.contentSha256 && envelope.audit.contentSha256 !== expected) {
    throw new Error(
      `vision_cache_audit_sha256_mismatch: key=${expected.slice(0, 12)} audit=${envelope.audit.contentSha256.slice(0, 12)}`,
    );
  }
  return envelope;
}

export function readVisionCache(contentSha256: string): PageVisionPassRunAudit | null {
  return readVisionCacheEnvelope(contentSha256)?.audit ?? null;
}

export function writeVisionCache(
  contentSha256: string,
  audit: PageVisionPassRunAudit,
  source: VisionCacheSource,
): void {
  const sha = contentSha256.trim().slice(0, 64);
  if (audit.contentSha256 && audit.contentSha256 !== sha) {
    throw new Error(`vision_cache_write_sha256_mismatch:${sha.slice(0, 12)}`);
  }
  const dir = visionCacheDir();
  fs.mkdirSync(dir, { recursive: true });
  const envelope: VisionCacheEnvelope = {
    version: 1,
    contentSha256: sha,
    pipelineVersion: GENOMA_PAGE_VISION_NIVEL1_VERSION,
    source,
    cachedAt: new Date().toISOString(),
    audit: { ...audit, contentSha256: sha },
  };
  fs.writeFileSync(visionCachePath(sha), `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

export function deleteVisionCache(contentSha256: string): void {
  const filePath = visionCachePath(contentSha256);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
