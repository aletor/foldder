"use client";

import type { ComponentType } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  MediaInputNode,
  PromptNode,
  NotesNode,
  GrokNode,
  ConcatenatorNode,
  ListadoNode,
  EnhancerNode,
  MediaDescriberNode,
  ImageExportNode,
  UrlImageNode,
  SpaceNode,
  SpaceInputNode,
  SpaceOutputNode,
  GeminiVideoNode,
  VfxGeneratorNode,
  PainterNode,
  CropNode,
  DesignerNode,
  ProjectBrainNode,
  ProjectAssetsNode,
  PresenterNode,
  ButtonEdge,
  FoldderConnectionLine,
} from "./CustomNodes";
import { CineNode } from "./cine/CineNode";
import { GuionistaNode } from "./guionista/GuionistaNode";
import { ExportMultimediaNode, ExportMultipleNode } from "./MediaListConsumerNodes";
import { NanoBananaNode } from "./nano-banana/NanoBananaNode";
import { PhotoRoomNode } from "./photo-room/PhotoRoomNode";
import { CanvasGroupNode } from "./CanvasGroupNode";
import { VideoEditorNode } from "./video-editor/VideoEditorNode";
import { InspirationNode } from "./inspiration/InspirationNode";
import { ImageCreationAdvancedNode } from "./image-creation-advanced/ImageCreationAdvancedNode";
import { LayerizerNode } from "./layerizer/LayerizerNode";

export const spacesInitialNodes: Node[] = [];

// React Flow accepts heterogeneous node components; each concrete node narrows NodeProps internally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const spacesNodeTypes: Record<string, ComponentType<any>> = {
  mediaInput: MediaInputNode,
  promptInput: PromptNode,
  notes: NotesNode,
  guionista: GuionistaNode,
  cine: CineNode,
  export_multimedia: ExportMultimediaNode,
  exportMultiple: ExportMultipleNode,
  video_editor: VideoEditorNode,
  videoEditor: VideoEditorNode,
  grokProcessor: GrokNode,
  concatenator: ConcatenatorNode,
  listado: ListadoNode,
  enhancer: EnhancerNode,
  nanoBanana: NanoBananaNode,
  imageCreationAdvanced: ImageCreationAdvancedNode,
  layerizer: LayerizerNode,
  mediaDescriber: MediaDescriberNode,
  imageExport: ImageExportNode,
  urlImage: UrlImageNode,
  inspiration: InspirationNode,
  space: SpaceNode,
  spaceInput: SpaceInputNode,
  spaceOutput: SpaceOutputNode,
  geminiVideo: GeminiVideoNode,
  vfxGenerator: VfxGeneratorNode,
  painter: PainterNode,
  crop: CropNode,
  designer: DesignerNode,
  projectBrain: ProjectBrainNode,
  projectAssets: ProjectAssetsNode,
  presenter: PresenterNode,
  photoRoom: PhotoRoomNode,
  canvasGroup: CanvasGroupNode,
};

export const spacesEdgeTypes = {
  buttonEdge: ButtonEdge,
  default: ButtonEdge,
};

export const spacesConnectionLineComponent = FoldderConnectionLine;

export const spacesDefaultEdgeOptions = {
  type: "buttonEdge",
  animated: false,
};

export const spacesInitialEdges: Edge[] = [];
