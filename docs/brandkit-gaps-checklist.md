# BrandKit — Checklist de gaps (Paso 0 + encargo precisión §1–§4)

Estado referencia: post-fix tipografía pdf.js ObjStm (`pdf-font-extract.ts`, `PDF_BRAND_EXTRACT_VERSION=2026-07-05-pdfjs-fonts`). Leyenda: ✅ hecho · ⚠️ parcial · ❌ pendiente.

Fixtures: `fixtures/brandkit/einf_2023_atresmedia.pdf`, `logo-atresmedia-quienes-somos.png`, `sample-brand-deck.pdf`.

---

## Encargo §1 — Tipografía

| ID | Requisito | Estado | Gap / archivos |
|---|---|---|---|
| T-fonts-atres | Montserrat + ≥3 pesos desde ObjStm Atresmedia | ✅ | `pdf-font-extract.test.ts`, `pdf-font-extract.ts` |
| T1-regex-bug | Regex sync = 0 en Atresmedia (documentado) | ✅ | `parseEmbeddedPdfFontFamiliesSync` deprecated |
| T1-pdfjs | Fuentes vía pdf.js setFont + commonObjs | ✅ | `parseEmbeddedPdfFontFamilies` async |
| T1-stopwords | Calibri/Segoe/Arial… excluidos de primary | ✅ | `BRAND_FONT_STOPWORDS`, `buildTypographyDraft` |
| T1-gemini-fallback | Visión 2–3 renders si 0 fuentes → `proposed` llm-synthesis | ✅ | `pdf-typography-vision-fallback.ts`, sidecar `applyTypographyLlmSynthesisSidecar` |
| T1-version-bump | `PDF_BRAND_EXTRACT_VERSION` al cambiar extractor | ✅ | `2026-07-05-brand-precision-1` |

**Gap real (resuelto hoy):** `parseEmbeddedPdfFontFamilies` era regex sobre bytes; PDFs con ObjStm (Office/InDesign) → 0 fuentes. Atresmedia tiene 23 fuentes embebidas invisibles al regex.

---

## Encargo §2 — Logo

| ID | Requisito | Estado | Gap / archivos |
|---|---|---|---|
| T-logo-atres | JPG/PNG limpio top candidato por **forma** | ✅ | `logo-shape-detect.ts`, `logo-shape-detect.test.ts` |
| T2a-wireframe | Autocontraste + FIND_EDGES finos; baja tinta OK | ✅ | `computeEdgeSignature` normalize + umbral tinta 0.003 |
| T2a-clusters-L1 | Ranking recurrencia×posición×tamaño×pHash | ⚠️ | Jaccard básico; sin pHash real en firma |
| T2b-filename | Nombre solo suma score, nunca auto-valida | ✅ | Bonus +0.1 en `logo-shape-detect.ts`; no auto-valida |
| T2c-picker | Coronación + rejected pHash + vectorize validated | ⚠️ | Adenda P2-5/7/L6 incompletos |

---

## Encargo §3 — Imágenes

| ID | Requisito | Estado | Gap / archivos |
|---|---|---|---|
| T-img-formats | AVIF/JPG/PNG/WebP batch aislado | ⚠️ | AVIF en policy; falta test + clasificación forma |
| T3-avif-diagram | Quienes_somos AVIF → referencia, no logo | ❌ | Sin clasificador multi-forma |
| T3-batch-isolate | Fallo por archivo no rompe batch | ⚠️ | Parcial en upload pump |

---

## Encargo §4 — Color

| ID | Requisito | Estado | Gap / archivos |
|---|---|---|---|
| T4-operators | Paleta operadores PDF | ✅ | `extractPdfOperatorColors` |
| T4-render-quant | Cuantización sobre renders | ❌ | Solo operadores |
| T4-logo-neutrals | No negro/blanco logo como marca | ❌ | `rankPdfPaletteColors` no excluye tinta logo |
| T4-roles | 5 colores con rol + evidencia | ✅ | `rankPdfPaletteColors` |

---

## Paso 0 — Instrumentación (previo acordado)

| ID | Requisito | Estado | Archivos / notas |
|---|---|---|---|
| P0-1 | `PDF_BRAND_EXTRACT_VERSION` bump obligatorio | ✅ | `pdf-brand-extract.ts` |
| P0-2 | Skip idempotente hash + versión | ✅ | `shouldSkipPdfBrandExtract`, T-F7 |
| P0-3 | `forceReextractBrand` ignora skip | ✅ | analyze + cliente |
| P0-4–P0-9 | Checkpoints upload/skip/extract/merge + UI | ✅ | `brand-pipeline-diagnostics`, Brain UI |
| P0-10 | pdf.js en rutas API Next | ✅ | `pdfjs-server.ts` |
| P0-11 | PDFium render páginas | ✅ | `pdf-page-render.ts` |
| P0-14 | Métrica `logoClusters` en extract | ⚠️ | `logoCandidates` mezcla harvest + clusters |

---

## Adenda L6 / picker (sin cambios respecto checklist previo)

Coronación atómica P2-5, Deshacer P2-7, pHash Hamming P2-9/10, L6 vectorize wallet — ❌ pendientes (ver checklist anterior).

---

## Orden de implementación (encargo)

1. ✅ Checklist + Paso 0 referencia  
2. ✅ **§1 Tipografía pdf.js + T-fonts-atres**  
3. ✅ §1 Gemini fallback tipografía  
4. ⚠️ §2a clusters wireframe + §2b forma + T-logo-atres (forma ✅; picker/L6 pendiente)
5. ❌ §3 AVIF + T-img-formats  
6. ❌ §4 paleta renders + neutros logo  


| ID | Requisito | Estado | Archivos / notas |
|---|---|---|---|
| P0-1 | `PDF_BRAND_EXTRACT_VERSION` bump obligatorio al cambiar extractor | ✅ | `pdf-brand-extract.ts` |
| P0-2 | Skip idempotente hash + versión (`shouldSkipPdfBrandExtract`) | ✅ | `pdf-brand-extract.ts`, tests T-F7 |
| P0-3 | `forceReextractBrand` ignora skip | ✅ | `analyze/route.ts`, cliente ingest |
| P0-4 | Checkpoint **upload** (dedupe, sha256) | ✅ | `brand-pipeline-diagnostics.ts`, UI pozo |
| P0-5 | Checkpoint **analyzeSkip** (motivo hash+version / nuevo / forzado) | ✅ | `runPdfBrandExtractPass` |
| P0-6 | Checkpoint **extract** (páginas, fonts, colorOps, logoCandidates) | ✅ | `runPdfBrandExtractPass` |
| P0-7 | Checkpoint **extract.error** en fallo | ✅ | Añadido tras bug pdf.js |
| P0-8 | Checkpoint **merge** (allowBrandWrites, fields, outcome) | ✅ | `applyGuardedAnalyzeResponse` |
| P0-9 | UI diagnósticos Paso 0 en Brain (upload/skip/extract/merge) | ✅ | `ProjectBrainFullscreen.tsx` ~6252 |
| P0-10 | pdf.js usable en rutas API Next (worker) | ✅ | `pdfjs-server.ts`, `serverExternalPackages` |
| P0-11 | PDFium render páginas (L1 input) | ✅ | `pdf-page-render.ts` |
| P0-12 | Respuesta analyze incluye `brand` + cliente aplica `data.brand` | ✅ | `analyze/route.ts`, `ProjectBrainFullscreen.tsx` |
| P0-13 | Toast/aviso cuando extract/render falla (no falso positivo en upload) | ✅ | `upload/route.ts` probe real + toast solo si `renderError` |
| P0-14 | Métrica `logoClusters` en checkpoint extract | ⚠️ | Este PR: `logoCandidates` cuenta clusters |

---

## L0–L3 — Pipeline logo PDF

| ID | Requisito | Estado | Archivos / notas |
|---|---|---|---|
| L1 | Clustering Jaccard regiones header/esquinas | ✅ | `pdf-logo-pipeline.ts` |
| L1b | **Todos** los clusters (no solo el mayor) → candidatos | ✅ | `pdf-logo-clusters.ts`, `clusterAllRegionSamples` |
| L2 | Polaridad + score + harvest 300 dpi | ✅ | `pdf-logo-pipeline.ts` |
| L3 | Variante sintetizada si falta polaridad opuesta | ✅ | `detectLogosFromRenderedPages` |
| L4 | Test monocromía / negativo sintetizado | ⚠️ | Lógica parcial en pipeline, sin T-V6 |
| L5 | Conflict rebranding alta recurrencia | ❌ | Solo guarded-merge genérico |
| Wire | Clusters → `discoveredBrandAssets` + sidecar `logo.candidate.*` | ✅ | `logo-cluster-projection.ts`, `analyze/route.ts` |
| Wire | Top-1 cluster → `brand.logoPositive` proposed | ✅ | `persistPdfBrandExtractForAnalyze` |

---

## Adenda §1 — Modelo de candidatos

| ID | Requisito | Estado | Archivos / notas |
|---|---|---|---|
| C1 | Tipo candidato `{ clusterId, phash, masterCropUrl, recurrence, polarity, score }` | ⚠️ | `BrainDiscoveredBrandAsset` extendido; falta `masterCropUrl` explícito |
| C2 | Sidecar `logo.candidate.{clusterId}` | ✅ | `applyLogoCandidateSidecar` |
| C3 | `InterpretationStatus: rejected` | ✅ | `interpretation.ts` |
| C4 | `statusWeight(rejected)=0`, no review badge | ✅ | `completeness.ts`, tests T-V1 parcial |
| C5 | Ranking score = recurrencia × posición × tamaño × bonus firma | ✅ | Bonus +0.15 si coincide `logoSignature` |
| C6 | Firma `brand.logoSignature` (pHash mark) persistida | ✅ | Al coronar candidato en picker |

---

## Adenda §2 — Picker

| ID | Requisito | Estado | Archivos / notas |
|---|---|---|---|
| P2-1 | Aparece con ≥2 clusters (pHash distinto) | ✅ | `countDistinctLogoClusters` + picker |
| P2-2 | Un solo cluster → tap = validar (sin picker) | ✅ | `showPicker = distinctClusters >= 2` |
| P2-3 | Modal copy «¿Cuál es el logo de tu marca?» | ✅ | `BrandBoardPanel.tsx` |
| P2-4 | Contexto «aparece en {p} páginas · {d} documentos» | ✅ | `LogoCandidateView.contextLine` |
| P2-5 | Tap candidato → validated + **rechazar resto** | ✅ | `crownLogoCandidateOnAssets` batch sidecar + pHash |
| P2-6 | «No es mi marca» → rejected individual | ✅ | `rejectLogoCandidateOnAssets` + pHash Hamming |
| P2-7 | Toast «Logo validado…» + Deshacer 10 s | ✅ | `onLogoCrowned` + toast con Deshacer |
| P2-8 | Cerrar sin elegir → sin cambios | ✅ | — |
| P2-9 | `rejectedLogoSignatures[]` por **pHash** (Hamming) | ✅ | `normalizeBrainMeta` preserva; Hamming en ingest |
| P2-10 | Candidato futuro ≈ rechazado → rejected silencioso | ✅ | `applyLogoCandidateSidecar` + Hamming |
| P2-11 | Drawer «Candidatos (n)» + Restaurar | ❌ | — |
| P2-12 | Auto-abrir picker tras análisis ambiguo | ✅ | `pendingLogoPicker` + `shouldPromptLogoPicker` |

---

## Adenda §3 — Firma guardia permanente

| ID | Requisito | Estado | Archivos / notas |
|---|---|---|---|
| G1 | Misma firma, mejor resolución → upgrade silencioso | ❌ | T-V5 |
| G2 | Firma distinta, recurrencia baja → drawer contador | ❌ | — |
| G3 | Firma distinta, recurrencia alta → conflict L5 | ❌ | — |

---

## Adenda §4 — L6 Vectorización

| ID | Requisito | Estado | Archivos / notas |
|---|---|---|---|
| V1 | Disparador solo `logo.primary → validated` | ⚠️ | `BrandKitProvider.validateElement`; picker no valida batch |
| V2 | Botón manual «Generar SVG» en popover | ❌ | — |
| V3 | Prohibido vectorizar en ingest/proposed | ⚠️ | Sin T-V1 spy completo en ingest |
| V4 | Re-render 600 dpi ≤3 MP | ❌ | Vectoriza PNG existente |
| V5 | Vectorizer.AI + interfaz intercambiable | ⚠️ | `vectorizer-ai-client.ts`; sin VectoSolve |
| V6 | SVGO post-proceso | ❌ | — |
| V7 | Negativo monocromo fill-swap / multicolor knockout | ❌ | — |
| V8 | `brand.logoVector` objeto completo en S3 | ❌ | Solo `logoPrimaryVector` key |
| V9 | Idempotencia por `logoSignature` | ❌ | Por URL sig en ruta vectorize |
| V10 | Wallet reserve/capture ~0,20 € | ❌ | Sin wallet en vectorize |
| V11 | Chip «SVG ✓» + Descargar SVG en popover | ❌ | — |

---

## Adenda §6 — Tests

| Test | Descripción | Estado |
|---|---|---|
| T-V1 | 0 llamadas vectorize tras ingest proposed | ⚠️ | Parcial en `completeness.test.ts` |
| T-V2 | 1 llamada en validate; idempotencia firma | ❌ | — |
| T-V3 | Picker 3 clusters → crown + reject batch + silencio futuro | ⚠️ | `brandkit-board-actions.test.ts` (2 clusters) |
| T-V4 | Deshacer toast revierte batch | ❌ | — |
| T-V5 | Upgrade máster misma firma | ❌ | — |
| T-V6 | Negativo SVG monocromo / multicolor | ❌ | — |
| T-V7 | SVGO + wallet única | ❌ | — |
| T-V8 | `rejected` no puntúa completeness | ⚠️ | Parcial |
| T-L* | Pipeline PDF L1–L5 | ✅ | `pdf-logo-pipeline.test.ts` |
| T-F* | Extracción deck fixture | ✅ | `pdf-brand-extract.test.ts` |
| Fixture | PDF con logos partners (T-V3) | ❌ | Solo deck genérico + guía FOLDDER |

---

## Consolidación previa (bloques A/B)

| Bloque | Estado | Gap principal |
|---|---|---|
| A2 Dataset projection | ✅ | — |
| A1 visualReferences runtime | ✅ | — |
| A3 Legacy migration banner | ✅ | — |
| B1 Schema rejected/derived | ✅ | — |
| B2 book-derivations | ✅ | — |
| B3 Style guide v2 + Chromium PDF | ⚠️ | Sin smoke Lambda T-B3b |
| B4 Completeness v2 | ✅ | — |
| B6 Voice examples LLM | ✅ | Sin wallet |
| T1 snapshots delta-only | ❌ | Regeneración completa |
| Wallet global | ❌ | Vectorize + voice |
| 8 PRs troceados | ❌ | Sin commits PR |

---

## Criterio de aceptación adenda (E2E)

| Paso | Estado |
|---|---|
| 3 PDFs (marca + 2 partners) → top proposed, 0 vectorize | ❌ |
| Picker → tap marca principal → partners rejected forever | ❌ |
| 1 crédito, SVG ± en S3, chip SVG ✓ | ❌ |
| 4.º PDF partner → cero ruido UI | ❌ |

**Prerrequisito zero (hecho hoy):** extracción PDF estable en Next → logo/paleta/tipo visibles en Board.

---

## Orden de implementación recomendado

1. ✅ Paso 0 pdf.js + diagnósticos error  
2. ✅ **Clusters → `discoveredBrandAssets` → picker**  
3. Coronación atómica + rejected pHash + Deshacer  
4. Firma guardia (upgrade / conflict)  
5. L6 completo (600 dpi, SVGO, negativo, wallet, T-V1–V8)  
6. Fixture partners + criterio aceptación E2E  
