# Integración de nodos con Populate

Cómo un tipo de nodo se convierte en **plantilla** de Populate y qué superficies hay que tocar
(Studio Lote, Studio Formulario, URL pública, salida a Dataset). El objetivo es que añadir un nodo
nuevo no obligue a re-descubrir todo esto.

> Regla de oro: **Populate no conoce los nodos por hardcode**. Los descubre por la _declaración de
> orquestación_ que cada nodo expone en `NODE_REGISTRY[type].orchestration`
> (`populate-declaration.ts`). Lo específico de cada nodo vive en su registro y en sus helpers; el
> resto es el contrato común que describe este documento.

---

## 1. Las dos estrategias de orquestación (`NodeOrchestrationMode`)

`populate-declaration.ts` → `getNodeOrchestrationDeclaration(type)`:

| Modo | Quién | Qué hace Populate | Resultado |
| --- | --- | --- | --- |
| `input-binding` | Image Creation (creativo IA) | Varía los **inputs declarados** (prompt + refs) por fila y **genera** una pieza con IA | 1 imagen por fila |
| `node-clone` | Designer | **Clona el nodo entero** por fila, resolviendo sus campos dinámicos internos, y lo congela | 1 instancia autónoma por fila (+ rasterizado opcional) |

La declaración la da el registro del nodo:

```ts
// nodeRegistry: NODE_REGISTRY[type].orchestration
{ mode: "input-binding", inputs: [{ id, label, kind: "text"|"image"|"video" }], promptDataKey }
// o
{ mode: "node-clone" }   // sus campos son por-instancia, no estáticos
```

Si un nodo no declara `orchestration`, se **deriva** de los tipos de sus handles de entrada
(prompt/txt → texto, image → imagen, video → vídeo): un nodo nuevo es orquestable por defecto.

---

## 2. Conexión y resolución de la plantilla

- **Handles de Populate** (`PopulateNode.tsx` → `HANDLES`): `dataset` (target, izq.), `template`
  (target, izq.), `media_list` y `out` (source, der.).
- **Enlace plantilla**: `populate-template-link.ts` → `findPopulateTemplateLinkEdge` resuelve el
  nodo conectado al handle `template`.
- **Designer (node-clone)**: `populate-designer-template.ts` →
  `resolveDesignerTemplateConfig(populateId, nodes, edges)` devuelve `{ pages, dynamicFields,
  templateLabel, … }`. `isNodeCloneTemplateType` detecta el modo.
- **Regla de exclusión Modo 1 / Modo 2** (`connection-utils.ts`): un Designer no puede tener a la
  vez un Dataset directo (`DESIGNER_DATASET_INPUT_HANDLE`) y ser plantilla de Populate
  (`POPULATE_TEMPLATE_INPUT_HANDLE`). `designerModeConflictReason` lo bloquea en `onConnect` /
  `onConnectEnd` / drop de librería (`SpacesContent.tsx`).

---

## 3. Studio · modo **Lote** (batch)

Componente: `PopulateStudio.tsx` (3 columnas: slots clicables → centro con picker → resumen).

### input-binding (Image Creation)
- **Slots**: `populate-studio-summary.ts` → `buildPopulateStudioSlots` (prompt, tokens del prompt,
  refs de imagen).
- **Mapeo**: tokens `{columna}` en el prompt (`populate-tokens.ts`) + bindings de refs
  (`PopulateBindings`/`PopulateInputBinding` en `populate-types.ts`, refs activas en
  `populate-active-refs.ts`).
- **Resumen/validación**: `buildPopulateStudioSummary`.
- **Resolución por fila**: `populate-resolve.ts` (`resolvePromptForRow`, `resolveImageBindingForRow`).
- **Generación**: `populate-generate.ts` (`generatePopulateImage`) + materialización
  `populate-materialize.ts` (`buildRowSubgraph`, `buildGeneratedSubgraph`, `buildMediaListOutput`).

### node-clone (Designer)
- **Campos dinámicos**: se marcan **dentro del Designer** (panel Dataset de cada objeto,
  `FreehandStudio.tsx`) con `makePendingDesignerBinding` (Modo 2: dinámico **sin** columna) o con
  columna (Modo 1). Estado en `_designerDatasetBinding` (`designer-dataset-binding.ts`:
  `isPendingDesignerBinding`, `designerSlotKey`, `bindingKind`).
- **Descubrimiento**: `populate-designer-fields.ts` → `extractDesignerDynamicFields(pages)` →
  `DesignerDynamicField[]` (`status: "bound" | "pending"`).
- **Mapeo hueco→columna** (solo `pending`): vive en Populate, no en el objeto.
  `PopulateNode.onChangeDesignerSlotBinding` → `nodeData.designerSlotBindings`
  (`DesignerSlotColumnMap`). En el Studio se mapea en la columna izquierda (slots) + centro (picker
  de columna), igual que los tokens de Image Creation.
- **Materialización**: `populate-designer-materialize.ts` → `freezeDesignerPagesForRow(pages,
  dataset, rowIndex, slotColumnMap)` (clona → resuelve huecos pendientes con el mapeo → resuelve
  enlaces de la fila → **strip** de bindings → re-estampa `slideKey`). `buildDesignerGeneratedSubgraph`
  crea N nodos Designer congelados.

---

## 4. Studio · modo **Formulario** (una pieza manual)

El formulario **no se diseña**: se deriva de las variables/campos ya existentes.

### input-binding (Image Creation)
- Modelo: `populate-form.ts` → `derivePopulateForm` (campo por token del prompt + por ref ligada a
  columna). Resolución: `resolveFormPrompt` + `resolveFormImages`. Autorelleno:
  `autofillFormFromRow`. UI: `PopulateFormPanel.tsx`. Genera **1** imagen.

### node-clone (Designer)
- Modelo: `populate-designer-form.ts` → `deriveDesignerForm({ dynamicFields, slotBindings, dataset,
  listId, slideCount })` → un campo por hueco **pendiente** (texto con sugerencias / imagen con
  opciones de la columna mapeada).
- Resolución: `resolveDesignerSlotValues` → `DesignerSlotValueMap` (no depende del Dataset: las
  imágenes vienen ya materializadas en el modelo). Congelado: `freezeDesignerPagesForForm(pages,
  slotValues)`.
- Generación: `PopulateNode.onGenerateDesignerForm` congela 1 instancia, la **rasteriza** (driver
  headless, ver §6) y muestra **tantas imágenes como slides**. UI: `DesignerFormPanel.tsx`.

---

## 5. URL pública (enlace compartible)

Crear/actualizar: `PopulateNode.onShareForm` → `POST /api/populate-share` (valida payload e
idempotencia por `existingToken`). Snapshot en `PopulateSharePayload` (`populate-share-types.ts`).
Página: `app/f/[token]/page.tsx` → elige cliente según `payload.designer`.

### input-binding (Image Creation) — generación en **servidor** (IA, factura al owner)
- Payload: `populate-share-payload.ts` (`formModel`, `templateModel`, refs).
- Cliente: `PublicPopulateFormClient.tsx` → `POST /api/populate-share/[token]/generate` →
  `populate-share-generate.ts` (`generatePopulateShareImage`, wallet/gate).

### node-clone (Designer) — generación en **cliente** (rasterizado, sin wallet)
- Payload: `payload.designer = { pages, formFields, slideCount }` (plantilla con huecos **sin
  resolver** + campos con opciones de imagen ya materializadas).
- Cliente: `PublicDesignerFormClient.tsx` resuelve valores → `freezeDesignerPagesForForm` →
  **rasteriza en el navegador** (`DesignerHeadlessRasterPortal`) → muestra N imágenes. No llama a la
  ruta `/generate` (no hay IA ni coste).

> Si añades otro nodo `node-clone`, reutiliza el patrón Designer del público (rasterizado cliente);
> si es `input-binding` con IA, reutiliza la ruta `/generate` y `populate-share-generate.ts`.

---

## 6. Rasterizado headless (solo `node-clone`)

- Portal reutilizable: `designer/DesignerHeadlessRasterPortal.tsx` (monta un `DesignerStudio`
  offscreen; `key={instanceKey}` fuerza remontaje por petición → cada fila lee sus `initialPages`).
- Driver (request/ref + `Promise`): ver `PopulateNode.rasterizeDesignerPages` y el mismo patrón en
  `PublicDesignerFormClient`.
- Orquestación lote + subida S3: `populate-designer-raster.ts` (`rasterizeAndUploadDesignerRows`,
  `uploadDesignerSlideRaster`). `projectId` desde `useProjectAssetsCanvas().projectScopeId`.

---

## 7. Salida a Dataset (devolver resultados como columnas)

UI: `PopulateDatasetOutputPanel.tsx` (`variant: "image" | "designer"`), dentro del resumen del
Studio. Settings: `PopulateDatasetOutputSettings` (`populate-types.ts`).

- **Imagen (1 columna)**: `populate-dataset-output.ts` + `persist-populate-dataset-output.ts`
  (`findImageFieldForOutput`, versionado/idempotencia por celda).
- **Designer (M columnas, 1 por slide)**: `populate-designer-dataset-output.ts`
  (`applyDesignerSlidesToDataset`, `makePopulateDesignerGroupId`, columnas estables por `slideKey`,
  huérfanas marcadas) + `persist-populate-designer-dataset-output.ts`. Reparto M columnas × N filas.

---

## 8. Checklist para añadir un nodo nuevo a Populate

1. **Declarar** `orchestration` en `NODE_REGISTRY[type]` (mode + inputs o `node-clone`).
2. **Handles**: asegurar que el nodo expone una salida conectable al handle `template` de Populate.
3. Si es **input-binding**: normalmente basta la declaración. Verifica slots/summary/resolución
   (genéricos) y, si la generación difiere, añade tu `generate` (paralelo a `populate-generate.ts`).
4. Si es **node-clone**:
   - Campos dinámicos por-instancia: define cómo se marcan y un `extract…DynamicFields`.
   - Materialización congelada: un `freeze…ForRow` (+ `…ForForm`) y un `build…GeneratedSubgraph`.
   - Studio: ramifica en `PopulateStudio` con `isXxxTemplate` (reutiliza slots/picker/summary).
   - Formulario + público: replica el patrón Designer (`populate-designer-form.ts`,
     `DesignerFormPanel.tsx`, `PublicDesignerFormClient.tsx`, `payload.<variant>`).
   - Si rasteriza: reutiliza el portal headless y `rasterizeAndUpload…`.
5. **Salida a Dataset** (opcional): reutiliza el modelo de 1 columna o el multi-columna por slide.
6. **Regla de exclusión** de modos si tu nodo puede tener Dataset directo y ser plantilla a la vez.
7. **Tests** de la lógica pura (modelo de formulario, materialización, salida a Dataset).
