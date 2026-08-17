"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  MoreHorizontal,
} from "lucide-react";
import { SC_VISUAL } from "./site-creator-visual-tokens";
import type {
  ResponsiveAlignX,
  ResponsiveAlignY,
  ResponsiveEditableBand,
  ResponsiveItemTuneV1,
  ResponsiveContainerTuneV1,
  ResponsiveMediaFit,
  ResponsiveMediaTuneV1,
  ResponsiveWidthMode,
} from "./site-creator-types";
import {
  alignXLabel,
  alignYLabel,
  mediaFitLabel,
  widthModeLabel,
} from "./site-creator-responsive-tunes";
import { resolveAdaptationPopoverPlacement, resolveFloatingEditorPlacement } from "./site-creator-floating-placement";
import { floatingPressHandlers, isNodeInsideRefs } from "./site-creator-floating-press";
import type { PageRect } from "./site-creator-coordinate-space";
import type { FloatingChromeGeometry } from "./SiteCreatorObjectMicrobar";

export type RefineControlKind = "container" | "item" | "media";

export type RefineControlModel = {
  band: ResponsiveEditableBand;
  kind: RefineControlKind;
  itemTune: ResponsiveItemTuneV1 | null;
  containerTune: ResponsiveContainerTuneV1 | null;
  mediaTune: ResponsiveMediaTuneV1 | null;
  canReorder: boolean;
  resetLabel: string;
  showReset: boolean;
  /** Unidades de contenido del contenedor (sin fondo). */
  containerContentCount?: number;
};

export type RefineControlHandlers = {
  onAlignX?: (align: ResponsiveAlignX) => void;
  onAlignY?: (align: ResponsiveAlignY) => void;
  onWidthMode?: (mode: ResponsiveWidthMode) => void;
  onHide?: (hidden: boolean) => void;
  onReorder?: (delta: -1 | 1) => void;
  onResetItem?: () => void;
  onResetContainer?: () => void;
  onResetBand?: () => void;
  onContainerPadding?: (value: number) => void;
  onContainerPaddingAuto?: () => void;
  onContainerGap?: (value: number) => void;
  onContainerGapAuto?: () => void;
  onContainerAlign?: (align: ResponsiveAlignX) => void;
  onContainerAlignAuto?: () => void;
  onContainerAlignY?: (align: ResponsiveAlignY) => void;
  onContainerAlignYAuto?: () => void;
  onContainerWidthMode?: (mode: ResponsiveWidthMode) => void;
  onContainerMaxWidth?: (value: number | null) => void;
  onContainerMaxWidthAuto?: () => void;
  onContainerMinHeight?: (value: number | null) => void;
  onContainerMinHeightAuto?: () => void;
  onMediaFit?: (fit: ResponsiveMediaFit) => void;
  onEnterFocal?: () => void;
};

export interface SiteCreatorRefineControlProps {
  model: RefineControlModel | null;
  handlers: RefineControlHandlers;
  floatingGeometry?: FloatingChromeGeometry | null;
  microbarClientRect?: PageRect | null;
  portalHost?: HTMLElement | null;
}

function stopFloatingCapture(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export function SiteCreatorRefineControl({
  model,
  handlers,
  floatingGeometry,
  microbarClientRect,
  portalHost,
}: SiteCreatorRefineControlProps) {
  const [menu, setMenu] = useState<"more" | "width" | "space" | "fit" | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setMenu(null);
  }, [model?.band, model?.kind]);

  useEffect(() => {
    if (!menu) return;
    let onDocPointerDown: ((e: PointerEvent) => void) | null = null;
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    const timer = window.setTimeout(() => {
      onDocPointerDown = (e: PointerEvent) => {
        if (isNodeInsideRefs(e.target, [triggerRef, popoverRef])) return;
        setMenu(null);
      };
      onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        e.preventDefault();
        setMenu(null);
      };
      document.addEventListener("pointerdown", onDocPointerDown);
      window.addEventListener("keydown", onKey, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (onDocPointerDown) document.removeEventListener("pointerdown", onDocPointerDown);
      if (onKey) window.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu || !model) {
      setPopoverPos(null);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const triggerRect: PageRect = {
      x: trigger.left,
      y: trigger.top,
      width: trigger.width,
      height: trigger.height,
    };
    const micro =
      microbarClientRect ??
      ({
        x: trigger.left - 8,
        y: trigger.top - 4,
        width: 220,
        height: 32,
      } satisfies PageRect);
    const studio =
      floatingGeometry?.studioViewportRect ??
      ({
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      } satisfies PageRect);
    const selection = floatingGeometry?.selectionClientRect ?? triggerRect;
    const popoverSize =
      menu === "space"
        ? { width: 248, height: 300 }
        : menu === "more"
          ? { width: 240, height: 180 }
          : { width: 240, height: 148 };
    if (menu === "space" && floatingGeometry) {
      const placed = resolveFloatingEditorPlacement({
        anchorRect: triggerRect,
        floatingSize: popoverSize,
        selectionRect: selection,
        relevantContentRects: floatingGeometry.relevantContentClientRects,
        pageFrameRect: floatingGeometry.pageFrameRect,
        studioViewportRect: studio,
        preferNearRect: micro,
        avoidRects: micro ? [micro] : [],
      });
      setPopoverPos({ left: placed.left, top: placed.top });
      return;
    }
    const placed = resolveAdaptationPopoverPlacement({
      triggerRect,
      microbarRect: micro,
      selectionRect: selection,
      studioViewportRect: studio,
      popoverSize,
    });
    setPopoverPos({ left: placed.left, top: placed.top });
  }, [menu, floatingGeometry, microbarClientRect, model]);

  if (!model) return null;

  const host = portalHost ?? (typeof document !== "undefined" ? document.body : null);
  const bandLabel = model.band === "mobile" ? "móvil" : "tablet";
  const Band = model.band === "mobile" ? "Móvil" : "Tablet";
  const isContainer = model.kind === "container";
  const isMedia = model.kind === "media";
  const isItem = model.kind === "item" || isMedia;
  const alignX = isContainer
    ? (model.containerTune?.contentAlignX ?? null)
    : (model.itemTune?.alignX ?? null);
  const alignY = isContainer ? (model.containerTune?.contentAlignY ?? null) : (model.itemTune?.alignY ?? null);
  const widthMode = isContainer
    ? (model.containerTune?.contentWidthMode ?? "container")
    : (model.itemTune?.widthMode ?? "content");

  const popoverInner = (() => {
    if (menu === "width") {
      return (
        <>
          <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: SC_VISUAL.chipMuted }}>
            Anchura en {bandLabel}
          </p>
          {(["content", "container", "full"] as const).map((mode) => (
            <MenuOption
              key={mode}
              selected={widthMode === mode}
              label={widthModeLabel(mode)}
              hint={
                mode === "content"
                  ? "Solo el ancho que necesita el contenido."
                  : mode === "full"
                    ? "Hasta los bordes laterales, sin salir del viewport."
                    : "Ocupa el ancho disponible dentro de los márgenes."
              }
              onClick={() => {
                if (isContainer) handlers.onContainerWidthMode?.(mode);
                else handlers.onWidthMode?.(mode);
                setMenu(null);
              }}
            />
          ))}
        </>
      );
    }
    if (menu === "fit") {
      return (
        <>
          <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: SC_VISUAL.chipMuted }}>
            Imagen en {bandLabel}
          </p>
          {(["cover", "contain", "preserve"] as const).map((fit) => (
            <MenuOption
              key={fit}
              selected={(model.mediaTune?.fit ?? "cover") === fit}
              label={mediaFitLabel(fit)}
              hint={
                fit === "cover"
                  ? "Cubre el área; puede recortar."
                  : fit === "contain"
                    ? "Muestra la imagen completa."
                    : "Mantiene la proporción, sin deformar."
              }
              onClick={() => {
                handlers.onMediaFit?.(fit);
                setMenu(null);
              }}
            />
          ))}
          <MenuOption
            selected={false}
            label="Punto focal"
            hint={`Se guarda aparte para ${Band}.`}
            onClick={() => {
              handlers.onEnterFocal?.();
              setMenu(null);
            }}
          />
        </>
      );
    }
    if (menu === "space") {
      const pad = model.containerTune?.padding;
      const gap = model.containerTune?.gap;
      const showGap = (model.containerContentCount ?? 2) > 1;
      const defaultPad = model.band === "mobile" ? 20 : 28;
      const defaultGap = model.band === "mobile" ? 16 : 20;
      return (
        <>
          <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: SC_VISUAL.chipMuted }}>
            Espaciado en {bandLabel}
          </p>
          <StepperRow
            label="Espacio interior"
            value={pad}
            fallback={defaultPad}
            onChange={(n) => handlers.onContainerPadding?.(n)}
            onAuto={() => handlers.onContainerPaddingAuto?.()}
          />
          {showGap ? (
            <StepperRow
              label="Espacio entre elementos"
              value={gap}
              fallback={defaultGap}
              onChange={(n) => handlers.onContainerGap?.(n)}
              onAuto={() => handlers.onContainerGapAuto?.()}
            />
          ) : null}
          <p className="mt-1.5 mb-1 px-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: SC_VISUAL.chipMuted }}>
            Alineación horizontal
          </p>
          <div className="mb-1 flex items-center gap-1 px-1">
            <div className="flex flex-1 gap-1">
              {(
                [
                  { align: "start" as const, label: "Izquierda", icon: <AlignLeft className="h-3 w-3" /> },
                  { align: "center" as const, label: "Centro horizontal", icon: <AlignCenter className="h-3 w-3" /> },
                  { align: "end" as const, label: "Derecha", icon: <AlignRight className="h-3 w-3" /> },
                ] as const
              ).map(({ align, label, icon }) => (
                <button
                  key={align}
                  type="button"
                  title={label}
                  aria-label={label}
                  className="flex h-7 flex-1 items-center justify-center rounded"
                  style={{
                    background:
                      model.containerTune?.contentAlignX === align
                        ? "rgba(168,255,50,0.18)"
                        : "rgba(255,255,255,0.06)",
                    color: SC_VISUAL.chipFg,
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  {...floatingPressHandlers(() => handlers.onContainerAlign?.(align))}
                >
                  {icon}
                </button>
              ))}
            </div>
            {model.containerTune?.contentAlignX ? (
              <AutoButton onClick={() => handlers.onContainerAlignAuto?.()} />
            ) : null}
          </div>
          <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: SC_VISUAL.chipMuted }}>
            Alineación vertical
          </p>
          <div className="mb-1 flex items-center gap-1 px-1">
            <div className="flex flex-1 gap-1">
              {(
                [
                  { align: "start" as const, label: "Arriba", icon: <AlignVerticalJustifyStart className="h-3 w-3" /> },
                  { align: "center" as const, label: "Centro vertical", icon: <AlignVerticalJustifyCenter className="h-3 w-3" /> },
                  { align: "end" as const, label: "Abajo", icon: <AlignVerticalJustifyEnd className="h-3 w-3" /> },
                ] as const
              ).map(({ align, label, icon }) => (
                <button
                  key={align}
                  type="button"
                  title={label}
                  aria-label={label}
                  className="flex h-7 flex-1 items-center justify-center rounded"
                  style={{
                    background:
                      model.containerTune?.contentAlignY === align
                        ? "rgba(168,255,50,0.18)"
                        : "rgba(255,255,255,0.06)",
                    color: SC_VISUAL.chipFg,
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  {...floatingPressHandlers(() => handlers.onContainerAlignY?.(align))}
                >
                  {icon}
                </button>
              ))}
            </div>
            {model.containerTune?.contentAlignY ? (
              <AutoButton onClick={() => handlers.onContainerAlignYAuto?.()} />
            ) : null}
          </div>
          <StepperRow
            label="Ancho máximo"
            value={model.containerTune?.maxContentWidth}
            step={10}
            onChange={(n) => handlers.onContainerMaxWidth?.(n)}
            onAuto={() => handlers.onContainerMaxWidthAuto?.()}
          />
          <StepperRow
            label="Altura mínima"
            value={model.containerTune?.minHeight}
            step={10}
            onChange={(n) => handlers.onContainerMinHeight?.(n)}
            onAuto={() => handlers.onContainerMinHeightAuto?.()}
          />
        </>
      );
    }
    return (
      <>
        <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: SC_VISUAL.chipMuted }}>
          Ajuste en {bandLabel}
        </p>
        {isItem ? (
          <>
            <MenuOption
              selected={model.itemTune?.hidden === true}
              label={model.itemTune?.hidden ? "Mostrar" : `Ocultar en ${bandLabel}`}
              hint={
                model.itemTune?.hidden
                  ? "Vuelve a mostrarlo en esta vista."
                  : "Sigue visible en Original y en la otra vista."
              }
              onClick={() => {
                handlers.onHide?.(!model.itemTune?.hidden);
                setMenu(null);
              }}
            />
            {model.canReorder ? (
              <>
                <MenuOption
                  selected={false}
                  label="Subir"
                  hint="Una posición antes en la pila. No cambia Original."
                  onClick={() => {
                    handlers.onReorder?.(-1);
                    setMenu(null);
                  }}
                />
                <MenuOption
                  selected={false}
                  label="Bajar"
                  hint="Una posición después en la pila. No cambia Original."
                  onClick={() => {
                    handlers.onReorder?.(1);
                    setMenu(null);
                  }}
                />
              </>
            ) : null}
            {model.showReset ? (
              <MenuOption
                selected={false}
                label="Restablecer elemento"
                hint={`Quita alineación, anchura y visibilidad de este elemento en ${Band}.`}
                onClick={() => {
                  handlers.onResetItem?.();
                  setMenu(null);
                }}
              />
            ) : null}
          </>
        ) : null}
        {isContainer ? (
          <>
            {model.showReset ? (
              <MenuOption
                selected={false}
                label="Restablecer contenedor"
                hint={`Quita alineación, anchura, separación y el comportamiento de este contenedor en ${Band}.`}
                onClick={() => {
                  handlers.onResetContainer?.();
                  setMenu(null);
                }}
              />
            ) : null}
          </>
        ) : null}
      </>
    );
  })();

  const popover =
    menu && host
      ? createPortal(
          <>
            <div
              data-site-creator-floating-ui="true"
              className="fixed inset-0 z-[100055] bg-transparent"
              aria-hidden
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu(null);
              }}
            />
            <div
              ref={popoverRef}
              data-testid="site-creator-refine-popover"
              data-site-creator-floating-ui="true"
              className="site-creator-floating-panel pointer-events-auto fixed z-[100060] w-[248px] rounded-md border p-2 shadow-xl"
              style={{
                left: popoverPos?.left ?? 16,
                top: popoverPos?.top ?? 16,
                background: SC_VISUAL.chipBg,
                borderColor: SC_VISUAL.chipBorder,
                color: SC_VISUAL.chipFg,
              }}
              onPointerDown={stopFloatingCapture}
              onMouseDown={stopFloatingCapture}
              onClick={stopFloatingCapture}
            >
              {popoverInner}
            </div>
          </>,
          host,
        )
      : null;

  return (
    <div
      ref={triggerRef}
      className="site-creator-floating-panel relative flex shrink-0 items-center gap-1 pointer-events-auto"
      data-testid="site-creator-refine"
      data-site-creator-floating-ui="true"
    >
      <div className="flex items-center gap-0.5">
        <AlignIconButton
          label="Alinear a la izquierda"
          active={alignX === "start"}
          onClick={() =>
            isContainer ? handlers.onContainerAlign?.("start") : handlers.onAlignX?.("start")
          }
        >
          <AlignLeft className="h-3 w-3" />
        </AlignIconButton>
        <AlignIconButton
          label="Centrar"
          active={alignX === "center"}
          onClick={() =>
            isContainer ? handlers.onContainerAlign?.("center") : handlers.onAlignX?.("center")
          }
        >
          <AlignCenter className="h-3 w-3" />
        </AlignIconButton>
        <AlignIconButton
          label="Alinear a la derecha"
          active={alignX === "end"}
          onClick={() =>
            isContainer ? handlers.onContainerAlign?.("end") : handlers.onAlignX?.("end")
          }
        >
          <AlignRight className="h-3 w-3" />
        </AlignIconButton>
        {isContainer ? (
          <>
            <AlignIconButton
              label="Arriba"
              active={alignY === "start"}
              onClick={() => handlers.onContainerAlignY?.("start")}
            >
              <AlignVerticalJustifyStart className="h-3 w-3" />
            </AlignIconButton>
            <AlignIconButton
              label="Centro vertical"
              active={alignY === "center"}
              onClick={() => handlers.onContainerAlignY?.("center")}
            >
              <AlignVerticalJustifyCenter className="h-3 w-3" />
            </AlignIconButton>
            <AlignIconButton
              label="Abajo"
              active={alignY === "end"}
              onClick={() => handlers.onContainerAlignY?.("end")}
            >
              <AlignVerticalJustifyEnd className="h-3 w-3" />
            </AlignIconButton>
          </>
        ) : null}
        <ChipButton
          testId="site-creator-refine-width"
          label={`Ancho · ${widthModeLabel(widthMode)}`}
          onClick={() => setMenu((m) => (m === "width" ? null : "width"))}
        />
      </div>
      {isContainer ? (
        <ChipButton
          testId="site-creator-refine-space"
          label="Espacio"
          onClick={() => setMenu((m) => (m === "space" ? null : "space"))}
        />
      ) : null}
      {isMedia ? (
        <ChipButton
          testId="site-creator-refine-fit"
          label={mediaFitLabel(model.mediaTune?.fit ?? "cover")}
          onClick={() => setMenu((m) => (m === "fit" ? null : "fit"))}
        />
      ) : null}
      <button
        type="button"
        data-testid="site-creator-refine-more"
        title="Más ajustes"
        className="flex h-6 w-6 items-center justify-center rounded"
        style={{
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.88)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
        {...floatingPressHandlers(() => setMenu((m) => (m === "more" ? null : "more")))}
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
      {popover}
    </div>
  );
}

function ChipButton({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      className="h-6 max-w-[140px] truncate rounded px-2 text-[10px] font-semibold"
      style={{
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.88)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
      {...floatingPressHandlers(onClick)}
    >
      {label}
    </button>
  );
}

function AlignIconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="flex h-6 w-6 items-center justify-center rounded"
      style={{
        background: active ? "rgba(168,255,50,0.18)" : "rgba(255,255,255,0.06)",
        color: active ? SC_VISUAL.selection : "rgba(255,255,255,0.88)",
        border: active ? "1px solid rgba(168,255,50,0.35)" : "1px solid rgba(255,255,255,0.12)",
      }}
      {...floatingPressHandlers(onClick)}
    >
      {children}
    </button>
  );
}

function MenuOption({
  selected,
  label,
  hint,
  onClick,
}: {
  selected: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left transition hover:bg-white/6"
      {...floatingPressHandlers(onClick)}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold">
        <span className="inline-block w-3 text-center" style={{ color: SC_VISUAL.selection }}>
          {selected ? "✓" : ""}
        </span>
        {label}
      </span>
      {hint ? (
        <span className="pl-4 text-[10px] leading-snug" style={{ color: SC_VISUAL.chipMuted }}>
          {hint}
        </span>
      ) : null}
    </button>
  );
}

function AutoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="h-7 shrink-0 rounded border px-2 text-[9px] font-semibold uppercase tracking-wide"
      style={{
        background: "rgba(255,255,255,0.04)",
        color: SC_VISUAL.chipMuted,
        borderColor: "rgba(255,255,255,0.12)",
      }}
      {...floatingPressHandlers(onClick)}
    >
      Auto
    </button>
  );
}

function StepperRow({
  label,
  value,
  onChange,
  onAuto,
  step = 4,
  fallback = 20,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number) => void;
  onAuto: () => void;
  step?: number;
  fallback?: number;
}) {
  const customized = typeof value === "number";
  const shown = customized ? value : "Auto";
  const base = customized ? value : fallback;
  return (
    <div className="mb-1 flex items-center gap-1 px-1">
      <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: SC_VISUAL.chipMuted }}>
        {label}
      </span>
      <button
        type="button"
        className="h-5 w-5 rounded text-[11px]"
        style={{ background: "rgba(255,255,255,0.06)" }}
        {...floatingPressHandlers(() => onChange(Math.max(0, base - step)))}
      >
        −
      </button>
      <span
        className={`w-10 text-center text-[10px] tabular-nums ${customized ? "font-semibold text-white" : ""}`}
        style={customized ? undefined : { color: SC_VISUAL.chipMuted }}
      >
        {shown}
      </span>
      <button
        type="button"
        className="h-5 w-5 rounded text-[11px]"
        style={{ background: "rgba(255,255,255,0.06)" }}
        {...floatingPressHandlers(() => onChange(base + step))}
      >
        +
      </button>
      <AutoButton onClick={onAuto} />
    </div>
  );
}
