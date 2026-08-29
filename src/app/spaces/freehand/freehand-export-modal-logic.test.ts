import { describe, expect, it } from "vitest";
import {
  exportCtaLabel,
  exportPageFilename,
  pageScopeHint,
  showDesignerPageScope,
} from "./freehand-export-modal-logic";

describe("showDesignerPageScope", () => {
  it("solo en documento completo con más de una página", () => {
    expect(showDesignerPageScope(3, "full")).toBe(true);
    expect(showDesignerPageScope(1, "full")).toBe(false);
    expect(showDesignerPageScope(4, "selection")).toBe(false);
  });
});

describe("exportCtaLabel", () => {
  it("nombra el formato y el destino", () => {
    expect(
      exportCtaLabel({ format: "jpg", destination: "download", pageScope: "current", pageCount: 4 }),
    ).toBe("Exportar JPG");
    expect(
      exportCtaLabel({ format: "pdf", destination: "foldder", pageScope: "all", pageCount: 4 }),
    ).toBe("Guardar PDF en Foldder");
  });

  it("cuenta archivos de imagen cuando el ámbito es todas las páginas", () => {
    expect(
      exportCtaLabel({ format: "png", destination: "download", pageScope: "all", pageCount: 5 }),
    ).toBe("Exportar 5 PNG");
    expect(
      exportCtaLabel({ format: "jpg", destination: "foldder", pageScope: "all", pageCount: 3 }),
    ).toBe("Guardar 3 JPG en Foldder");
  });

  it("PDF de todas las páginas sigue siendo un solo documento", () => {
    expect(
      exportCtaLabel({ format: "pdf", destination: "download", pageScope: "all", pageCount: 8 }),
    ).toBe("Exportar PDF");
  });
});

describe("pageScopeHint", () => {
  it("explica N imágenes vs un PDF", () => {
    expect(pageScopeHint({ format: "png", pageScope: "all", pageCount: 4 })).toBe(
      "4 archivos, uno por página.",
    );
    expect(pageScopeHint({ format: "pdf", pageScope: "all", pageCount: 4 })).toBe(
      "Un único PDF con 4 páginas.",
    );
    expect(pageScopeHint({ format: "jpg", pageScope: "current", pageCount: 4 })).toBe(
      "Solo la página que estás viendo.",
    );
  });
});

describe("exportPageFilename", () => {
  it("no añade índice si hay una sola página", () => {
    expect(exportPageFilename({ base: "deck.png", ext: "png", pageIndex: 0, pageCount: 1 })).toBe(
      "deck.png",
    );
  });

  it("numera y usa el nombre de la slide", () => {
    expect(
      exportPageFilename({
        base: "deck",
        ext: "jpg",
        pageIndex: 1,
        pageCount: 12,
        slideName: "Portada hero",
      }),
    ).toBe("deck-02-Portada_hero.jpg");
  });
});
