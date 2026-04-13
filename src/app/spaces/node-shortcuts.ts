/**
 * Tecla mostrada en los botones de la librería (sidebar / modo ventana).
 * Debe coincidir con el `switch (e.key)` del atajo en `page.tsx` (~keydown en el lienzo).
 *
 * Alias no reflejados en la chapa: Layout también con **L**;
 * **F** Designer; **Mayús+F** encuadra todo el grafo. **J** Listado. Mantener **Espacio**: vista global + rollover + pan; soltar encuadra nodo bajo cursor o restaura zoom (Ctrl/Mayús ya no activan este modo).
 * **G** agrupa en el lienzo; **Mayús+G** desagrupa. Grok = **K**. VFX Generator = **Y**.
 * **A** auto-layout (alterna en cada pulsación): componentes conexos igual; nodos sueltos primero en columna al margen, la siguiente vez en filas horizontales a izquierda y derecha del núcleo conectado.
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
  vfxGenerator: 'y',
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
  designer: 'f',
};
