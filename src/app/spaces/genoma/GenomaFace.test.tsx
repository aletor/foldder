import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { GenomaFace } from "./GenomaFace";
import { crownedGenome, ghostGenome, proposedGenome } from "@/lib/genoma/fixtures";
import { buildBookView } from "@/lib/genoma/projection/book-view";

describe("GenomaFace — cara estática (ghost · proposed · crowned)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ state: { projectId: "test", status: "none", sightings: [] } }),
      })) as unknown as typeof fetch,
    );
  });

  it("ghost: completitud 0 y rasgos en estado ghost", () => {
    const view = buildBookView(ghostGenome());
    const { container } = render(<GenomaFace view={view} projectId="test" />);

    expect(screen.getByTestId("completeness")).toHaveTextContent("0%");
    expect(screen.getByText(/sin fuentes aún/i)).toBeTruthy();
    expect(container.querySelector('[data-testid="slot-typography.primary"]')).toHaveAttribute("data-state", "ghost");
    expect(screen.getByText(/^logo$/i)).toBeTruthy();
  });

  it("proposed: muestra propuestas, completitud > 0 y tap dispara onCrown", () => {
    const view = buildBookView(proposedGenome());
    const onCrown = vi.fn();
    const { container } = render(<GenomaFace view={view} projectId="test" onCrown={onCrown} />);

    expect(Number(screen.getByTestId("completeness").textContent?.replace("%", ""))).toBeGreaterThan(0);
    expect(screen.getByText("Montserrat")).toBeTruthy();
    expect(screen.getByText("Hacemos que pase.")).toBeTruthy();

    const typoSlot = container.querySelector('[data-testid="slot-typography.primary"]');
    expect(typoSlot).toHaveAttribute("data-state", "proposed");

    fireEvent.click(typoSlot!);
    expect(onCrown).toHaveBeenCalledTimes(1);
    expect(onCrown.mock.calls[0][0]).toBe("typography.primary");
    expect(typeof onCrown.mock.calls[0][1]).toBe("string");
  });

  it("crowned: rasgos principales coronados y completitud alta", () => {
    const view = buildBookView(crownedGenome());
    const { container } = render(<GenomaFace view={view} projectId="test" />);

    expect(container.querySelector('[data-testid="slot-typography.primary"]')).toHaveAttribute("data-state", "crowned");
    expect(Number(screen.getByTestId("completeness").textContent?.replace("%", ""))).toBeGreaterThan(70);
    expect(screen.getByText("1 fuente")).toBeTruthy();
  });

  it("panel izquierdo: añadir url notifica hacia arriba", () => {
    const view = buildBookView(proposedGenome());
    const onAddSource = vi.fn();
    render(<GenomaFace view={view} projectId="test" onAddSource={onAddSource} />);

    fireEvent.change(screen.getByPlaceholderText(/pega una url/i), { target: { value: "https://marca.example" } });
    fireEvent.click(screen.getByRole("button", { name: /añadir/i }));
    expect(onAddSource).toHaveBeenCalledWith("https://marca.example");
  });
});
