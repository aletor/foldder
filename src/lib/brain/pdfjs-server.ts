import fs from "fs";
import path from "path";
import { createRequire } from "node:module";
import { pathToFileURL } from "url";

/** Resuelve pdfjs-dist desde node_modules (no depende de process.cwd() en serverless). */
function resolvePdfJsDistDir(): string {
  try {
    const require = createRequire(import.meta.url);
    return path.dirname(require.resolve("pdfjs-dist/package.json"));
  } catch {
    return path.join(process.cwd(), "node_modules", "pdfjs-dist");
  }
}

const PDFJS_DIST_DIR = resolvePdfJsDistDir();

/** Directorio wasm (barra final) — NodeBinaryDataFactory usa fs.readFile, no file:// URLs. */
const PDFJS_WASM_DIR = path.join(PDFJS_DIST_DIR, "wasm") + path.sep;
export const PDFJS_WASM_URL = PDFJS_WASM_DIR;

const PDFJS_STANDARD_FONT_DIR = path.join(PDFJS_DIST_DIR, "standard_fonts") + path.sep;
export const PDFJS_STANDARD_FONT_DATA_URL = PDFJS_STANDARD_FONT_DIR;

const PDFJS_WORKER_PATH = path.join(PDFJS_DIST_DIR, "legacy", "build", "pdf.worker.mjs");

export const PDFJS_OPENJPEG_WASM_PATH = path.join(PDFJS_DIST_DIR, "wasm", "openjpeg.wasm");

let pdfJsConfigured = false;

export function assertPdfJsWasmRuntime(): { ok: boolean; wasmDir: string; missing: string[] } {
  const required = ["openjpeg.wasm", "qcms_bg.wasm", "jbig2.wasm"];
  const missing = required.filter((name) => !fs.existsSync(path.join(PDFJS_WASM_DIR, name)));
  if (missing.length) {
    console.warn(
      `[brain/pdfjs-server] wasm incompleto en ${PDFJS_WASM_DIR}: falta ${missing.join(", ")}`,
    );
  }
  return { ok: missing.length === 0, wasmDir: PDFJS_WASM_DIR, missing };
}

/** Evita el fake worker roto de webpack en rutas API de Next (`pdf.worker.mjs` missing). */
export async function configurePdfJsForNodeServer(): Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfJsConfigured) {
    assertPdfJsWasmRuntime();
    if (fs.existsSync(PDFJS_WORKER_PATH)) {
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(PDFJS_WORKER_PATH).href;
    } else {
      console.warn(`[brain/pdfjs-server] worker no encontrado: ${PDFJS_WORKER_PATH}`);
    }
    (pdfjs.GlobalWorkerOptions as { wasmUrl?: string }).wasmUrl = PDFJS_WASM_URL;
    (pdfjs.GlobalWorkerOptions as { standardFontDataUrl?: string }).standardFontDataUrl =
      PDFJS_STANDARD_FONT_DATA_URL;
    pdfJsConfigured = true;
  }
  return pdfjs;
}

export type LoadPdfJsDocumentOptions = {
  disableWorker?: boolean;
  isEvalSupported?: boolean;
  wasmUrl?: string;
  standardFontDataUrl?: string;
};

export function pdfJsGetDocumentInit(
  buffer: Buffer,
  options?: LoadPdfJsDocumentOptions,
): {
  data: Uint8Array;
  disableWorker: boolean;
  isEvalSupported: boolean;
  wasmUrl: string;
  standardFontDataUrl: string;
} {
  return {
    data: new Uint8Array(buffer),
    disableWorker: options?.disableWorker ?? true,
    isEvalSupported: options?.isEvalSupported ?? false,
    wasmUrl: options?.wasmUrl ?? PDFJS_WASM_URL,
    standardFontDataUrl: options?.standardFontDataUrl ?? PDFJS_STANDARD_FONT_DATA_URL,
  };
}

export async function loadPdfJsDocumentFromBuffer(
  buffer: Buffer,
  options?: LoadPdfJsDocumentOptions,
): Promise<{
  pdfjs: Awaited<ReturnType<typeof configurePdfJsForNodeServer>>;
  pdf: Awaited<
    Awaited<ReturnType<Awaited<ReturnType<typeof configurePdfJsForNodeServer>>["getDocument"]>>["promise"]
  >;
}> {
  const pdfjs = await configurePdfJsForNodeServer();
  const pdf = await pdfjs
    .getDocument(pdfJsGetDocumentInit(buffer, options) as Parameters<typeof pdfjs.getDocument>[0])
    .promise;
  return { pdfjs, pdf };
}
