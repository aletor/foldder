/**
 * B3 — PDF vía Chromium (servidor). Fallback: cliente usa jsPDF si no hay binario disponible.
 */

import { existsSync } from "node:fs";

export type StyleGuidePdfRenderOptions = {
  html: string;
  format?: "A4";
  marginMm?: number;
  contentTimeoutMs?: number;
};

export async function resolveChromiumExecutablePath(): Promise<string | null> {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const macCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const candidate of macCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const chromium = await import("@sparticuz/chromium-min");
      const mod = chromium.default ?? chromium;
      return await mod.executablePath();
    } catch {
      return null;
    }
  }

  return null;
}

export async function renderHtmlToPdfBuffer(options: StyleGuidePdfRenderOptions): Promise<Buffer> {
  const executablePath = await resolveChromiumExecutablePath();
  if (!executablePath) throw new Error("chromium_not_available");

  const puppeteer = await import("puppeteer-core");
  const margin = options.marginMm ?? 18;
  const contentTimeoutMs = options.contentTimeoutMs ?? 90_000;
  const browser = await puppeteer.default.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=medium"],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(contentTimeoutMs);
    page.setDefaultTimeout(contentTimeoutMs);
    await page.setContent(options.html, { waitUntil: "load", timeout: contentTimeoutMs });
    const pdf = await page.pdf({
      format: options.format ?? "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: `${margin}mm`,
        right: `${margin}mm`,
        bottom: `${margin}mm`,
        left: `${margin}mm`,
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function isChromiumPdfAvailable(): Promise<boolean> {
  return Boolean(await resolveChromiumExecutablePath());
}
