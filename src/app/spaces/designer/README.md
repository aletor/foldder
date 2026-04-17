# Designer (Foldder)

Módulo del **nodo Designer** en el canvas: documento multipágina, historias enlazadas, marcos de imagen, export `.de`, PDF vectorial y pipeline de imágenes (HR/OPT en S3).

## Imports: reglas

| Quién importa | Qué usar |
|---------------|----------|
| **`FreehandStudio.tsx`** | **No** importar `./designer` (barrel): arrastra `DesignerStudio` y crea ciclo. Usar `./designer/DesignerCanvasRulers` para reglas. |
| **`CustomNodes.tsx`** | `./designer/DesignerNode` (carga perezosa del studio). |
| **`DesignerStudio.tsx`** | Tipos embed: `../freehand/designer-embed-props` — **no** `./index`. |
| Resto (herramientas, tests, docs) | `@/app/spaces/designer` o `./designer` según el archivo. |

## Mapa de archivos

| Archivo | Rol |
|---------|-----|
| `DesignerNode.tsx` | Nodo React Flow + portal al studio. |
| `DesignerStudio.tsx` | Shell del documento: páginas, `FreehandStudio`, import/export `.de`. |
| `DesignerPagesRail.tsx`, `DesignerFormatModal.tsx`, `DesignerStudioPageBar.tsx` | UI acotada. |
| `DesignerCanvasRulers.tsx` | Reglas del lienzo (modo Designer). |
| `DesignerPagePreview.tsx` | Miniatura estática del nodo. |
| `designer-studio-pure.ts` | Funciones puras (claves de sesión, duplicar página, spans PDF). |
| `designer-document-file.ts` | ZIP `.de` (JSON + assets). |
| `designer-de-s3-hydrate.ts` | Subida a S3 de `blob:` tras import. |
| `designer-image-pipeline.ts` | OPT local / `newDesignerAssetId`. |
| `designer-optimize-scheduler.ts` | Presign, cola OPT, URLs de visualización. |
| `useDesignerImagePipeline.ts` | Hook: presign + cola OPT + progreso. |
| `useDesignerTextFrameLayoutSync.ts` | Hook: reparto texto entre marcos + ref para PDF multipágina. |
| `index.ts` | API pública del feature (ver exports). |

## Tipos compartidos con el lienzo

- **`DesignerEmbedProps`** (`../freehand/designer-embed-props.ts`): props opcionales de modo Designer en `FreehandStudio`.

## Contexto

- **`DesignerSpaceIdContext`**: `src/contexts/DesignerSpaceIdContext.tsx` — space activo para rutas S3.
