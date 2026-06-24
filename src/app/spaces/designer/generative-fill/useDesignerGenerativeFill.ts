"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignerStudioApi, FreehandObject } from "../../FreehandStudio";
import type { DesignerPageState } from "../DesignerNode";
import { getPageDimensions } from "../../indesign/page-formats";
import { solidFill } from "../../freehand/fill";
import type { GenerativeFillCorrection, GenerativeFillRect } from "@/lib/designer/generative-fill/types";
import { requestGenerativeFill } from "./client";
import {
  GENERATIVE_FILL_PANEL_DEFAULTS,
  type DesignerGenerativeFillPanelProps,
} from "./DesignerGenerativeFillPanel";

function genLayerId(): string {
  return `gf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

type UseDesignerGenerativeFillArgs = {
  activePage: DesignerPageState | undefined;
  activePageIndex: number;
  studioApiRef: React.MutableRefObject<DesignerStudioApi | null>;
  setPages: React.Dispatch<React.SetStateAction<DesignerPageState[]>>;
  activeIdxRef: React.MutableRefObject<number>;
};

export function useDesignerGenerativeFill({
  activePage,
  activePageIndex,
  studioApiRef,
  setPages,
  activeIdxRef,
}: UseDesignerGenerativeFillArgs): {
  panelProps: DesignerGenerativeFillPanelProps;
  generativeFillBridge: {
    selections: GenerativeFillRect[];
    onSelectionsChange: (next: GenerativeFillRect[]) => void;
  };
} {
  const [selections, setSelections] = useState<GenerativeFillRect[]>([]);
  const [prompt, setPrompt] = useState(GENERATIVE_FILL_PANEL_DEFAULTS.prompt);
  const [feather, setFeather] = useState(GENERATIVE_FILL_PANEL_DEFAULTS.feather);
  const [contextBleed, setContextBleed] = useState(GENERATIVE_FILL_PANEL_DEFAULTS.contextBleed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageIdRef = useRef(activePage?.id);

  useEffect(() => {
    if (pageIdRef.current !== activePage?.id) {
      pageIdRef.current = activePage?.id;
      setSelections([]);
      setError(null);
    }
  }, [activePage?.id]);

  const onGenerate = useCallback(async () => {
    if (!activePage || selections.length === 0) return;
    const api = studioApiRef.current;
    if (!api?.getNodePreviewPngDataUrl) {
      setError("El lienzo no está listo para exportar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const composite = await api.getNodePreviewPngDataUrl({ fullResolution: true });
      if (!composite) {
        throw new Error("No se pudo capturar el composite del pliego.");
      }
      const pageDims = getPageDimensions(activePage);
      const response = await requestGenerativeFill({
        composite,
        selections,
        pageWidth: pageDims.width,
        pageHeight: pageDims.height,
        prompt: prompt.trim() || undefined,
        feather,
        contextBleed,
      });

      const layerId = response.correction.resultLayerId || genLayerId();
      const correction: GenerativeFillCorrection = {
        ...response.correction,
        resultLayerId: layerId,
      };

      const newObj = {
        id: layerId,
        type: "image" as const,
        x: response.layer.x,
        y: response.layer.y,
        width: Math.max(1, response.layer.w),
        height: Math.max(1, response.layer.h),
        fill: solidFill("none"),
        stroke: "none",
        strokeWidth: 0,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        strokeDasharray: "",
        opacity: 1,
        blendMode: "normal" as const,
        rotation: 0,
        visible: true,
        locked: false,
        name: "Relleno generativo",
        src: response.resultPng,
        intrinsicRatio: response.layer.w / Math.max(response.layer.h, 1),
        imagePreserveAspectRatio: "none",
        imageAssetMeta: {
          fileName: "Relleno generativo",
          mimeType: "image/png",
          byteSize: 0,
          pixelWidth: Math.round(response.layer.w),
          pixelHeight: Math.round(response.layer.h),
          generatedByAi: true,
          generatedByAiSource: "generative-fill",
        },
      } satisfies FreehandObject;

      api.addObject(newObj);
      api.setSelectedIds(new Set([layerId]));

      const idx = activeIdxRef.current;
      setPages((prev) => {
        const n = [...prev];
        const p = n[idx];
        if (!p) return prev;
        const corrections = [...(p.generativeFillCorrections ?? []), correction];
        n[idx] = { ...p, generativeFillCorrections: corrections };
        return n;
      });

      setSelections([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el relleno");
    } finally {
      setBusy(false);
    }
  }, [
    activePage,
    activeIdxRef,
    contextBleed,
    feather,
    prompt,
    selections,
    setPages,
    studioApiRef,
  ]);

  const panelProps: DesignerGenerativeFillPanelProps = {
    selections,
    prompt,
    feather,
    contextBleed,
    busy,
    error,
    onPromptChange: setPrompt,
    onFeatherChange: setFeather,
    onContextBleedChange: setContextBleed,
    onClearSelections: () => setSelections([]),
    onGenerate: () => void onGenerate(),
  };

  return {
    panelProps,
    generativeFillBridge: {
      selections,
      onSelectionsChange: setSelections,
    },
  };
}
