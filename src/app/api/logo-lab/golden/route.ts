import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { bufferContentSha256 } from "@/lib/brandkit/ingest/paid-operations-server";
import {
  getGoldenDocument,
  loadGoldenManifest,
  sanitizeGoldenDocument,
  saveGoldenManifest,
  upsertGoldenDocument,
} from "@/lib/brandkit/logo-lab/golden/manifest";
import { goldenPdfExists, goldenSetDir, resolveGoldenPdfPath } from "@/lib/brandkit/logo-lab/golden/paths";
import type { GoldenDocument, GoldenSetManifest } from "@/lib/brandkit/logo-lab/golden/types";

export const runtime = "nodejs";

function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "golden_api_dev_only" }, { status: 404 });
  }
  return null;
}

export async function GET() {
  const manifest = loadGoldenManifest();
  const documents = manifest.documents.map((doc) => ({
    ...doc,
    pdfAvailable: goldenPdfExists(doc.file),
  }));
  return NextResponse.json({ version: manifest.version, documents } satisfies GoldenSetManifest & {
    documents: (GoldenDocument & { pdfAvailable: boolean })[];
  });
}

export async function PUT(request: NextRequest) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const body = (await request.json()) as {
    action?: "save_document" | "replace_manifest";
    document?: GoldenDocument;
    manifest?: GoldenSetManifest;
  };

  if (body.action === "replace_manifest" && body.manifest?.version === 1) {
    saveGoldenManifest(body.manifest);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save_document" && body.document?.id) {
    const doc = body.document;
    if (doc.groundTruth.some((g) => g.page < 1)) {
      return NextResponse.json({ error: "invalid_page" }, { status: 400 });
    }
    for (const g of doc.groundTruth) {
      const [x1, y1, x2, y2] = g.bboxPage;
      if (x2 <= x1 || y2 <= y1 || x1 < 0 || y1 < 0 || x2 > 1 || y2 > 1) {
        return NextResponse.json({ error: "invalid_bbox" }, { status: 400 });
      }
    }

    if (goldenPdfExists(doc.file)) {
      const buf = fs.readFileSync(resolveGoldenPdfPath(doc.file));
      const sha = bufferContentSha256(buf);
      if (sha !== doc.sha256) {
        return NextResponse.json({ error: "sha256_mismatch", expected: sha }, { status: 400 });
      }
    }

    upsertGoldenDocument(sanitizeGoldenDocument(doc));
    return NextResponse.json({ ok: true, document: getGoldenDocument(doc.id) });
  }

  return NextResponse.json({ error: "invalid_body" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const form = await request.formData();
  const file = form.get("file");
  const docId = String(form.get("docId") ?? "").trim();
  const kind = String(form.get("kind") ?? "mixed") as GoldenDocument["kind"];

  if (!(file instanceof File) || !docId) {
    return NextResponse.json({ error: "missing_file_or_docId" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = bufferContentSha256(buffer);
  const safeName = `${docId}.pdf`;
  const pdfPath = resolveGoldenPdfPath(safeName);
  fs.mkdirSync(goldenSetDir(), { recursive: true });
  fs.writeFileSync(pdfPath, buffer);

  const totalPages = await countPdfPagesInBuffer(buffer, 500);
  const existing = getGoldenDocument(docId);
  const document: GoldenDocument = existing ?? {
    id: docId,
    file: safeName,
    sha256,
    kind,
    groundTruth: [],
  };
  document.file = safeName;
  document.sha256 = sha256;
  document.kind = kind;

  upsertGoldenDocument(document);
  return NextResponse.json({ ok: true, document, totalPages });
}
