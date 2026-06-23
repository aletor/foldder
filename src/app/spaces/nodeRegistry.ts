export type HandleType = 'image' | 'video' | 'audio' | 'prompt' | 'mask' | 'pdf' | 'txt' | 'url' | 'json' | 'brain' | 'media_list' | 'image_layout';

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
  dataSchema: Record<string, unknown>;
  preferredConnections?: Record<string, string>; // Maps output types to specific input handled IDs
}

export const NODE_REGISTRY: Record<string, NodeMetadata> = {
  photoRoom: {
    type: 'photoRoom',
    label: 'PhotoRoom',
    description:
      'Retoque y composición de imagen: varias entradas de imagen (ranuras dinámicas); salida imagen. Studio en evolución.',
    inputs: [
      { id: 'in-n', label: 'Imágenes', type: 'image' },
      { id: 'brain', label: 'Brain', type: 'brain' },
    ],
    outputs: [{ id: 'image', label: 'Imagen', type: 'image' }],
    dataSchema: {
      studioObjects: 'FreehandObject[] (vector en studio)',
      studioLayoutGuides: 'LayoutGuide[]',
      studioArtboard: '{ id, width, height, background? } px — por defecto 1920×1080',
      value: 'string (preview PNG / salida)',
    },
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
  inspiration: {
    type: 'inspiration',
    label: 'Inspiration',
    description:
      'Visual reference search node: accepts a prompt or image, explores Pexels references, and outputs one selected image.',
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'prompt' },
      { id: 'image', label: 'Image', type: 'image' },
    ],
    outputs: [{ id: 'image', label: 'Selected image', type: 'image' }],
    dataSchema: {
      facet: 'similar | textures | colors | style | people | backgrounds',
      manualPrompt: 'string',
      imageIntent: 'string (simple visual description for image input)',
      results: 'InspirationResult[]',
      selected: 'InspirationResult',
      value: 'string (selected image URL)',
      type: 'image',
    },
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
    description:
      'Exports connected media: PNG or JPG for images, multi-page PDF for Designer documents, MP4 for video.',
    inputs: [
      { id: 'image', label: 'Image Input', type: 'image' },
      { id: 'video', label: 'Video Input', type: 'video' },
      { id: 'document', label: 'Document Input', type: 'json' },
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
  notes: {
    type: 'notes',
    label: 'Notes',
    description: 'Quick sticky note for text annotations.',
    inputs: [],
    outputs: [{ id: 'prompt', label: 'Prompt Out', type: 'prompt' }],
    dataSchema: {
      title: 'string (editable note title, default "Note")',
      contentHtml: 'string (rich text HTML for visual editing)',
      contentMarkdown: 'string (serialized Markdown output)',
      plainText: 'string (search / preview text)',
      value: 'string (prompt-compatible Markdown mirror of the note content)',
      color: '"yellow"',
      updatedAt: 'string (ISO timestamp)',
    },
  },
  guionista: {
    type: 'guionista',
    label: 'Guionista',
    description: 'Convierte ideas en posts, artículos, guiones, escenas, slides, campañas y reescrituras.',
    inputs: [
      { id: 'prompt', label: 'Notes / Prompt', type: 'prompt' },
      { id: 'text', label: 'Text', type: 'txt' },
      { id: 'brain', label: 'Brain', type: 'brain' },
    ],
    outputs: [
      { id: 'text', label: 'Text out', type: 'txt' },
      { id: 'prompt', label: 'Prompt out', type: 'prompt' },
    ],
    dataSchema: {
      briefing: 'string (idea, note, prompt or base text)',
      format: 'post | article | script | scenes | slides | campaign | rewrite',
      settings: '{ language, length, tone, audience, goal, extraInstructions }',
      approaches: 'GuionistaApproach[] (3 editorial approaches)',
      versions: 'GuionistaVersion[]',
      activeVersionId: 'string',
      assetId: 'string (Generated Media text asset id)',
      value: 'string (active version markdown for Text/Prompt outputs)',
      promptValue: 'string (active version markdown for Prompt output)',
    },
  },
  cine: {
    type: 'cine',
    label: 'Cine',
    description:
      'Dirección audiovisual y preproducción: convierte guiones en reparto, fondos, storyboard, prompts de frames y plan de vídeo.',
    inputs: [
      { id: 'prompt', label: 'Guion / Prompt', type: 'prompt' },
      { id: 'text', label: 'Texto / Guion', type: 'txt' },
      { id: 'brain', label: 'Brain', type: 'brain' },
    ],
	    outputs: [
	      { id: 'media_list', label: 'Media List', type: 'media_list' as HandleType },
	    ],
    dataSchema: {
      sourceScript: '{ nodeId?, text, title? }',
      manualScript: 'string',
      mode: 'short_film | advertising | fashion_film | documentary | product_video | music_video | brand_story | social_video',
      status: 'empty | script_received | analyzed | characters_ready | backgrounds_ready | storyboard_ready | frames_ready | ready_for_video',
      visualDirection: '{ aspectRatio, realismLevel, globalStylePrompt, tone, pacing, cameraStyle, lightingStyle, useBrain }',
      characters: 'CineCharacter[]',
      backgrounds: 'CineBackground[]',
      scenes: 'CineScene[]',
	      value: 'string (JSON summary for downstream planning)',
	      mediaListOutput: 'MediaListOutput (single structured output for Export Multiple / Video Editor)',
	    },
	  },
	  export_multimedia: {
	    type: 'export_multimedia',
	    label: 'Export Multimedia',
	    description: 'Recibe una media_list y permite revisar, filtrar, descargar medios y exportar un manifest JSON.',
	    inputs: [{ id: 'media_list', label: 'Media List', type: 'media_list' as HandleType, required: true }],
	    outputs: [],
	    dataSchema: {
	      label: 'string',
	    },
	  },
	  exportMultiple: {
	    type: 'exportMultiple',
	    label: 'Export Multiple',
	    description: 'Alias legacy de Export Multimedia para proyectos existentes.',
	    inputs: [{ id: 'media_list', label: 'Media List', type: 'media_list' as HandleType, required: true }],
	    outputs: [],
	    dataSchema: {
	      label: 'string',
	    },
	  },
	  video_editor: {
	    type: 'video_editor',
	    label: 'Video Editor',
	    description: 'Recibe vídeos individuales o una media_list y los convierte en una timeline editable con vídeo, imágenes y audio generado por prompt.',
	    inputs: [
	      { id: 'video-n', label: 'Videos', type: 'video' },
	      { id: 'media_list', label: 'Media List', type: 'media_list' as HandleType },
	    ],
	    outputs: [],
	    dataSchema: {
	      sourceMediaList: 'MediaListOutput',
	      tracks: '{ video, audio, music, sfx, ambience, voiceover }',
	      audioRequests: 'TimelineAudioRequest[]',
	      playheadTime: 'number',
	      totalDurationSeconds: 'number',
	      mediaListOutput: 'MediaListOutput future output prepared',
	    },
	  },
	  videoEditor: {
	    type: 'videoEditor',
	    label: 'Video Editor',
	    description: 'Alias legacy de Video Editor.',
	    inputs: [
	      { id: 'video-n', label: 'Videos', type: 'video' },
	      { id: 'media_list', label: 'Media List', type: 'media_list' as HandleType },
	    ],
	    outputs: [],
	    dataSchema: {
	      label: 'string',
	      clips: 'VideoEditorClip[] (timeline local derivada de media_list)',
	    },
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
    label: 'Image Creation',
    description: 'Generates images and supports image-to-image transformations.',
    inputs: [
      { id: 'brain',   label: 'Brain',         type: 'brain' },
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
  imageCreationAdvanced: {
    type: 'imageCreationAdvanced',
    label: 'Image Creation Advanced',
    description:
      'Non destructive image creation: locks an immutable master, stores structured corrections, and rebuilds from master.',
    inputs: [
      { id: 'image', label: 'Master image', type: 'image', required: true },
      { id: 'prompt', label: 'Prompt', type: 'prompt' },
    ],
    outputs: [{ id: 'image', label: 'Image Out', type: 'image' }],
    dataSchema: {
      advancedSession: 'AdvancedImageSession (master + structured corrections + working image)',
      value: 'string (working/output image URL)',
      type: 'image',
    },
  },
  mediaDescriber: {
    type: 'mediaDescriber',
    label: 'Image Describer',
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
    description: 'An interactive drawing canvas. Use this when the user asks to draw, paint, sketch, or mask freely. Allows freehand drawing, erasing, and outputs a base64 image immediately.',
    inputs: [],
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
  projectBrain: {
    type: 'projectBrain',
    label: 'Brain',
    description:
      'Project identity and knowledge (brand kit + PDFs/links). Canvas card shows counts; full editing is in Brain studio mode (same as the Brain bottom-bar panel).',
    inputs: [],
    outputs: [
      { id: 'brain', label: 'Brain out', type: 'brain' as HandleType },
    ],
    dataSchema: {
      label: 'string (optional title on the card)',
    },
  },
  projectAssets: {
    type: 'projectAssets',
    label: 'Foldder',
    description:
      'Read-only summary of project media and files plus link to the Foldder fullscreen view (same as the Foldder bottom-bar pin).',
    inputs: [],
    outputs: [{ id: 'prompt', label: 'Prompt out', type: 'prompt' as HandleType }],
    dataSchema: {
      label: 'string (optional title on the card)',
    },
  },
  layerizer: {
    type: 'layerizer',
    label: 'Layerizer',
    description:
      'Inverse of Composite: decomposes one image into pixel-exact layers. Detects objects (Gemini), the user picks which to extract (SAM 3 + matting, no generation), and a single generative call produces a clean plate background. Outputs a layer stack (background + objects) for Designer.',
    inputs: [{ id: 'image', label: 'Image', type: 'image' as HandleType, required: true }],
    outputs: [{ id: 'layout', label: 'Image Layout', type: 'image_layout' as HandleType }],
    dataSchema: {
      masterUrl: 'string (immutable source image — never rewritten)',
      detected: 'DetectedObject[] (Gemini: id, label, bbox, isText, score) — pre-paid Estado 1',
      selected: 'SelectedObject[] (id, prompt SAM, amodalComplete) — Estado 2',
      jobId: 'string (async extract job)',
      status: 'LayerizerJobStatus',
      output: 'LayerizerOutput { masterUrl, background(clean_plate), layers[] }',
      value: 'LayerizerOutput (mirror of output; flows through the layout handle)',
    },
  },
  designer: {
    type: 'designer',
    label: 'Designer',
    description:
      'Full design studio: vector tools (pen, shapes, text) + page-based layout + threaded text frames + image frames. Combines Freehand vector editing with InDesign-style page management. Accepts an Image Layout from Layerizer: layers arrive pre-mounted at their original positions for drag-reordering.',
    inputs: [
      { id: 'brain', label: 'Brain', type: 'brain' as HandleType },
      { id: 'layout', label: 'Image Layout', type: 'image_layout' as HandleType },
    ],
    outputs: [
      { id: 'image', label: 'Image Out', type: 'image' as HandleType },
      { id: 'document', label: 'Document', type: 'json' as HandleType },
    ],
    dataSchema: {
      pages:
        'DesignerPageState[] (id, format, objects, layoutGuides, stories, textFrames, imageFrames)',
      activePageIndex: 'number',
      label: 'string',
      value: 'string (exported raster data URL)',
    },
  },
  presenter: {
    type: 'presenter',
    label: 'Presenter',
    description:
      'Presentation deck: connect Designer Document output to turn each page into a slide. Step animations, slide transitions, image→video overlays, and public share links.',
    inputs: [{ id: 'document', label: 'Designer document', type: 'json' as HandleType, required: true }],
    outputs: [],
    dataSchema: {
      label: 'string',
      imageVideoPlacements: 'PresenterImageVideoPlacement[]',
      transitionsByPageId: 'Record<pageId, SlideTransitionId>',
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
    "modelKey (flash31|flash25|pro3), aspect_ratio, resolution (1k|2k|4k), thinking (bool), value/s3Key (salida), label; entrada brain desde projectBrain mezcla ADN visual (metadata.assets) con el prompt del usuario",
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
    "label (consulta de búsqueda de imagen en inglés, desambiguada), searchIntent (obligatorio: qué debe verse en la foto — verificación por visión), count, urls[], selectedIndex, value, pendingSearch",
  inspiration:
    "facet, manualPrompt, imageIntent, results[], selected, value (URL de la imagen seleccionada), type ('image'); entrada prompt o image; busca 40 referencias en Pexels; salida siempre image al seleccionar una imagen",
  imageExport: "format (png|jpeg), label",
  photoRoom:
    "studioObjects, studioLayoutGuides, studioArtboard (px); value/salida imagen; label; entradas in_0… por cable",
  space: "label, hasInput, hasOutput, value",
  spaceInput: "label",
  spaceOutput: "label",
  painter: "bgColor, strokeColor, brushSize, value",
  crop: "aspectRatio, cropConfig, value",
  layerizer:
    "entrada image (master inmutable); detected (Gemini), selected (objetos + amodal opt-in), jobId/status (job async), output/value (LayerizerOutput: background clean_plate + layers extracted); salida layout (image_layout) conecta a designer. Extracción = recorte pixel-exacto (SAM 3 + matting), NUNCA generativo; fondo limpio = 1 llamada Nano Banana",
  projectBrain:
    "label (título opcional); marca y conocimiento en metadata.assets — resume y abre studio; salida brain",
  projectAssets:
    "label (título opcional); salida prompt reservada; inventario de medios desde el grafo — abre Foldder",
  designer:
    "pages (DesignerPageState[]), activePageIndex, label, value (export raster), autoImageOptimization; salida document (json) conecta a presenter",
  presenter:
    "label; conectar entrada document desde designer; transitionsByPageId; imageVideoPlacements; el UI lee pages del Designer vía grafo (slides / Presenter / share)",
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
