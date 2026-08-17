/**
 * UI tests 6B.2 — control Adaptación en microbarra.
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  SiteCreatorAdaptationControl,
  adaptationButtonLabel,
} from "./SiteCreatorAdaptationControl";

describe("SiteCreatorAdaptationControl", () => {
  it("muestra solo Composición y Apilar; Escape cierra", () => {
    const onSelect = vi.fn();
    render(
      <SiteCreatorAdaptationControl
        model={{
          band: "mobile",
          effective: { mode: "preserve", source: "explicit" },
          buttonLabel: adaptationButtonLabel("preserve"),
          target: { kind: "blueprintNode", nodeId: "hero-1" },
        }}
        onSelectMode={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("site-creator-adaptation-trigger"));
    expect(screen.getByTestId("site-creator-adaptation-popover")).toBeTruthy();
    expect(screen.getByText(/Adaptación en móvil/i)).toBeTruthy();
    expect(screen.getByTestId("site-creator-adaptation-option-preserve").textContent).toContain("✓");
    expect(screen.getByTestId("site-creator-adaptation-option-stack")).toBeTruthy();
    expect(screen.queryByTestId("site-creator-adaptation-option-auto")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("site-creator-adaptation-popover")).toBeNull();
  });

  it("seleccionar opción llama onSelectMode", () => {
    const onSelect = vi.fn();
    render(
      <SiteCreatorAdaptationControl
        model={{
          band: "tablet",
          effective: { mode: "auto", source: "default" },
          buttonLabel: adaptationButtonLabel("auto"),
          target: { kind: "blueprintNode", nodeId: "sec-1" },
        }}
        onSelectMode={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("site-creator-adaptation-trigger"));
    const popover = screen.getByTestId("site-creator-adaptation-popover");
    expect(popover.className).toContain("site-creator-floating-panel");
    fireEvent.click(screen.getByTestId("site-creator-adaptation-option-preserve"));
    expect(onSelect).toHaveBeenCalledWith("preserve");
  });

  it("pointerdown on Apilar llama onSelectMode", () => {
    const onSelect = vi.fn();
    render(
      <SiteCreatorAdaptationControl
        model={{
          band: "tablet",
          effective: { mode: "auto", source: "default" },
          buttonLabel: adaptationButtonLabel("auto"),
          target: { kind: "blueprintNode", nodeId: "sec-1" },
        }}
        onSelectMode={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("site-creator-adaptation-trigger"));
    fireEvent.pointerDown(screen.getByTestId("site-creator-adaptation-option-stack"));
    expect(onSelect).toHaveBeenCalledWith("stack");
  });

  it("controlado por ancestro no abre opciones", () => {
    const onFocus = vi.fn();
    render(
      <SiteCreatorAdaptationControl
        model={{
          band: "mobile",
          effective: {
            mode: "preserve",
            source: "ancestor",
            controller: { kind: "blueprintNode", nodeId: "hero-1" },
          },
          buttonLabel: adaptationButtonLabel("preserve"),
          controlledByLabel: "Hero",
          controller: { kind: "blueprintNode", nodeId: "hero-1" },
        }}
        onSelectMode={vi.fn()}
        onFocusController={onFocus}
      />,
    );
    fireEvent.click(screen.getByTestId("site-creator-adaptation-controlled"));
    expect(onFocus).toHaveBeenCalled();
    expect(screen.queryByTestId("site-creator-adaptation-popover")).toBeNull();
  });

  it("reset-only solo Restablecer, sin menú de modos", () => {
    const onSelect = vi.fn();
    render(
      <SiteCreatorAdaptationControl
        model={{
          band: "tablet",
          effective: { mode: "stack", source: "explicit" },
          buttonLabel: "Adaptación sin efecto · Restablecer",
          target: { kind: "blueprintNode", nodeId: "sec-bg" },
          resetOnly: true,
        }}
        onSelectMode={onSelect}
      />,
    );
    expect(screen.getByTestId("site-creator-adaptation-reset")).toBeTruthy();
    fireEvent.click(screen.getByTestId("site-creator-adaptation-reset"));
    expect(onSelect).toHaveBeenCalledWith("auto");
    expect(screen.queryByTestId("site-creator-adaptation-popover")).toBeNull();
  });
});
