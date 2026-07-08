/**
 * Genoma — API pública del núcleo.
 *
 * Un libro de estilo vivo que rankea evidencia y el usuario corona con un tap.
 * No fusiona: solo lista ordenada + corona. La cara (React) y el servidor
 * (rutas API) se apoyan en este núcleo puro y testeable.
 */

export * from "./genoma-version";
export * from "./model/trait-ids";
export * from "./model/evidence";
export * from "./model/signature";
export * from "./model/trait";
export * from "./model/new-material";
export * from "./model/trait-values";
export * from "./extractors/typography";
export * from "./projection/book-view";
export * from "./projection/completeness";
export * from "./fixtures";
