/**
 * Transiciones entre slides en Presenter (sin «Continuity»).
 *
 * Semántica al avanzar (índice mayor):
 * - none: corte instantáneo
 * - fade: fundido cruzado
 * - slideLeft: contenido nuevo entra desde la derecha; el anterior sale hacia la izquierda
 * - slideRight: nuevo desde la izquierda; anterior hacia la derecha
 * - slideUp: nuevo desde abajo; anterior hacia arriba
 * - slideDown: nuevo desde arriba; anterior hacia abajo
 *
 * Al retroceder (índice menor), las direcciones de entrada/salida se invierten para que
 * la animación sea coherente con el sentido de navegación.
 */
export type SlideTransitionId =
  | "none"
  | "fade"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown";

export const SLIDE_TRANSITION_OPTIONS: {
  id: SlideTransitionId;
  label: string;
}[] = [
  { id: "none", label: "Ninguna" },
  { id: "fade", label: "Fundido" },
  { id: "slideLeft", label: "Deslizar izq." },
  { id: "slideRight", label: "Deslizar der." },
  { id: "slideUp", label: "Deslizar arriba" },
  { id: "slideDown", label: "Deslizar abajo" },
];

export const DEFAULT_SLIDE_TRANSITION: SlideTransitionId = "fade";
