import fs from "node:fs";
import { NextResponse } from "next/server";
import {
  LOGO_LAB_FIXTURES,
  type LogoLabFixtureId,
} from "@/lib/genoma/logo-lab/fixtures";
import { auditFileNameForPrefix, loadLatestAuditByPrefix } from "@/lib/genoma/logo-lab/load-audit";

export const runtime = "nodejs";

export async function GET() {
  const fixtures = LOGO_LAB_FIXTURES.map((fixture) => {
    const audit = loadLatestAuditByPrefix(fixture.auditPrefix);
    return {
      id: fixture.id,
      label: fixture.label,
      fileName: fixture.fileName,
      auditPrefix: fixture.auditPrefix,
      pdfAvailable: fs.existsSync(fixture.pdfPath),
      auditAvailable: Boolean(audit),
      auditFile: auditFileNameForPrefix(fixture.auditPrefix),
      selectedPages: audit?.selectedPages ?? [],
      logoInstanceCount: audit?.pages.reduce(
        (sum, p) => sum + (p.result?.logoInstances?.length ?? 0),
        0,
      ) ?? 0,
    };
  });

  return NextResponse.json({ fixtures });
}

export type LogoLabFixturesResponse = {
  fixtures: Array<{
    id: LogoLabFixtureId;
    label: string;
    fileName: string;
    auditPrefix: string;
    pdfAvailable: boolean;
    auditAvailable: boolean;
    auditFile: string | null;
    selectedPages: number[];
    logoInstanceCount: number;
  }>;
};
