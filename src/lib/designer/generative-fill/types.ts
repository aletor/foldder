/** Rect en coordenadas del artboard / composite (px). */
export type GenerativeFillRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type GenerativeFillMode = "inpaint" | "outpaint";
export type GenerativeFillModel = "nano-banana" | "flux-fill";

export type GenerativeFillCorrection = {
  id: string;
  type: "generative-fill";
  mode: GenerativeFillMode;
  /** Una o más zonas rectangulares (pueden estar separadas). */
  selections: GenerativeFillRect[];
  prompt?: string;
  feather: number;
  contextBleed: number;
  seed?: number;
  model: GenerativeFillModel;
  resultLayerId: string;
  createdAt: string;
};

export const GENERATIVE_FILL_DEFAULT_FEATHER = 3;
export const GENERATIVE_FILL_DEFAULT_CONTEXT_BLEED = 64;

export const GENERATIVE_FILL_DEFAULT_PROMPT =
  "Fill the masked region so it blends naturally and continuously with the surrounding content. Match lighting, texture, perspective and color.";

export type GenerativeFillRequestBody = {
  composite: string;
  selections: GenerativeFillRect[];
  prompt?: string;
  feather?: number;
  contextBleed?: number;
  seed?: number;
  mode?: GenerativeFillMode;
  model?: GenerativeFillModel;
  pageWidth: number;
  pageHeight: number;
};

export type GenerativeFillResponseBody = {
  resultPng: string;
  layer: GenerativeFillRect;
  correction: Omit<GenerativeFillCorrection, "resultLayerId"> & { resultLayerId?: string };
};
