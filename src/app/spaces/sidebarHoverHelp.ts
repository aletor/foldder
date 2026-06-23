/** Textos del panel de ayuda al hacer hover en los botones del sidebar (Node Library). */
export const SIDEBAR_HOVER_HELP: Record<string, { title: string; line: string }> = {
  promptInput: {
    title: 'Prompt',
    line: 'Escribes instrucción para la IA',
  },
  notes: {
    title: 'Notes',
    line: 'Sticky note rápida para escribir ideas y conectarlas como prompt',
  },
  guionista: {
    title: 'Guionista',
    line: 'Editor editorial: convierte ideas, notas o Brain en textos versionados',
  },
  cine: {
    title: 'Cine',
    line: 'Preproducción audiovisual: guion, reparto, fondos, storyboard y prompts de frames',
  },
  projectBrain: {
    title: 'Brain',
    line: 'Dashboard compacto: ADN, fuentes, nodos conectados y pendientes; abre Brain para editar',
  },
  projectAssets: {
    title: 'Foldder',
    line: 'Contenedor vivo del proyecto: Imported Media, Generated Media, Media Files y Exports',
  },
  mediaInput: {
    title: 'Media Input',
    line: 'Subes archivo como material base',
  },
  urlImage: {
    title: 'URL Image / Carousel',
    line: 'Seleccionas imagen desde varias URLs',
  },
  inspiration: {
    title: 'Inspiration',
    line: 'Busca referencias visuales desde prompt o imagen y devuelve una imagen seleccionada',
  },
  nanoBanana: {
    title: 'Image Creation',
    line: 'Genera imagen desde prompt y referencias',
  },
  geminiVideo: {
    title: 'Video Generator',
    line: 'Veo 3.1 o Seedance 2: prompt y frames opcionales',
  },
  vfxGenerator: {
    title: 'VFX Generator',
    line: 'Beeble SwitchX: vídeo fuente, prompt e imagen de referencia',
  },
  grokProcessor: {
    title: 'Grok Imagine',
    line: 'Genera imagen con motor Grok',
  },
  concatenator: {
    title: 'Nodo Prompt Concatenator',
    line: 'Junta varios prompts en uno',
  },
  listado: {
    title: 'Listado',
    line: 'Varios prompts entrantes; la salida es «título del nodo: opción elegida»',
  },
  enhancer: {
    title: 'Enhancer',
    line: 'Mejora y amplía tu prompt',
  },
  photoRoom: {
    title: 'PhotoRoom',
    line: 'Retoque y composición; acepta capas desde Layerizer (layout) o imágenes in_0…',
  },
  painter: {
    title: 'Painter',
    line: 'Dibuja manualmente sobre el lienzo',
  },
  crop: {
    title: 'Crop',
    line: 'Recorta y encuadra imagen',
  },
  layerizer: {
    title: 'Layerizer',
    line: 'Capas + fondo limpio → Designer o PhotoRoom (layout)',
  },
  mediaDescriber: {
    title: 'Image Describer',
    line: 'Prompt con cámara, lente y color grade',
  },
  imageExport: {
    title: 'Image Export',
    line: 'Exporta imagen final',
  },
  space: {
    title: 'Nested Space',
    line: 'Crea subflujo dentro del flujo',
  },
  spaceInput: {
    title: 'Space Entry',
    line: 'Entrada al subflujo',
  },
  spaceOutput: {
    title: 'Space Exit',
    line: 'Salida del subflujo',
  },
  designer: {
    title: 'Designer',
    line: 'Diseño completo: vectores, páginas, cajas de texto y marcos de imagen',
  },
  presenter: {
    title: 'Presenter',
    line: 'Conecta Document del Designer: cada página es un slide con animaciones, transiciones y vídeos en imágenes',
  },
  video_editor: {
    title: 'Video Editor',
    line: 'Conecta una media_list y edita timeline con vídeo, imágenes y audio generado por prompt',
  },
  imageCreationAdvanced: {
    title: 'Image Advanced',
    line: 'Creación no destructiva: master inmutable, correcciones estructuradas y reconstrucción desde el original',
  },
  export_multimedia: {
    title: 'Export Multimedia',
    line: 'Recibe media_list: revisa, filtra, descarga medios y exporta un manifest JSON',
  },
};
