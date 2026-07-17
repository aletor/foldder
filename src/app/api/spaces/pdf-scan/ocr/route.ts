import { NextRequest, NextResponse } from "next/server";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  PDF_SCAN_OCR_ROUTE,
  PDF_SCAN_OCR_USD_PER_PAGE,
  runPdfScanOcr,
} from "@/lib/pdf-scan/pdf-scan-ocr";
import {
  PDF_SCAN_MAX_FILE_BYTES,
  PDF_SCAN_OCR_MAX_PAGES,
  type PdfScanSourceMeta,
} from "@/lib/pdf-scan/pdf-scan-types";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 300;

type OcrBody = {
  s3Key?: string;
  contentSha256?: string;
  fileName?: string;
  byteSize?: number;
  sourceUrl?: string;
  dpi?: number;
  maxPages?: number;
  pagesDone?: number[];
};

function parseSource(body: OcrBody): PdfScanSourceMeta | null {
  if (typeof body.s3Key !== "string" || !body.s3Key.trim()) return null;
  return {
    s3Key: body.s3Key.trim(),
    contentSha256: typeof body.contentSha256 === "string" ? body.contentSha256 : "",
    fileName: typeof body.fileName === "string" ? body.fileName : "document.pdf",
    byteSize: typeof body.byteSize === "number" ? body.byteSize : Number(body.byteSize) || 0,
    url: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined,
  };
}

/**
 * F6 OCR opt-in — Gemini vision, 1 llamada de pago por página.
 * Sin auto-retry. Wallet obligatorio. Gesto explícito desde el cliente.
 */
export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("gemini-vision-analysis");
    const auth = await requireSpacesAuthUser(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as OcrBody;
    const source = parseSource(body);
    if (!source) {
      return NextResponse.json({ error: "Se requiere s3Key del PDF staged." }, { status: 400 });
    }
    if (source.byteSize > PDF_SCAN_MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `PDF demasiado grande (máx. ${Math.round(PDF_SCAN_MAX_FILE_BYTES / (1024 * 1024))} MB).` },
        { status: 413 },
      );
    }

    const maxPages = Math.min(
      typeof body.maxPages === "number" && Number.isFinite(body.maxPages)
        ? Math.max(1, Math.floor(body.maxPages))
        : PDF_SCAN_OCR_MAX_PAGES,
      PDF_SCAN_OCR_MAX_PAGES,
    );
    const pagesDone = Array.isArray(body.pagesDone)
      ? body.pagesDone.filter((n): n is number => typeof n === "number" && n >= 1)
      : [];

    // Reserva por el máximo posible de páginas en esta operación (el capture usa coste real).
    const reservePages = Math.max(1, maxPages - pagesDone.length);
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: auth.user.email,
      serviceId: "gemini-vision-analysis",
      provider: "gemini",
      route: PDF_SCAN_OCR_ROUTE,
      maxCostMicros: reserveUsdToMicros(PDF_SCAN_OCR_USD_PER_PAGE * reservePages, { multiplier: 1.25 }),
      metadata: { maxPages, pagesDoneCount: pagesDone.length, usdPerPage: PDF_SCAN_OCR_USD_PER_PAGE },
    });

    const result = await runPdfScanOcr({
      source,
      userEmail: auth.user.email,
      dpi: typeof body.dpi === "number" ? body.dpi : undefined,
      maxPages,
      pagesDone,
    });

    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd: Math.max(PDF_SCAN_OCR_USD_PER_PAGE * 0.25, result.actualCostUsd),
      metadata: {
        pagesCompleted: result.ocr.pagesDone,
        blockCount: result.ocr.blockCount,
        stoppedEarly: Boolean(result.stoppedEarly),
      },
    });

    return NextResponse.json({
      ok: true,
      ...result,
      warning: result.stoppedEarly
        ? `OCR detenido en página ${result.stoppedEarly.page}: ${result.stoppedEarly.message}. Reintenta para el resto (nuevo cargo).`
        : undefined,
    });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : "pdf_scan_ocr_failed";
    const status =
      /no quedan|no es necesario|ya tiene texto/i.test(message) ? 422 : 500;
    console.error("[pdf-scan/ocr]", message);
    return NextResponse.json({ error: message }, { status });
  }
}
