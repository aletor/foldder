export type HandleType = 'image' | 'video' | 'audio' | 'prompt' | 'mask' | 'pdf' | 'txt' | 'url' | 'json';

export interface NodeMetadata {
  type: string;
  label: string;
  description: string;
  inputs: {
    id: string;
    label: string;
    type: HandleType;
    required?: boolean;
  }[];
  outputs: {
    id: string;
    label: string;
    type: HandleType;
  }[];
  dataSchema: Record<string, any>;
  preferredConnections?: Record<string, string>; // Maps output types to specific input handled IDs
}

export const NODE_REGISTRY: Record<string, NodeMetadata> = {
  background: {
    type: 'background',
    label: 'Background / Canvas',
    description: 'Creates a solid color canvas or base layer for compositions.',
    inputs: [],
    outputs: [
      { id: 'image', label: 'Image Out', type: 'image' }
    ],
    dataSchema: {
      width: 'number (default 1920)',
      height: 'number (default 1080)',
      color: 'string (hex color)'
    }
  },
  imageComposer: {
    type: 'imageComposer',
    label: 'Image Composer',
    description: 'Stacks multiple images or canvas layers together.',
    inputs: [
      { id: 'layer-n', label: 'Layer Input', type: 'image' }
    ],
    outputs: [
      { id: 'image', label: 'Image Out', type: 'image' }
    ],
    dataSchema: {
      layersConfig: 'Record<handleId, { x: number, y: number, scale: number }>',
      selectedLayerId: 'string (id of the active layer for interaction)'
    }
  },
  urlImage: {
    type: 'urlImage',
    label: 'URL Image / Carousel',
    description: 'Displays images from URLs. Supports multiple URLs in a carousel; the output is the selected image.',
    inputs: [],
    outputs: [
      { id: 'image', label: 'Selected Image', type: 'image' }
    ],
    dataSchema: {
      label: 'string (English image search query — disambiguated, e.g. "Earth Moon surface NASA" not just "moon")',
      searchIntent:
        'string (what MUST appear in the image — used for vision verification; e.g. "Earth natural satellite, not a person named Luna")',
      urls: 'string[]',
      selectedIndex: 'number',
      value: 'string (the selected URL)',
      count: 'number (carousel size / fetch limit — default 10)'
    }
  },
  mediaInput: {
    type: 'mediaInput',
    label: 'Media Input',
    description: 'Uploads or fetches external media (Image, Video, Audio, etc).',
    inputs: [],
    outputs: [
      { id: 'media', label: 'Media Asset', type: 'url' } // Semantic type depends on content
    ],
    dataSchema: {
      value: 'string (URL)',
      type: 'video | image | audio | pdf | txt | url'
    }
  },
  imageExport: {
    type: 'imageExport',
    label: 'Image Export',
    description: 'Exports the final composition as a PNG or JPG file.',
    inputs: [
      { id: 'image', label: 'Image Input', type: 'image', required: true }
    ],
    outputs: [],
    dataSchema: {
      format: 'png | jpeg'
    }
  },
  promptInput: {
    type: 'promptInput',
    label: 'Prompt',
    description: 'Input text to guide generative models.',
    inputs: [],
    outputs: [
      { id: 'prompt', label: 'Prompt Out', type: 'prompt' }
    ],
    dataSchema: {
      value: 'string (prompt body)',
      label:
        'string (optional — short title shown above the node on the canvas; use when the user names the prompt, e.g. "Eye color" / "color de ojos")',
    }
  },
  grokProcessor: {
    type: 'grokProcessor',
    label: 'Grok Video',
    description: 'Generates videos using xAI Grok Imagine Video. Supports text-to-video and video-to-video editing.',
    inputs: [
      { id: 'prompt', label: 'Prompt Input', type: 'prompt' },
      { id: 'video', label: 'Video Input', type: 'video' }
    ],
    outputs: [
      { id: 'video', label: 'Video Out', type: 'video' }
    ],
    dataSchema: {
      duration: 'number (seconds, default 5)',
      resolution: 'string (e.g. "720p")',
      aspect_ratio: 'string (e.g. "16:9")'
    }
  },
  concatenator: {
    type: 'concatenator',
    label: 'Prompt Concatenator',
    description: 'Combines multiple text strings into a single large prompt.',
    inputs: [
      { id: 'p-n', label: 'Prompt Part', type: 'prompt' }
    ],
    outputs: [
      { id: 'prompt', label: 'Combined Prompt', type: 'prompt' }
    ],
    dataSchema: {}
  },
  listado: {
    type: 'listado',
    label: 'Listado',
    description:
      'Connects several prompt sources; a dropdown lists each one. Output is «node title (data.label): selected prompt text».',
    inputs: [{ id: 'p-n', label: 'Prompt in', type: 'prompt' }],
    outputs: [{ id: 'prompt', label: 'Selected prompt', type: 'prompt' }],
    dataSchema: {
      label: 'string (optional — canvas title above the node, e.g. "color de ojos")',
      value:
        'string (output — «data.label or "Listado"»: text of the selected connected prompt; synced by UI)',
      selectedEdgeId: 'string | undefined (internal: which incoming edge is selected)',
    },
  },
  enhancer: {
    type: 'enhancer',
    label: 'Prompt Enhancer',
    description: 'Uses GPT-4o to transform simple prompts into highly detailed descriptions.',
    inputs: [
      { id: 'p-n', label: 'Raw prompts (p0…)', type: 'prompt' }
    ],
    outputs: [
      { id: 'prompt', label: 'Enhanced Prompt', type: 'prompt' }
    ],
    dataSchema: {}
  },
  nanoBanana: {
    type: 'nanoBanana',
    label: 'Nano Banana 2',
    description: 'Generates images and supports image-to-image transformations.',
    inputs: [
      { id: 'prompt',  label: 'Prompt Input',  type: 'prompt' },
      { id: 'image',   label: 'Ref 1 (Base)',  type: 'image' },
      { id: 'image2',  label: 'Ref 2',          type: 'image' },
      { id: 'image3',  label: 'Ref 3',          type: 'image' },
      { id: 'image4',  label: 'Ref 4',          type: 'image' },
    ],
    outputs: [
      { id: 'image', label: 'Image Out', type: 'image' }
    ],
    dataSchema: {}
  },
  backgroundRemover: {
    type: 'backgroundRemover',
    label: 'Background Remover',
    description: 'Professional human matting and background removal using 851-labs.',
    inputs: [
      { id: 'media', label: 'Image', type: 'image' }
    ],
    outputs: [
      { id: 'mask', label: 'Mask', type: 'mask' },
      { id: 'rgba', label: 'Cutout', type: 'image' },
      { id: 'bbox', label: 'BBox', type: 'json' }
    ],
    dataSchema: {
      threshold: 0.9,
      expansion: 0,
      feather: 0.6
    }
  },
  mediaDescriber: {
    type: 'mediaDescriber',
    label: 'Vision Describer',
    description: 'Analyzes an image and returns a text description of its content.',
    inputs: [
      { id: 'media', label: 'Image Input', type: 'image' }
    ],
    outputs: [
      { id: 'prompt', label: 'Visual Prompt', type: 'prompt' }
    ],
    dataSchema: {}
  },
  space: {
    type: 'space',
    label: 'Nested Space',
    description: 'A portal to a sub-graph for modular project organization.',
    inputs: [
      { id: 'in', label: 'Data In', type: 'url' }
    ],
    outputs: [
      { id: 'out', label: 'Data Out', type: 'url' }
    ],
    dataSchema: {
      value: 'string (target space ID)'
    }
  },
  spaceInput: {
    type: 'spaceInput',
    label: 'Space Entry',
    description: 'The starting point of a nested space.',
    inputs: [],
    outputs: [
      { id: 'out', label: 'Entry Point', type: 'url' }
    ],
    dataSchema: {}
  },
  spaceOutput: {
    type: 'spaceOutput',
    label: 'Space Exit',
    description: 'The final point of a nested space.',
    inputs: [
      { id: 'in', label: 'Exit Point', type: 'image' },
      { id: 'in', label: 'Exit Point', type: 'video' },
      { id: 'in', label: 'Exit Point', type: 'url' },
      { id: 'in', label: 'Exit Point', type: 'prompt' },
    ],
    outputs: [],
    dataSchema: {}
  },

  vfxGenerator: {
    type: 'vfxGenerator',
    label: 'VFX Generator',
    description:
      'Beeble SwitchX: efectos VFX sobre un vídeo fuente con un prompt e imagen de referencia opcional; máscara alpha si el modo lo requiere.',
    inputs: [
      { id: 'sourceVideo', label: 'Source video', type: 'video' },
      { id: 'referenceImage', label: 'Reference image', type: 'image' },
      { id: 'alphaMask', label: 'Alpha mask', type: 'image' },
      { id: 'prompt', label: 'Prompt', type: 'prompt' },
    ],
    outputs: [{ id: 'video', label: 'Video Out', type: 'video' }],
    dataSchema: {
      prompt: 'string',
      alphaMode: 'auto | fill | select | custom',
      maxResolution: '720 | 1080',
      sourceVideoUri: 'string (URL o beeble_uri)',
      referenceImageUri: 'string',
      alphaUri: 'string',
      activeJobId: 'string',
      value: 'vídeo de salida (URL)',
    },
  },

  geminiVideo: {
    type: 'geminiVideo',
    label: 'Video Generator',
    description: 'Generates video with Gemini Veo 3.1 or Volcengine Seedance 2 (Ark); optional first/last frame and negative prompt.',
    inputs: [
      { id: 'firstFrame', label: 'First Frame', type: 'image' },
      { id: 'lastFrame', label: 'Last Frame', type: 'image' },
      { id: 'prompt', label: 'Creative Prompt', type: 'prompt' },
      { id: 'negativePrompt', label: 'Negative Prompt', type: 'prompt' }
    ],
    outputs: [
      { id: 'video', label: 'Video Out', type: 'video' }
    ],
    dataSchema: {
      videoModel: 'veo31 | seedance2',
      videoFormat: '16:9 | 9:16 | 1:1 (solo Seedance)',
      resolution: '720p | 1080p | 4K (solo Veo)',
      duration: 'Veo: 720p 4|6|8 s; 1080p y 4K fijan 8 s (API); Seedance: 2–12 s',
      audio: 'boolean',
      seed: 'number (optional, for reproducibility)',
      negativePrompt: 'string (things to avoid)',
      animationPrompt: 'string (motion description)',
      cameraPreset: 'string (Dolly-in | Dolly-out | Orbit-Left | Slow-Pan | Crane-Up | empty for auto)'
    }
  },
  painter: {
    type: 'painter',
    label: 'Painter',
    description: 'An interactive drawing canvas. Use this when the user asks to draw, paint, sketch, or mask freely. Allows freehand drawing, erasing, and outputs a base64 image immediately. Input is optional (used as a base background).',
    inputs: [
      { id: 'image', label: 'Base Image', type: 'image', required: false }
    ],
    outputs: [
      { id: 'image', label: 'Output Image', type: 'image' }
    ],
    dataSchema: {
      bgColor: 'string (hex color)',
      strokeColor: 'string (hex color)',
      brushSize: 'number'
    }
  },
  crop: {
    type: 'crop',
    label: 'Crop Asset',
    description: 'An interactive image cropping tool. Use this when the user needs to reframe, crop, cut, or change the aspect ratio of an existing image. It provides an interactive bounding box over the source image.',
    inputs: [
      { id: 'image', label: 'Source Image', type: 'image', required: true }
    ],
    outputs: [
      { id: 'image', label: 'Cropped Image', type: 'image' }
    ],
    dataSchema: {
      aspectRatio: 'free | 1:1 | 16:9 | 9:16',
      cropConfig: '{ x: number, y: number, w: number, h: number } (Percentages 0-100)'
    }
  },
  bezierMask: {
    type: 'bezierMask',
    label: 'Bezier Mask',
    description: 'An interactive vector pen tool to draw bezier curves over an image. Creates precise custom shape masks with zoom, pan and point editing. Outputs both a B&W mask and an RGBA transparent cutout, identical to the Background Remover.',
    inputs: [
      { id: 'image', label: 'Reference Image', type: 'image', required: true }
    ],
    outputs: [
      { id: 'mask', label: 'Mask', type: 'mask' },
      { id: 'rgba', label: 'RGBA', type: 'image' }
    ],
    dataSchema: {
      points: 'Array of bezier points',
      closed: 'boolean',
      invert: 'boolean',
      result_mask: 'string (B&W mask data URL)',
      result_rgba: 'string (RGBA transparent cutout data URL)'
    }
  },
  textOverlay: {
    type: 'textOverlay',
    label: 'Text Overlay',
    description: 'Renders styled text (font, size, color, weight, align) onto a transparent canvas and outputs it as a PNG image for use in compositions.',
    inputs: [],
    outputs: [
      { id: 'image', label: 'Text Image', type: 'image' }
    ],
    dataSchema: {
      text: 'string',
      fontFamily: 'string (CSS font-family)',
      fontSize: 'number (px)',
      color: 'string (hex color)',
      fontWeight: '300 | 400 | 700 | 900',
      textAlign: 'left | center | right',
      canvasW: 'number',
      canvasH: 'number',
    }
  },
  designer: {
    type: 'designer',
    label: 'Designer',
    description:
      'Full design studio: vector tools (pen, shapes, text) + page-based layout + threaded text frames + image frames. Combines Freehand vector editing with InDesign-style page management.',
    inputs: [],
    outputs: [{ id: 'image', label: 'Image Out', type: 'image' as HandleType }],
    dataSchema: {
      pages:
        'DesignerPageState[] (id, format, objects, layoutGuides, stories, textFrames, imageFrames)',
      activePageIndex: 'number',
      label: 'string',
      value: 'string (exported raster data URL)',
    },
  },
  canvasGroup: {
    type: 'canvasGroup',
    label: 'Canvas Group',
    description:
      'UI-only frame on the same canvas: select 2+ nodes and group (G / context menu). Children use parentId + relative positions; collapsed mode keeps external edges via proxy handles. Not a runnable pipeline step — omit from executeNodeIds.',
    inputs: [],
    outputs: [],
    dataSchema: {
      label: 'string (visible title, e.g. Grupo de prompts)',
      collapsed: 'boolean',
      memberIds: 'string[] (child node ids)',
    }
  },
};

/**
 * Pistas por tipo para `node.data` (además de dataSchema del registro).
 * Ayuda al asistente a saber qué puede editar sin listar todo el código del UI.
 */
export const ASSISTANT_NODE_DATA_HINTS: Record<string, string> = {
  promptInput: "value (texto del prompt), label (título visible encima del nodo — obligatorio si el usuario pide nombres/etiquetas por nodo)",
  nanoBanana:
    "modelKey (flash31|flash25|pro3), aspect_ratio, resolution (1k|2k|4k), thinking (bool), value/s3Key (salida), label",
  grokProcessor: "duration (number, 5|10), resolution, aspect_ratio, value (salida vídeo URL), type ('video'), label",
  geminiVideo:
    "videoModel (veo31|seedance2), videoFormat (16:9|9:16|1:1), resolution (720p|1080p|4K Veo), duration (s), audio (bool), seed, negativePrompt, animationPrompt, cameraPreset, value (salida vídeo URL), type ('video'), s3Key, label",
  vfxGenerator:
    "prompt, alphaMode, maxResolution (720|1080), sourceVideoUri, referenceImageUri, alphaUri, activeJobId, outputRenderUrl, value (vídeo), type ('video'), label",
  enhancer: "value (texto mejorado), label",
  concatenator: "label; el texto combinado viene de las entradas conectadas",
  listado:
    "label (título del control); un promptInput por opción con data.value = texto de esa opción; edges a p0, p1…; salida = «label: opción elegida» → nanoBanana u otros",
  mediaDescriber: "value (descripción), label",
  mediaInput: "value (URL), type, metadata, label, s3Key",
  urlImage:
    "label (consulta GIS en inglés, desambiguada), searchIntent (obligatorio: qué debe verse en la foto — verificación por visión), count, urls[], selectedIndex, value, pendingSearch",
  imageExport: "format (png|jpeg), label",
  imageComposer: "layersConfig, selectedLayerId",
  space: "label, hasInput, hasOutput, value",
  spaceInput: "label",
  spaceOutput: "label",
  painter: "bgColor, strokeColor, brushSize, value",
  crop: "aspectRatio, cropConfig, value",
  bezierMask: "points, closed, invert, result_mask, result_rgba",
  textOverlay: "text, fontFamily, fontSize, color, fontWeight, textAlign, canvasW, canvasH",
  backgroundRemover: "threshold, expansion, feather",
  canvasGroup:
    "label (título del marco), collapsed (plegado), memberIds (ids hijos — sincronizado con parentId). Creación habitual: usuario selecciona 2+ nodos y agrupa en el lienzo (G / menú); el asistente solo debe emitir type canvasGroup si el usuario pide explícitamente un grafo agrupado en JSON: entonces cada hijo lleva parentId=id del grupo y position relativa; data.memberIds debe listar esos ids; style width/height del marco; NO incluir canvasGroup en executeNodeIds (no ejecuta). Si solo piden “organizar en grupo”, mejor devolver nodos/aristas sueltos y decir que agrupen con la UI.",
};

function formatDataSchemaForAssistant(meta: NodeMetadata): string {
  const s = meta.dataSchema;
  const keys = Object.keys(s || {});
  if (keys.length === 0) return "(sin dataSchema en registro)";
  return keys.map((k) => `${k}: ${JSON.stringify((s as Record<string, unknown>)[k])}`).join("; ");
}

/** Una línea por tipo: campos documentados + pista de data típica. */
export function buildNodeRegistryDataSchemaDigestForAssistant(): string {
  return Object.entries(NODE_REGISTRY)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, meta]) => {
      const schemaLine = formatDataSchemaForAssistant(meta);
      const hint = ASSISTANT_NODE_DATA_HINTS[key];
      return hint ? `• ${key}: ${schemaLine} | típico en data: ${hint}` : `• ${key}: ${schemaLine}`;
    })
    .join("\n");
}

/**
 * Texto compacto para el system prompt del asistente (mucho menos tokens que JSON.stringify del registro completo).
 */
export function buildNodeRegistryDigestForAssistant(): string {
  return Object.entries(NODE_REGISTRY)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, meta]) => {
      const ins = meta.inputs.map((i) => `${i.id}:${i.type}`).join(", ");
      const outs = meta.outputs.map((o) => `${o.id}:${o.type}`).join(", ");
      const desc =
        meta.description.length > 160 ? meta.description.slice(0, 157) + "…" : meta.description;
      return `• ${key} — ${meta.label}: ${desc} | IN: ${ins || "—"} | OUT: ${outs || "—"}`;
    })
    .join("\n");
}
