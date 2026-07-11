/** Utilidades pHash compartidas — sin dependencias Node (safe en cliente). */

export const LOGO_PHASH_MATCH_THRESHOLD = 12;

export function phashHammingDistance(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let dist = Math.abs(a.length - b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) dist += 1;
  }
  return dist;
}

export function isPhashNearRejected(phash: string, rejected: string[] | undefined): boolean {
  if (!phash || !rejected?.length) return false;
  return rejected.some((entry) => {
    if (entry === phash) return true;
    if (/^[01]{32,}$/.test(entry) && /^[01]{32,}$/.test(phash)) {
      return phashHammingDistance(entry, phash) <= LOGO_PHASH_MATCH_THRESHOLD;
    }
    return false;
  });
}
