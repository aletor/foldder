import type { BrandKitIngestSectionId } from "./types";

export function copyReceivingFiles(n: number): string {
  return `Recibiendo ${n} ${n === 1 ? "archivo" : "archivos"}…`;
}

export function copyReadingBrand(sourceCount: number): string {
  return sourceCount > 1 ? `Leyendo tu marca · ${sourceCount} fuentes` : "Leyendo tu marca";
}

export function copyReadingNewSources(n: number): string {
  return n === 1 ? "Leyendo 1 fuente nueva…" : `Leyendo ${n} fuentes nuevas…`;
}

export function copyConsolidatingGenome(fileCount: number): string {
  return fileCount === 1
    ? "Consolidando tu brandKit…"
    : `Consolidando tu brandKit · ${fileCount} documentos`;
}

export function copyVisitingUrl(domain: string): string {
  return `Visitando ${domain}…`;
}

export function copySectionRunning(section: BrandKitIngestSectionId): string {
  switch (section) {
    case "palette":
      return "Extrayendo colores…";
    case "logo":
      return "Buscando tu logo…";
    case "typography":
      return "Reconociendo tu tipografía…";
    case "visual":
      return "Leyendo el estilo de tus imágenes…";
    case "voice":
      return "Destilando tu tono y tus mensajes…";
  }
}

export function copyPaletteResolved(count: number): string {
  return `${count} ${count === 1 ? "color extraído" : "colores extraídos"} de tu paleta`;
}

export function copyLogoResolved(pagesWithLogo: number, totalPages: number): string {
  return `Logo encontrado en ${pagesWithLogo} de ${totalPages} ${totalPages === 1 ? "página" : "páginas"}`;
}

export function copyTypographyResolved(family: string): string {
  return `${family} detectada como principal`;
}

export function copyVisualResolved(count: number): string {
  return `${count} ${count === 1 ? "territorio visual identificado" : "territorios visuales identificados"}`;
}

export function copyVoiceResolved(traits: string[]): string {
  const joined = traits.slice(0, 3).join(", ");
  return joined ? `Tu marca habla en tono ${joined}` : "Tu tono de marca toma forma";
}

export function copySourceUnreadable(fileName: string): string {
  return `No pude leer ${fileName}`;
}

export const COPY_GENOME_COMPLETE = "Tu brandKit está completo";
