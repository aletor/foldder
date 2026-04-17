/**
 * API pública del feature Designer.
 *
 * No importar este barrel desde `FreehandStudio` (ciclo con `DesignerStudio`).
 * Ver `designer/README.md`.
 */
export {
  DesignerNode,
  type DesignerNodeData,
  type DesignerPageState,
} from "./DesignerNode";
export { designerCanvasSessionKey } from "./designer-studio-pure";
export { default as DesignerStudio } from "./DesignerStudio";
export { DesignerPagePreview } from "./DesignerPagePreview";
export {
  DESIGNER_RULER_THICKNESS,
  DesignerRulerCorner,
  DesignerRulerHorizontal,
  DesignerRulerVertical,
  type DesignerViewport,
} from "./DesignerCanvasRulers";
export type { DesignerOptimizeProgressState } from "./useDesignerImagePipeline";
export { useDesignerImagePipeline } from "./useDesignerImagePipeline";
export { useDesignerTextFrameLayoutSync } from "./useDesignerTextFrameLayoutSync";
export type { DesignerEmbedProps } from "../freehand/designer-embed-props";
export type { DesignerFormatModalState } from "./DesignerFormatModal";
