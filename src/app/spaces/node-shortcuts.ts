/**
 * Tecla mostrada en los botones de la librería (sidebar / modo ventana).
 * Debe coincidir con el `switch (e.key)` del atajo en `page.tsx` (~keydown en el lienzo).
 *
 * **2** Brain (projectBrain); **3** Foldder (projectAssets); **1** PhotoRoom.
 * **F** Designer; **;** Presenter; **G** agrupar en lienzo; **Mayús+F** encuadra todo el grafo. **J** Listado. Mantener **Espacio**: vista global + rollover + pan; soltar encuadra nodo bajo cursor o restaura zoom (Ctrl/Mayús ya no activan este modo).
 * **G** agrupa en el lienzo; **Mayús+G** desagrupa. Grok = **K**. VFX Generator = **Y**.
 * **A** auto-layout (alterna en cada pulsación): componentes conexos igual; nodos sueltos primero en columna al margen, la siguiente vez en filas horizontales a izquierda y derecha del núcleo conectado.
 */
export const NODE_KEYS: Record<string, string> = {
  projectBrain: '2',
  projectAssets: '3',
  photoRoom: '1',
  mediaInput: 'm',
  promptInput: 'p',
  urlImage: 'u',
  pinterestSearch: '8',
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
  imageExport: 'e',
  painter: 'w',
  crop: 'x',
  designer: 'f',
  presenter: ';',
  cine: 'c',
};
