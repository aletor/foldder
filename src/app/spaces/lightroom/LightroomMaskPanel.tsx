"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  Circle,
  Copy,
  Eye,
  Layers,
  Minus,
  Palette,
  Plus,
  SunMedium,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type { DevelopSettings } from "./lightroom-develop-settings";
import type {
  ComponentMode,
  LightroomDevelopDocument,
  MaskAdjustmentLayer,
  MaskComponentType,
  MaskPrimitive,
  MaskTool,
} from "./lightroom-mask-types";
import {
  MASK_TYPE_LABELS,
  componentMode,
  createMaskLayer,
  createMaskPrimitive,
  duplicateMaskPrimitive,
  primaryMaskType,
} from "./lightroom-mask-types";
import type { LightroomDevelopEngine } from "./lightroom-webgl-engine";
import { LightroomDevelopControls } from "./LightroomDevelopControls";
import { RangeSliderDoblePomo } from "./lightroom-ui/RangeSliderDoblePomo";
import { SliderBidireccional } from "./lightroom-ui/SliderBidireccional";
import { LightroomScrubValue } from "./lightroom-ui/LightroomScrubValue";
import { computeRgbHistogram } from "./lightroom-ui/lightroom-histogram";

export type LightroomMaskPanelProps = {
  document: LightroomDevelopDocument;
  activeLayerId: string | null;
  activeTool: MaskTool;
  activeMaskIndex: number;
  brushErase: boolean;
  engine: LightroomDevelopEngine | null;
  onChangeDocument: (doc: LightroomDevelopDocument) => void;
  onSelectLayer: (id: string | null) => void;
  onSelectTool: (tool: MaskTool) => void;
  onSelectMaskIndex: (index: number) => void;
  onToggleBrushErase: () => void;
  onToggleColorEyedropper: () => void;
  colorEyedropperActive?: boolean;
  maskPreview?: boolean;
  onToggleMaskPreview?: () => void;
  onRefresh: () => void;
};

const MASK_TYPES: MaskComponentType[] = ["brush", "linear", "radial", "colorRange", "luminanceRange"];

function maskTypeIcon(type: MaskComponentType | null, size = 12) {
  switch (type) {
    case "brush":
      return <Brush size={size} />;
    case "linear":
      return <TrendingUp size={size} />;
    case "radial":
      return <Circle size={size} />;
    case "colorRange":
      return <Palette size={size} />;
    case "luminanceRange":
      return <SunMedium size={size} />;
    default:
      return <Layers size={size} />;
  }
}

function MaskTypeMenu({
  onSelect,
  onClose,
}: {
  onSelect: (type: MaskComponentType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  return (
    <div ref={ref} className="lightroom-mask-panel__type-menu nodrag" role="menu">
      {MASK_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="menuitem"
          className="lightroom-mask-panel__type-menu-item nodrag"
          onClick={() => onSelect(type)}
        >
          {maskTypeIcon(type, 14)}
          <span>{MASK_TYPE_LABELS[type]}</span>
        </button>
      ))}
    </div>
  );
}

export function LightroomMaskPanel({
  document,
  activeLayerId,
  activeTool,
  activeMaskIndex,
  brushErase,
  engine,
  onChangeDocument,
  onSelectLayer,
  onSelectTool,
  onSelectMaskIndex,
  onToggleBrushErase,
  onToggleColorEyedropper,
  colorEyedropperActive,
  maskPreview,
  onToggleMaskPreview,
  onRefresh,
}: LightroomMaskPanelProps) {
  const activeLayer = document.maskLayers.find((l) => l.id === activeLayerId) ?? null;
  const activeComponent = activeLayer?.masks[activeMaskIndex] ?? null;

  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [componentMenuMode, setComponentMenuMode] = useState<ComponentMode | null>(null);

  const lumaHist = useMemo(() => {
    const pixels = engine?.getSourcePixels();
    const dims = engine?.dimensions;
    if (!pixels || !dims?.width) return undefined;
    return computeRgbHistogram(pixels, dims.width, dims.height).luma;
  }, [engine]);

  const patchLayer = (layerId: string, patch: Partial<MaskAdjustmentLayer>) => {
    onChangeDocument({
      ...document,
      maskLayers: document.maskLayers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    });
  };

  const startDrawing = (layerId: string, maskIndex: number, tool: MaskComponentType) => {
    onSelectLayer(layerId);
    onSelectMaskIndex(maskIndex);
    onSelectTool(tool);
  };

  const createMask = (type: MaskComponentType) => {
    const primitive = createMaskPrimitive(type, "add");
    const layer = createMaskLayer(`Máscara ${document.maskLayers.length + 1}`);
    layer.masks = [primitive];
    onChangeDocument({ ...document, maskLayers: [...document.maskLayers, layer] });
    setCreateMenuOpen(false);
    startDrawing(layer.id, 0, type);
    onRefresh();
  };

  const addComponent = (layerId: string, type: MaskComponentType, mode: ComponentMode) => {
    const layer = document.maskLayers.find((l) => l.id === layerId);
    if (!layer) return;
    const primitive = createMaskPrimitive(type, mode);
    patchLayer(layerId, { masks: [...layer.masks, primitive] });
    setComponentMenuMode(null);
    startDrawing(layerId, layer.masks.length, type);
    onRefresh();
  };

  const removeLayer = (id: string) => {
    onChangeDocument({ ...document, maskLayers: document.maskLayers.filter((l) => l.id !== id) });
    if (activeLayerId === id) {
      onSelectLayer(null);
      onSelectTool("none");
    }
  };

  const removeComponent = (layerId: string, index: number) => {
    const layer = document.maskLayers.find((l) => l.id === layerId);
    if (!layer) return;
    const masks = layer.masks.filter((_, i) => i !== index);
    patchLayer(layerId, { masks });
    if (activeLayerId === layerId) {
      if (masks.length === 0) {
        onSelectTool("none");
        onSelectMaskIndex(0);
      } else {
        const next = Math.min(index, masks.length - 1);
        onSelectMaskIndex(next);
        onSelectTool(masks[next]!.type);
      }
    }
    onRefresh();
  };

  const duplicateActiveComponent = () => {
    if (!activeLayer || !activeComponent) return;
    const dup = duplicateMaskPrimitive(activeComponent);
    const masks = [...activeLayer.masks, dup];
    patchLayer(activeLayer.id, { masks });
    startDrawing(activeLayer.id, masks.length - 1, dup.type);
    onRefresh();
  };

  return (
    <div className="lightroom-mask-panel">
      <div className="lightroom-mask-panel__head">
        <Layers size={14} />
        <span>Máscaras</span>
      </div>

      <div className="lightroom-mask-panel__create-wrap">
        <button
          type="button"
          className="lightroom-mask-panel__create-btn nodrag"
          onClick={() => {
            setCreateMenuOpen((v) => !v);
            setComponentMenuMode(null);
          }}
        >
          <Plus size={14} />
          Crear nueva máscara
        </button>
        {createMenuOpen ? (
          <MaskTypeMenu
            onSelect={createMask}
            onClose={() => setCreateMenuOpen(false)}
          />
        ) : null}
      </div>

      <div className="lightroom-mask-panel__layers">
        {document.maskLayers.map((layer) => {
          const isActive = layer.id === activeLayerId;
          const primary = primaryMaskType(layer);
          return (
            <div key={layer.id} className={`lightroom-mask-panel__layer-block${isActive ? " is-active" : ""}`}>
              <div className="lightroom-mask-panel__layer">
                <button
                  type="button"
                  className="lightroom-mask-panel__layer-btn nodrag"
                  onClick={() => {
                    onSelectLayer(isActive ? null : layer.id);
                    if (!isActive && layer.masks[0]) {
                      onSelectMaskIndex(0);
                      onSelectTool(layer.masks[0].type);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={layer.enabled}
                    title="Visibilidad"
                    onChange={(e) => patchLayer(layer.id, { enabled: e.target.checked })}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="lightroom-mask-panel__layer-icon">{maskTypeIcon(primary)}</span>
                  <span>{layer.name}</span>
                </button>
                <button
                  type="button"
                  className="lightroom-mask-panel__icon-btn nodrag"
                  onClick={() => removeLayer(layer.id)}
                  title="Eliminar máscara"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {isActive ? (
                <div className="lightroom-mask-panel__expanded">
                  <p className="lightroom-mask-panel__subhead">Componentes</p>
                  <div className="lightroom-mask-panel__components">
                    {layer.masks.map((mask, i) => {
                      const mode = componentMode(mask);
                      return (
                        <div
                          key={mask.id}
                          className={`lightroom-mask-panel__component${i === activeMaskIndex ? " is-active" : ""}`}
                        >
                          <button
                            type="button"
                            className="lightroom-mask-panel__component-btn nodrag"
                            onClick={() => startDrawing(layer.id, i, mask.type)}
                          >
                            <span className={`lightroom-mask-panel__badge lightroom-mask-panel__badge--${mode}`}>
                              {mode === "add" ? "AÑADIR" : "RESTAR"}
                            </span>
                            <span className="lightroom-mask-panel__component-type">
                              {maskTypeIcon(mask.type, 11)}
                              {MASK_TYPE_LABELS[mask.type]}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="lightroom-mask-panel__icon-btn nodrag"
                            onClick={() => removeComponent(layer.id, i)}
                            title="Eliminar componente"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="lightroom-mask-panel__component-actions">
                    <div className="lightroom-mask-panel__create-wrap">
                      <button
                        type="button"
                        className="lightroom-mask-panel__action-btn nodrag"
                        onClick={() => {
                          setComponentMenuMode(componentMenuMode === "add" ? null : "add");
                          setCreateMenuOpen(false);
                        }}
                      >
                        <Plus size={12} />
                        Añadir
                      </button>
                      {componentMenuMode === "add" ? (
                        <MaskTypeMenu
                          onSelect={(type) => addComponent(layer.id, type, "add")}
                          onClose={() => setComponentMenuMode(null)}
                        />
                      ) : null}
                    </div>
                    <div className="lightroom-mask-panel__create-wrap">
                      <button
                        type="button"
                        className="lightroom-mask-panel__action-btn nodrag"
                        onClick={() => {
                          setComponentMenuMode(componentMenuMode === "subtract" ? null : "subtract");
                          setCreateMenuOpen(false);
                        }}
                      >
                        <Minus size={12} />
                        Restar
                      </button>
                      {componentMenuMode === "subtract" ? (
                        <MaskTypeMenu
                          onSelect={(type) => addComponent(layer.id, type, "subtract")}
                          onClose={() => setComponentMenuMode(null)}
                        />
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={`lightroom-mask-panel__action-btn nodrag${layer.inverted ? " is-active" : ""}`}
                      onClick={() => patchLayer(layer.id, { inverted: !layer.inverted })}
                    >
                      Invertir
                    </button>
                    <button
                      type="button"
                      className="lightroom-mask-panel__action-btn nodrag"
                      onClick={duplicateActiveComponent}
                      disabled={!activeComponent}
                      title="Duplicar componente activo"
                    >
                      <Copy size={12} />
                      Duplicar
                    </button>
                  </div>

                  {activeComponent ? (
                    <MaskPrimitiveControls
                      mask={activeComponent}
                      lumaHist={lumaHist}
                      onChange={(patch) => {
                        const masks = layer.masks.map((m, i) =>
                          i === activeMaskIndex ? ({ ...m, ...patch } as MaskPrimitive) : m,
                        );
                        patchLayer(layer.id, { masks });
                        onRefresh();
                      }}
                    />
                  ) : null}

                  {activeComponent?.type === "brush" && componentMode(activeComponent) === "add" ? (
                    <button
                      type="button"
                      className="lightroom-mask-panel__action-btn nodrag"
                      onClick={onToggleBrushErase}
                    >
                      {brushErase ? "Modo pintar" : "Modo borrador"}
                    </button>
                  ) : null}

                  {activeTool === "colorRange" ? (
                    <button
                      type="button"
                      className={`lightroom-mask-panel__action-btn nodrag${colorEyedropperActive ? " is-active" : ""}`}
                      onClick={onToggleColorEyedropper}
                    >
                      Cuentagotas color
                    </button>
                  ) : null}

                  <label className="lightroom-develop-controls__row nodrag">
                    <span className="lightroom-develop-controls__label">Cantidad</span>
                    <input
                      type="range"
                      className="lightroom-develop-controls__slider"
                      min={0}
                      max={100}
                      step={0.5}
                      value={Math.round(layer.amount)}
                      onChange={(e) => patchLayer(layer.id, { amount: Number(e.target.value) })}
                    />
                    <LightroomScrubValue
                      value={Math.round(layer.amount)}
                      min={0}
                      max={100}
                      onChange={(v) => patchLayer(layer.id, { amount: v })}
                      onReset={() => patchLayer(layer.id, { amount: 100 })}
                    />
                  </label>

                  {onToggleMaskPreview ? (
                    <label className="lightroom-mask-panel__preview-toggle nodrag">
                      <Eye size={12} />
                      <span>Ver máscara</span>
                      <input
                        type="checkbox"
                        checked={!!maskPreview}
                        onChange={onToggleMaskPreview}
                      />
                    </label>
                  ) : null}

                  <div className="lightroom-mask-panel__divider" />

                  <p className="lightroom-mask-panel__subhead">Ajustes — solo esta máscara</p>
                  <LightroomDevelopControls
                    settings={layer.settings}
                    onChange={(settings: DevelopSettings) => patchLayer(layer.id, { settings })}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {document.maskLayers.length === 0 ? (
        <p className="lightroom-studio__hint">
          Pulsa «Crear nueva máscara» y elige un tipo para empezar a dibujar sobre la imagen.
        </p>
      ) : null}
    </div>
  );
}

function MaskPrimitiveControls({
  mask,
  lumaHist,
  onChange,
}: {
  mask: MaskPrimitive;
  lumaHist?: Uint32Array;
  onChange: (patch: Partial<MaskPrimitive>) => void;
}) {
  return (
    <div className="lightroom-mask-panel__primitive">
      {mask.type === "linear" || mask.type === "radial" ? (
        <SliderBidireccional
          label="Difuminado"
          min={0}
          max={100}
          value={Math.round(mask.feather * 100)}
          onChange={(v) => onChange({ feather: v / 100 })}
        />
      ) : null}
      {mask.type === "linear" || mask.type === "radial" || mask.type === "colorRange" || mask.type === "luminanceRange" ? (
        <label className="lightroom-develop-controls__row nodrag">
          <input type="checkbox" checked={mask.invert} onChange={(e) => onChange({ invert: e.target.checked })} />
          <span>Invertir componente</span>
        </label>
      ) : null}
      {mask.type === "colorRange" ? (
        <>
          <SliderBidireccional label="Tolerancia" value={mask.tolerance} onChange={(v) => onChange({ tolerance: v })} />
          <SliderBidireccional
            label="Suavizado"
            min={0}
            max={100}
            value={Math.round(mask.smoothness * 100)}
            onChange={(v) => onChange({ smoothness: v / 100 })}
          />
          <div
            className="lightroom-mask-panel__swatch"
            style={{
              background: `rgb(${Math.round(mask.color.r * 255)}, ${Math.round(mask.color.g * 255)}, ${Math.round(mask.color.b * 255)})`,
            }}
          />
        </>
      ) : null}
      {mask.type === "luminanceRange" ? (
        <>
          <RangeSliderDoblePomo
            label="Rango luminancia"
            min={0}
            max={100}
            low={mask.min}
            high={mask.max}
            histogram={lumaHist}
            onChange={(min, max) => onChange({ min, max })}
          />
          <SliderBidireccional
            label="Suavizado"
            min={0}
            max={100}
            value={Math.round(mask.smoothness * 100)}
            onChange={(v) => onChange({ smoothness: v / 100 })}
          />
        </>
      ) : null}
      {mask.type === "brush" ? (
        <>
          <SliderBidireccional label="Tamaño" min={0} max={100} value={mask.size} onChange={(v) => onChange({ size: v })} />
          <SliderBidireccional
            label="Dureza"
            min={0}
            max={100}
            value={Math.round(mask.hardness * 100)}
            onChange={(v) => onChange({ hardness: v / 100 })}
          />
          <SliderBidireccional label="Flujo" min={0} max={100} value={Math.round(mask.flow * 100)} onChange={(v) => onChange({ flow: v / 100 })} />
          <SliderBidireccional label="Densidad" min={0} max={100} value={Math.round(mask.density * 100)} onChange={(v) => onChange({ density: v / 100 })} />
        </>
      ) : null}
    </div>
  );
}
