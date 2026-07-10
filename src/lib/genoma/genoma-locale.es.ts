import type { SlotId } from "./genoma-types";

export const genomaLocaleEs = {
  essence: "Esencia",
  voice: "Voz",
  visualWorld: "Mundo visual",
  typography: "Tipografía",
  palette: "Paleta",
  logo: "Logo",
  gallery: "Galería",
  harvested: "Cosecha",
  generated: "Generadas",
  pendingQueue: "Pendiente de ti",
  confirm: "Confirmar",
  confirmLogo: "Confirmar logo",
  confirmPalette: "Confirmar paleta",
  confirmTypography: "Confirmar tipografía",
  confirmEssence: "Confirmar esencia",
  confirmVoice: "Confirmar voz",
  confirmVisualWorld: "Confirmar mundo visual",
  confirmGallery: "Confirmar galería",
  unlock: "Desbloquear",
  revert: "Revertir",
  locked: "Bloqueado",
  you: "tú",
  live: "Vivo",
  tokens: "Tokens",
  compiled: "Compilado",
  exportStyleGuide: "exportar libro",
  downloadStyleGuidePdf: "Descargar PDF",
  vectorizingLogo: "vectorizando…",
  downloadingPdf: "descargando…",
  generateGallery: "Generar set de estilo (10 imgs)",
  generatingGallery: "Generando imágenes de estilo…",
  generatingGalleryProgress: (current: number, total: number, category: string) =>
    `Generando ${current}/${total}${category ? ` · ${category}` : ""}…`,
  galleryToneLabel: "Tono de imagen",
  galleryGeneratedSuccess: "Set de estilo listo — pestaña Generadas",
  galleryGeneratedCount: (count: number) =>
    `${count} imagen${count === 1 ? "" : "es"} de estilo listas — revisa por categoría`,
  galleryGeneratedEmpty: "Pulsa «Generar set de estilo» para crear 10 referencias (personas, lugares, objetos, texturas y general).",
  galleryHarvestedHint: (count: number) =>
    `${count} imagen${count === 1 ? "" : "es"} del análisis en la pestaña Cosecha.`,
  galleryHarvestedOnlyIncluded: "solo incluidas",
  recalibrate: "Recalibrar estilo",
  noLogo: "Sin logo todavía.",
  logoReviewSuggested: "Revisa el logo detectado antes de confirmar",
  logoPageSignal: (page: number, total: number) => `pág. ${page}${total > 0 ? ` de ${total}` : ""}`,
  adjustLogoArea: "Ajustar área",
  logoCropPreview: "Vista previa del recorte",
  logoTrimToContent: "Ajustar a contenido",
  logoMultiSourceReview: "Nueva fuente — elige el logo de tu marca",
  noPalette: "Sin paleta.",
  monochromePalette: "Paleta monocroma detectada — un solo tono dominante en la cosecha.",
  noTypography: "Sin tipografías.",
  noEssence: "Aún no hay una síntesis de esencia. Analiza la web o completa el bloque.",
  noVoice: "Aún no hay una síntesis de voz. Analiza la web o completa el bloque.",
  noVisualWorld: "Aún no hay suficientes imágenes para definir el mundo visual. Añade fotos, campañas o un manual de marca.",
  noVisualWorldSynthesis:
    "Aún no hay suficiente análisis visual. Añade imágenes o genera una galería de estilo.",
  synthesisFallback: "Propuesta de respaldo — revisa antes de confirmar",
  reviewChip: "Borrador",
  needsReview: "La síntesis necesita revisión",
  promise: "Promesa",
  purpose: "Propósito",
  pov: "Punto de vista",
  headlineDetected: "Headline detectado",
  beliefs: "Creencias",
  writingRules: "Reglas de escritura",
  mood: "Mood",
  visualTerritory: "Territorio visual",
  limits: "Límites",
  evidence: "Evidencia",
  detail: "Detalle",
  avoid: "Evitar",
  fedByGallery: "Se alimenta de",
  images: "imágenes",
  expandQuote: "Ver más",
  collapseQuote: "Ver menos",
  expandDetail: "Ver más",
  collapseDetail: "Ver menos",
  chooseColor: "Elegir color",
  chooseFonts: "Elegir tipografías",
  chooseLogo: "Elegir este logo",
  uploadLogo: "Súbelo",
  specimen: "Aa",
  typePrimary: "Principal",
  typeSecondary: "Secundaria",
  typeSpecimenPhrase: "La marca en movimiento",
  edit: "Editar",
  save: "Guardar",
  cancel: "Cancelar",
  uploadLogoShort: "Subir logo",
  logoPlinthLabel: "Fondo de preview",
  logoPlinthAuto: "Auto",
  logoPlinthLight: "Claro",
  logoPlinthDark: "Oscuro",
  logoPlinthChecker: "Cuadros",
  logoCandidateMethod: (method: string) => method,
  logoCandidateScore: (percent: number) => `${percent}% confianza`,
  logoCandidateAdjustBeforeChoose: "Ajustar antes de elegir",
  logoDetectionFailedTitle: "No encontré un logo claro",
  logoDetectionFailedCopy:
    "Puedes subir el logo directamente, volver a analizar un PDF/imagen con el logo visible o marcar el área a mano.",
  logoDetectionTipUpload: "Sube solo el archivo del logo (PNG/SVG).",
  logoDetectionTipPdf: "Prueba con un manual de marca o brand board donde el logo sea grande.",
  logoDetectionTipAdjust: "Si hay candidatos casi correctos, ajusta el recorte antes de confirmar.",
  logoDetectionRetryAdjust: "Marcar área manualmente",
  logoEditorPageLabel: "Página del documento",
  analyze: "analizar",
  addSource: "añadir fuente",
  addSourceHint: "Los bloques confirmados se conservan. Lo nuevo se suma o pide elegir.",
  lockedBlocksHint: (count: number) =>
    `${count} bloque${count === 1 ? "" : "s"} confirmado${count === 1 ? "" : "s"}`,
  reconcileNewSource: "Nueva fuente",
  reconcileSource: (label: string) => `Nueva fuente (${label})`,
  reconcilePreviousDefault: "fuente anterior",
  reconcileDecisionEyebrow: (slot: string) => `Decisión pendiente en ${slot}`,
  reconcileDecisionLead: (incoming: string) =>
    `La nueva fuente (${incoming}) no coincide con lo que ya tenías guardado.`,
  reconcileDecisionAction: "Elige qué versión quieres guardar en el genoma.",
  reconcileOpenBlock: (slot: string) => `Resolver en ${slot.toLowerCase()}`,
  reconcileMoreConflicts: (count: number) =>
    `+${count} conflicto${count === 1 ? "" : "s"} más en otros bloques`,
  reconcileCompareHint: "Compara resumen, descriptores y reglas. Lo resaltado solo aparece en esa opción.",
  reconcileSelectHint: "Selecciona una opción arriba para confirmar.",
  candidateDecisionEyebrow: (slot: string) => `Decisión pendiente en ${slot}`,
  candidateDecisionLead: (count: number) =>
    `Hay ${count} propuesta${count === 1 ? "" : "s"} — elige la que mejor representa la marca.`,
  candidateCompareHint: (slotId: string) => {
    if (slotId === "essence") {
      return "Compara headline, creencias y promesa. Lo resaltado solo aparece en esa opción.";
    }
    if (slotId === "voice") {
      return "Compara resumen, descriptores y reglas. Lo resaltado solo aparece en esa opción.";
    }
    return "Compara resumen y rasgos visuales. Lo resaltado solo aparece en esa opción.";
  },
  candidateOption: (index: number) => `Opción ${index}`,
  candidateSourceGenerated: "síntesis IA",
  reviewEyebrow: (slot: string) => `Borrador de ${slot.toLowerCase()}`,
  reviewLead: "Propuesta generada automáticamente — no hay otras versiones que comparar.",
  reviewHint: (slotId: string) => {
    if (slotId === "visualWorld") {
      return "Lee resumen, mood, territorio y límites. Guárdala si encaja o edítala antes.";
    }
    if (slotId === "voice") {
      return "Lee resumen, descriptores y reglas. Guárdala si encaja o edítala antes.";
    }
    if (slotId === "essence") {
      return "Lee headline, creencias y promesa. Guárdala si encaja o edítala antes.";
    }
    return "Guárdala en el genoma si encaja, o edítala antes.";
  },
  reviewReasonExplain: (reason: string) => {
    const normalized = reason.toLowerCase();
    if (normalized.includes("galería insuficiente") || normalized.includes("galeria insuficiente")) {
      return "Faltan imágenes en la galería — esta propuesta se apoya sobre todo en texto.";
    }
    if (normalized.includes("contradicción")) return reason;
    return reason;
  },
  reviewProposal: "Contenido propuesto",
  reviewAccept: (slot: string) => `Guardar ${slot.toLowerCase()}`,
  reviewEditFirst: "Editar antes de guardar",
  reviewGalleryNote: "Añade más imágenes a la galería para afinar esta síntesis más adelante.",
  reconcileSectionSummary: "Resumen",
  reconcileSectionDescriptors: "Descriptores",
  reconcileNoSummary: "Sin resumen narrativo en esta fuente.",
  reconcileSyntheticSummary: "Resumen inferido a partir de descriptores — usa las reglas para decidir.",
  reconcileOptionA: "Opción A",
  reconcileOptionB: "Opción B",
  reconcileFromSource: (label: string) => `De ${label}`,
  reconcilePreviousSource: "versión anterior",
  reconcileMergeAction: "Combinar ambas",
  reconcileMergeHint: "Une descriptores y reglas de las dos fuentes.",
  reconcileIgnoreAction: "Descartar nueva fuente",
  reconcileIgnoreHint: "Mantienes la versión anterior e ignoras esta fuente.",
  reconcileConflictTitle: "Posible contradicción — ¿cuál representa mejor la marca?",
  reconcileBefore: "Antes",
  reconcileAfter: "Ahora",
  reconcileKeepPrevious: "Quedarme con antes",
  reconcileSwitchIncoming: "Cambiar a ahora",
  reconcileMerge: "Fusionar",
  reconcileIgnoreSource: "Ignorar fuente",
  conflictsPending: (count: number) =>
    `${count} conflicto${count === 1 ? "" : "s"} pendiente${count === 1 ? "" : "s"}`,
  rankScore: (pct: number) => `${pct}%`,
  rankScoreRaw: (score: number) => (Number.isInteger(score) ? String(score) : score.toFixed(1)),
  galleryNewLeaders: (count: number) =>
    `${count} imagen${count === 1 ? "" : "es"} destacada${count === 1 ? "" : "s"} en cosecha`,
  bestOption: "Mejor opción",
  authoritativeSource: "Fuente autoritativa",
  markAuthoritative: "Marcar como autoritativa",
  unmarkAuthoritative: "Quitar prioridad",
  supplementalObservations: (count: number) =>
    `Hay ${count} observación${count === 1 ? "" : "es"} de otra fuente`,
  supplementalEvidence: "Evidencia adicional",
  supplementalCandidates: "Candidatos archivados",
  supplementalGallery: "Imágenes archivadas",
  slotAnalyzing: "Analizando…",
  conflictChip: "Conflicto",
  candidatesChip: (count: number) => `${count} opciones`,
  supplementalChip: (count: number) => `+${count} obs.`,
  pendingChip: "Pendiente",
  candidatesBoardHint: (count: number) => `${count} bloque${count === 1 ? "" : "s"} con opciones`,
  boardReady: "ADN estable — listo para exportar",
  analyzingLive: "Analizando fuente en vivo…",
  analysisDone: "Análisis completado",
  analysisDoneAdded: (count: number) =>
    `Fuente añadida — ${count} documento${count === 1 ? "" : "s"} integrado${count === 1 ? "" : "s"}`,
  analysisDoneClean: "Sin conflictos nuevos",
  analysisDoneNeedsYou: (count: number) => `${count} decisión${count === 1 ? "" : "es"} pendiente${count === 1 ? "" : "s"} en el board`,
  reviewAskButton: (count: number) => `Genoma te pregunta (${count})`,
  reviewCompleteToast: (count: number) => `Revisión completada — ${count} decisión${count === 1 ? "" : "es"} tomada${count === 1 ? "" : "s"}`,
  analysisDoneConflict: (count: number) =>
    `${count} conflicto${count === 1 ? "" : "s"} nuevo${count === 1 ? "" : "s"} — revisa el board`,
  analysisDoneConflictHint: "Los bloques marcados en ámbar piden tu criterio",
  analysisDoneSupplemental: (count: number) =>
    `${count} observación${count === 1 ? "" : "es"} archivada${count === 1 ? "" : "s"} en bloques confirmados`,
  analysisDoneSupplementalHint: "Lo confirmado no cambió — abre las observaciones si quieres",
  slotLocked: (label: string) => `${label} confirmado`,
  slotLockedHint: "Este bloque ya no se sobrescribe al añadir fuentes",
  slotUnlocked: (label: string) => `${label} desbloqueado`,
  slotConfirmed: (label: string) => `${label} confirmado`,
  slotChosen: (label: string) => `Opción aplicada en ${label.toLowerCase()}`,
  slotMerged: (label: string) => `${label} fusionado`,
  slotIgnoredSource: (label: string) => `Fuente ignorada en ${label.toLowerCase()}`,
  slotReverted: (label: string) => `${label} restaurado`,
  authoritativeSet: "Fuente autoritativa activada",
  authoritativeSetDetail: (label: string) => `${label} tendrá más peso en futuros análisis`,
  authoritativeRemoved: "Prioridad de fuente quitada",
  logoUploadSuccess: "Logo subido — revisa el bloque",
  logoUploadFastHint: "Análisis rápido sin síntesis IA — añade un manual para enriquecer voz y esencia.",
  analyzingButton: "Analizando…",
  synthesisIaHint:
    "Genera esencia, voz y mundo visual con IA. Desactivar = más rápido, solo extracción de datos.",
  crawlCostHint: "El análisis web no consume créditos de visión por archivo.",
  retryAnalysis: "Reintentar",
  exportNeedsCompleteness: (percent: number) =>
    `Necesitas al menos 40% de ADN resuelto para exportar (ahora ${percent}%).`,
  exportNeedsCompile: "Compilando ADN… vuelve a intentar en unos segundos.",
  pendingChecklistTitle: "Pendiente de ti",
  presentationMode: "solo confirmado",
  presentationModeHint: "Oculta borradores y muestra solo bloques confirmados.",
  sidebarEmptyLead: "Añade la primera fuente de la marca",
  sidebarEmptySub: "PDF, manual de marca o URL web — el análisis tarda unos minutos.",
  sidebarDropHero: "Suelta aquí tu manual o deck",
  sidebarOrUrl: "o pega una url",
  sidebarAnalysisOptions: "opciones de análisis",
  sidebarIngestTitle: "Analizando material",
  addAnotherSource: "añadir otra fuente",
  hideAddSource: "ocultar entrada",
  sidebarReviewPending: (count: number) =>
    `Te falta confirmar ${count} ${count === 1 ? "bloque" : "bloques"}`,
  sidebarReviewConflicts: (count: number) =>
    `${count} ${count === 1 ? "conflicto" : "conflictos"} por resolver`,
  sidebarReviewLead: "Revisa y confirma en el board — el sidebar solo te guía.",
  sidebarReviewGo: "ir",
  sidebarReadyMeta: (locked: number, sources: number) =>
    `${locked} bloque${locked === 1 ? "" : "s"} confirmado${locked === 1 ? "" : "s"} · ${sources} fuente${sources === 1 ? "" : "s"}`,
  sidebarExportCollapsed: "exportar",
  galleryVerdictUp: "Encaja",
  galleryVerdictDown: "No encaja",
  recalibrateHint: "Regenera imágenes con el estilo actualizado del ADN.",
  authoritativeTooltip: "Esta fuente prevalece en futuros conflictos.",
  nodeStatusEmpty: "Vacío",
  nodeStatusPartial: "Parcial",
  nodeStatusDone: "Listo",
  voiceManualSummaryFallback: "Voz definida a partir de ejemplos del usuario.",
} as const;

export const confirmLabelForSlot: Partial<Record<SlotId, string>> = {
  logo: genomaLocaleEs.confirmLogo,
  palette: genomaLocaleEs.confirmPalette,
  typography: genomaLocaleEs.confirmTypography,
  essence: genomaLocaleEs.confirmEssence,
  voice: genomaLocaleEs.confirmVoice,
  visualWorld: genomaLocaleEs.confirmVisualWorld,
  gallery: genomaLocaleEs.confirmGallery,
};

export function formatProvenanceEs(detail?: string, type?: string): string {
  if (!detail && !type) return "";
  if (type === "user_input") return genomaLocaleEs.you;
  const normalized = (detail ?? "").toLowerCase();
  if (normalized.includes("tagline home") || normalized.includes("tagline-home")) return "tagline-home";
  return detail || type || "";
}
