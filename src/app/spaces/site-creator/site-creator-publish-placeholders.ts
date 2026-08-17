/** Placeholders de assets en el HTML compilado. Sin imports de cliente. */

export type PublishImageRef = {
  layerId: string;
  s3Key?: string;
  src?: string;
  /** True cuando la clave copiada es `s3KeyOpt` (ya ≤ 2000). El servidor no debe fiarse solo de esto. */
  alreadyOptimized?: boolean;
};

export function publishAssetPlaceholder(layerId: string): string {
  const id = layerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `assets/__${id}__`;
}

export function applyPublishedAssetHrefs(
  html: string,
  hrefByLayerId: Record<string, string>,
): string {
  let out = html;
  for (const [layerId, href] of Object.entries(hrefByLayerId)) {
    const token = publishAssetPlaceholder(layerId);
    if (!token || !href) continue;
    out = out.split(token).join(href);
  }
  return out;
}

/** Reescribe el HTML servido en /s/{id}/ para que CSS/JS/assets no dependan de la barra final. */
export function rewritePublishedHtmlForPublicUrl(html: string, siteId: string): string {
  const base = `/s/${siteId}/`;
  let out = html;
  if (!out.includes("<base ")) {
    out = out.replace(/<head>/i, `<head>\n  <base href="${base}">`);
  }
  out = out.replace(
    /(<link\s+rel="stylesheet"\s+href=")(?:\.\/)?styles\.css(")/i,
    `$1${base}styles.css$2`,
  );
  out = out.replace(/(<script\s+src=")(?:\.\/)?script\.js(")/i, `$1${base}script.js$2`);
  out = out.replace(/(src=")(?:\.\/)?(assets\/)/gi, `$1${base}$2`);
  return out;
}
