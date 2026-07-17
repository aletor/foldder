/** pdf.js almost always passes RGB as hex string after ColorSpace conversion. */
export function parsePdfRgbColor(args: unknown[]): string {
  const first = args[0];
  if (typeof first === "string") {
    const s = first.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      const r = s[1]!;
      const g = s[2]!;
      const b = s[3]!;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  }
  if (
    args.length >= 3 &&
    typeof args[0] === "number" &&
    typeof args[1] === "number" &&
    typeof args[2] === "number"
  ) {
    const toByte = (n: number) => {
      const v = n > 1 ? n / 255 : n;
      return Math.round(Math.min(1, Math.max(0, v)) * 255);
    };
    const r = toByte(args[0]);
    const g = toByte(args[1]);
    const b = toByte(args[2]);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
      .toString(16)
      .padStart(2, "0")}`;
  }
  return "#000000";
}

export function isNearWhiteHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r >= 248 && g >= 248 && b >= 248;
}

export function isNearBlackHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r <= 8 && g <= 8 && b <= 8;
}
