"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { DesignerStudioApi, FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import {
  applyDesignerImageDisplayUrls,
  collectAllDesignerImageS3Keys,
  collectPendingDesignerOptimizations,
  createOptVersionForDesignerAsset,
  presignKnowledgeFileKeys,
} from "./designer-optimize-scheduler";

export type DesignerOptimizeProgressState = {
  visible: boolean;
  currentFileLabel: string;
  done: number;
  total: number;
  activeFrameId: string | null;
};

type Params = {
  studioApiRef: MutableRefObject<DesignerStudioApi | null>;
  pagesRef: MutableRefObject<DesignerPageState[]>;
  activeIdxRef: MutableRefObject<number>;
  setPages: React.Dispatch<React.SetStateAction<DesignerPageState[]>>;
  designerSpaceId: string | null;
  autoImageOptimization: boolean;
};

/**
 * Presign HR/OPT, cola de generación OPT en background y parcheo de `imageFrameContent` en el lienzo.
 */
export function useDesignerImagePipeline({
  studioApiRef,
  pagesRef,
  activeIdxRef,
  setPages,
  designerSpaceId,
  autoImageOptimization,
}: Params): {
  designerOptimizeProgress: DesignerOptimizeProgressState;
  refreshDisplayForAllPages: (snapshot: DesignerPageState[], useOpt: boolean) => Promise<void>;
} {
  const [designerOptimizeProgress, setDesignerOptimizeProgress] = useState<DesignerOptimizeProgressState>({
    visible: false,
    currentFileLabel: "",
    done: 0,
    total: 0,
    activeFrameId: null,
  });
  const optimizeLockRef = useRef(false);
  const optimizeDoneCountRef = useRef(0);
  const optimizeBatchTotalRef = useRef(0);

  const applyImageFramesToCanvasPage = useCallback((page: DesignerPageState) => {
    const api = studioApiRef.current;
    if (!api) return;
    const walk = (objs: FreehandObject[]) => {
      for (const o of objs) {
        if (o.type === "booleanGroup") walk(o.children);
        else if (o.type === "clippingContainer") {
          walk([o.mask as FreehandObject]);
          walk(o.content);
        } else if (o.isImageFrame && o.imageFrameContent) {
          api.patchObject(o.id, { imageFrameContent: { ...o.imageFrameContent } });
        }
      }
    };
    walk(page.objects ?? []);
  }, []);

  const refreshDisplayForAllPages = useCallback(
    async (snapshot: DesignerPageState[], useOpt: boolean) => {
      const keys = collectAllDesignerImageS3Keys(snapshot);
      if (keys.length === 0) return;
      const urls = await presignKnowledgeFileKeys(keys);
      const next = applyDesignerImageDisplayUrls(snapshot, useOpt, urls);
      setPages(next);
      queueMicrotask(() => {
        const idx = activeIdxRef.current;
        const pg = next[idx];
        if (pg) applyImageFramesToCanvasPage(pg);
      });
    },
    [activeIdxRef, applyImageFramesToCanvasPage, setPages],
  );

  useEffect(() => {
    void refreshDisplayForAllPages(pagesRef.current, autoImageOptimization);
  }, [autoImageOptimization, refreshDisplayForAllPages]);

  useEffect(() => {
    if (!autoImageOptimization) {
      setDesignerOptimizeProgress({
        visible: false,
        currentFileLabel: "",
        done: 0,
        total: 0,
        activeFrameId: null,
      });
      optimizeDoneCountRef.current = 0;
      optimizeBatchTotalRef.current = 0;
      return;
    }
    const id = window.setInterval(() => {
      void (async () => {
        if (optimizeLockRef.current) return;
        const activePid = pagesRef.current[activeIdxRef.current]?.id ?? null;
        const pending = collectPendingDesignerOptimizations(pagesRef.current, activePid);
        if (pending.length === 0) {
          optimizeDoneCountRef.current = 0;
          optimizeBatchTotalRef.current = 0;
          setDesignerOptimizeProgress((p) =>
            p.visible
              ? { visible: false, currentFileLabel: "", done: 0, total: 0, activeFrameId: null }
              : p,
          );
          return;
        }
        if (optimizeBatchTotalRef.current === 0) {
          optimizeBatchTotalRef.current = pending.length;
          optimizeDoneCountRef.current = 0;
        }
        optimizeLockRef.current = true;
        const item = pending[0]!;
        const total = optimizeBatchTotalRef.current;
        setDesignerOptimizeProgress({
          visible: true,
          currentFileLabel: item.label,
          done: optimizeDoneCountRef.current,
          total,
          activeFrameId: item.frameId,
        });
        try {
          const result = await createOptVersionForDesignerAsset(
            pagesRef.current,
            item,
            designerSpaceId,
            undefined,
          );
          if (!result.ok) {
            console.warn("[Designer] HR no está en el bucket; se omite OPT:", item.hrKey);
          }
          await refreshDisplayForAllPages(result.pages, result.ok ? true : autoImageOptimization);
          optimizeDoneCountRef.current += 1;
          const still = collectPendingDesignerOptimizations(
            pagesRef.current,
            pagesRef.current[activeIdxRef.current]?.id ?? null,
          ).length;
          if (still === 0) {
            optimizeDoneCountRef.current = 0;
            optimizeBatchTotalRef.current = 0;
            setDesignerOptimizeProgress({
              visible: false,
              currentFileLabel: "",
              done: 0,
              total: 0,
              activeFrameId: null,
            });
          } else {
            setDesignerOptimizeProgress({
              visible: true,
              currentFileLabel: item.label,
              done: optimizeDoneCountRef.current,
              total,
              activeFrameId: null,
            });
          }
        } catch (e) {
          console.error("[Designer] auto-optimize", e);
        } finally {
          optimizeLockRef.current = false;
        }
      })();
    }, 900);
    return () => window.clearInterval(id);
  }, [autoImageOptimization, designerSpaceId, refreshDisplayForAllPages]);

  return { designerOptimizeProgress, refreshDisplayForAllPages };
}
