"use client";

import type { ComponentType } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  MediaInputNode,
  PromptNode,
  NotesNode,
  GuionistaNode,
  CineNode,
  GrokNode,
  ConcatenatorNode,
  ListadoNode,
  EnhancerNode,
  NanoBananaNode,
  BackgroundRemoverNode,
  MediaDescriberNode,
  ImageExportNode,
  UrlImageNode,
  PinterestSearchNode,
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
} from "./CustomNodes";
import { PhotoRoomNode } from "./photo-room/PhotoRoomNode";
import { CanvasGroupNode } from "./CanvasGroupNode";

export const spacesInitialNodes: Node[] = [];

// React Flow accepts heterogeneous node components; each concrete node narrows NodeProps internally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const spacesNodeTypes: Record<string, ComponentType<any>> = {
  mediaInput: MediaInputNode,
  promptInput: PromptNode,
  notes: NotesNode,
  guionista: GuionistaNode,
  cine: CineNode,
  grokProcessor: GrokNode,
  concatenator: ConcatenatorNode,
  listado: ListadoNode,
  enhancer: EnhancerNode,
  nanoBanana: NanoBananaNode,
  backgroundRemover: BackgroundRemoverNode,
  mediaDescriber: MediaDescriberNode,
  imageExport: ImageExportNode,
  urlImage: UrlImageNode,
  pinterestSearch: PinterestSearchNode,
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

export const spacesDefaultEdgeOptions = {
  type: "buttonEdge",
  animated: true,
};

export const spacesInitialEdges: Edge[] = [];
