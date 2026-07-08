import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { BrandBoardPanel } from "@/app/spaces/brandkit/BrandBoardPanel";
import { BrandKitProvider } from "@/app/spaces/brandkit/BrandKitProvider";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";
import { refCategoryLabelEs } from "./brand-board-labels";
import {
  applySynthesisToSidecar,
  emptyBrandKitBoardMeta,
} from "./interpretation";

function BrandBoardHarness() {
  const [assets, setAssets] = useState(() => {
    let boardMeta = applySynthesisToSidecar(emptyBrandKitBoardMeta(), "Tag", {
      key: "messages.tagline",
      nextValue: "Propuesta tagline",
      evidence: [],
    });
    return normalizeProjectAssets({
      ...LEGACY_BRANDKIT_RUNTIME_FIXTURE,
      brainMeta: { ...LEGACY_BRANDKIT_RUNTIME_FIXTURE.brainMeta, boardMeta },
    });
  });

  return (
    <BrandKitProvider
      assets={assets}
      pipeline={{ busy: false, detail: "", queued: 0 }}
      onAssetsPatch={(updater) => setAssets((prev) => normalizeProjectAssets(updater(prev)))}
    >
      <BrandBoardPanel projectName="Acme" />
    </BrandKitProvider>
  );
}

describe("BrandBoardPanel — landing v1", () => {
  it("renderiza layout Board sin copy de síntesis ni pestañas", () => {
    render(<BrandBoardHarness />);
    expect(screen.getByTestId("brand-board-panel")).toBeTruthy();
    expect(screen.getByTestId("brand-board-dropzone")).toBeTruthy();
    expect(screen.getByText(/Claridad visual|Marca orientada|Propuesta tagline/)).toBeTruthy();
    expect(screen.getByText(refCategoryLabelEs("protagonist"))).toBeTruthy();
    expect(screen.getByTestId("brand-board-completeness").textContent).toMatch(/Libro de estilo|Descargar Libro de estilo/);
    expect(screen.queryByText(/pendiente de síntesis/i)).toBeNull();
    expect(screen.queryByText(/analiza fuentes/i)).toBeNull();
  });

  it("validar propuesto desde overlay invisible", async () => {
    const user = userEvent.setup();
    render(<BrandBoardHarness />);
    const validateButtons = screen.getAllByRole("button", { name: /validar propuesta/i });
    expect(validateButtons.length).toBeGreaterThan(0);
    await user.click(validateButtons[0]!);
  });

  it("muestra placeholders ghost cuando faltan datos", () => {
    render(
      <BrandKitProvider
        assets={normalizeProjectAssets({})}
        pipeline={{ busy: false, detail: "", queued: 0 }}
        onAssetsPatch={() => {}}
      >
        <BrandBoardPanel projectName="Proyecto activo" />
      </BrandKitProvider>,
    );
    expect(screen.getByText("Aquí aparecerá tu logo")).toBeTruthy();
    expect(screen.getByText("Aquí aparecerá tu mensaje de marca")).toBeTruthy();
  });
});
