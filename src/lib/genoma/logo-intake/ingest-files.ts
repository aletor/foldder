import { execFileSync } from "node:child_process";
import { bufferContentSha256 } from "@/lib/genoma/ingest/paid-operations-server";
import type { IntakeDocInput } from "@/lib/genoma/logo-intake/render";

const MAX_FILES = 6;
const LOGO_INTAKE_EXT = /\.(pdf|png|jpe?g|webp|docx)$/i;

export function isLogoIntakeSupportedFile(file: Pick<File, "name">): boolean {
  return LOGO_INTAKE_EXT.test(file.name);
}

export function assertIntakeFileCount(count: number): void {
  if (count < 1 || count > MAX_FILES) {
    throw new Error(`file_count_invalid:${count}`);
  }
}

export async function prepareIntakeDoc(file: File): Promise<IntakeDocInput> {
  return prepareIntakeDocFromBuffer({
    fileName: file.name,
    buffer: Buffer.from(await file.arrayBuffer()),
  });
}

export async function prepareIntakeDocFromBuffer(input: {
  fileName: string;
  buffer: Buffer;
}): Promise<IntakeDocInput> {
  let buffer = input.buffer;
  const lower = input.fileName.toLowerCase();

  if (lower.endsWith(".docx")) {
    buffer = Buffer.from(await convertDocxToPdf(buffer, input.fileName));
  }

  const kind: IntakeDocInput["kind"] =
    isPdfBuffer(buffer) || lower.endsWith(".pdf") || lower.endsWith(".docx") ? "pdf" : "image";
  if (kind === "image" && !/\.(png|jpe?g|webp)$/i.test(lower)) {
    throw new Error("unsupported_file_type");
  }

  return {
    docId: bufferContentSha256(buffer).slice(0, 16),
    docName: input.fileName,
    buffer,
    kind,
  };
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.slice(0, 5).toString("utf8") === "%PDF-";
}

async function convertDocxToPdf(buffer: Buffer, fileName: string): Promise<Buffer> {
  try {
    execFileSync("soffice", ["--version"], { stdio: "pipe" });
  } catch {
    throw new Error("docx_requires_libreoffice");
  }

  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "logo-intake-docx-"));
  const inPath = path.join(tmp, fileName);
  fs.writeFileSync(inPath, buffer);
  try {
    execFileSync(
      "soffice",
      ["--headless", "--convert-to", "pdf", "--outdir", tmp, inPath],
      { stdio: "pipe" },
    );
    const pdfPath = path.join(tmp, fileName.replace(/\.docx$/i, ".pdf"));
    return Buffer.from(fs.readFileSync(pdfPath));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
