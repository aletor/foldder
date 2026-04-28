import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node } from "@xyflow/react";

export type SpacesViewerMedia = {
  value: string | null;
  type: "image" | "video";
};

/**
 * Modo ventana del visor de salida (media del nodo), resize vertical, pan/zoom sobre la imagen o vídeo.
 */
export function useSpacesOutputViewer(nodes: Node[]) {
  const [windowMode, setWindowMode] = useState(false);
  const [viewerSourceNodeId, setViewerSourceNodeId] = useState<string | null>(null);
  const [viewerHeight, setViewerHeight] = useState(500);

  const isDraggingViewer = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  const startViewerResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDraggingViewer.current = true;
      dragStartY.current = e.clientY;
      dragStartH.current = viewerHeight;
      const onMove = (ev: PointerEvent) => {
        if (!isDraggingViewer.current) return;
        const delta = ev.clientY - dragStartY.current;
        const newH = Math.min(Math.max(dragStartH.current + delta, 200), Math.round(window.innerHeight * 0.82));
        setViewerHeight(newH);
      };
      const onUp = () => {
        isDraggingViewer.current = false;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [viewerHeight],
  );

  const [viewerTransform, setViewerTransform] = useState({ scale: 1, x: 0, y: 0 });
  const isPanningViewer = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const viewerAreaRef = useRef<HTMLDivElement>(null);

  const onViewerWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = Math.pow(0.998, e.deltaY);
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setViewerTransform((prev) => {
      const newScale = Math.min(Math.max(prev.scale * factor, 0.1), 20);
      const ratio = newScale / prev.scale;
      return {
        scale: newScale,
        x: mx - ratio * (mx - prev.x),
        y: my - ratio * (my - prev.y),
      };
    });
  }, []);

  const onViewerPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isPanningViewer.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { x: 0, y: 0 };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setViewerTransform((prev) => {
      panOrigin.current = { x: prev.x, y: prev.y };
      return prev;
    });
  }, []);

  const onViewerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningViewer.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setViewerTransform((prev) => ({
      ...prev,
      x: panOrigin.current.x + dx,
      y: panOrigin.current.y + dy,
    }));
  }, []);

  const onViewerPointerUp = useCallback(() => {
    isPanningViewer.current = false;
  }, []);

  const onViewerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "a" || e.key === "A") {
      setViewerTransform({ scale: 1, x: 0, y: 0 });
    }
  }, []);

  const finalMedia = useMemo((): SpacesViewerMedia => {
    if (!viewerSourceNodeId) {
      return { value: null, type: "image" };
    }
    const node = nodes.find((n: Node) => n.id === viewerSourceNodeId);
    if (!node) {
      return { value: null, type: "image" };
    }
    const value = typeof node.data?.value === "string" ? node.data.value : null;
    let type: "image" | "video" = "image";
    const nt = node.type as string;
    if (nt === "geminiVideo" || nt === "vfxGenerator" || nt === "grokProcessor") type = "video";
    else if (node.data?.type === "video") type = "video";
    else if (typeof value === "string" && value.startsWith("data:video")) type = "video";
    return { value, type };
  }, [nodes, viewerSourceNodeId]);

  const downloadViewerMedia = useCallback(async () => {
    if (!finalMedia.value) return;
    const ext = finalMedia.type === "video" ? "mp4" : "png";
    const filename = `output.${ext}`;
    const url = finalMedia.value;

    if (url.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } catch {
        window.open(url, "_blank");
      }
    }
    if (viewerSourceNodeId) {
      window.dispatchEvent(
        new CustomEvent("foldder-spaces-viewer-download", { detail: { nodeId: viewerSourceNodeId } }),
      );
    }
  }, [finalMedia, viewerSourceNodeId]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<{ nodeId?: string }>;
      const nid = ce.detail?.nodeId;
      if (!nid) return;
      setViewerSourceNodeId(nid);
      setWindowMode(true);
    };
    window.addEventListener("open-viewer-for-node", onOpen);
    return () => window.removeEventListener("open-viewer-for-node", onOpen);
  }, []);

  useEffect(() => {
    setViewerHeight(Math.max(Math.round(window.innerHeight * 0.5), 400));
  }, []);

  const closeViewer = useCallback(() => {
    setWindowMode(false);
    setViewerSourceNodeId(null);
  }, []);

  return {
    windowMode,
    setWindowMode,
    viewerSourceNodeId,
    setViewerSourceNodeId,
    viewerHeight,
    startViewerResize,
    viewerTransform,
    viewerAreaRef,
    onViewerWheel,
    onViewerPointerDown,
    onViewerPointerMove,
    onViewerPointerUp,
    onViewerKeyDown,
    finalMedia,
    downloadViewerMedia,
    closeViewer,
    isPanningViewerRef: isPanningViewer,
  };
}
