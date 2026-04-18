import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";

/**
 * Al soltar una conexión sobre el lienzo vacío: tipo de nodo a crear según
 * el tipo de dato del handle y si el arrastre salió de source o target.
 */
export const HANDLE_DROP_MAP: Record<string, string> = {
  "prompt:source": "enhancer",
  "prompt:target": "promptInput",
  /** Salida document (json) del Designer → suelta en el lienzo crea Presenter. */
  "json:source": "presenter",
  "image:source": "imageExport",
  "image:target": "nanoBanana",
  "video:source": "imageExport",
  "video:target": "geminiVideo",
  "mask:source": "imageComposer",
  "mask:target": "backgroundRemover",
  "url:source": "mediaDescriber",
  "url:target": "mediaInput",
  "audio:source": "imageExport",
  "audio:target": "mediaInput",
};

type HandleMeta = { type: string; id: string };

/**
 * Resuelve metadatos del handle aunque el id real sea p0, p1, layer_0…
 * (el registro a veces solo tiene p-n o un único "prompt").
 */
export function resolveHandleMetaForCanvasDrop(
  nodeType: string | undefined,
  handleId: string,
  fromFlow: "source" | "target"
): HandleMeta | null {
  const meta = nodeType ? NODE_REGISTRY[nodeType] : null;
  if (!meta) return null;

  const list = fromFlow === "source" ? meta.outputs : meta.inputs;
  const exact = list.find((h) => h.id === handleId);
  if (exact) return exact;

  if (fromFlow === "target") {
    if (/^p\d+$/.test(handleId)) {
      const hasPromptInput = list.some((i) => i.type === "prompt");
      const multiPromptNode = ["concatenator", "listado", "enhancer", "vfxGenerator"].includes(
        nodeType || "",
      );
      if (hasPromptInput || multiPromptNode) {
        return { type: "prompt", id: handleId };
      }
    }
    if (/^layer_\d+$/.test(handleId)) {
      return { type: "image", id: handleId };
    }
  }

  return null;
}

export function pickNewNodeTypeForCanvasDrop(
  baseKey: string,
  opts: {
    srcNodeType?: string;
    fromHandleId?: string;
    fromFlow?: "source" | "target";
  }
): string | undefined {
  const { srcNodeType, fromHandleId, fromFlow } = opts;

  if (
    srcNodeType === "imageComposer" &&
    fromFlow === "target" &&
    fromHandleId &&
    /^layer_\d+$/.test(fromHandleId)
  ) {
    return "urlImage";
  }

  if (
    srcNodeType === "geminiVideo" &&
    fromFlow === "target" &&
    (fromHandleId === "firstFrame" || fromHandleId === "lastFrame")
  ) {
    return "urlImage";
  }

  if (srcNodeType === "painter" && fromFlow === "target" && fromHandleId === "image") {
    return "urlImage";
  }

  return HANDLE_DROP_MAP[baseKey];
}

export function defaultDataForCanvasDropNode(nodeType: string): Record<string, unknown> {
  switch (nodeType) {
    case "urlImage":
      return { label: "", pendingSearch: false };
    case "promptInput":
      return { label: "", value: "" };
    case "mediaInput":
      return { label: "", value: "", type: "image" };
    /** Salida pide imageSize a Gemini (1K/2K/4K). Máxima calidad por defecto; el usuario puede bajar en el nodo. */
    case "nanoBanana":
      return {
        label: "",
        modelKey: "flash31",
        aspect_ratio: "16:9",
        resolution: "4k",
      };
    case "geminiVideo":
      return {
        label: "",
        videoModel: "veo31",
        resolution: "1080p",
        duration: "8",
      };
    case "vfxGenerator":
      return {
        label: "",
        type: "video",
        prompt: "",
        alphaMode: "auto",
        maxResolution: 1080,
      };
    case "presenter":
      return { label: "Presenter" };
    case "projectBrain":
      return { label: "Brain" };
    case "projectAssets":
      return { label: "Assets" };
    default:
      return { label: "" };
  }
}
