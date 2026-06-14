"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { easeCircleOut, easeExpOut } from "d3-ease";
import { Renderer, Program, Mesh, Triangle, Texture, Transform } from "ogl";
import type { CanvasBackgroundOption } from "./canvas-backgrounds";
import { resolveCanvasBackgroundSelection } from "./canvas-backgrounds";
import { useInputMode } from "./input-mode-context";

type Props = {
  activeId: string;
  options: CanvasBackgroundOption[];
  solidColor?: string;
};

function useWallpaperTargetUrl(activeId: string, options: CanvasBackgroundOption[], solidColor?: string): string {
  return useMemo(() => {
    const selection = resolveCanvasBackgroundSelection(activeId, solidColor ?? "", options);
    return selection.kind === "image" ? selection.url : "";
  }, [activeId, options, solidColor]);
}

function CanvasSolidColorBackground({ color }: { color: string }) {
  const [displayColor, setDisplayColor] = useState(color);
  const [incomingColor, setIncomingColor] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (color === displayColor) return;
    if (incomingColor === color) return;
    setAnimKey((key) => key + 1);
    setIncomingColor(color);
  }, [color, displayColor, incomingColor]);

  const onIncomingEnd = () => {
    setIncomingColor((current) => {
      if (current) setDisplayColor(current);
      return null;
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-0 isolate foldder-canvas-wallpaper-layer">
      <div
        className="absolute inset-0 transition-colors duration-300"
        style={{ backgroundColor: displayColor }}
        aria-hidden
      />
      {incomingColor ? (
        <div
          key={animKey}
          className="foldder-canvas-bg-incoming pointer-events-none absolute inset-0"
          style={{ backgroundColor: incomingColor }}
          onAnimationEnd={onIncomingEnd}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

const CLEAR = [248 / 255, 250 / 255, 252 / 255, 1] as const;
const TRANSITION_MS = 1120;

/** Cover dentro del contenedor del lienzo — sin `fixed` (provoca parpadeo al resize). */
function canvasWallpaperCoverStyle(url: string): React.CSSProperties {
  return {
    backgroundColor: "#f8fafc",
    backgroundImage: url ? `url("${url}")` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
}

const bgLayerStyle = canvasWallpaperCoverStyle;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

const VERT = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
uniform vec2 uResolution;
uniform vec2 uTex0Size;
uniform vec2 uTex1Size;
varying vec2 vUv0;
varying vec2 vUv1;

vec2 resizeUvCover(vec2 uv, vec2 texSize, vec2 resolution) {
  vec2 ratio = vec2(
    min((resolution.x / resolution.y) / (texSize.x / texSize.y), 1.0),
    min((resolution.y / resolution.x) / (texSize.y / texSize.x), 1.0)
  );
  return vec2(
    uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
    uv.y * ratio.y + (1.0 - ratio.y) * 0.5
  );
}

void main() {
  vUv0 = resizeUvCover(uv, uTex0Size, uResolution);
  vUv1 = resizeUvCover(uv, uTex1Size, uResolution);
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform float uMix;
uniform float uBulge;
uniform vec2 uCenter;
varying vec2 vUv0;
varying vec2 vUv1;

vec2 bulgeUv(vec2 uv, vec2 center, float amount) {
  if (amount < 0.001) return uv;
  uv -= center;
  float radius = 0.52;
  float dist = length(uv) / radius;
  float distPow = dist * dist;
  float strengthAmount = 1.0 + amount * (0.22 / (1.0 + distPow * 2.5));
  uv *= strengthAmount;
  uv += center;
  return uv;
}

void main() {
  vec2 c0 = bulgeUv(vUv0, uCenter, uBulge);
  vec2 c1 = bulgeUv(vUv1, uCenter, uBulge);
  vec4 col0 = texture2D(uTex0, c0);
  vec4 col1 = texture2D(uTex1, c1);
  float t = smoothstep(0.0, 1.0, uMix);
  gl_FragColor = mix(col0, col1, t);
}
`;

function CanvasWallpaperCssFallback({ activeId, options, solidColor }: Props) {
  const targetUrl = useWallpaperTargetUrl(activeId, options, solidColor);
  const [displayUrl, setDisplayUrl] = useState(targetUrl);
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (targetUrl === displayUrl) return;
    if (incomingUrl === targetUrl) return;
    setAnimKey((k) => k + 1);
    setIncomingUrl(targetUrl);
  }, [targetUrl, displayUrl, incomingUrl]);

  const onIncomingEnd = () => {
    setIncomingUrl((cur) => {
      if (cur) setDisplayUrl(cur);
      return null;
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-0 isolate foldder-canvas-wallpaper-layer">
      <div style={bgLayerStyle(displayUrl)} className="absolute inset-0" aria-hidden />
      {incomingUrl ? (
        <div
          key={animKey}
          className="foldder-canvas-bg-incoming pointer-events-none absolute inset-0"
          style={bgLayerStyle(incomingUrl)}
          onAnimationEnd={onIncomingEnd}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

type GlApi = {
  renderer: Renderer;
  program: Program;
  mesh: Mesh;
  scene: Transform;
  tex0: Texture;
  tex1: Texture;
  uTex0Size: { value: Float32Array };
  uTex1Size: { value: Float32Array };
  uResolution: { value: Float32Array };
};

function CanvasWallpaperTouchStatic({ activeId, options, solidColor }: Props) {
  const targetUrl = useWallpaperTargetUrl(activeId, options, solidColor);
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 isolate bg-[#f8fafc] foldder-canvas-wallpaper-layer"
      style={canvasWallpaperCoverStyle(targetUrl)}
      aria-hidden
    />
  );
}

export function CanvasWallpaperTransition(props: Props) {
  const { activeId, options, solidColor } = props;
  const { isTouchUI } = useInputMode();
  const selection = useMemo(
    () => resolveCanvasBackgroundSelection(activeId, solidColor ?? "", options),
    [activeId, options, solidColor],
  );

  if (selection.kind === "color") {
    if (isTouchUI) {
      return (
        <div
          className="pointer-events-none absolute inset-0 z-0 isolate bg-[#f8fafc] foldder-canvas-wallpaper-layer"
          style={{ backgroundColor: selection.color }}
          aria-hidden
        />
      );
    }
    return <CanvasSolidColorBackground color={selection.color} />;
  }

  if (isTouchUI) {
    return <CanvasWallpaperTouchStatic activeId={activeId} options={options} solidColor={solidColor} />;
  }

  return <CanvasWallpaperImageTransition activeId={activeId} options={options} solidColor={solidColor} />;
}

function CanvasWallpaperImageTransition({
  activeId,
  options,
  solidColor,
}: Props) {
  const targetUrl = useWallpaperTargetUrl(activeId, options, solidColor);

  const containerRef = useRef<HTMLDivElement>(null);
  const targetUrlRef = useRef(targetUrl);
  targetUrlRef.current = targetUrl;

  const displayUrlRef = useRef(targetUrl);
  const [useCssFallback, setUseCssFallback] = useState(false);
  const [webglReady, setWebglReady] = useState(false);

  const apiRef = useRef<GlApi | null>(null);
  const rafRef = useRef<number | null>(null);
  const transitionRef = useRef<{
    start: number;
    toUrl: string;
    reducedMotion: boolean;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || useCssFallback) return;

    let cancelled = false;
    let dispose: (() => void) | null = null;

    void (async () => {
      const renderer = new Renderer({
        dpr: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        preserveDrawingBuffer: true,
        powerPreference: "low-power",
      });
      const { gl } = renderer;
      if (!gl) {
        if (!cancelled) setUseCssFallback(true);
        return;
      }

      gl.clearColor(CLEAR[0], CLEAR[1], CLEAR[2], CLEAR[3]);

      const tex0 = new Texture(gl, { generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR });
      const tex1 = new Texture(gl, { generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR });

      const uResolution = { value: new Float32Array([1, 1]) };
      const uTex0Size = { value: new Float32Array([1, 1]) };
      const uTex1Size = { value: new Float32Array([1, 1]) };

      const initialUrl = targetUrlRef.current;
      let firstImg: HTMLImageElement;
      try {
        firstImg = await loadImage(initialUrl);
      } catch {
        if (!cancelled) setUseCssFallback(true);
        return;
      }
      if (cancelled) return;

      tex0.image = firstImg;
      tex1.image = firstImg;
      const nw = firstImg.naturalWidth;
      const nh = firstImg.naturalHeight;
      uTex0Size.value[0] = nw;
      uTex0Size.value[1] = nh;
      uTex1Size.value[0] = nw;
      uTex1Size.value[1] = nh;
      displayUrlRef.current = initialUrl;

      const program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        uniforms: {
          uTex0: { value: tex0 },
          uTex1: { value: tex1 },
          uResolution,
          uTex0Size,
          uTex1Size,
          uMix: { value: 0 },
          uBulge: { value: 0 },
          uCenter: { value: new Float32Array([0.5, 0.5]) },
        },
        cullFace: false,
        depthTest: false,
        depthWrite: false,
      });

      const geometry = new Triangle(gl);
      const mesh = new Mesh(gl, { geometry, program, frustumCulled: false });
      const scene = new Transform();
      mesh.setParent(scene);

      el.innerHTML = "";
      el.appendChild(gl.canvas);
      gl.canvas.style.display = "block";
      gl.canvas.style.width = "100%";
      gl.canvas.style.height = "100%";
      gl.canvas.style.backgroundColor = "#f8fafc";

      const api: GlApi = {
        renderer,
        program,
        mesh,
        scene,
        tex0,
        tex1,
        uTex0Size,
        uTex1Size,
        uResolution,
      };
      apiRef.current = api;

      let resizeRafId = 0;
      const resize = () => {
        if (resizeRafId) cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => {
          resizeRafId = 0;
          if (cancelled || !containerRef.current) return;
          const w = Math.max(1, containerRef.current.clientWidth);
          const h = Math.max(1, containerRef.current.clientHeight);
          renderer.setSize(w, h);
          uResolution.value[0] = w;
          uResolution.value[1] = h;
          program.uniforms.uMix.value = 0;
          program.uniforms.uBulge.value = 0;
          renderer.render({ scene });
        });
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      const tick = () => {
        if (cancelled || !apiRef.current) return;
        const a = apiRef.current;
        const tr = transitionRef.current;
        const p = a.program;

        if (tr) {
          const dur = tr.reducedMotion ? Math.min(TRANSITION_MS, 320) : TRANSITION_MS;
          const tLin = Math.min(1, (performance.now() - tr.start) / dur);
          /** Crossfade: exponential ease-out (rápido al inicio, frena al final). */
          const mixEased = easeExpOut(tLin);
          p.uniforms.uMix.value = mixEased;
          /** Bulge: fase temporal con circular ease-out + seno (pico más natural que lineal). */
          const bulgePhase = tr.reducedMotion ? 0 : easeCircleOut(tLin);
          p.uniforms.uBulge.value = tr.reducedMotion ? 0 : Math.sin(bulgePhase * Math.PI) * 0.92;

          if (tLin >= 1) {
            p.uniforms.uMix.value = 0;
            p.uniforms.uBulge.value = 0;
            const img = a.tex1.image as HTMLImageElement;
            a.tex0.image = img;
            a.tex0.needsUpdate = true;
            a.uTex0Size.value[0] = a.uTex1Size.value[0];
            a.uTex0Size.value[1] = a.uTex1Size.value[1];
            displayUrlRef.current = tr.toUrl;
            transitionRef.current = null;
          }
        } else {
          p.uniforms.uMix.value = 0;
          p.uniforms.uBulge.value = 0;
        }

        a.renderer.render({ scene: a.scene });
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      if (!cancelled) {
        setWebglReady(true);
      }

      dispose = () => {
        cancelled = true;
        ro.disconnect();
        if (resizeRafId) cancelAnimationFrame(resizeRafId);
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        apiRef.current = null;
        transitionRef.current = null;
        setWebglReady(false);
      };
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [useCssFallback]);

  useEffect(() => {
    if (useCssFallback || !webglReady) return;
    const api = apiRef.current;
    if (!api) return;

    if (targetUrl === displayUrlRef.current) return;

    let cancelled = false;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    void (async () => {
      let img: HTMLImageElement;
      try {
        img = await loadImage(targetUrl);
      } catch (e) {
        console.warn("[CanvasWallpaperTransition] WebGL texture load failed; keeping previous background.", e);
        return;
      }
      if (cancelled) return;

      const { tex1, program, uTex1Size } = api;
      tex1.image = img;
      tex1.needsUpdate = true;
      uTex1Size.value[0] = img.naturalWidth;
      uTex1Size.value[1] = img.naturalHeight;
      program.uniforms.uTex1.value = tex1;

      transitionRef.current = {
        start: performance.now(),
        toUrl: targetUrl,
        reducedMotion,
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUrl, useCssFallback, webglReady]);

  if (useCssFallback) {
    return <CanvasWallpaperCssFallback activeId={activeId} options={options} solidColor={solidColor} />;
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-0 isolate overflow-hidden bg-[#f8fafc] foldder-canvas-wallpaper-layer"
      aria-hidden
    />
  );
}
