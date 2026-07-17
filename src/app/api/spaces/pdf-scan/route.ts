import { NextRequest } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { PDF_SCAN_MAX_FILE_BYTES, type PdfScanMode, type PdfScanSourceMeta } from "@/lib/pdf-scan/pdf-scan-types";
import { mapPdfScanErrorMessage } from "@/lib/pdf-scan/pdf-scan-sanitize";
import { stagePdfScanSource } from "@/lib/pdf-scan/pdf-scan-stage";
import { runPdfScanTexts } from "@/lib/pdf-scan/run-pdf-scan";
import { runPdfScanDocument } from "@/lib/pdf-scan/run-pdf-scan-document";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseMode(raw: FormDataEntryValue | null): PdfScanMode | "stage" | null {
  if (typeof raw !== "string") return null;
  if (raw === "stage" || raw === "texts" || raw === "document") return raw;
  return null;
}

function parseSource(formData: FormData): PdfScanSourceMeta | undefined {
  const s3Key = formData.get("s3Key");
  const contentSha256 = formData.get("contentSha256");
  const fileName = formData.get("fileName");
  const byteSize = formData.get("byteSize");
  if (typeof s3Key !== "string" || !s3Key.trim()) return undefined;
  return {
    s3Key: s3Key.trim(),
    contentSha256: typeof contentSha256 === "string" ? contentSha256 : "",
    fileName: typeof fileName === "string" ? fileName : "document.pdf",
    byteSize: typeof byteSize === "string" ? Number(byteSize) || 0 : 0,
    url: typeof formData.get("sourceUrl") === "string" ? String(formData.get("sourceUrl")) : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSpacesAuthUser(req);
    if (!auth.ok) return auth.response;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return Response.json(
        { error: "El archivo supera el límite de subida del servidor (máx. ~32MB)." },
        { status: 413 },
      );
    }

    const mode = parseMode(formData.get("mode")) ?? "texts";
    const dpiRaw = formData.get("dpi");
    const dpi = typeof dpiRaw === "string" ? Number(dpiRaw) : undefined;
    const sourceMeta = parseSource(formData);
    const file = formData.get("file");

    if (mode === "stage") {
      if (!(file instanceof File)) {
        return Response.json({ error: "Se requiere un archivo PDF (campo file) para stage." }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.byteLength > PDF_SCAN_MAX_FILE_BYTES) {
        return Response.json(
          { error: `PDF demasiado grande (máx. ${Math.round(PDF_SCAN_MAX_FILE_BYTES / (1024 * 1024))} MB).` },
          { status: 413 },
        );
      }
      const staged = await stagePdfScanSource({
        buffer,
        fileName: file.name || "document.pdf",
        userEmail: auth.user.email,
      });
      return Response.json({ ok: true, mode: "stage", ...staged });
    }

    const hasFile = file instanceof File;
    if (!hasFile && !sourceMeta) {
      return Response.json({ error: "Se requiere file o s3Key del PDF staged." }, { status: 400 });
    }

    let buffer: Buffer | undefined;
    if (hasFile) {
      buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.byteLength > PDF_SCAN_MAX_FILE_BYTES) {
        return Response.json(
          { error: `PDF demasiado grande (máx. ${Math.round(PDF_SCAN_MAX_FILE_BYTES / (1024 * 1024))} MB).` },
          { status: 413 },
        );
      }
    }

    const common = {
      buffer,
      source: sourceMeta,
      fileName: hasFile ? file.name || "document.pdf" : sourceMeta?.fileName,
      userEmail: auth.user.email,
      dpi: Number.isFinite(dpi) ? dpi : undefined,
    };

    if (mode === "document") {
      const result = await runPdfScanDocument(common);
      return Response.json({ ok: true, ...result });
    }

    const result = await runPdfScanTexts(common);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[pdf-scan]", error);
    return Response.json({ error: mapPdfScanErrorMessage(error) }, { status: 500 });
  }
}
