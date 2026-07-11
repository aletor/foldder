"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FOLDDER_CLOSE_STUDIO_EVENT,
  FOLDDER_LEGACY_CLOSE_NODE_STUDIO_EVENT,
  FOLDDER_LEGACY_OPEN_NODE_STUDIO_EVENT,
  FOLDDER_OPEN_STUDIO_EVENT,
  type FoldderStudioEventDetail,
} from "../desktop-studio-events";

export const FOLDDER_STUDIO_BODY_CLASS = "nb-studio-open";
export const FOLDDER_STUDIO_PORTAL_Z = 100090;

const BODY_LOCK_KEY = "__foldderStudioBodyLocks";

type WindowWithStudioLocks = Window & { [BODY_LOCK_KEY]?: number };

function getStudioWindow(): WindowWithStudioLocks | null {
  return typeof window === "undefined" ? null : (window as WindowWithStudioLocks);
}

function acquireStudioBodyLock(): () => void {
  const studioWindow = getStudioWindow();
  if (!studioWindow || typeof document === "undefined") return () => undefined;
  studioWindow[BODY_LOCK_KEY] = (studioWindow[BODY_LOCK_KEY] ?? 0) + 1;
  document.body.classList.add(FOLDDER_STUDIO_BODY_CLASS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    studioWindow[BODY_LOCK_KEY] = Math.max(0, (studioWindow[BODY_LOCK_KEY] ?? 1) - 1);
    if (studioWindow[BODY_LOCK_KEY] === 0) {
      document.body.classList.remove(FOLDDER_STUDIO_BODY_CLASS);
    }
  };
}

export function useStudioBodyLock(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    return acquireStudioBodyLock();
  }, [active]);
}

export type FoldderStudioChrome = "freehand" | "editorial" | "cinematic" | "brain" | "media" | "generator";

export type FoldderStudioNodeManifest = {
  nodeType: string;
  appId?: string;
  label: string;
  chrome: FoldderStudioChrome;
  modulePath: string;
  ownsPortal: boolean;
  description: string;
};

export const STUDIO_NODE_MANIFESTS = {
  designer: {
    nodeType: "designer",
    appId: "designer",
    label: "Designer",
    chrome: "freehand",
    modulePath: "src/app/spaces/designer",
    ownsPortal: false,
    description: "Documento visual multipágina sobre FreehandStudio.",
  },
  guionista: {
    nodeType: "guionista",
    label: "Guionista",
    chrome: "editorial",
    modulePath: "src/app/spaces/GuionistaStudio.tsx",
    ownsPortal: false,
    description: "Editor editorial inteligente con versiones y Generated Media.",
  },
  cine: {
    nodeType: "cine",
    label: "Cine",
    chrome: "cinematic",
    modulePath: "src/app/spaces/CineStudio.tsx",
    ownsPortal: false,
    description: "Preproducción audiovisual, reparto, fondos, storyboard y prompts de frames.",
  },
  brandKit: {
    nodeType: "brandKit",
    label: "BrandKit",
    chrome: "brain",
    modulePath: "src/app/spaces/brandKit/BrandKitStudio.tsx",
    ownsPortal: true,
    description: "ADN de marca editable con procedencia y confirmación por slot.",
  },
  site: {
    nodeType: "site",
    label: "Site",
    chrome: "editorial",
    modulePath: "src/app/spaces/site/SiteStudio.tsx",
    ownsPortal: true,
    description: "Compilador de marca a web: bloques, tema y publish SSG.",
  },
  nanoBanana: {
    nodeType: "nanoBanana",
    appId: "nanoBanana",
    label: "Imagen IA",
    chrome: "generator",
    modulePath: "src/app/spaces/nano-banana/NanoBananaNode.tsx",
    ownsPortal: true,
    description: "Generación y edición de imágenes con referencias.",
  },
  imageCreationAdvanced: {
    nodeType: "imageCreationAdvanced",
    appId: "imageCreationAdvanced",
    label: "Imagen Avanzada",
    chrome: "generator",
    modulePath: "src/app/spaces/image-creation-advanced/ImageCreationAdvancedNode.tsx",
    ownsPortal: true,
    description: "Edición no destructiva de imagen desde master inmutable.",
  },
  geminiVideo: {
    nodeType: "geminiVideo",
    appId: "geminiVideo",
    label: "Video",
    chrome: "generator",
    modulePath: "src/app/spaces/CustomNodes.tsx#GeminiVideoNode",
    ownsPortal: true,
    description: "Generación de vídeo existente; separado del futuro editor de vídeo.",
  },
  vfxGenerator: {
    nodeType: "vfxGenerator",
    appId: "vfxGenerator",
    label: "VFX",
    chrome: "generator",
    modulePath: "src/app/spaces/VfxGeneratorNode.tsx",
    ownsPortal: true,
    description: "Generación VFX existente.",
  },
  painter: {
    nodeType: "painter",
    appId: "painter",
    label: "Freehand",
    chrome: "freehand",
    modulePath: "src/app/spaces/CustomNodes.tsx#PainterNode",
    ownsPortal: true,
    description: "Lienzo libre legacy sobre FreehandStudio.",
  },
} as const satisfies Record<string, FoldderStudioNodeManifest>;

export type FoldderStudioNodeType = keyof typeof STUDIO_NODE_MANIFESTS;

export function getStudioNodeManifest(nodeType: string | undefined): FoldderStudioNodeManifest | undefined {
  if (!nodeType) return undefined;
  return Object.values(STUDIO_NODE_MANIFESTS).find((manifest) => manifest.nodeType === nodeType || ("appId" in manifest && manifest.appId === nodeType));
}

export type StudioNodePortalProps = {
  children: React.ReactNode;
  open?: boolean;
  bodyLock?: boolean;
};

export function StudioNodePortal({ children, open = true, bodyLock = true }: StudioNodePortalProps) {
  useStudioBodyLock(Boolean(open && bodyLock));
  if (!open || typeof document === "undefined") return null;
  return createPortal(<>{children}</>, document.body);
}

export function StudioNodeLoading({ label = "Cargando Studio…" }: { label?: string }) {
  return (
    <StudioNodePortal>
      <div className="fixed inset-0 z-[100090] flex items-center justify-center bg-[#0b0d10] text-[13px] text-zinc-400">
        <span className="animate-pulse">{label}</span>
      </div>
    </StudioNodePortal>
  );
}

type StudioEventDetail = FoldderStudioEventDetail & Record<string, unknown>;

type UseStudioNodeControllerOptions = {
  nodeId: string;
  nodeType: string;
  /** false en preview de arrastre desde librería: sin listeners ni apertura de studio */
  enabled?: boolean;
  openEvents?: string[];
  closeEvents?: string[];
  matchOpen?: (detail: StudioEventDetail) => boolean;
  matchClose?: (detail: StudioEventDetail) => boolean;
  onOpen?: (detail: StudioEventDetail) => void;
  onClose?: (detail: StudioEventDetail) => void;
};

function defaultMatchesNode(nodeId: string, detail: StudioEventDetail): boolean {
  return detail?.nodeId === nodeId;
}

export function useStudioNodeController({
  nodeId,
  nodeType,
  enabled = true,
  openEvents = [],
  closeEvents = [],
  matchOpen,
  matchClose,
  onOpen,
  onClose,
}: UseStudioNodeControllerOptions) {
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const matchOpenRef = useRef(matchOpen);
  const matchCloseRef = useRef(matchClose);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    matchOpenRef.current = matchOpen;
    matchCloseRef.current = matchClose;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
  }, [matchClose, matchOpen, onClose, onOpen]);

  const matchesOpen = useCallback(
    (detail: StudioEventDetail) => (matchOpenRef.current ? matchOpenRef.current(detail) : defaultMatchesNode(nodeId, detail)),
    [nodeId],
  );
  const matchesClose = useCallback(
    (detail: StudioEventDetail) => (matchCloseRef.current ? matchCloseRef.current(detail) : defaultMatchesNode(nodeId, detail)),
    [nodeId],
  );

  const openStudio = useCallback(
    (detail: StudioEventDetail = {}) => {
      setIsStudioOpen(true);
      onOpenRef.current?.(detail);
    },
    [],
  );

  const closeStudio = useCallback(
    (options?: { detail?: StudioEventDetail }) => {
      setIsStudioOpen(false);
      onCloseRef.current?.(options?.detail ?? {});
    },
    [],
  );

  const openEventsKey = openEvents.join("\u0000");
  const closeEventsKey = closeEvents.join("\u0000");
  const openEventNames = useMemo(
    () => Array.from(new Set([FOLDDER_OPEN_STUDIO_EVENT, FOLDDER_LEGACY_OPEN_NODE_STUDIO_EVENT, ...openEvents])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openEventsKey],
  );
  const closeEventNames = useMemo(
    () => Array.from(new Set([FOLDDER_CLOSE_STUDIO_EVENT, FOLDDER_LEGACY_CLOSE_NODE_STUDIO_EVENT, ...closeEvents])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closeEventsKey],
  );

  useEffect(() => {
    if (!enabled) return;
    const handleOpen = (event: Event) => {
      const detail = ((event as CustomEvent<StudioEventDetail>).detail ?? {}) as StudioEventDetail;
      if (!matchesOpen(detail)) return;
      openStudio(detail);
    };
    const handleClose = (event: Event) => {
      const detail = ((event as CustomEvent<StudioEventDetail>).detail ?? {}) as StudioEventDetail;
      if (!matchesClose(detail)) return;
      closeStudio({ detail });
    };
    openEventNames.forEach((eventName) => window.addEventListener(eventName, handleOpen as EventListener));
    closeEventNames.forEach((eventName) => window.addEventListener(eventName, handleClose as EventListener));
    return () => {
      openEventNames.forEach((eventName) => window.removeEventListener(eventName, handleOpen as EventListener));
      closeEventNames.forEach((eventName) => window.removeEventListener(eventName, handleClose as EventListener));
    };
  }, [closeEventNames, closeStudio, enabled, matchesClose, matchesOpen, openEventNames, openStudio]);

  return useMemo(
    () => ({
      isStudioOpen,
      setIsStudioOpen,
      openStudio,
      closeStudio,
    }),
    [closeStudio, isStudioOpen, openStudio],
  );
}
