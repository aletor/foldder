"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

type PlayerStatus = "idle" | "loading" | "playing" | "error";

type RadioStation = { url_resolved?: string; bitrate?: number };

type Genre = { id: string; label: string; tag: string };

/**
 * Banda sonora de fondo mientras se trabaja.
 *
 * Diseño deliberadamente minimalista y de coste cero hasta usarse:
 *  - `<audio preload="none">`: no descarga nada hasta el primer play (sin impacto en carga/CPU).
 *  - Solo emisoras `https://` para evitar bloqueos de "mixed content".
 *  - Failover automático al siguiente stream si uno falla o no arranca a tiempo.
 *  - Una sola petición ligera a radio-browser.info por género.
 *
 * Interacción:
 *  - Clic: play / pausa.
 *  - Clic derecho o pulsación larga: panel con géneros + volumen.
 */
const GENRES: Genre[] = [
  { id: "jazz", label: "Jazz", tag: "jazz" },
  { id: "lofi", label: "Lo-Fi", tag: "lofi" },
  { id: "ambient", label: "Ambient", tag: "ambient" },
  { id: "classical", label: "Clásica", tag: "classical" },
  { id: "piano", label: "Piano", tag: "piano" },
];

/** Barras del ecualizador: retardo/duración distintos para un movimiento orgánico. */
const EQ_BARS = [
  { delay: 0, duration: 0.82 },
  { delay: 0.18, duration: 1.06 },
  { delay: 0.36, duration: 0.7 },
  { delay: 0.1, duration: 0.94 },
  { delay: 0.28, duration: 0.78 },
];

const GENRE_KEY = "foldder-bg-radio-genre";
const VOLUME_KEY = "foldder-bg-radio-volume";
/** Evento interno para notificar cambios de preferencias en la misma pestaña. */
const PREFS_EVENT = "foldder-bg-radio-prefs";
const DEFAULT_VOLUME = 0.32;
const CONNECT_TIMEOUT_MS = 9000;
const FETCH_TIMEOUT_MS = 8000;
const LONG_PRESS_MS = 420;

/**
 * Mirrors de radio-browser. El host `api.radio-browser.info` (sin prefijo)
 * NO sirve la ruta (404); hay que apuntar a un servidor concreto y hacer
 * failover entre ellos.
 */
const API_HOSTS = [
  "de1.api.radio-browser.info",
  "de2.api.radio-browser.info",
  "all.api.radio-browser.info",
];

function searchPath(tag: string): string {
  return `/json/stations/search?tag=${encodeURIComponent(
    tag,
  )}&limit=40&hidebroken=true&order=clickcount&reverse=true`;
}

/** Pide la lista de emisoras probando mirrors en orden hasta que uno responda. */
async function fetchStations(tag: string): Promise<RadioStation[]> {
  const path = searchPath(tag);
  for (const host of API_HOSTS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`https://${host}${path}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data as RadioStation[];
    } catch {
      // host caído / DNS / timeout → probar el siguiente
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw new Error("radio_browser_unreachable");
}

/** Suscripción a cambios de preferencias (otras pestañas vía `storage`, esta vía evento interno). */
function subscribePrefs(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", onChange);
  window.addEventListener(PREFS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREFS_EVENT, onChange);
  };
}

/** Snapshot estable (string) del id de género guardado; el servidor usa el primero. */
function readStoredGenreId(): string {
  return window.localStorage.getItem(GENRE_KEY) ?? GENRES[0].id;
}

function readStoredVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const stored = Number(window.localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : DEFAULT_VOLUME;
}

function persistGenre(id: string): void {
  window.localStorage.setItem(GENRE_KEY, id);
  window.dispatchEvent(new Event(PREFS_EVENT));
}

function persistVolume(value: number): void {
  window.localStorage.setItem(VOLUME_KEY, String(value));
  window.dispatchEvent(new Event(PREFS_EVENT));
}

export function BackgroundRadioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stationsRef = useRef<string[]>([]);
  const loadedTagRef = useRef<string | null>(null);
  const indexRef = useRef(0);
  const connectTimerRef = useRef<number | null>(null);
  const failoverRef = useRef<() => void>(() => {});
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [panelOpen, setPanelOpen] = useState(false);

  // SSR-safe: servidor y primer render de cliente usan los valores por defecto
  // (getServerSnapshot); tras la hidratación se sincronizan las preferencias de
  // localStorage. Evita el desajuste de hidratación en title/aria-label.
  const genreId = useSyncExternalStore(subscribePrefs, readStoredGenreId, () => GENRES[0].id);
  const genre = useMemo(() => GENRES.find((g) => g.id === genreId) ?? GENRES[0], [genreId]);
  const volume = useSyncExternalStore(subscribePrefs, readStoredVolume, () => DEFAULT_VOLUME);

  const genreRef = useRef(genre);
  useEffect(() => {
    genreRef.current = genre;
  }, [genre]);

  const clearConnectTimer = useCallback(() => {
    if (connectTimerRef.current != null) {
      window.clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
  }, []);

  /** Indirección estable para romper la recursión playIndex ↔ failover. */
  const failover = useCallback(() => failoverRef.current(), []);

  const playIndex = useCallback(
    (i: number) => {
      const el = audioRef.current;
      if (!el) return;
      const url = stationsRef.current[i];
      if (!url) {
        clearConnectTimer();
        setStatus("error");
        return;
      }
      indexRef.current = i;
      setStatus("loading");
      el.src = url;
      clearConnectTimer();
      connectTimerRef.current = window.setTimeout(failover, CONNECT_TIMEOUT_MS);
      el.play().catch(() => failover());
    },
    [clearConnectTimer, failover],
  );

  useEffect(() => {
    failoverRef.current = () => {
      const next = indexRef.current + 1;
      if (next < stationsRef.current.length) {
        playIndex(next);
      } else {
        clearConnectTimer();
        setStatus("error");
      }
    };
  }, [playIndex, clearConnectTimer]);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const el = new Audio();
    el.preload = "none";
    el.volume = readStoredVolume();
    el.addEventListener("playing", () => {
      clearConnectTimer();
      setStatus("playing");
    });
    el.addEventListener("error", failover);
    audioRef.current = el;
    return el;
  }, [clearConnectTimer, failover]);

  const stop = useCallback(() => {
    clearConnectTimer();
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    setStatus("idle");
  }, [clearConnectTimer]);

  const start = useCallback(async () => {
    ensureAudio();
    const tag = genreRef.current.tag;
    setStatus("loading");
    try {
      if (loadedTagRef.current !== tag || stationsRef.current.length === 0) {
        const list = await fetchStations(tag);
        const urls = list
          .filter(
            (s) =>
              typeof s.url_resolved === "string" &&
              s.url_resolved.startsWith("https://") &&
              (!s.bitrate || (s.bitrate >= 32 && s.bitrate <= 160)),
          )
          .map((s) => s.url_resolved as string);
        stationsRef.current = Array.from(new Set(urls));
        loadedTagRef.current = tag;
      }
      if (stationsRef.current.length === 0) {
        setStatus("error");
        return;
      }
      playIndex(0);
    } catch {
      setStatus("error");
    }
  }, [ensureAudio, playIndex]);

  const toggle = useCallback(() => {
    if (status === "playing" || status === "loading") {
      stop();
    } else {
      void start();
    }
  }, [status, start, stop]);

  const selectGenre = useCallback(
    (next: Genre) => {
      genreRef.current = next;
      persistGenre(next.id);
      if (loadedTagRef.current !== next.tag) {
        stationsRef.current = [];
        loadedTagRef.current = null;
      }
      if (status === "playing" || status === "loading") {
        clearConnectTimer();
        void start();
      }
    },
    [status, start, clearConnectTimer],
  );

  const changeVolume = useCallback((next: number) => {
    if (audioRef.current) audioRef.current.volume = next;
    persistVolume(next);
  }, []);

  const openPanel = useCallback(() => setPanelOpen(true), []);

  const handlePointerDown = useCallback(() => {
    longPressFiredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      openPanel();
    }, LONG_PRESS_MS);
  }, [openPanel]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    cancelLongPress();
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    toggle();
  }, [cancelLongPress, toggle]);

  // Cerrar panel al clicar fuera o pulsar Escape.
  useEffect(() => {
    if (!panelOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPanelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

  useEffect(() => {
    return () => {
      clearConnectTimer();
      cancelLongPress();
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
      }
    };
  }, [clearConnectTimer, cancelLongPress]);

  const label =
    status === "playing"
      ? "Pausar música de fondo"
      : status === "loading"
        ? "Conectando música de fondo…"
        : status === "error"
          ? "No se pudo conectar. Reintentar"
          : `Música de fondo · ${genre.label}`;

  return (
    <div ref={wrapRef} className="fixed bottom-3 left-1/2 z-[10030] -translate-x-1/2">
      {panelOpen ? (
        <div className="absolute bottom-10 left-1/2 w-44 -translate-x-1/2 border border-white/15 bg-[#0b0f14]/95 p-2 shadow-xl backdrop-blur-md">
          <p className="px-1 pb-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-white/45">
            Género
          </p>
          <div className="flex flex-col gap-px">
            {GENRES.map((g) => {
              const active = g.id === genre.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectGenre(g)}
                  className={`flex items-center justify-between px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] transition ${
                    active
                      ? "bg-white/90 text-slate-950"
                      : "text-white/65 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {g.label}
                  {active ? <span className="text-[7px]">●</span> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-2 border-t border-white/10 px-1 pt-2">
            <p className="pb-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-white/45">
              Volumen
            </p>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="w-full accent-white"
              aria-label="Volumen de la música de fondo"
            />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          openPanel();
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        title={label}
        aria-label={label}
        aria-pressed={status === "playing"}
        className="group flex h-7 items-center justify-center px-2"
      >
        <span
          className={`flex h-4 items-end gap-[3px] transition-colors [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.55))] ${
            status === "playing"
              ? "foldder-eq--playing text-white"
              : status === "loading"
                ? "foldder-eq--loading text-white/80"
                : status === "error"
                  ? "text-red-300/90"
                  : "text-white/45 group-hover:text-white/80"
          }`}
          aria-hidden
        >
          {EQ_BARS.map((bar, i) => (
            <span
              key={i}
              className="foldder-eq-bar"
              style={{ animationDelay: `${bar.delay}s`, animationDuration: `${bar.duration}s` }}
            />
          ))}
        </span>
      </button>
    </div>
  );
}
