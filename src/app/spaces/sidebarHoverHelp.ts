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
  pinterestSearch: {
    title: 'Pinterest',
    line: 'Conecta un Prompt con la búsqueda; Buscar usa ese texto (requiere token API)',
  },
  nanoBanana: {
    title: 'Nano Banana',
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
    title: 'Concatenator',
    line: 'Une varios textos en uno',
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
    line: 'Retoque de imagen: varias entradas; salida imagen (Studio en evolución)',
  },
  painter: {
    title: 'Painter',
    line: 'Dibuja manualmente sobre el lienzo',
  },
  crop: {
    title: 'Crop',
    line: 'Recorta y encuadra imagen',
  },
  backgroundRemover: {
    title: 'Background Remover',
    line: 'Elimina fondo de la imagen',
  },
  mediaDescriber: {
    title: 'Vision / Media Describer',
    line: 'Describe imagen como prompt',
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
    line: 'Conecta la salida Document del Designer: cada página es un slide (vista previa; animaciones después)',
  },
};
