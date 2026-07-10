/** Human-readable font label from crawl/CSS slugs like "__fractul_a47117". */
export function normalizeFontDisplayName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;

  let name = raw.trim().replace(/^["']|["']$/g, "");
  if (!name) return null;

  const lower = name.toLowerCase();
  if (lower.includes("fallback") || lower.startsWith("_fallback")) return null;

  if (name.startsWith("__")) name = name.slice(2);
  name = name.replace(/_[a-f0-9]{4,8}$/i, "");
  name = name.replace(/_Fallback$/i, "");
  name = name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!name || name.length < 2) return null;

  return name
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function cssFontFamilyName(name: string): string {
  return name.includes(" ") ? `"${name}"` : name;
}

export function buildFontStack(family: string, fallbacks: string[] = []): string {
  const core = cssFontFamilyName(family);
  const tail = fallbacks.filter(Boolean).join(", ");
  return tail ? `${core}, ${tail}` : core;
}

export function buildGoogleFontsCssUrl(
  families: Array<{ name: string; weights: number[] }>,
): string | null {
  const valid = families.filter((entry) => entry.name && entry.weights.length > 0);
  if (!valid.length) return null;

  const query = valid
    .map((entry) => {
      const weights = [...new Set(entry.weights)].sort((a, b) => a - b);
      return `family=${encodeURIComponent(entry.name)}:wght@${weights.join(";")}`;
    })
    .join("&");

  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}
