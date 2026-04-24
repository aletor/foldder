"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TOPBAR_GLYPH_BY_NODE_TYPE } from "./TopbarPinIcons";

/** Iconos en la barra inferior — glyph dedicado + pie de etiqueta (icono predominante). */
export const TOPBAR_PIN_ICON_SIZE = 32;

/** Escala en reposo (antes ~½ del pleno; ahora ×1.4 respecto a ese valor → 0.7). */
const DOCK_MIN_SCALE = 0.5 * 1.4;
/** Escala máxima bajo el cursor (pico anterior ×0.7 respecto al pleno de diseño). */
const DOCK_MAX_SCALE = 1.3 * 0.7;
/** Ancho del “bulto” gaussiano en px (vecinos crecen suavemente como en el dock de macOS). */
const DOCK_SIGMA_PX = 54;

/** min-w del chip en rem (debe coincidir con clases Tailwind del chip). */
const CHIP_MIN_W_REM_SIDEBAR = 3.85;
const CHIP_MIN_W_REM_DEFAULT = 3.75;
/** Hueco mínimo entre iconos adyacentes (px). Base ~gap-1.5 +40 %. */
const DOCK_GAP_PX = 6 * 1.4;

/** Vuelta al reposo del dock (sin transición durante el seguimiento del puntero). */
const DOCK_REST_MS = 300;
const DOCK_REST_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";

/** Clic simple en Brain/Foldder abre el panel tras esta espera; si es doble clic, se cancela y solo se añade el nodo. */
const TOPBAR_PANEL_SINGLE_CLICK_OPEN_DELAY_MS = 280;

/** Alto fijo del strip (tamaño “reposo” ~ icono pequeño); el zoom crece hacia arriba con overflow visible. */
const DOCK_STRIP_H_SIDEBAR = "min-h-[2.7rem] h-[2.7rem]";
const DOCK_STRIP_H_DEFAULT = "min-h-[2.6rem] h-[2.6rem]";

/** Fracción del ancho visual del chip en reposo usada como padding horizontal del recuadro. */
const DOCK_FRAME_PAD_X_FRAC = 0.14;
/** Borde del marco: puntos finos (1px). */
const DOCK_FRAME_BOX =
  "rounded-xl border border-dotted border-white/35 [border-width:1px] bg-white/[0.08] shadow-sm backdrop-blur-xl";

/** Centros en coords de fila [0..wRest] con todos los iconos a escala reposo (para la Gaussiana). */
function dockRestCentersPx(n: number, chipWpx: number, gapPx: number): { centers: number[]; wRest: number } {
  const hMin = (chipWpx * DOCK_MIN_SCALE) / 2;
  const centers: number[] = [hMin];
  for (let i = 0; i < n - 1; i++) {
    centers.push(centers[i] + 2 * hMin + gapPx);
  }
  const wRest = centers[n - 1] + hMin;
  return { centers, wRest };
}

/** Posiciones sin solape: mitades anchas h[i] = chipW*s/2; c[i+1] = c[i] + h[i] + gap + h[i+1]. */
function dockLayoutSpreadPx(
  scales: number[],
  chipWpx: number,
  gapPx: number,
): { lefts: number[]; halfWidths: number[]; totalWidth: number } {
  const n = scales.length;
  const halfW = scales.map((s) => (chipWpx * s) / 2);
  const c: number[] = [halfW[0]];
  for (let i = 0; i < n - 1; i++) {
    c.push(c[i] + halfW[i] + gapPx + halfW[i + 1]);
  }
  const left0 = c[0] - halfW[0];
  const totalWidth = c[n - 1] + halfW[n - 1] - left0;
  const lefts = c.map((ci, i) => ci - halfW[i] - left0);
  return { lefts, halfWidths: halfW, totalWidth };
}

/**
 * Accesos fijos (no personalizables): Brain → Design → Image → PhotoRoom → Video → VFX → Foldder. (Presenter solo en la librería.)
 * Brain y Foldder: clic → panel fullscreen (tras breve espera); doble clic → nodo projectBrain / projectAssets en el lienzo. Resto: doble clic añade el nodo del pin. Orden estable.
 */
export const TOPBAR_FIXED_PIN_TYPES = [
  "brain",
  "designer",
  "nanoBanana",
  "photoRoom",
  "geminiVideo",
  "vfxGenerator",
  "files",
] as const;

/** Tooltip (nombre completo) vs etiqueta corta bajo el icono. */
const TOPBAR_PIN_UI: Record<
  (typeof TOPBAR_FIXED_PIN_TYPES)[number],
  { title: string; shortLabel: string }
> = {
  brain: { title: "Brain — marca y conocimiento", shortLabel: "Brain" },
  designer: { title: "Designer Studio", shortLabel: "Design" },
  nanoBanana: { title: "Image Generator", shortLabel: "Image" },
  photoRoom: { title: "PhotoRoom — retoque de imagen", shortLabel: "Room" },
  geminiVideo: { title: "Video Generator", shortLabel: "Video" },
  vfxGenerator: { title: "VFX Generator", shortLabel: "VFX" },
  files: { title: "Foldder — multimedia del proyecto", shortLabel: "Foldder" },
};

type TopbarPinsProps = {
  /** Clic en «Brain»: identidad + fuente de conocimiento. */
  onBrainClick?: () => void;
  /** Clic en «Assets»: biblioteca multimedia (importados / generados). */
  onAssetsClick?: () => void;
  /** Doble clic: añadir nodo (Brain → projectBrain, Assets → projectAssets, resto → tipo del pin). */
  onPinDoubleClick?: (nodeType: string) => void;
  /** Arrastre desde la librería: sin tooltip hover encima de la barra */
  paletteDragActive?: boolean;
  /** Dentro de una barra con borde padre: sin caja interior duplicada */
  embedded?: boolean;
  /** Segunda fila bajo el agente: ancho según contenido, centrado, estilo librería */
  fullWidthRow?: boolean;
};

function PinHoverCard({ label }: { label: string }) {
  return (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 z-[10020] mb-0.5 flex w-max max-w-[min(260px,78vw)] -translate-x-1/2 flex-col items-center opacity-0 translate-y-1 scale-[0.98] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/pin:opacity-100 group-hover/pin:translate-y-0 group-hover/pin:scale-100"
      role="tooltip"
    >
      <div className="relative rounded-lg border border-white/20 bg-black/55 px-2.5 py-1 text-center shadow-sm backdrop-blur-md">
        <p className="text-[11px] font-bold leading-tight tracking-tight text-white">{label}</p>
      </div>
      <div
        className="-mt-px h-1.5 w-1.5 rotate-45 border border-white/20 border-t-0 border-l-0 bg-black/55 shadow-sm backdrop-blur-md"
        aria-hidden
      />
    </div>
  );
}

type PinChipProps = {
  type: (typeof TOPBAR_FIXED_PIN_TYPES)[number];
  title: string;
  shortLabel: string;
  iconSize: number;
  chipClassName: string;
  captionClassName: string;
  onBrainClick?: () => void;
  onAssetsClick?: () => void;
  onPinDoubleClick?: (nodeType: string) => void;
  paletteDragActive?: boolean;
};

function TopbarPinChip({
  type,
  title,
  shortLabel,
  iconSize,
  chipClassName,
  captionClassName,
  onBrainClick,
  onAssetsClick,
  onPinDoubleClick,
  paletteDragActive = false,
}: PinChipProps) {
  const Glyph = TOPBAR_GLYPH_BY_NODE_TYPE[type];
  const isBrain = type === "brain";
  const isAssets = type === "files";
  const brainOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assetsOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (brainOpenTimerRef.current) clearTimeout(brainOpenTimerRef.current);
      if (assetsOpenTimerRef.current) clearTimeout(assetsOpenTimerRef.current);
    };
  }, []);

  return (
    <div className="relative shrink-0 group/pin pt-3 -mt-3 pb-0.5 overflow-visible">
      <button
        type="button"
        className={
          isAssets
            ? `${chipClassName} !bg-transparent !border-[#b081f1] hover:!bg-transparent active:!bg-transparent focus:!bg-transparent hover:!border-[#b081f1] hover:ring-[#b081f1]/60`
            : chipClassName
        }
        style={isAssets ? { backgroundColor: "transparent" } : undefined}
        aria-label={
          isBrain
            ? `${title}. Clic para abrir studio (marca y conocimiento). Doble clic para añadir el nodo Brain al lienzo.`
            : isAssets
              ? `${title}. Clic para abrir la biblioteca multimedia. Doble clic para añadir el nodo Foldder al lienzo.`
              : `${title}. Doble clic para añadir al lienzo.`
        }
        onClick={
          isBrain
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                const detail = e.nativeEvent.detail;
                if (detail >= 2) {
                  if (brainOpenTimerRef.current) {
                    clearTimeout(brainOpenTimerRef.current);
                    brainOpenTimerRef.current = null;
                  }
                  return;
                }
                if (brainOpenTimerRef.current) clearTimeout(brainOpenTimerRef.current);
                brainOpenTimerRef.current = setTimeout(() => {
                  brainOpenTimerRef.current = null;
                  onBrainClick?.();
                }, TOPBAR_PANEL_SINGLE_CLICK_OPEN_DELAY_MS);
              }
            : isAssets
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const detail = e.nativeEvent.detail;
                  if (detail >= 2) {
                    if (assetsOpenTimerRef.current) {
                      clearTimeout(assetsOpenTimerRef.current);
                      assetsOpenTimerRef.current = null;
                    }
                    return;
                  }
                  if (assetsOpenTimerRef.current) clearTimeout(assetsOpenTimerRef.current);
                  assetsOpenTimerRef.current = setTimeout(() => {
                    assetsOpenTimerRef.current = null;
                    onAssetsClick?.();
                  }, TOPBAR_PANEL_SINGLE_CLICK_OPEN_DELAY_MS);
                }
              : undefined
        }
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (brainOpenTimerRef.current) {
            clearTimeout(brainOpenTimerRef.current);
            brainOpenTimerRef.current = null;
          }
          if (assetsOpenTimerRef.current) {
            clearTimeout(assetsOpenTimerRef.current);
            assetsOpenTimerRef.current = null;
          }
          const nodeType = isBrain ? "projectBrain" : isAssets ? "projectAssets" : type;
          onPinDoubleClick?.(nodeType);
        }}
      >
        <Glyph size={iconSize} className={isAssets ? "shrink-0" : "shrink-0 text-white"} />
        <span className={captionClassName}>{shortLabel}</span>
      </button>
      {!paletteDragActive && <PinHoverCard label={title} />}
    </div>
  );
}

export function TopbarPins({
  onBrainClick,
  onAssetsClick,
  onPinDoubleClick,
  paletteDragActive = false,
  embedded = false,
  fullWidthRow = false,
}: TopbarPinsProps) {
  const pinRowSidebarStyle = embedded && fullWidthRow;
  const rowRef = useRef<HTMLDivElement>(null);
  const [remPx, setRemPx] = useState(16);
  const [mouseX, setMouseX] = useState<number | null>(null);

  useLayoutEffect(() => {
    const r = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (!Number.isNaN(r) && r > 0) setRemPx(r);
  }, []);

  const pinCount = TOPBAR_FIXED_PIN_TYPES.length;
  const chipWpx = pinRowSidebarStyle ? CHIP_MIN_W_REM_SIDEBAR * remPx : CHIP_MIN_W_REM_DEFAULT * remPx;

  const { centers: restCenterPx, wRest } = useMemo(
    () => dockRestCentersPx(pinCount, chipWpx, DOCK_GAP_PX),
    [pinCount, chipWpx],
  );

  const scales = useMemo(() => {
    if (mouseX === null) {
      return Array.from({ length: pinCount }, () => DOCK_MIN_SCALE);
    }
    const denom = 2 * DOCK_SIGMA_PX * DOCK_SIGMA_PX;
    const gaussFromMxRest = (mxRest: number) =>
      restCenterPx.map((cx) => {
        const d = mxRest - cx;
        const g = Math.exp(-(d * d) / denom);
        return DOCK_MIN_SCALE + (DOCK_MAX_SCALE - DOCK_MIN_SCALE) * g;
      });

    let rowW = wRest;
    let scalesIter = Array.from({ length: pinCount }, () => DOCK_MIN_SCALE);
    for (let iter = 0; iter < 3; iter++) {
      const u = Math.min(1, Math.max(0, mouseX / Math.max(rowW, 1)));
      const mxRest = u * wRest;
      scalesIter = gaussFromMxRest(mxRest);
      rowW = dockLayoutSpreadPx(scalesIter, chipWpx, DOCK_GAP_PX).totalWidth;
    }
    return scalesIter;
  }, [mouseX, pinCount, restCenterPx, wRest, chipWpx]);

  const { lefts, halfWidths, totalWidth } = useMemo(
    () => dockLayoutSpreadPx(scales, chipWpx, DOCK_GAP_PX),
    [scales, chipWpx],
  );

  const onRowMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const row = rowRef.current;
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    setMouseX(e.clientX - rowRect.left);
  };

  const onRowMouseLeave = () => setMouseX(null);

  /**
   * Durante el seguimiento del ratón, `scales` y `left` cambian cada frame: si hay
   * `transition` en CSS, cada icono interpola con retraso distinto y parece “desincronizado”.
   * Sin transición mientras hay puntero; solo al salir animamos vuelta al reposo.
   */
  const tracking = mouseX !== null;
  const dockMoveTransition = tracking
    ? "none"
    : `left ${DOCK_REST_MS}ms ${DOCK_REST_EASE}, width ${DOCK_REST_MS}ms ${DOCK_REST_EASE}`;
  const dockScaleTransition = tracking ? "none" : `transform ${DOCK_REST_MS}ms ${DOCK_REST_EASE}`;
  const dockRowWidthTransition = tracking ? "none" : `width ${DOCK_REST_MS}ms ${DOCK_REST_EASE}`;

  const captionClass =
    "mt-0.5 max-w-[4rem] text-center text-[6px] font-medium leading-none tracking-wide text-white uppercase sm:text-[6.5px]";

  const chipEmbedded =
    "flex min-h-[3.85rem] min-w-[3.85rem] max-w-[4.25rem] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/30 bg-white/15 px-1 py-1.5 transition-all duration-150 hover:bg-white/25 hover:ring-2 hover:ring-inset hover:ring-white/45 select-none";
  const chipDefault =
    "flex min-h-[3.75rem] min-w-[3.75rem] max-w-[4.1rem] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-white/20 bg-white/[0.12] px-1 py-1.5 transition-all duration-150 hover:bg-white/[0.2] hover:ring-2 hover:ring-inset hover:ring-white/40 select-none";

  const dockStripH = pinRowSidebarStyle ? DOCK_STRIP_H_SIDEBAR : DOCK_STRIP_H_DEFAULT;

  /** Padding horizontal del recuadro ≈ proporcional al ancho del icono en reposo. */
  const dockFramePadXPx = chipWpx * DOCK_MIN_SCALE * DOCK_FRAME_PAD_X_FRAC;

  return (
    <div
      data-foldder-topbar-pins
      className={
        embedded && fullWidthRow
          ? `pointer-events-auto relative z-[1] mx-auto box-border flex w-max max-w-full items-center justify-center overflow-visible py-1 ${DOCK_FRAME_BOX}`
          : embedded
            ? "pointer-events-auto relative z-[1] flex min-h-0 min-w-0 flex-[1.15] items-center justify-start px-1"
            : "pointer-events-auto relative z-[1] box-border flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-visible px-1.5"
      }
      style={
        embedded && fullWidthRow
          ? {
              paddingLeft: dockFramePadXPx,
              paddingRight: dockFramePadXPx,
            }
          : undefined
      }
    >
      <div
        ref={rowRef}
        onMouseMove={onRowMouseMove}
        onMouseLeave={onRowMouseLeave}
        className={
          embedded && fullWidthRow
            ? `relative ${dockStripH} shrink-0 overflow-visible`
            : embedded
              ? `relative ${dockStripH} max-w-none shrink-0 overflow-visible px-0.5`
              : `relative ${dockStripH} box-border shrink-0 overflow-visible py-1 ${DOCK_FRAME_BOX}`
        }
        style={{
          width: Math.max(totalWidth, 1),
          transition: dockRowWidthTransition,
          ...(!embedded
            ? {
                paddingLeft: dockFramePadXPx,
                paddingRight: dockFramePadXPx,
              }
            : {}),
        }}
        role="toolbar"
        aria-label="Accesos directos: Brain, Design, Image, PhotoRoom, Video, VFX, Foldder. Brain y Foldder: clic abre el panel; doble clic añade el nodo en el lienzo. En el resto, doble clic para añadir al lienzo."
      >
        {TOPBAR_FIXED_PIN_TYPES.map((type, i) => {
          const ui = TOPBAR_PIN_UI[type];
          const useSidebarChips = pinRowSidebarStyle;
          const w = halfWidths[i] * 2;
          return (
            <div
              key={type}
              data-dock-pin
              className={`absolute bottom-0 overflow-visible ${dockStripH}`}
              style={{
                left: lefts[i],
                width: w,
                transition: dockMoveTransition,
              }}
            >
              <div className="pointer-events-none flex h-full w-full items-end justify-center">
                <div
                  className="pointer-events-auto origin-bottom will-change-transform"
                  style={{
                    transform: `scale(${scales[i] ?? DOCK_MIN_SCALE})`,
                    transition: dockScaleTransition,
                  }}
                >
                  <TopbarPinChip
                    type={type}
                    title={ui.title}
                    shortLabel={ui.shortLabel}
                    iconSize={useSidebarChips ? TOPBAR_PIN_ICON_SIZE : 28}
                    chipClassName={useSidebarChips ? chipEmbedded : chipDefault}
                    captionClassName={captionClass}
                    onBrainClick={onBrainClick}
                    onAssetsClick={onAssetsClick}
                    onPinDoubleClick={onPinDoubleClick}
                    paletteDragActive={paletteDragActive}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
