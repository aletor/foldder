import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getLogoLabFixture } from "@/lib/genoma/logo-lab/fixtures";
import { harvestLogoLabDocument } from "@/lib/genoma/logo-lab/harvest-document-logos";
import {
  getCachedLogoLabHarvest,
  logoLabFixtureHarvestCacheKey,
  setCachedLogoLabHarvest,
} from "@/lib/genoma/logo-lab/harvest-cache";
import { loadLatestAuditByPrefix } from "@/lib/genoma/logo-lab/load-audit";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const fixture = getLogoLabFixture(id);
  if (!fixture) {
    return NextResponse.json({ error: "unknown_fixture" }, { status: 404 });
  }

  const audit = loadLatestAuditByPrefix(fixture.auditPrefix);
  if (!audit) {
    return NextResponse.json({ error: "audit_not_found", fixtureId: id }, { status: 404 });
  }

  const cacheKey = logoLabFixtureHarvestCacheKey(fixture.id, audit.contentSha256);
  let harvest = getCachedLogoLabHarvest(cacheKey);
  if (!harvest) {
    if (!fs.existsSync(fixture.pdfPath)) {
      return NextResponse.json({ error: "pdf_not_found", fixtureId: id }, { status: 404 });
    }
    const pdfBuffer = fs.readFileSync(fixture.pdfPath);
    harvest = await harvestLogoLabDocument({ pdfBuffer, audit });
    setCachedLogoLabHarvest(cacheKey, harvest);
  }

  return NextResponse.json({
    fixtureId: fixture.id,
    label: fixture.label,
    fileName: fixture.fileName,
    audit,
    harvest,
  });
}
