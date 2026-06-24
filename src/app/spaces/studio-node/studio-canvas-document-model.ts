/**
 * Configuración visible del lienzo de un studio (medidas + fondo) y helpers de fondo.
 * Compartido por Designer (panel de presets, controles de medidas del canvas).
 */
export type NewDocumentConfig = {
  name: string;
  width: number;
  height: number;
  background: "white" | "black" | "transparent";
};

export function newDocumentBackgroundToCss(bg: NewDocumentConfig["background"]): string {
  switch (bg) {
    case "white":
      return "#ffffff";
    case "black":
      return "#000000";
    case "transparent":
      return "transparent";
    default: {
      const _exhaustive: never = bg;
      return _exhaustive;
    }
  }
}

/** Interpreta el fondo guardado en el artboard (CSS) para el formulario de presets. */
export function artboardCssToDocumentBackground(css: string | undefined): NewDocumentConfig["background"] {
  if (css == null || css.trim() === "" || css.trim().toLowerCase() === "transparent") {
    return "transparent";
  }
  const s = css.trim().toLowerCase();
  if (s === "#000" || s === "#000000" || s === "rgb(0, 0, 0)" || s === "rgb(0,0,0)" || s === "black") {
    return "black";
  }
  if (s === "#fff" || s === "#ffffff" || s === "white") {
    return "white";
  }
  return "white";
}
