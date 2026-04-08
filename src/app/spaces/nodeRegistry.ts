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
      label: 'string (search query)',
      urls: 'string[]',
      selectedIndex: 'number',
      value: 'string (the selected URL)',
      count: 'number (limit of images to fetch - default 3)'
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
      value: 'string'
    }
  },
  grokProcessor: {
    type: 'grokProcessor',
    label: 'Grok Imagine',
    description: 'Generates artistic images using xAI Grok model.',
    inputs: [
      { id: 'prompt', label: 'Prompt Input', type: 'prompt' }
    ],
    outputs: [
      { id: 'image', label: 'Image Out', type: 'image' }
    ],
    dataSchema: {}
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
  enhancer: {
    type: 'enhancer',
    label: 'Prompt Enhancer',
    description: 'Uses GPT-4o to transform simple prompts into highly detailed descriptions.',
    inputs: [
      { id: 'prompt', label: 'Raw Prompt', type: 'prompt' }
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

  geminiVideo: {
    type: 'geminiVideo',
    label: 'Gemini Video',
    description: 'Generates high-fidelity videos using Veo 3.1 with first and last frame control.',
    inputs: [
      { id: 'firstFrame', label: 'First Frame', type: 'image' },
      { id: 'lastFrame', label: 'Last Frame', type: 'image' },
      { id: 'prompt', label: 'Creative Prompt', type: 'prompt' }
    ],
    outputs: [
      { id: 'video', label: 'Video Out', type: 'video' }
    ],
    dataSchema: {
      resolution: '720p | 1080p | 4K',
      duration: '4 | 5 | 6 | 8',
      audio: 'boolean'
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
};

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
