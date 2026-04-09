/**
 * Tecla mostrada en los botones de la librería (sidebar / modo ventana).
 * Debe coincidir con el `switch (e.key)` del atajo en `page.tsx` (~keydown en el lienzo).
 *
 * Alias no reflejados en la chapa: Listado también con **F**; Layout también con **L**;
 * **Mayús+F** encuadra todo el grafo. Mantener **Control**, **Mayús** o **Espacio**: vista global + rollover; soltar la última encuadra nodo bajo cursor o restaura zoom.
 * **G** agrupa en el lienzo; **Mayús+G** desagrupa. Grok = **K**.
 * **A** auto-layout: por componente conexo; nodos sueltos (sin aristas al resto) en columna al margen, no mezclados con el flujo enlazado.
 */
export const NODE_KEYS: Record<string, string> = {
  mediaInput: 'm',
  promptInput: 'p',
  background: 'b',
  urlImage: 'u',
  backgroundRemover: 'r',
  mediaDescriber: 'd',
  enhancer: 'h',
  grokProcessor: 'k',
  nanoBanana: 'n',
  geminiVideo: 'v',
  concatenator: 'q',
  listado: 'j',
  space: 's',
  spaceInput: 'i',
  spaceOutput: 'o',
  imageComposer: 'c',
  imageExport: 'e',
  painter: 'w',
  textOverlay: 't',
  crop: 'x',
  bezierMask: 'z',
};
