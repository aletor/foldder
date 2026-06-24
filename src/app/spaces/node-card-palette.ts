/** Card background colors — keep in sync with `.spaces-canvas` palette in spaces.css */
export const FOLDDER_NODE_CARD_BG: Record<string, string> = {
  inspiration: "#0ac38a",
  nanoBanana: "#f16389",
  imageCreationAdvanced: "#9E8458",
  designer: "#8A8B58",
  urlImage: "#383522",
  projectBrain: "#5E8E70",
  promptInput: "#4F8A82",
  mediaInput: "#4C7E8F",
  mediaDescriber: "#fc329f",
  videoEditor: "#6A679F",
  video_editor: "#6A679F",
  cine: "#de323f",
  projectAssets: "#965B92",
  grokProcessor: "#A35B84",
  imageExport: "#DDDE55",
  geminiVideo: "#3239ba",
  crop: "#F0804D",
  layerizer: "#a6c85e",
  dataset: "#3f7e8c",
  vfxGenerator: "#6B597F",
  presenter: "#f5b91b",
  painter: "#890AF3",
  notes: "#55606B",
  concatenator: "#FADC93",
  listado: "#6F5E58",
  enhancer: "#21817f",
  space: "#8A5755",
  spaceInput: "#76514E",
  spaceOutput: "#76514E",
  guionista: "#1b71df",
  export_multimedia: "#3F3C58",
  exportMultiple: "#3F3C58",
  canvasGroup: "#3F3C58",
};

export const PROMPT_DEFAULT_CARD_BG = FOLDDER_NODE_CARD_BG.promptInput;

/** Light gray when a prompt feeds several targets at once */
export const PROMPT_MULTI_TARGET_CARD_BG = "#c4c8ce";

export function getNodeCardBackgroundColor(nodeType: string | undefined): string {
  if (!nodeType) return PROMPT_DEFAULT_CARD_BG;
  return FOLDDER_NODE_CARD_BG[nodeType] ?? "#3F3C58";
}
