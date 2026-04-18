"use client";

import type { ComponentType } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  MediaInputNode,
  PromptNode,
  GrokNode,
  ConcatenatorNode,
  ListadoNode,
  EnhancerNode,
  NanoBananaNode,
  BackgroundRemoverNode,
  MediaDescriberNode,
  BackgroundNode,
  ImageComposerNode,
  ImageExportNode,
  UrlImageNode,
  SpaceNode,
  SpaceInputNode,
  SpaceOutputNode,
  GeminiVideoNode,
  VfxGeneratorNode,
  PainterNode,
  CropNode,
  BezierMaskNode,
  DesignerNode,
  ProjectBrainNode,
  ProjectAssetsNode,
  PresenterNode,
  TextOverlayNode,
  ButtonEdge,
} from "./CustomNodes";
import { CanvasGroupNode } from "./CanvasGroupNode";

export const spacesInitialNodes: Node[] = [];

export const spacesNodeTypes: Record<string, ComponentType<any>> = {
  mediaInput: MediaInputNode,
  promptInput: PromptNode,
  grokProcessor: GrokNode,
  concatenator: ConcatenatorNode,
  listado: ListadoNode,
  enhancer: EnhancerNode,
  nanoBanana: NanoBananaNode,
  backgroundRemover: BackgroundRemoverNode,
  mediaDescriber: MediaDescriberNode,
  background: BackgroundNode,
  imageComposer: ImageComposerNode,
  imageExport: ImageExportNode,
  urlImage: UrlImageNode,
  space: SpaceNode,
  spaceInput: SpaceInputNode,
  spaceOutput: SpaceOutputNode,
  geminiVideo: GeminiVideoNode,
  vfxGenerator: VfxGeneratorNode,
  painter: PainterNode,
  crop: CropNode,
  bezierMask: BezierMaskNode,
  designer: DesignerNode,
  projectBrain: ProjectBrainNode,
  projectAssets: ProjectAssetsNode,
  presenter: PresenterNode,
  textOverlay: TextOverlayNode,
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
