import { googleFontBatchStylesheetHref } from "./google-fonts";

const PREVIEW_LINK_ID_PREFIX = "fh-gfont-preview-batch";
const PREVIEW_BATCH_CHUNK_SIZE = 12;

let previewLoadPromise: Promise<void> | null = null;
let previewLoadKey = "";

function chunkFamilies(families: string[]): string[][] {
  const unique = [...new Set(families.map((f) => f.trim()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += PREVIEW_BATCH_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + PREVIEW_BATCH_CHUNK_SIZE));
  }
  return chunks;
}

/** Carga en `<link>` las familias visibles (reutiliza la misma petición por página). */
export function ensureGoogleFontPreviewBatchLoaded(families: string[]): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const chunks = chunkFamilies(families);
  if (chunks.length === 0) return Promise.resolve();
  const key = chunks.map((chunk) => googleFontBatchStylesheetHref(chunk)).join("|");
  if (previewLoadKey === key && previewLoadPromise) return previewLoadPromise;

  previewLoadPromise = Promise.all(
    chunks.map((chunk, index) => {
      const href = googleFontBatchStylesheetHref(chunk);
      if (!href) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const linkId = `${PREVIEW_LINK_ID_PREFIX}-${index}`;
        let el = document.getElementById(linkId) as HTMLLinkElement | null;
        if (!el) {
          el = document.createElement("link");
          el.id = linkId;
          el.rel = "stylesheet";
          document.head.appendChild(el);
        }

        if (el.getAttribute("href") === href && el.dataset.loaded === "1") {
          resolve();
          return;
        }

        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          el?.removeEventListener("load", onLoad);
          el?.removeEventListener("error", onError);
          if (ok) {
            el!.dataset.loaded = "1";
            resolve();
          } else {
            reject(new Error(`Google Font preview batch failed (${href})`));
          }
        };
        const onLoad = () => finish(true);
        const onError = () => finish(false);
        el.addEventListener("load", onLoad);
        el.addEventListener("error", onError);
        el.dataset.loaded = "0";
        el.setAttribute("href", href);
        window.setTimeout(() => {
          if (settled) return;
          finish(!!el?.sheet);
        }, 12000);
      });
    }),
  )
    .then(() => {
      previewLoadKey = key;
      if (typeof document !== "undefined" && document.fonts?.ready) {
        return document.fonts.ready.then(() => undefined);
      }
      return undefined;
    })
    .catch(() => {
      previewLoadKey = "";
      throw new Error("Google Font preview batch failed");
    })
    .finally(() => {
      if (previewLoadKey !== key) previewLoadPromise = null;
    });

  return previewLoadPromise;
}

export function cssFontFamilyForGooglePreview(family: string): string {
  const fam = family.trim();
  if (!fam) return "system-ui, sans-serif";
  return `"${fam.replace(/"/g, '\\"')}", system-ui, sans-serif`;
}
