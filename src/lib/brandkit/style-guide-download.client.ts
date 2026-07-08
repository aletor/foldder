"use client";

import { jsPDF } from "jspdf";
import type { StyleGuideExportMode } from "./style-guide-export-types";
import type { StyleGuideDocument } from "./style-guide-render";

function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error("No se pudo cargar el HTML del libro de estilo"));
  });
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadStyleGuidePdfViaChromium(
  doc: StyleGuideDocument,
  filename: string,
  options: StyleGuideDownloadOptions,
): Promise<boolean> {
  const response = await fetch("/api/spaces/brain/brand/style-guide/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assets: options.assets,
      exportMode: options.exportMode ?? doc.exportMode ?? "operativo",
      projectName: options.projectName,
      brainVersion: doc.brainVersion,
      generatedAt: doc.generatedAt,
    }),
  });

  if (response.status === 503) return false;
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "No se pudo generar el PDF en servidor");
  }

  const blob = await response.blob();
  triggerBlobDownload(blob, filename);
  return true;
}

async function downloadStyleGuidePdfViaJsPdf(doc: StyleGuideDocument, filename: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "794px";
  iframe.style.height = "1123px";
  iframe.style.border = "0";
  iframe.srcdoc = doc.html;
  document.body.appendChild(iframe);

  try {
    await waitForIframeLoad(iframe);
    const body = iframe.contentDocument?.body;
    if (!body) throw new Error("Documento del libro de estilo vacío");

    const pdf = new jsPDF({
      unit: "pt",
      format: "a4",
      orientation: "portrait",
      compress: true,
    });

    await pdf.html(body, {
      x: 0,
      y: 0,
      width: 595,
      windowWidth: 794,
      autoPaging: "text",
      html2canvas: {
        scale: 0.72,
        useCORS: true,
        logging: false,
      },
    });

    pdf.save(filename);
  } finally {
    document.body.removeChild(iframe);
  }
}

export type StyleGuideDownloadOptions = {
  assets?: unknown;
  exportMode?: StyleGuideExportMode;
  projectName?: string;
};

export async function downloadStyleGuidePdf(
  doc: StyleGuideDocument,
  filename: string,
  options: StyleGuideDownloadOptions = {},
): Promise<void> {
  if (options.assets) {
    try {
      const usedServer = await downloadStyleGuidePdfViaChromium(doc, filename, options);
      if (usedServer) return;
    } catch (error) {
      console.warn("[style-guide] Chromium PDF falló, usando jsPDF", error);
    }
  }

  await downloadStyleGuidePdfViaJsPdf(doc, filename);
}
