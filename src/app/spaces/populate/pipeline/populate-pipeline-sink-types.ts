/**
 * Tipos de nodo que pueden ser sink de una tubería Populate (deben tener executor en
 * register-default-executors.ts). Archivo puro para validación de conexiones sin importar client code.
 */

export const POPULATE_PIPELINE_EXECUTABLE_TYPES = new Set<string>([
  "nanoBanana",
  "mediaDescriber",
  "enhancer",
  "concatenator",
  "designer",
  "backgroundRemover",
]);
