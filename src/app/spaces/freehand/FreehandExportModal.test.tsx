import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FreehandExportModal } from "./FreehandExportModal";

const bounds = { x: 0, y: 0, w: 800, h: 600 };

function renderModal(
  onExport = vi.fn(),
  extra?: { pageCount?: number; exportScope?: "selection" | "full" },
) {
  render(
    <FreehandExportModal
      open
      onClose={() => undefined}
      bounds={bounds}
      defaultFilename="deck"
      selectionLabel="Página completa"
      hasSelection={false}
      exportScope={extra?.exportScope ?? "full"}
      onExport={onExport}
      designerMultipageVectorPdf={
        extra?.pageCount
          ? { pageCount: extra.pageCount, busy: false }
          : null
      }
    />,
  );
  return onExport;
}

describe("FreehandExportModal", () => {
  it("muestra ámbito de páginas en un documento Designer multipágina", () => {
    renderModal(vi.fn(), { pageCount: 4 });
    expect(screen.getByRole("button", { name: "Página actual" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Todas (4)" })).toBeTruthy();
    expect(screen.getByText("Solo la página que estás viendo.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exportar PNG" })).toBeTruthy();
  });

  it("no muestra ámbito de páginas con una sola página", () => {
    renderModal(vi.fn(), { pageCount: 1 });
    expect(screen.queryByRole("button", { name: "Página actual" })).toBeNull();
  });

  it("pasa pageScope all y destination foldder al exportar imágenes", async () => {
    const onExport = renderModal(vi.fn(async () => undefined), { pageCount: 3 });
    fireEvent.click(screen.getByRole("button", { name: "JPG" }));
    fireEvent.click(screen.getByRole("button", { name: "Todas (3)" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar en Foldder" }));
    expect(screen.getByRole("button", { name: "Guardar 3 JPG en Foldder" })).toBeTruthy();
    expect(screen.getByText("3 archivos, uno por página.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar 3 JPG en Foldder" }));
    await vi.waitFor(() => expect(onExport).toHaveBeenCalledTimes(1));
    expect(onExport.mock.calls[0]?.[0]).toMatchObject({
      format: "jpg",
      destination: "foldder",
      pageScope: "all",
    });
  });

  it("PDF de todas las páginas sigue siendo un solo documento", () => {
    renderModal(vi.fn(), { pageCount: 5 });
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Todas (5)" }));
    expect(screen.getByText("Un único PDF con 5 páginas.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exportar PDF" })).toBeTruthy();
  });
});
