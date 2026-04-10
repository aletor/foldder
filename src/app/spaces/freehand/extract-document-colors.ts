import { migrateFill, type FillAppearance } from "./fill";

/** Normaliza a `#rrggbb` minúsculas, o null si no es un hex usable en paleta. */
export function normalizeHexColor(input: string | undefined | null): string | null {
  if (input == null || typeof input !== "string") return null;
  const s = input.trim();
  if (s === "none" || s === "transparent") return null;
  if (/^#[0-9A-Fa-f]{6}$/i.test(s)) return `#${s.slice(1).toLowerCase()}`;
  if (/^#[0-9A-Fa-f]{3}$/i.test(s)) {
    const r = s[1]!,
      g = s[2]!,
      b = s[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function bump(map: Map<string, number>, raw: string | undefined) {
  const h = normalizeHexColor(raw);
  if (!h) return;
  map.set(h, (map.get(h) ?? 0) + 1);
}

function collectFillAppearance(f: unknown, map: Map<string, number>) {
  const m = migrateFill(f);
  if (m.type === "solid") {
    bump(map, m.color);
    return;
  }
  if (m.type === "gradient-linear" || m.type === "gradient-radial") {
    for (const s of m.stops) bump(map, s.color);
  }
}

/** Objeto suelto del lienzo (evita import circular con FreehandStudio). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function visitObject(o: any, map: Map<string, number>) {
  if (!o || !o.visible || o.isClipMask) return;

  switch (o.type) {
    case "booleanGroup": {
      for (const c of o.children as any[]) visitObject(c, map);
      return;
    }
    case "clippingContainer": {
      visitObject(o.mask, map);
      for (const ch of o.content as any[]) visitObject(ch, map);
      return;
    }
    case "textOnPath": {
      bump(map, o.fill as string);
      bump(map, o.stroke);
      return;
    }
    default:
      collectFillAppearance(o.fill, map);
      bump(map, o.stroke as string);
  }
}

export type DocumentColorStat = { hex: string; count: number };

/** Colores hex del documento actual, ordenados por frecuencia descendente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractDocumentColorStats(objects: any[], artboardBackgrounds?: string[]): DocumentColorStat[] {
  const map = new Map<string, number>();
  for (const o of objects) visitObject(o, map);
  if (artboardBackgrounds) {
    for (const bg of artboardBackgrounds) bump(map, bg);
  }
  return [...map.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
}

function replaceInFill(f: FillAppearance, from: string, to: string): FillAppearance {
  const nf = normalizeHexColor(from);
  const nt = normalizeHexColor(to);
  if (!nf || !nt) return f;
  if (f.type === "solid") {
    if (normalizeHexColor(f.color) === nf) return { ...f, color: nt };
    return f;
  }
  if (f.type === "gradient-linear" || f.type === "gradient-radial") {
    const stops = f.stops.map((s) =>
      normalizeHexColor(s.color) === nf ? { ...s, color: nt } : s,
    );
    return { ...f, stops };
  }
  return f;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOne(o: any, from: string, to: string): any {
  const nf = normalizeHexColor(from);
  const nt = normalizeHexColor(to);
  if (!nf || !nt) return o;

  switch (o.type) {
    case "booleanGroup":
      return { ...o, children: o.children.map((c: any) => mapOne(c, from, to)) };
    case "clippingContainer":
      return {
        ...o,
        mask: mapOne(o.mask, from, to),
        content: o.content.map((ch: any) => mapOne(ch, from, to)),
      };
    case "textOnPath": {
      let fill = o.fill as string;
      if (normalizeHexColor(fill) === nf) fill = nt;
      let stroke = o.stroke as string;
      if (normalizeHexColor(stroke) === nf) stroke = nt;
      return { ...o, fill, stroke };
    }
    default: {
      let stroke = o.stroke as string;
      if (normalizeHexColor(stroke) === nf) stroke = nt;
      const fill = replaceInFill(migrateFill(o.fill), from, to);
      return { ...o, fill, stroke };
    }
  }
}

/** Sustituye todas las apariciones de `from` por `to` en fills, trazos y stops de gradiente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function replaceHexEverywhere(objects: any[], from: string, to: string): any[] {
  return objects.map((o) => mapOne(o, from, to));
}
