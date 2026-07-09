import { EMPTY_DEVELOP_SETTINGS } from "@/app/spaces/lightroom/lightroom-develop-settings";
import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";
/**
 * Centro del conector en coordenadas del flujo (para alinear nodos creados al soltar la conexión).
 */
export function getHandleCenterFlowPosition(opts: {
  nodeId: string;
  handleId: string | null | undefined;
  screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
}): { x: number; y: number } | null {
  const hid = opts.handleId ?? "";
  const nid = opts.nodeId;
  if (!nid) return null;

  const nodeEl = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(nid)}"]`
  );
  if (!nodeEl) return null;

  let handleEl: HTMLElement | null = null;
  if (hid) {
    handleEl = nodeEl.querySelector(
      `.react-flow__handle[data-handleid="${CSS.escape(hid)}"]`
    ) as HTMLElement | null;
  }
  if (!handleEl) {
    handleEl = nodeEl.querySelector(".react-flow__handle") as HTMLElement | null;
  }
  if (!handleEl) {
    const r = nodeEl.getBoundingClientRect();
    return opts.screenToFlowPosition({
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
    });
  }
  const r = handleEl.getBoundingClientRect();
  return opts.screenToFlowPosition({
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
  });
}

/**
 * Rectángulo del nodo en coordenadas de flujo (evita solapar al crear un nodo
 * a la derecha/izquierda del que arrastra la conexión).
 */
export function getNodeFlowRect(opts: {
  nodeId: string;
  screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
}): { left: number; right: number; top: number; bottom: number } | null {
  const nid = opts.nodeId;
  if (!nid) return null;
  const nodeEl = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(nid)}"]`,
  );
  if (!nodeEl) return null;
  const r = nodeEl.getBoundingClientRect();
  const tl = opts.screenToFlowPosition({ x: r.left, y: r.top });
  const tr = opts.screenToFlowPosition({ x: r.right, y: r.top });
  const br = opts.screenToFlowPosition({ x: r.right, y: r.bottom });
  return {
    left: tl.x,
    right: tr.x,
    top: tl.y,
    bottom: br.y,
  };
}

/**
 * Al soltar una conexión sobre el lienzo vacío: tipo de nodo a crear según
 * el tipo de dato del handle y si el arrastre salió de source o target.
 */
export const HANDLE_DROP_MAP: Record<string, string> = {
  "prompt:source": "enhancer",
  "prompt:target": "promptInput",
  /** Entrada dataset (Designer, Loop…) → suelta en el lienzo crea Dataset. */
  "dataset:target": "dataset",
  /** Salida document (json) del Designer → suelta en el lienzo crea Presenter. */
  "json:source": "presenter",
  "media_list:source": "export_multimedia",
  "image:source": "imageExport",
  "image:target": "nanoBanana",
  "video:source": "imageExport",
  "video:target": "geminiVideo",
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
    case "inspiration":
      return {
        label: "Inspiration",
        facet: "similar",
        results: [],
        selected: null,
        value: "",
        type: "image",
        status: "empty",
      };
    case "promptInput":
      return { label: "", value: "" };
    case "mediaInput":
      return { label: "", value: "", type: "image" };
    /** Salida pide imageSize a Gemini (1K/2K/4K). 2K por defecto en iPad/desktop; el usuario puede subir en el nodo. */
    case "nanoBanana":
      return {
        label: "",
        modelKey: "flash31",
        aspect_ratio: "16:9",
        resolution: "2k",
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
    case "dataset":
      return { label: "Dataset", _datasetShowChooser: true };
    case "loop":
      return { label: "Loop", status: "idle" };
    case "populate":
      return { label: "Populate", templateBindings: [], _populateKind: "assign" as const };
    case "export_multimedia":
      return { label: "Export Multimedia" };
    case "exportMultiple":
      return { label: "Export Multiple" };
    case "video_editor":
      return { label: "Video Editor" };
    case "videoEditor":
      return { label: "Video Editor" };
    case "projectBrain":
      return { label: "Brain" };
    case "genoma":
      return { label: "Genoma", status: "empty" as const };
    case "projectAssets":
      return { label: "Assets" };
    case "notes":
      return {
        title: "Note",
        label: "Note",
        color: "yellow",
        contentHtml: "<p></p>",
        contentMarkdown: "",
        plainText: "",
        value: "",
        updatedAt: new Date().toISOString(),
      };
    case "guionista":
      return {
        label: "Guionista",
        briefing: "",
        format: "post",
        settings: {
          language: "es",
          length: "medium",
          tone: "natural",
          audience: "",
          goal: "explain",
          extraInstructions: "",
        },
        approaches: [],
        versions: [],
        value: "",
        promptValue: "",
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
    case "lightroom":
      return {
        label: "Lightroom",
        developSettings: structuredClone(EMPTY_DEVELOP_SETTINGS),
        maskLayers: [],
        decodeStatus: "idle",
      };
    case "cine":
      return {
        label: "Cine",
        manualScript: "",
        mode: "short_film",
        status: "empty",
        visualDirection: {
          aspectRatio: "16:9",
          realismLevel: "realistic",
          globalStylePrompt: "",
          tone: "cinematografico, sobrio y visual",
          pacing: "claro y narrativo",
          colorPalette: [],
          cameraStyle: "camara cinematografica natural",
          lightingStyle: "luz motivada y atmosferica",
          useBrain: true,
          visualCapsuleIds: [],
        },
        characters: [],
        backgrounds: [],
        scenes: [],
        value: "",
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    default:
      return { label: "" };
  }
}
