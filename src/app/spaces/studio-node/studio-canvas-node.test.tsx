import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  StudioCanvasNodeShell,
  StudioCanvasOpenButton,
  StudioCanvasPill,
  type StudioCanvasNodeHandleSpec,
} from "./studio-canvas-node";

vi.mock("../FoldderDataHandle", () => ({
  FoldderDataHandle: ({ id, type, dataType, position }: { id: string; type: string; dataType: string; position: string }) => (
    <span data-testid={`handle-${id}`} data-handle-type={type} data-data-type={dataType} data-position={position} />
  ),
}));

vi.mock("../foldder-icons", () => ({
  NodeIcon: ({ type }: { type: string }) => <span data-testid="node-icon">{type}</span>,
}));

vi.mock("../foldder-node-ui", () => ({
  NodeLabel: ({ label, defaultLabel }: { label?: string; defaultLabel: string }) => (
    <span data-testid="node-label">{label || defaultLabel}</span>
  ),
  FoldderNodeHeaderTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <strong data-testid="node-title" className={className}>{children}</strong>
  ),
}));

describe("StudioCanvasNodeShell", () => {
  it("renders the shared studio node chrome and handle contract", () => {
    const handles: StudioCanvasNodeHandleSpec[] = [
      { side: "left", top: "32%", type: "target", id: "brain", dataType: "brain", label: "Brain" },
      { side: "right", top: "64%", type: "source", id: "image", dataType: "image", label: "Image" },
    ];

    render(
      <StudioCanvasNodeShell
        nodeId="node-1"
        nodeType="designer"
        label="Mi Designer"
        defaultLabel="Designer"
        title="DESIGNER"
        badge="DESIGN"
        minWidth={280}
        width={320}
        handles={handles}
      >
        <div>Contenido</div>
      </StudioCanvasNodeShell>,
    );

    expect(screen.getByTestId("node-label")).toHaveTextContent("Mi Designer");
    expect(screen.getByTestId("node-icon")).toHaveTextContent("designer");
    expect(screen.getByTestId("node-title")).toHaveTextContent("DESIGNER");
    expect(screen.getByText("DESIGN")).toBeInTheDocument();
    expect(screen.getByText("Contenido")).toBeInTheDocument();
    expect(screen.getByTestId("handle-brain")).toHaveAttribute("data-handle-type", "target");
    expect(screen.getByTestId("handle-brain")).toHaveAttribute("data-data-type", "brain");
    expect(screen.getByTestId("handle-image")).toHaveAttribute("data-handle-type", "source");
    expect(screen.getByTestId("handle-image")).toHaveAttribute("data-data-type", "image");
  });

  it("supports custom branded header icons", () => {
    render(
      <StudioCanvasNodeShell
        nodeId="photo-room"
        nodeType="photoRoom"
        defaultLabel="PhotoRoom"
        title="PhotoRoom"
        headerIcon={<span data-testid="brand-icon">PR</span>}
      >
        <div />
      </StudioCanvasNodeShell>,
    );

    expect(screen.getByTestId("brand-icon")).toHaveTextContent("PR");
    expect(screen.queryByTestId("node-icon")).not.toBeInTheDocument();
  });
});

describe("StudioCanvasOpenButton", () => {
  it("stops canvas bubbling and calls the studio opener", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const bubbled = vi.fn();

    render(
      <div onClick={bubbled}>
        <StudioCanvasOpenButton onClick={onClick}>Abrir Studio</StudioCanvasOpenButton>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Abrir Studio" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(bubbled).not.toHaveBeenCalled();
  });
});

describe("StudioCanvasPill", () => {
  it("switches between active and inactive visual states", () => {
    const { rerender } = render(
      <StudioCanvasPill active activeClassName="active-pill">
        Guardado
      </StudioCanvasPill>,
    );

    expect(screen.getByText("Guardado")).toHaveClass("active-pill");

    rerender(
      <StudioCanvasPill active={false} activeClassName="active-pill">
        Borrador
      </StudioCanvasPill>,
    );

    expect(screen.getByText("Borrador")).toHaveClass("border-slate-300/70");
  });
});
