/**
 * Versionado de BrandKit (lección Paso 0 de BrandKit: versionar SIEMPRE que cambie
 * el esquema o un extractor, para poder invalidar cachés y re-extraer de forma
 * idempotente). Estas constantes se estampan en `Genome.version` y en cada
 * `Candidate`/`SourceRef` según convenga.
 */

/** Sube al cambiar la forma del modelo núcleo (`Genome`, `Trait`, `Candidate`). */
export const BRAND_KIT_SCHEMA_VERSION = "2026-07-05-brand-kit-core-1";

/** Sube al cambiar CUALQUIER extractor (tipografía, logo, color, imágenes, mensajes). */
export const BRAND_KIT_EXTRACT_VERSION = "2026-07-05-brand-kit-extract-1";
