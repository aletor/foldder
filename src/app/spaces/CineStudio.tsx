"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Clapperboard,
  Clock,
  Cloud,
  Contrast,
  Copy,
  Eye,
  Film,
  Layers,
  Lock,
  Map,
  Megaphone,
  Moon,
  Music,
  Package,
  Palette,
  Plus,
  Shirt,
  Smartphone,
  Sparkles,
  Sun,
  SunMedium,
  Trash2,
  Unlock,
  Users,
  Video,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { FoldderStudioHeader } from "./FoldderStudioHeader";
import {
  CINE_CAMERA_MOVEMENT_LABELS,
  CINE_COLOR_GRADING_LABELS,
  CINE_LIGHTING_STYLE_LABELS,
  CINE_MODE_LABELS,
  CINE_SHOT_LABELS,
  CINE_STATUS_LABELS,
  CINE_VISUAL_STYLE_LABELS,
  createEmptyCineNodeData,
  makeCineId,
  type CineAspectRatio,
  type CineBackground,
  type CineCameraMovementType,
  type CineCharacter,
  type CineColorGrading,
  type CineFrame,
  type CineImageStudioSession,
  type CineLightingStyle,
  type CineMode,
  type CineNodeData,
  type CineScene,
  type CineShot,
  type CineVideoPlan,
  type CineVisualStyle,
} from "./cine-types";
import { CineCameraMotionIcon, CineCameraMotionSelector } from "./CineCameraMotionIcon";
import {
  analyzeCineScript,
  analyzeCineScriptWithAI,
  approveCineFrame,
  applyCineAnalysisToData,
  applyCineImageStudioResult,
  buildCineBackgroundPrompt,
  buildCineCharacterPrompt,
  buildCineCharacterSheetNegativePrompt,
  buildCineCharacterSheetPrompt,
  buildCineMediaListOutput,
  buildCineFrameNegativePrompt,
  buildCineFramePrompt,
  buildCineLocationSheetNegativePrompt,
  buildCineLocationSheetPrompt,
  buildCineVisualDirectionPrompt,
  createCineFrameDraft,
  getCineFrameReferenceAssetIds,
  getCineFrameReferenceS3Keys,
  getCineCharacterSheetLayout,
  getEffectiveCharacterSheetAsset,
  getEffectiveCharacterSheetS3Key,
  getEffectiveCineBackgroundAsset,
  getEffectiveCineBackgroundS3Key,
  getEffectiveCineCharacterAsset,
  getEffectiveCineCharacterS3Key,
  getEffectiveCineFrameAsset,
  getEffectiveCineFrameS3Key,
  getEffectiveCineVideoAsset,
  getEffectiveCineVideoS3Key,
  getEffectiveLocationSheetAsset,
  getEffectiveLocationSheetS3Key,
  getEffectiveSceneVisualDirection,
  prepareSceneForVideo,
} from "./cine-engine";
import type { MediaListItem } from "./media-list-output";
import { StudioNodePortal } from "./studio-node/studio-node-architecture";
import { geminiGenerateWithServerProgress } from "@/lib/gemini-generate-stream-client";
import { stableKnowledgeFileUrlFromKey, tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import {
  CineStudioAssetCard,
  CineStudioBadge,
  CineStudioLockedPanel,
  CineStudioMetricsBar,
  CineStudioSection,
  CineStudioTabBar,
  CineStudioWorkflowBar,
  ChromeIconButton,
  ChoiceGrid,
  DirectionChoiceCard,
  DirectionHeaderBar,
  DirectionInlineToggle,
  DirectionPromptPreview,
  DirectionSection,
  DirectionStat,
  DirectionStatRow,
  FieldLabel,
  PillButton,
  PrimaryButton,
  Stat,
  StatRow,
  Select,
  TextArea,
  TextInput,
  cx,
} from "./cine/CineStudioChrome";
import {
  getCineRecommendedTab,
  getCineTabAccess,
  getCineWorkflowHint,
  getCineWorkflowSnapshot,
  isCineTabUnlocked,
  type CineStudioTab,
} from "./cine/cine-studio-workflow";

type CineAnalyzerMode = "ai" | "local";
type CineGeneratingTarget = string | null;
type CineFrameSelection = Record<string, boolean>;

export type CineStudioProps = {
  nodeId: string;
  data: CineNodeData;
  onChange: (next: CineNodeData) => void;
  onClose: () => void;
  brainConnected?: boolean;
  sourceScriptText?: string;
  sourceScriptNodeId?: string;
  initialTab?: CineStudioTab;
  initialSceneId?: string;
  onOpenImageStudio?: (session: Omit<CineImageStudioSession, "nanoNodeId">) => void;
};

const aspectRatios: CineAspectRatio[] = ["16:9", "9:16", "1:1", "4:5", "2.39:1"];
const cineModes = Object.keys(CINE_MODE_LABELS) as CineMode[];
const shotTypes = Object.keys(CINE_SHOT_LABELS) as CineShot["shotType"][];
const visualStyles = Object.keys(CINE_VISUAL_STYLE_LABELS) as CineVisualStyle[];
const colorGradings = Object.keys(CINE_COLOR_GRADING_LABELS) as CineColorGrading[];
const lightingStyles = Object.keys(CINE_LIGHTING_STYLE_LABELS) as CineLightingStyle[];

const CINE_MODE_DESCRIPTIONS: Record<CineMode, string> = {
  short_film: "Narrativa breve, emocional y visual.",
  advertising: "Mensaje claro, ritmo preciso y cierre memorable.",
  fashion_film: "Estética, presencia, textura y gesto.",
  documentary: "Observación, verdad y contexto humano.",
  product_video: "Producto, beneficio y detalle visual.",
  music_video: "Ritmo, atmósfera y energía sensorial.",
  brand_story: "Identidad, relato y coherencia de marca.",
  social_video: "Impacto rápido y lectura vertical.",
};

const CINE_VISUAL_STYLE_DESCRIPTIONS: Record<CineVisualStyle, string> = {
  naturalistic_realistic: "Creíble, humano, sin exceso de artificio.",
  commercial_cinematic: "Pulido, premium y fácil de leer.",
  black_white_noir: "Sombras, contraste y sobriedad gráfica.",
  animation_cartoon: "Formas icónicas y lectura animable.",
  retro_vintage: "Textura analógica y memoria visual.",
  futuristic_sci_fi: "Materiales avanzados y luz tecnológica.",
  surreal_dreamlike: "Poético, simbólico y ligeramente extraño.",
  raw_documentary: "Directo, imperfecto y observacional.",
};

const CINE_COLOR_GRADING_DESCRIPTIONS: Record<CineColorGrading, string> = {
  teal_orange: "Sombras frías y acentos cálidos.",
  golden_hour_warm: "Calidez amable y luz dorada.",
  cool_blue_desaturated: "Frío, sobrio y desaturado.",
  pastel_soft_film: "Suave, aireado y delicado.",
  high_contrast_crunchy: "Negros densos y separación fuerte.",
  film_emulation_kodak_fuji: "Respuesta orgánica de película.",
  vibrant_commercial_pop: "Color vivo y acabado publicitario.",
  bleach_bypass: "Plateado, duro y con grano.",
  low_contrast_fade_matte: "Negros levantados y tono editorial.",
  monochrome_color_cast: "Atmósfera de color dominante.",
};

const CINE_LIGHTING_STYLE_DESCRIPTIONS: Record<CineLightingStyle, string> = {
  normal: "Luz equilibrada y motivada.",
  dark: "Baja clave, sombras y atmósfera.",
  bright: "Alta clave, claridad y limpieza.",
};

const CINE_MODE_SHORT_LABELS: Record<CineMode, string> = {
  short_film: "Corto",
  advertising: "Spot",
  fashion_film: "Fashion",
  documentary: "Docu",
  product_video: "Producto",
  music_video: "Clip",
  brand_story: "Marca",
  social_video: "Social",
};

const CINE_MODE_ICONS: Record<CineMode, React.ReactNode> = {
  short_film: <Film size={14} strokeWidth={2} />,
  advertising: <Megaphone size={14} strokeWidth={2} />,
  fashion_film: <Shirt size={14} strokeWidth={2} />,
  documentary: <Video size={14} strokeWidth={2} />,
  product_video: <Package size={14} strokeWidth={2} />,
  music_video: <Music size={14} strokeWidth={2} />,
  brand_story: <Layers size={14} strokeWidth={2} />,
  social_video: <Smartphone size={14} strokeWidth={2} />,
};

const CINE_VISUAL_STYLE_SHORT_LABELS: Record<CineVisualStyle, string> = {
  naturalistic_realistic: "Natural",
  commercial_cinematic: "Comercial",
  black_white_noir: "Noir",
  animation_cartoon: "Animación",
  retro_vintage: "Retro",
  futuristic_sci_fi: "Sci-Fi",
  surreal_dreamlike: "Onírico",
  raw_documentary: "Crudo",
};

const CINE_VISUAL_STYLE_ICONS: Record<CineVisualStyle, React.ReactNode> = {
  naturalistic_realistic: <Eye size={14} strokeWidth={2} />,
  commercial_cinematic: <Sparkles size={14} strokeWidth={2} />,
  black_white_noir: <Contrast size={14} strokeWidth={2} />,
  animation_cartoon: <Palette size={14} strokeWidth={2} />,
  retro_vintage: <Clock size={14} strokeWidth={2} />,
  futuristic_sci_fi: <Zap size={14} strokeWidth={2} />,
  surreal_dreamlike: <Cloud size={14} strokeWidth={2} />,
  raw_documentary: <Camera size={14} strokeWidth={2} />,
};

const CINE_COLOR_GRADING_SHORT_LABELS: Record<CineColorGrading, string> = {
  teal_orange: "Teal",
  golden_hour_warm: "Golden",
  cool_blue_desaturated: "Cool",
  pastel_soft_film: "Pastel",
  high_contrast_crunchy: "Crunchy",
  film_emulation_kodak_fuji: "Film",
  vibrant_commercial_pop: "Vibrant",
  bleach_bypass: "Bleach",
  low_contrast_fade_matte: "Matte",
  monochrome_color_cast: "Mono",
};

const CINE_COLOR_GRADING_SWATCHES: Record<CineColorGrading, string> = {
  teal_orange: "from-cyan-400 via-slate-500 to-orange-400",
  golden_hour_warm: "from-amber-200 via-orange-300 to-rose-300",
  cool_blue_desaturated: "from-slate-400 via-blue-400 to-slate-500",
  pastel_soft_film: "from-pink-200 via-sky-200 to-lime-200",
  high_contrast_crunchy: "from-black via-zinc-500 to-white",
  film_emulation_kodak_fuji: "from-amber-300 via-rose-200 to-emerald-300",
  vibrant_commercial_pop: "from-fuchsia-400 via-yellow-300 to-cyan-400",
  bleach_bypass: "from-zinc-300 via-zinc-500 to-zinc-200",
  low_contrast_fade_matte: "from-stone-400 via-stone-300 to-stone-500",
  monochrome_color_cast: "from-indigo-400 via-indigo-300 to-indigo-500",
};

function CineAspectRatioIcon({ ratio }: { ratio: CineAspectRatio }) {
  const [w, h] = ratio.split(":").map(Number);
  const landscape = w >= h;
  return (
    <span
      className="inline-block border border-current opacity-80"
      style={{
        width: landscape ? 16 : Math.round(16 * (w / h)),
        height: landscape ? Math.round(16 * (h / w)) : 16,
      }}
      aria-hidden
    />
  );
}

function CineColorGradingIcon({ grading }: { grading: CineColorGrading }) {
  return <span className={`inline-block h-3 w-5 bg-gradient-to-r ${CINE_COLOR_GRADING_SWATCHES[grading]}`} aria-hidden />;
}

const CINE_S3_URL_TTL_MS = 50 * 60 * 1000;
const CINE_GEMINI_VIDEO_MAX_REFERENCE_IMAGES = 3;
const CINE_GEMINI_VIDEO_EXTRA_REFERENCE_IMAGES = 0;
const cinePresignedUrlCache = new globalThis.Map<string, { url: string; expiresAt: number }>();
const cinePresignInFlight = new globalThis.Map<string, Promise<string | null>>();

function resolveCineS3Key(src?: string, s3Key?: string): string | undefined {
  const direct = typeof s3Key === "string" && s3Key.trim() ? s3Key.trim() : "";
  if (direct) return direct;
  const fromUrl = typeof src === "string" ? tryExtractKnowledgeFilesKeyFromUrl(src) : null;
  return fromUrl || undefined;
}

async function presignCineS3Key(key: string): Promise<string | null> {
  const cached = cinePresignedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const pending = cinePresignInFlight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const res = await fetch("/api/spaces/s3-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [key] }),
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as { urls?: Record<string, string> };
      const url = payload.urls?.[key];
      if (!url) return null;
      cinePresignedUrlCache.set(key, { url, expiresAt: Date.now() + CINE_S3_URL_TTL_MS });
      return url;
    } catch {
      return null;
    } finally {
      cinePresignInFlight.delete(key);
    }
  })();
  cinePresignInFlight.set(key, promise);
  return promise;
}

async function resolveCineAssetUrl(src?: string, s3Key?: string): Promise<string | undefined> {
  const key = resolveCineS3Key(src, s3Key);
  if (!key) return src;
  return (await presignCineS3Key(key)) || src;
}

function isDirectGeminiReference(src?: string): src is string {
  if (!src) return false;
  if (src.startsWith("data:image/")) return true;
  if (src.startsWith("blob:")) return false;
  return /^https?:\/\//i.test(src) && !resolveCineS3Key(src);
}

function resolveCineVideoPlaybackUrl(src?: string, s3Key?: string): string | undefined {
  const key = resolveCineS3Key(src, s3Key);
  if (key) return stableKnowledgeFileUrlFromKey(key) ?? undefined;
  const trimmed = src?.trim();
  return trimmed || undefined;
}

function useCineVideoPlaybackSource(src?: string, s3Key?: string) {
  const stableUrl = useMemo(() => resolveCineVideoPlaybackUrl(src, s3Key), [s3Key, src]);
  const [playbackUrl, setPlaybackUrl] = useState<string | undefined>(stableUrl);
  const blobUrlRef = useRef<string | null>(null);
  const blobAttemptRef = useRef(false);

  useEffect(() => {
    blobAttemptRef.current = false;
    setPlaybackUrl(stableUrl);
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, [stableUrl]);

  useEffect(
    () => () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    },
    [],
  );

  const retryWithBlob = useCallback(async () => {
    if (!stableUrl || blobAttemptRef.current) return;
    blobAttemptRef.current = true;
    try {
      const response = await fetch(stableUrl, { credentials: "include" });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.size) return;
      const objectUrl = URL.createObjectURL(blob);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = objectUrl;
      setPlaybackUrl(objectUrl);
    } catch {
      // Keep streaming URL if blob fallback fails.
    }
  }, [stableUrl]);

  return { playbackUrl, stableUrl, retryWithBlob };
}

function cineScenePosterFrame(scene: CineScene): CineFrame | undefined {
  if (scene.framesMode === "start_end") return scene.frames.start ?? scene.frames.end ?? scene.frames.single;
  return scene.frames.single ?? scene.frames.start ?? scene.frames.end;
}

function CineVideoPreview({
  src,
  s3Key,
  posterScene,
}: {
  src?: string;
  s3Key?: string;
  posterScene: CineScene;
}) {
  const { playbackUrl, retryWithBlob } = useCineVideoPlaybackSource(src, s3Key);
  const posterFrame = cineScenePosterFrame(posterScene);
  const { url: posterUrl } = useCineResolvedImageUrl(
    getEffectiveCineFrameAsset(posterFrame),
    getEffectiveCineFrameS3Key(posterFrame),
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) return;
    video.load();
  }, [playbackUrl]);

  if (!playbackUrl) return <CineStoryboardHero scene={posterScene} />;

  return (
    <div className="cine-video-preview absolute inset-0 z-[1] flex items-center justify-center bg-black" data-cine-video-preview>
      <video
        ref={videoRef}
        src={playbackUrl}
        poster={posterUrl}
        className="cine-video-preview__media block h-full w-full object-contain"
        controls
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (video.videoWidth === 0) void retryWithBlob();
          else if (video.currentTime === 0) {
            try {
              video.currentTime = 0.001;
            } catch {
              // Some browsers reject tiny seeks before enough data is buffered.
            }
          }
        }}
        onError={() => {
          void retryWithBlob();
        }}
      />
    </div>
  );
}

function useCineResolvedImageUrl(src?: string, s3Key?: string): { url?: string; refresh: () => void } {
  const [resolved, setResolved] = useState<{ cacheKey: string; url: string } | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const key = resolveCineS3Key(src, s3Key);
  const cacheKey = `${src || ""}\u0001${key || ""}`;
  useEffect(() => {
    let cancelled = false;
    if (!key) return () => {
      cancelled = true;
    };
    void (async () => {
      const fresh = await presignCineS3Key(key);
      if (!cancelled && fresh) setResolved({ cacheKey, url: fresh });
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, key, refreshNonce]);
  return {
    url: resolved?.cacheKey === cacheKey ? resolved.url : src,
    refresh: () => {
      if (key) cinePresignedUrlCache.delete(key);
      setRefreshNonce((value) => value + 1);
    },
  };
}

function updated(data: CineNodeData): CineNodeData {
  return {
    ...data,
    metadata: {
      ...data.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
}

function nextStatus(data: CineNodeData): CineNodeData["status"] {
  if (data.scenes.some((scene) => scene.status === "ready_for_video")) return "ready_for_video";
  if (data.scenes.some((scene) => scene.frames.single || scene.frames.start || scene.frames.end)) return "frames_ready";
  if (data.scenes.length) return "storyboard_ready";
  if (data.backgrounds.length) return "backgrounds_ready";
  if (data.characters.length) return "characters_ready";
  if (data.detected) return "analyzed";
  if ((data.manualScript || data.sourceScript?.text || "").trim()) return "script_received";
  return "empty";
}

function SceneCameraControls({
  scene,
  onPatch,
}: {
  scene: CineScene;
  onPatch: (patch: Partial<CineScene>) => void;
}) {
  const updateShot = (patch: Partial<CineShot>) => onPatch({ shot: { ...scene.shot, ...patch } });
  return (
    <div className="border-b border-white/10 py-3">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>Cámara</FieldLabel>
        <span className="text-[9px] font-black uppercase tracking-[0.1em] text-white/38">
          {CINE_CAMERA_MOVEMENT_LABELS[scene.shot.cameraMovementType ?? "none"]}
        </span>
      </div>
      <div className="mt-3">
        <CineCameraMotionSelector
          value={scene.shot.cameraMovementType ?? "none"}
          onChange={(cameraMovementType: CineCameraMovementType) => updateShot({ cameraMovementType })}
        />
      </div>
      <div className="mt-3">
        <FieldLabel>Descripción de cámara</FieldLabel>
        <TextInput
          value={scene.shot.cameraDescription ?? scene.shot.cameraMovement ?? ""}
          onChange={(event) => updateShot({ cameraDescription: event.target.value, cameraMovement: event.target.value })}
          placeholder="Lento acercamiento desde detrás de Puffy hacia la pirámide"
        />
      </div>
    </div>
  );
}

function CineVisualAssetHero({
  src,
  s3Key,
  title,
  kicker,
  subtitle,
  status,
  icon,
}: {
  src?: string;
  s3Key?: string;
  title: string;
  kicker: string;
  subtitle?: string;
  status?: string;
  icon: React.ReactNode;
}) {
  const { url, refresh } = useCineResolvedImageUrl(src, s3Key);
  const retryKey = `${src || ""}\u0001${s3Key || ""}`;
  const [retriedFor, setRetriedFor] = useState<string | null>(null);
  return (
    <div className="relative aspect-[4/3] min-h-[240px] overflow-hidden bg-slate-950">
      {url ? (
        // S3 presigned URLs inside React Flow/Studio cards need deterministic object-cover behavior.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={title}
          className="h-full w-full object-cover"
          onError={() => {
            if (retriedFor === retryKey) return;
            setRetriedFor(retryKey);
            refresh();
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[#0b0f14] text-white/42">
          <div className="mb-4 border border-white/10 bg-white/[0.04] p-4">{icon}</div>
          <span className="text-[9px] font-black uppercase tracking-[0.14em]">{kicker}</span>
          <span className="mt-1 text-[11px] text-white/30">Imagen pendiente</span>
        </div>
      )}
      {status ? (
        <span className="absolute right-3 top-3 border border-white/15 bg-black/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-white/72">
          {status}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/92 via-black/50 to-transparent p-4 pt-14">
        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--foldder-studio-accent,#de323f)]">{kicker}</div>
        <h3 className="mt-1 line-clamp-2 text-lg font-semibold tracking-[-0.03em] text-white">{title}</h3>
        {subtitle ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/58">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function cineSceneFrameRoles(scene: CineScene): CineFrame["role"][] {
  return scene.framesMode === "start_end" ? ["start", "end"] : ["single"];
}

function cineFrameLabel(role: CineFrame["role"]): string {
  return role === "single" ? "Frame único" : role === "start" ? "Frame inicial" : "Frame final";
}

function cineFrameStatusLabel(status?: CineFrame["status"], isGenerating?: boolean): string {
  if (isGenerating) return "generando";
  if (!status) return "pendiente";
  return status === "draft" ? "prompt preparado" : status;
}

function cineVideoStatusLabel(status?: CineVideoPlan["status"]): string {
  if (status === "generated") return "Vídeo generado";
  if (status === "generating") return "Generando vídeo";
  if (status === "prepared") return "Vídeo preparado";
  if (status === "ready") return "Listo para vídeo";
  if (status === "missing_frames") return "Faltan frames";
  if (status === "error") return "Error";
  return "Sin preparar";
}

function cineMissingFramesLabel(missing?: CineVideoPlan["missingFrames"]): string {
  if (!missing?.length) return "";
  const labels: Record<NonNullable<CineVideoPlan["missingFrames"]>[number], string> = {
    single: "frame único",
    start: "frame inicial",
    end: "frame final",
  };
  return missing.map((item) => labels[item]).join(", ");
}

function cineVideoModeLabel(mode?: CineVideoPlan["mode"]): string {
  return mode === "start_end_frames" ? "Frame inicial + final" : "Imagen a vídeo";
}

function cineVideoApiAspectRatio(aspectRatio: CineAspectRatio): "16:9" | "9:16" | "1:1" {
  if (aspectRatio === "9:16" || aspectRatio === "4:5") return "9:16";
  if (aspectRatio === "1:1") return "1:1";
  return "16:9";
}

function cineVideoProviderLabel(provider?: CineVideoPlan["videoProvider"]): string {
  return provider === "seedance" ? "Seedance (legacy)" : "Gemini Veo";
}

function CineMediaListVideoThumb({ src, s3Key }: { src?: string; s3Key?: string }) {
  const { playbackUrl, retryWithBlob } = useCineVideoPlaybackSource(src, s3Key);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) return;
    video.load();
  }, [playbackUrl]);

  if (!playbackUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white/[0.06] text-white/24">
        <Layers size={18} />
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={playbackUrl}
      controls
      playsInline
      preload="metadata"
      className="h-full w-full object-cover"
      onLoadedMetadata={(event) => {
        if (event.currentTarget.videoWidth === 0) void retryWithBlob();
      }}
      onError={() => {
        void retryWithBlob();
      }}
    />
  );
}

function CineMediaListPreviewThumb({ item }: { item: MediaListItem }) {
  const { url: imageUrl } = useCineResolvedImageUrl(item.url || item.assetId, item.s3Key);
  if (item.mediaType === "video") {
    return <CineMediaListVideoThumb src={item.url || item.assetId} s3Key={item.s3Key} />;
  }
  if (item.mediaType === "image" && imageUrl) {
    // Media list previews are already generated assets; raw img keeps S3 URLs simple and cover-cropped.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={item.title} className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-white/[0.06] text-white/24">
      <Layers size={18} />
    </div>
  );
}

function CineStoryboardFrameImage({
  frame,
  label,
  compact,
}: {
  frame?: CineFrame;
  label: string;
  compact?: boolean;
}) {
  const src = getEffectiveCineFrameAsset(frame);
  const s3Key = getEffectiveCineFrameS3Key(frame);
  const { url, refresh } = useCineResolvedImageUrl(src, s3Key);
  const retryKey = `${src || ""}\u0001${s3Key || ""}`;
  const [retriedFor, setRetriedFor] = useState<string | null>(null);
  if (!url) {
    return (
      <div className="flex h-full min-h-[190px] w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(103,232,249,0.12),rgba(15,23,42,0.18)_42%,rgba(2,6,23,0.72))] text-white/45">
        <Clapperboard size={compact ? 22 : 32} className="mb-3 opacity-70" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">{label}</span>
        <span className="mt-1 text-xs text-white/30">Frame pendiente</span>
      </div>
    );
  }
  return (
    // S3 presigned URLs inside React Flow/Studio cards need deterministic object-cover behavior.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={label}
      className="h-full w-full object-cover"
      onError={() => {
        if (retriedFor === retryKey) return;
        setRetriedFor(retryKey);
        refresh();
      }}
    />
  );
}

function CineStoryboardHero({ scene }: { scene: CineScene }) {
  if (scene.framesMode === "start_end") {
    return (
      <div className="grid h-full grid-cols-2">
        <div className="min-h-[230px] border-r border-black/45">
          <CineStoryboardFrameImage frame={scene.frames.start} label="Frame inicial" compact />
        </div>
        <div className="min-h-[230px]">
          <CineStoryboardFrameImage frame={scene.frames.end} label="Frame final" compact />
        </div>
      </div>
    );
  }
  return <CineStoryboardFrameImage frame={scene.frames.single} label="Frame único" />;
}

function useCineMutations(data: CineNodeData, onChange: (next: CineNodeData) => void, nodeId: string, brainConnected?: boolean) {
  const commit = (producer: (draft: CineNodeData) => CineNodeData) => {
    const next = producer(data);
    onChange(updated({ ...next, status: nextStatus(next) }));
  };

  return {
    commit,
	    analyze(script: string) {
	      const analysis = analyzeCineScript(script, { mode: data.visualDirection.mode, visualDirection: data.visualDirection });
	      onChange(updated(applyCineAnalysisToData({ ...data, manualScript: script }, analysis)));
	    },
	    createStoryboard(script: string) {
	      const analysis = analyzeCineScript(script, { mode: data.visualDirection.mode, visualDirection: data.visualDirection });
	      onChange(updated({ ...applyCineAnalysisToData({ ...data, manualScript: script }, analysis), status: "storyboard_ready" }));
    },
    useConnectedScript(sourceText: string, sourceNodeId?: string) {
      commit((draft) => ({
        ...draft,
        sourceScript: { text: sourceText, nodeId: sourceNodeId, title: "Guion conectado" },
        manualScript: draft.manualScript || sourceText,
        metadata: { ...draft.metadata, sourceScriptNodeId: sourceNodeId },
      }));
    },
    patchCharacter(id: string, patch: Partial<CineCharacter>) {
      commit((draft) => ({ ...draft, characters: draft.characters.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    },
    patchBackground(id: string, patch: Partial<CineBackground>) {
      commit((draft) => ({ ...draft, backgrounds: draft.backgrounds.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    },
    patchScene(id: string, patch: Partial<CineScene>) {
      commit((draft) => ({ ...draft, scenes: draft.scenes.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    },
    addCharacter() {
      commit((draft) => ({
        ...draft,
        characters: [
          ...draft.characters,
          {
            id: makeCineId("cine_character"),
            name: `Personaje ${draft.characters.length + 1}`,
            role: "secondary",
            description: "",
            visualPrompt: "",
            lockedTraits: [],
            wardrobe: "",
            emotionalRange: [],
            notes: "",
            isLocked: false,
          },
        ],
      }));
    },
    addBackground() {
      commit((draft) => ({
        ...draft,
        backgrounds: [
          ...draft.backgrounds,
          {
            id: makeCineId("cine_background"),
            name: `Fondo ${draft.backgrounds.length + 1}`,
            type: "other",
            description: "",
            visualPrompt: "",
            lighting: "",
            palette: [],
            textures: [],
            lockedElements: [],
            notes: "",
            isLocked: false,
          },
        ],
      }));
    },
    duplicateCharacter(id: string) {
      const source = data.characters.find((item) => item.id === id);
      if (!source) return;
      commit((draft) => ({ ...draft, characters: [...draft.characters, { ...source, id: makeCineId("cine_character"), name: `${source.name} copia`, isLocked: false }] }));
    },
    duplicateBackground(id: string) {
      const source = data.backgrounds.find((item) => item.id === id);
      if (!source) return;
      commit((draft) => ({ ...draft, backgrounds: [...draft.backgrounds, { ...source, id: makeCineId("cine_background"), name: `${source.name} copia`, isLocked: false }] }));
    },
    removeCharacter(id: string) {
      commit((draft) => ({ ...draft, characters: draft.characters.filter((item) => item.id !== id), scenes: draft.scenes.map((scene) => ({ ...scene, characters: scene.characters.filter((characterId) => characterId !== id) })) }));
    },
    removeBackground(id: string) {
      commit((draft) => ({ ...draft, backgrounds: draft.backgrounds.filter((item) => item.id !== id), scenes: draft.scenes.map((scene) => scene.backgroundId === id ? { ...scene, backgroundId: undefined } : scene) }));
    },
    prepareFrame(sceneId: string, role: CineFrame["role"]) {
      const frame = createCineFrameDraft({ data, sceneId, frameRole: role, cineNodeId: nodeId, brainConnected });
      commit((draft) => ({
        ...draft,
        scenes: draft.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            frames: { ...scene.frames, [role]: frame },
            status: role === "single" ? "frame_generated" : "ready_to_generate",
          };
        }),
      }));
    },
    prepareAllSceneFrames(sceneId: string) {
      const scene = data.scenes.find((item) => item.id === sceneId);
      if (!scene) return;
      const roles: CineFrame["role"][] = scene.framesMode === "start_end" ? ["start", "end"] : ["single"];
      const frames = Object.fromEntries(roles.map((role) => [role, createCineFrameDraft({ data, sceneId, frameRole: role, cineNodeId: nodeId, brainConnected })]));
      commit((draft) => ({
        ...draft,
        scenes: draft.scenes.map((item) => item.id === sceneId ? { ...item, frames: { ...item.frames, ...frames }, status: roles.length > 1 ? "frames_generated" : "frame_generated" } : item),
      }));
    },
    prepareVideo(sceneId: string) {
      const video = prepareSceneForVideo(data, sceneId, nodeId);
      commit((draft) => ({
        ...draft,
        scenes: draft.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, video, status: video.status === "prepared" ? "ready_for_video" : scene.status } : scene,
        ),
      }));
    },
    duplicateScene(sceneId: string) {
      const source = data.scenes.find((scene) => scene.id === sceneId);
      if (!source) return;
      commit((draft) => ({
        ...draft,
        scenes: [...draft.scenes, { ...source, id: makeCineId("cine_scene"), order: draft.scenes.length + 1, title: `${source.title} copia`, frames: {}, status: "draft" }],
      }));
    },
    removeScene(sceneId: string) {
      commit((draft) => ({
        ...draft,
        scenes: draft.scenes.filter((scene) => scene.id !== sceneId).map((scene, index) => ({ ...scene, order: index + 1 })),
      }));
    },
  };
}

export function CineStudio({ nodeId, data, onChange, onClose, brainConnected = false, sourceScriptText = "", sourceScriptNodeId, initialTab, initialSceneId, onOpenImageStudio }: CineStudioProps) {
  const [activeTab, setActiveTab] = useState<CineStudioTab>(initialTab ?? "direction");
  const [promptPreview, setPromptPreview] = useState<{ title: string; prompt: string; negativePrompt?: string; details?: Array<[string, string]> } | null>(null);
  const [analyzerMode, setAnalyzerMode] = useState<CineAnalyzerMode>("ai");
  const [analysisState, setAnalysisState] = useState<{
    status: "idle" | "running" | "done" | "fallback";
    message?: string;
  }>({ status: "idle" });
  const [generatingTarget, setGeneratingTarget] = useState<CineGeneratingTarget>(null);
  const [selectedFrames, setSelectedFrames] = useState<CineFrameSelection>({});
  const [storyboardView, setStoryboardView] = useState<"grid" | "list">("grid");
  const [storyboardStatusFilter, setStoryboardStatusFilter] = useState<"all" | "empty" | CineFrame["status"]>("all");
  const [showStoryboardDetails, setShowStoryboardDetails] = useState(false);
  const [videoPrepareSummary, setVideoPrepareSummary] = useState<string>("");
  const [generationMessage, setGenerationMessage] = useState("");
  const staleVideoRecoveryRef = useRef("");
  const safeData = data || createEmptyCineNodeData();

  useEffect(() => {
    if (generatingTarget) return;
    const staleSceneIds = safeData.scenes
      .filter((scene) => scene.video?.status === "generating")
      .map((scene) => scene.id)
      .sort();
    if (!staleSceneIds.length) return;
    const signature = staleSceneIds.join(",");
    if (staleVideoRecoveryRef.current === signature) return;
    staleVideoRecoveryRef.current = signature;
    const next = {
      ...safeData,
      scenes: safeData.scenes.map((scene) =>
        scene.video?.status === "generating"
          ? {
              ...scene,
              video: {
                ...scene.video,
                status: "prepared" as const,
                errorMessage: "La generación se interrumpió (recarga, cierre de pestaña o timeout del servidor). Vuelve a pulsar Generar vídeo.",
              },
            }
          : scene,
      ),
    };
    onChange(updated({ ...next, status: nextStatus(next) }));
    setVideoPrepareSummary("Generación de vídeo interrumpida — puedes reintentar.");
  }, [generatingTarget, onChange, safeData]);
  const mutations = useCineMutations(safeData, onChange, nodeId, brainConnected);
  const script = safeData.manualScript || safeData.sourceScript?.text || sourceScriptText || "";
  const framesPrepared = safeData.scenes.reduce((count, scene) => count + [scene.frames.single, scene.frames.start, scene.frames.end].filter(Boolean).length, 0);
  const tabs: Array<{ id: CineStudioTab; label: string; icon: React.ReactNode }> = [
    { id: "direction", label: "Dirección", icon: <Sparkles size={14} /> },
    { id: "script", label: "Guion", icon: <BookOpen size={14} /> },
    { id: "cast", label: "Reparto", icon: <Users size={14} /> },
    { id: "backgrounds", label: "Fondos", icon: <Map size={14} /> },
    { id: "storyboard", label: "Storyboard", icon: <Clapperboard size={14} /> },
    { id: "output", label: "Salida", icon: <Film size={14} /> },
  ];

  const exportPlan = useMemo(() => ({
    cineNodeId: nodeId,
    mode: safeData.visualDirection.mode,
    aspectRatio: safeData.visualDirection.aspectRatio,
    scenes: safeData.scenes.map((scene) => ({
      sceneId: scene.id,
      order: scene.order,
      title: scene.title,
      framesMode: scene.framesMode,
      video: scene.video,
      prompt: scene.video?.prompt,
    })),
  }), [nodeId, safeData.scenes, safeData.visualDirection.aspectRatio, safeData.visualDirection.mode]);
  const mediaListOutput = useMemo(() => buildCineMediaListOutput(safeData, nodeId), [nodeId, safeData]);
  const mediaListPreviewItems = useMemo(
    () => mediaListOutput.items.filter((item) => item.mediaType !== "placeholder").slice(0, 5),
    [mediaListOutput.items],
  );
  const characterSheetAsset = getEffectiveCharacterSheetAsset(safeData);
  const locationSheetAsset = getEffectiveLocationSheetAsset(safeData);
  const characterSheetS3Key = getEffectiveCharacterSheetS3Key(safeData);
  const locationSheetS3Key = getEffectiveLocationSheetS3Key(safeData);
  const selectedFrameCount = Object.values(selectedFrames).filter(Boolean).length;
  const selectedSceneCount = safeData.scenes.filter((scene) => cineSceneFrameRoles(scene).some((role) => selectedFrames[`frame:${scene.id}:${role}`])).length;
  const filteredStoryboardScenes = useMemo(() => {
    if (storyboardStatusFilter === "all") return safeData.scenes;
    return safeData.scenes.filter((scene) => cineSceneFrameRoles(scene).some((role) => {
      const frame = scene.frames[role];
      if (storyboardStatusFilter === "empty") return !frame || !getEffectiveCineFrameAsset(frame);
      return frame?.status === storyboardStatusFilter;
    }));
  }, [safeData.scenes, storyboardStatusFilter]);

  const workflowSnapshot = useMemo(
    () => getCineWorkflowSnapshot(script, Boolean(safeData.detected), safeData.scenes.length),
    [safeData.detected, safeData.scenes.length, script],
  );
  const tabAccess = useMemo(() => getCineTabAccess(workflowSnapshot), [workflowSnapshot]);
  const workflowHint = getCineWorkflowHint(workflowSnapshot);
  const tabsWithAccess = useMemo(
    () =>
      tabs.map((tab) => {
        const access = tabAccess.find((item) => item.id === tab.id);
        return { ...tab, unlocked: access?.unlocked ?? true, lockReason: access?.lockReason };
      }),
    [tabAccess, tabs],
  );

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, initialSceneId]);

  useEffect(() => {
    if (isCineTabUnlocked(activeTab, workflowSnapshot)) return;
    setActiveTab(getCineRecommendedTab(workflowSnapshot, initialTab));
  }, [activeTab, initialTab, workflowSnapshot]);

  const goToRecommended = useCallback(() => {
    setActiveTab(getCineRecommendedTab(workflowSnapshot));
  }, [workflowSnapshot]);

  const renderLockedTab = (tab: CineStudioTab) => {
    const access = tabAccess.find((item) => item.id === tab);
    return (
      <CineStudioLockedPanel
        title="Paso bloqueado"
        message={access?.lockReason ?? "Completa el paso anterior para continuar."}
        actionLabel={!workflowSnapshot.hasScript ? "Ir al guion" : "Ir a analizar guion"}
        onAction={goToRecommended}
      />
    );
  };

  const openCharacterImageStudio = useCallback(async (character: CineCharacter, mode: "generate" | "edit") => {
    if (!onOpenImageStudio) return;
    const sourceS3Key = mode === "edit" ? getEffectiveCineCharacterS3Key(character) : undefined;
    const sourceAssetId = mode === "edit" ? await resolveCineAssetUrl(getEffectiveCineCharacterAsset(character), sourceS3Key) : undefined;
    onOpenImageStudio({
      cineNodeId: nodeId,
      kind: "character",
      characterId: character.id,
      prompt: buildCineCharacterPrompt(safeData, character.id),
      negativePrompt: buildCineFrameNegativePrompt(),
      sourceAssetId,
      sourceS3Key,
      returnTab: "reparto",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "character",
        cineNodeId: nodeId,
        characterId: character.id,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        referenceAssetS3Keys: sourceS3Key ? [sourceS3Key] : [],
        createdAt: new Date().toISOString(),
      },
    });
  }, [brainConnected, nodeId, onOpenImageStudio, safeData]);

  const characterSession = useCallback((character: CineCharacter, mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const sourceAssetId = mode === "edit" ? getEffectiveCineCharacterAsset(character) : undefined;
    const sourceS3Key = mode === "edit" ? getEffectiveCineCharacterS3Key(character) : undefined;
    return {
      cineNodeId: nodeId,
      kind: "character",
      characterId: character.id,
      prompt: buildCineCharacterPrompt(safeData, character.id),
      negativePrompt: buildCineFrameNegativePrompt(),
      sourceAssetId,
      sourceS3Key,
      returnTab: "reparto",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "character",
        cineNodeId: nodeId,
        characterId: character.id,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        referenceAssetS3Keys: sourceS3Key ? [sourceS3Key] : [],
        createdAt: new Date().toISOString(),
      },
    };
  }, [brainConnected, nodeId, safeData]);

  const openBackgroundImageStudio = useCallback(async (background: CineBackground, mode: "generate" | "edit") => {
    if (!onOpenImageStudio) return;
    const sourceS3Key = mode === "edit" ? getEffectiveCineBackgroundS3Key(background) : undefined;
    const sourceAssetId = mode === "edit" ? await resolveCineAssetUrl(getEffectiveCineBackgroundAsset(background), sourceS3Key) : undefined;
    onOpenImageStudio({
      cineNodeId: nodeId,
      kind: "background",
      backgroundId: background.id,
      prompt: buildCineBackgroundPrompt(safeData, background.id),
      negativePrompt: buildCineFrameNegativePrompt(),
      sourceAssetId,
      sourceS3Key,
      returnTab: "fondos",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "background",
        cineNodeId: nodeId,
        backgroundId: background.id,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        referenceAssetS3Keys: sourceS3Key ? [sourceS3Key] : [],
        createdAt: new Date().toISOString(),
      },
    });
  }, [brainConnected, nodeId, onOpenImageStudio, safeData]);

  const backgroundSession = useCallback((background: CineBackground, mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const sourceAssetId = mode === "edit" ? getEffectiveCineBackgroundAsset(background) : undefined;
    const sourceS3Key = mode === "edit" ? getEffectiveCineBackgroundS3Key(background) : undefined;
    return {
      cineNodeId: nodeId,
      kind: "background",
      backgroundId: background.id,
      prompt: buildCineBackgroundPrompt(safeData, background.id),
      negativePrompt: buildCineFrameNegativePrompt(),
      sourceAssetId,
      sourceS3Key,
      returnTab: "fondos",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "background",
        cineNodeId: nodeId,
        backgroundId: background.id,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        referenceAssetS3Keys: sourceS3Key ? [sourceS3Key] : [],
        createdAt: new Date().toISOString(),
      },
    };
  }, [brainConnected, nodeId, safeData]);

  const openFrameImageStudio = useCallback(async (scene: CineScene, frameRole: CineFrame["role"], mode: "generate" | "edit") => {
    if (!onOpenImageStudio) return;
    const frame = scene.frames[frameRole];
    const sourceS3Key = mode === "edit" ? (frame?.editedImageS3Key || frame?.approvedImageS3Key || frame?.imageS3Key) : undefined;
    const sourceAssetId = mode === "edit" ? await resolveCineAssetUrl(frame?.editedImageAssetId || frame?.approvedImageAssetId || frame?.imageAssetId, sourceS3Key) : undefined;
    onOpenImageStudio({
      cineNodeId: nodeId,
      kind: "frame",
      sceneId: scene.id,
      frameRole,
      prompt: frame?.prompt || buildCineFramePrompt({ data: safeData, sceneId: scene.id, frameRole, cineNodeId: nodeId, brainConnected }),
      negativePrompt: frame?.negativePrompt || buildCineFrameNegativePrompt(),
      sourceAssetId,
      sourceS3Key,
      returnTab: "storyboard",
      returnSceneId: scene.id,
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "scene-frame",
        cineNodeId: nodeId,
        sceneId: scene.id,
        frameRole,
        charactersUsed: scene.characters,
        backgroundUsed: scene.backgroundId,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: mode === "edit" && sourceAssetId ? [sourceAssetId] : getCineFrameReferenceAssetIds(safeData, scene.id),
        referenceAssetS3Keys: mode === "edit" && sourceS3Key ? [sourceS3Key] : getCineFrameReferenceS3Keys(safeData, scene.id),
        characterSheetAssetId: safeData.continuity?.useCharacterSheetForFrames ? characterSheetAsset : undefined,
        characterSheetS3Key: safeData.continuity?.useCharacterSheetForFrames ? characterSheetS3Key : undefined,
        locationSheetAssetId: safeData.continuity?.useLocationSheetForFrames ? locationSheetAsset : undefined,
        locationSheetS3Key: safeData.continuity?.useLocationSheetForFrames ? locationSheetS3Key : undefined,
        createdAt: new Date().toISOString(),
      },
    });
  }, [brainConnected, characterSheetAsset, characterSheetS3Key, locationSheetAsset, locationSheetS3Key, nodeId, onOpenImageStudio, safeData]);

  const frameSession = useCallback((scene: CineScene, frameRole: CineFrame["role"], mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const frame = scene.frames[frameRole];
    const sourceAssetId = mode === "edit" ? (frame?.editedImageAssetId || frame?.approvedImageAssetId || frame?.imageAssetId) : undefined;
    const sourceS3Key = mode === "edit" ? (frame?.editedImageS3Key || frame?.approvedImageS3Key || frame?.imageS3Key) : undefined;
    return {
      cineNodeId: nodeId,
      kind: "frame",
      sceneId: scene.id,
      frameRole,
      prompt: frame?.prompt || buildCineFramePrompt({ data: safeData, sceneId: scene.id, frameRole, cineNodeId: nodeId, brainConnected }),
      negativePrompt: frame?.negativePrompt || buildCineFrameNegativePrompt(),
      sourceAssetId,
      sourceS3Key,
      returnTab: "storyboard",
      returnSceneId: scene.id,
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "scene-frame",
        cineNodeId: nodeId,
        sceneId: scene.id,
        frameRole,
        charactersUsed: scene.characters,
        backgroundUsed: scene.backgroundId,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: mode === "edit" && sourceAssetId ? [sourceAssetId] : getCineFrameReferenceAssetIds(safeData, scene.id),
        referenceAssetS3Keys: mode === "edit" && sourceS3Key ? [sourceS3Key] : getCineFrameReferenceS3Keys(safeData, scene.id),
        characterSheetAssetId: safeData.continuity?.useCharacterSheetForFrames ? characterSheetAsset : undefined,
        characterSheetS3Key: safeData.continuity?.useCharacterSheetForFrames ? characterSheetS3Key : undefined,
        locationSheetAssetId: safeData.continuity?.useLocationSheetForFrames ? locationSheetAsset : undefined,
        locationSheetS3Key: safeData.continuity?.useLocationSheetForFrames ? locationSheetS3Key : undefined,
        createdAt: new Date().toISOString(),
      },
    };
  }, [brainConnected, characterSheetAsset, characterSheetS3Key, locationSheetAsset, locationSheetS3Key, nodeId, safeData]);

  const characterSheetSession = useCallback((mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const sheet = safeData.continuity?.characterSheet;
    const sourceAssetId = mode === "edit" ? getEffectiveCharacterSheetAsset(safeData) : undefined;
    const sourceS3Key = mode === "edit" ? getEffectiveCharacterSheetS3Key(safeData) : undefined;
    const referenceAssetIds = mode === "edit" && sourceAssetId
      ? [sourceAssetId]
      : safeData.characters.map(getEffectiveCineCharacterAsset).filter((item): item is string => Boolean(item));
    const referenceAssetS3Keys = mode === "edit" && sourceS3Key
      ? [sourceS3Key]
      : safeData.characters.map(getEffectiveCineCharacterS3Key).filter((item): item is string => Boolean(item));
    return {
      cineNodeId: nodeId,
      kind: "character_sheet",
      prompt: buildCineCharacterSheetPrompt(safeData),
      negativePrompt: buildCineCharacterSheetNegativePrompt(),
      sourceAssetId,
      sourceS3Key,
      returnTab: "reparto",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "character-sheet",
        cineNodeId: nodeId,
        referenceAssetIds,
        referenceAssetS3Keys,
        createdAt: sheet?.createdAt || new Date().toISOString(),
      },
    };
  }, [nodeId, safeData]);

  const locationSheetSession = useCallback((mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const sheet = safeData.continuity?.locationSheet;
    const sourceAssetId = mode === "edit" ? getEffectiveLocationSheetAsset(safeData) : undefined;
    const sourceS3Key = mode === "edit" ? getEffectiveLocationSheetS3Key(safeData) : undefined;
    const referenceAssetIds = mode === "edit" && sourceAssetId
      ? [sourceAssetId]
      : safeData.backgrounds.map(getEffectiveCineBackgroundAsset).filter((item): item is string => Boolean(item));
    const referenceAssetS3Keys = mode === "edit" && sourceS3Key
      ? [sourceS3Key]
      : safeData.backgrounds.map(getEffectiveCineBackgroundS3Key).filter((item): item is string => Boolean(item));
    return {
      cineNodeId: nodeId,
      kind: "location_sheet",
      prompt: buildCineLocationSheetPrompt(safeData),
      negativePrompt: buildCineLocationSheetNegativePrompt(),
      sourceAssetId,
      sourceS3Key,
      returnTab: "fondos",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "location-sheet",
        cineNodeId: nodeId,
        referenceAssetIds,
        referenceAssetS3Keys,
        createdAt: sheet?.createdAt || new Date().toISOString(),
      },
    };
  }, [nodeId, safeData]);

  const openSheetImageStudio = useCallback(async (session: Omit<CineImageStudioSession, "nanoNodeId">) => {
    if (!onOpenImageStudio || !session.sourceAssetId) return;
    onOpenImageStudio({
      ...session,
      sourceAssetId: await resolveCineAssetUrl(session.sourceAssetId, session.sourceS3Key),
    });
  }, [onOpenImageStudio]);

  const patchFrameStatus = useCallback((session: Omit<CineImageStudioSession, "nanoNodeId">, status: CineFrame["status"], baseData: CineNodeData = safeData) => {
    if (session.kind !== "frame" || !session.sceneId || !session.frameRole) return;
    const frameRole = session.frameRole;
    const next = {
      ...baseData,
      scenes: baseData.scenes.map((scene) => {
        if (scene.id !== session.sceneId) return scene;
        const existing = scene.frames[frameRole] ?? {
          id: makeCineId("cine_frame"),
          role: frameRole,
          prompt: session.prompt,
          negativePrompt: session.negativePrompt,
          status: "draft" as const,
        };
        return {
          ...scene,
          frames: {
            ...scene.frames,
            [frameRole]: {
              ...existing,
              prompt: session.prompt || existing.prompt,
              negativePrompt: session.negativePrompt || existing.negativePrompt,
              status,
              metadata: {
                ...existing.metadata,
                generatedFrom: "cine-node",
                cineAssetKind: "scene-frame",
                cineNodeId: nodeId,
                sceneId: session.sceneId!,
                frameRole,
                prompt: session.prompt || existing.prompt,
                negativePrompt: session.negativePrompt || existing.negativePrompt,
                charactersUsed: session.metadata?.charactersUsed ?? existing.metadata?.charactersUsed ?? scene.characters,
                backgroundUsed: session.metadata?.backgroundUsed ?? existing.metadata?.backgroundUsed ?? scene.backgroundId,
                brainNodeId: session.metadata?.brainNodeId ?? existing.metadata?.brainNodeId,
                visualCapsuleIds: session.metadata?.visualCapsuleIds ?? existing.metadata?.visualCapsuleIds,
                sourceScriptNodeId: session.metadata?.sourceScriptNodeId ?? existing.metadata?.sourceScriptNodeId,
                referenceAssetIds: session.metadata?.referenceAssetIds ?? existing.metadata?.referenceAssetIds,
                referenceAssetS3Keys: session.metadata?.referenceAssetS3Keys ?? existing.metadata?.referenceAssetS3Keys,
                characterSheetAssetId: session.metadata?.characterSheetAssetId ?? existing.metadata?.characterSheetAssetId,
                characterSheetS3Key: session.metadata?.characterSheetS3Key ?? existing.metadata?.characterSheetS3Key,
                locationSheetAssetId: session.metadata?.locationSheetAssetId ?? existing.metadata?.locationSheetAssetId,
                locationSheetS3Key: session.metadata?.locationSheetS3Key ?? existing.metadata?.locationSheetS3Key,
                createdAt: existing.metadata?.createdAt || session.metadata?.createdAt || new Date().toISOString(),
              },
            },
          },
        };
      }),
    };
    onChange(updated({ ...next, status: nextStatus(next) }));
  }, [nodeId, onChange, safeData]);

  const generateImageInCine = useCallback(async (session: Omit<CineImageStudioSession, "nanoNodeId">, targetKey: string, baseData: CineNodeData = safeData): Promise<CineNodeData | null> => {
    if (generatingTarget) return null;
    if (session.kind === "frame") patchFrameStatus(session, "generating", baseData);
    setGeneratingTarget(targetKey);
    setGenerationMessage("Generando imagen 2K...");
    try {
      const rawReferenceImages = Array.from(
        new Set([...(session.metadata?.referenceAssetIds ?? []), session.sourceAssetId].filter((item): item is string => Boolean(item))),
      );
      const referenceKeys = Array.from(
        new Set([
          ...(session.metadata?.referenceAssetS3Keys ?? []),
          session.sourceS3Key,
          ...rawReferenceImages.map((item) => resolveCineS3Key(item)),
        ].filter((item): item is string => Boolean(item))),
      );
      const signedReferences = (await Promise.all(referenceKeys.map((key) => presignCineS3Key(key))))
        .filter((item): item is string => Boolean(item));
      const directReferences = rawReferenceImages.filter((item) => isDirectGeminiReference(item));
      const referenceImages = Array.from(new Set([...signedReferences, ...directReferences])).slice(0, 4);
      const result = await geminiGenerateWithServerProgress(
        {
          prompt: session.prompt,
          images: referenceImages,
          aspect_ratio: baseData.visualDirection.aspectRatio,
          resolution: "2k",
          model: "flash31",
          thinking: false,
        },
        (pct, stage) => setGenerationMessage(`${Math.max(1, Math.round(pct))}% · ${stage || "generando"}`),
      );
      const next = applyCineImageStudioResult(baseData, { ...session, nanoNodeId: "" }, {
        assetId: result.output,
        s3Key: result.key,
        promptUsed: session.prompt,
        negativePromptUsed: session.negativePrompt,
        mode: "generate",
      });
      onChange(updated({ ...next, status: nextStatus(next) }));
      setGenerationMessage("Imagen generada en Cine.");
      return next;
    } catch (error) {
      console.error("Cine image generation failed:", error);
      if (session.kind === "frame") patchFrameStatus(session, "error", baseData);
      setGenerationMessage(error instanceof Error ? error.message : "No se pudo generar la imagen.");
      return null;
    } finally {
      setGeneratingTarget(null);
    }
  }, [generatingTarget, onChange, patchFrameStatus, safeData]);

  const generateFrameSlot = useCallback(async (scene: CineScene, role: CineFrame["role"]) => {
    const frame = scene.frames[role];
    if (getEffectiveCineFrameAsset(frame) && !window.confirm("Este frame ya tiene una imagen. Se generará una nueva versión sin borrar el frame aprobado si existe.")) return;
    await generateImageInCine(frameSession(scene, role, "generate"), `frame:${scene.id}:${role}`);
  }, [frameSession, generateImageInCine]);

  const generateSelectedFrames = useCallback(async () => {
    if (generatingTarget) return;
    const jobs = safeData.scenes.flatMap((scene) => {
      const roles = scene.framesMode === "start_end" ? (["start", "end"] as CineFrame["role"][]) : (["single"] as CineFrame["role"][]);
      return roles
        .filter((role) => selectedFrames[`frame:${scene.id}:${role}`])
        .map((role) => ({ sceneId: scene.id, role }));
    });
    if (!jobs.length) return;
    const existingCount = jobs.filter(({ sceneId, role }) => Boolean(getEffectiveCineFrameAsset(safeData.scenes.find((scene) => scene.id === sceneId)?.frames[role]))).length;
    if (existingCount > 0 && !window.confirm(`${existingCount} frame(s) ya tienen imagen. Se regenerarán sin borrar aprobados. ¿Continuar?`)) return;
    let workingData = safeData;
    for (let i = 0; i < jobs.length; i += 1) {
      const { sceneId, role } = jobs[i]!;
      const scene = workingData.scenes.find((item) => item.id === sceneId);
      if (!scene) continue;
      setGenerationMessage(`Generando seleccionado ${i + 1}/${jobs.length}...`);
      const next = await generateImageInCine(frameSession(scene, role, "generate"), `frame:${scene.id}:${role}`, workingData);
      if (next) workingData = next;
    }
  }, [frameSession, generateImageInCine, generatingTarget, safeData, selectedFrames]);

  const prepareAllVideoPlans = useCallback(() => {
    let prepared = 0;
    let pending = 0;
    const scenes = safeData.scenes.map((scene) => {
      const video = prepareSceneForVideo(safeData, scene.id, nodeId);
      if (video.status === "prepared" || video.status === "generated") prepared += 1;
      if (video.status === "missing_frames") pending += 1;
      return {
        ...scene,
        video,
        status: video.status === "prepared" || video.status === "generated" ? "ready_for_video" as const : scene.status,
      };
    });
    const next = { ...safeData, scenes };
    onChange(updated({ ...next, status: nextStatus(next) }));
    setVideoPrepareSummary(`${prepared} preparadas · ${pending} con frames pendientes`);
  }, [nodeId, onChange, safeData]);

  const commitVideoPlan = useCallback((baseData: CineNodeData, sceneId: string, video: CineVideoPlan): CineNodeData => {
    const next = {
      ...baseData,
      scenes: baseData.scenes.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              video,
              status: video.status === "prepared" || video.status === "generating" || video.status === "generated" ? "ready_for_video" as const : scene.status,
            }
          : scene,
      ),
    };
    onChange(updated({ ...next, status: nextStatus(next) }));
    return next;
  }, [onChange]);

  const generateSceneVideo = useCallback(async (scene: CineScene) => {
    if (generatingTarget) return;
    const preparedPlan = prepareSceneForVideo(safeData, scene.id, nodeId);
    if (preparedPlan.status === "missing_frames") {
      commitVideoPlan(safeData, scene.id, preparedPlan);
      setVideoPrepareSummary(`Faltan frames en ${scene.title}: ${cineMissingFramesLabel(preparedPlan.missingFrames)}`);
      return;
    }
    if (preparedPlan.status === "generated" && !window.confirm("Esta escena ya tiene un vídeo generado. Se creará una nueva versión sin borrar el plan anterior del JSON exportable. ¿Continuar?")) return;

    const provider = "gemini" as const;
    const apiAspectRatio = cineVideoApiAspectRatio(preparedPlan.aspectRatio);
    const targetKey = `video:${scene.id}`;
    const generatingPlan: CineVideoPlan = {
      ...preparedPlan,
      status: "generating",
      videoProvider: provider,
      errorMessage: undefined,
      warnings: [
        ...(preparedPlan.warnings ?? []),
        ...(preparedPlan.aspectRatio !== apiAspectRatio ? [`El proveedor de vídeo recibirá ${apiAspectRatio}; la dirección original de Cine es ${preparedPlan.aspectRatio}.`] : []),
      ],
    };
    let workingData = commitVideoPlan(safeData, scene.id, generatingPlan);
    setGeneratingTarget(targetKey);
    setGenerationMessage(`Generando vídeo de ${scene.title}...`);
    try {
      const firstAsset = preparedPlan.mode === "start_end_frames" ? preparedPlan.startFrameAssetId : preparedPlan.singleFrameAssetId;
      const firstKey = preparedPlan.mode === "start_end_frames" ? preparedPlan.startFrameS3Key : preparedPlan.singleFrameS3Key;
      const lastAsset = preparedPlan.mode === "start_end_frames" ? preparedPlan.endFrameAssetId : undefined;
      const lastKey = preparedPlan.mode === "start_end_frames" ? preparedPlan.endFrameS3Key : undefined;
      const firstFrame = await resolveCineAssetUrl(firstAsset, firstKey);
      const lastFrame = preparedPlan.mode === "start_end_frames" ? await resolveCineAssetUrl(lastAsset, lastKey) : undefined;
      if (!firstFrame) throw new Error("No encuentro un frame base válido para generar vídeo.");
      if (preparedPlan.mode === "start_end_frames" && !lastFrame) throw new Error("Falta resolver el frame final para generar vídeo start/end.");

      const frameAssetIds = new Set([preparedPlan.singleFrameAssetId, preparedPlan.startFrameAssetId, preparedPlan.endFrameAssetId].filter(Boolean));
      const baseReferenceCount = [firstFrame, lastFrame].filter(Boolean).length;
      const extraReferenceLimit = Math.min(
        CINE_GEMINI_VIDEO_EXTRA_REFERENCE_IMAGES,
        Math.max(0, CINE_GEMINI_VIDEO_MAX_REFERENCE_IMAGES - baseReferenceCount),
      );
      const referenceKeys = extraReferenceLimit > 0
        ? Array.from(new Set([
            ...(preparedPlan.referenceAssetS3Keys ?? []),
            ...(preparedPlan.referenceAssetIds ?? []).map((item) => resolveCineS3Key(item)),
          ].filter((item): item is string => Boolean(item))))
        : [];
      const signedReferenceUrls = extraReferenceLimit > 0
        ? (await Promise.all(referenceKeys.map((key) => presignCineS3Key(key)))).filter((item): item is string => Boolean(item))
        : [];
      const directReferenceUrls = extraReferenceLimit > 0
        ? (preparedPlan.referenceAssetIds ?? []).filter((item) => !frameAssetIds.has(item) && isDirectGeminiReference(item))
        : [];
      const extraReferences = Array.from(new Set([...signedReferenceUrls, ...directReferenceUrls])).slice(0, extraReferenceLimit);
      const videoRefSlots = Object.fromEntries(extraReferences.map((url, index) => [`Image${index + 1}`, url]));
      const res = await fetch("/api/gemini/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: preparedPlan.prompt,
          firstFrame,
          lastFrame,
          videoRefSlots,
          resolution: "1080p",
          aspectRatio: apiAspectRatio,
          durationSeconds: preparedPlan.durationSeconds,
          audio: false,
          negativePrompt: preparedPlan.negativePrompt,
          cameraPreset: preparedPlan.cameraPrompt || preparedPlan.cameraDescription,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { output?: string; key?: string; error?: string };
      if (!res.ok || !json.output) {
        const message = json.error || "No se pudo generar el vídeo.";
        workingData = commitVideoPlan(workingData, scene.id, {
          ...generatingPlan,
          status: "error",
          errorMessage: message,
          metadata: {
            ...generatingPlan.metadata,
            generatedFrom: "cine-node",
            cineNodeId: nodeId,
            updatedAt: new Date().toISOString(),
          },
        });
        setVideoPrepareSummary(message);
        return;
      }
      const generatedPlan: CineVideoPlan = {
        ...generatingPlan,
        status: "generated",
        videoAssetId: json.output,
        videoUrl: json.output,
        videoS3Key: json.key,
        generatedVideoAssetId: json.output,
        generatedVideoS3Key: json.key,
        videoProvider: provider,
        generatedAt: new Date().toISOString(),
        errorMessage: undefined,
	        metadata: {
	          ...generatingPlan.metadata,
	          generatedFrom: "cine-node",
	          cineNodeId: nodeId,
	          updatedAt: new Date().toISOString(),
	        },
      };
      workingData = commitVideoPlan(workingData, scene.id, generatedPlan);
      setVideoPrepareSummary(`Vídeo generado · ${scene.title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo generar el vídeo.";
      console.warn("Cine video generation failed:", message);
      commitVideoPlan(workingData, scene.id, {
        ...generatingPlan,
        status: "error",
        errorMessage: message,
	        metadata: {
	          ...generatingPlan.metadata,
	          generatedFrom: "cine-node",
	          cineNodeId: nodeId,
	          updatedAt: new Date().toISOString(),
	        },
      });
      setVideoPrepareSummary(message);
    } finally {
      setGeneratingTarget(null);
      setGenerationMessage("");
    }
  }, [commitVideoPlan, generatingTarget, nodeId, safeData]);

  const runAnalysis = async () => {
    const source = script.trim();
    if (!source || analysisState.status === "running") return;
    setAnalysisState({
      status: "running",
      message: analyzerMode === "ai" ? "Analizando con IA..." : "Analizando con parser local...",
    });
    if (analyzerMode === "local") {
      const analysis = analyzeCineScript(source, { mode: safeData.visualDirection.mode, visualDirection: safeData.visualDirection });
      onChange(updated(applyCineAnalysisToData({ ...safeData, mode: safeData.visualDirection.mode, manualScript: source }, analysis)));
      setAnalysisState({ status: "done", message: "Analizado con parser local." });
      return;
    }
    try {
      const analysis = await analyzeCineScriptWithAI(source, {
        mode: safeData.visualDirection.mode,
        visualDirection: safeData.visualDirection,
      });
      onChange(updated(applyCineAnalysisToData({ ...safeData, mode: safeData.visualDirection.mode, manualScript: source }, analysis)));
      setAnalysisState({ status: "done", message: "Analizado con IA." });
    } catch (error) {
      console.warn("Cine AI analyzer failed, using local parser:", error);
      const fallback = analyzeCineScript(source, { mode: safeData.visualDirection.mode, visualDirection: safeData.visualDirection });
      onChange(updated(applyCineAnalysisToData({ ...safeData, mode: safeData.visualDirection.mode, manualScript: source }, fallback)));
      setAnalysisState({ status: "fallback", message: "La IA no respondió. He usado el parser local." });
    }
  };

  const shell = (
    <div
      className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14] text-white"
      data-foldder-studio-panel
      data-foldder-studio-flush
      data-foldder-cine-studio
      role="dialog"
      aria-modal="true"
      aria-label="Cine studio"
      style={{ ["--foldder-studio-accent" as string]: "#de323f" }}
    >
      <FoldderStudioHeader
        nodeType="cine"
        nodeLabel="Cine"
        subtitle="Mesa de dirección audiovisual"
        onClose={onClose}
      />
      <CineStudioTabBar
        tabs={tabsWithAccess}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (!isCineTabUnlocked(tab, workflowSnapshot)) {
            setActiveTab(getCineRecommendedTab(workflowSnapshot));
            return;
          }
          setActiveTab(tab);
        }}
      />
      <CineStudioWorkflowBar snapshot={workflowSnapshot} tabAccess={tabAccess} />
      {workflowHint ? (
        <p className="border-b border-white/10 bg-[var(--foldder-studio-accent,#de323f)]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-white/72">
          {workflowHint}
        </p>
      ) : null}
      <CineStudioMetricsBar
        statusLabel={CINE_STATUS_LABELS[safeData.status]}
        sceneCount={safeData.scenes.length}
        characterCount={safeData.characters.length}
        frameCount={framesPrepared}
        brainConnected={brainConnected}
      />
      <main className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
          {activeTab === "direction" ? (
            <div className="mx-auto max-w-7xl" data-cine-direction-panel>
              <DirectionHeaderBar
                action={
                  <ChromeIconButton onClick={() => setActiveTab("script")} title="Ir al guion">
                    <BookOpen size={14} strokeWidth={2} />
                  </ChromeIconButton>
                }
              >
                <DirectionStatRow>
                  <DirectionStat label="Pieza" value={CINE_MODE_SHORT_LABELS[safeData.visualDirection.mode]} />
                  <DirectionStat label="Formato" value={safeData.visualDirection.aspectRatio} />
                  <DirectionStat label="Estilo" value={CINE_VISUAL_STYLE_SHORT_LABELS[safeData.visualDirection.visualStyle]} />
                  <DirectionStat label="Color" value={CINE_COLOR_GRADING_SHORT_LABELS[safeData.visualDirection.colorGrading]} />
                  <DirectionStat label="Luz" value={CINE_LIGHTING_STYLE_LABELS[safeData.visualDirection.lightingStyle]} />
                </DirectionStatRow>
              </DirectionHeaderBar>

              <DirectionPromptPreview>
                {buildCineVisualDirectionPrompt(safeData.visualDirection)}
              </DirectionPromptPreview>

              <DirectionSection title="Tipo de pieza">
                <ChoiceGrid columns={8}>
                  {cineModes.map((mode) => (
                    <DirectionChoiceCard
                      key={mode}
                      active={safeData.visualDirection.mode === mode}
                      icon={CINE_MODE_ICONS[mode]}
                      title={CINE_MODE_LABELS[mode]}
                      shortLabel={CINE_MODE_SHORT_LABELS[mode]}
                      description={CINE_MODE_DESCRIPTIONS[mode]}
                      onClick={() => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, mode } }))}
                    />
                  ))}
                </ChoiceGrid>
              </DirectionSection>

              <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-white/10">
                <DirectionSection title="Formato">
                  <ChoiceGrid columns={5}>
                    {aspectRatios.map((ratio) => (
                      <DirectionChoiceCard
                        key={ratio}
                        active={safeData.visualDirection.aspectRatio === ratio}
                        icon={<CineAspectRatioIcon ratio={ratio} />}
                        title={ratio}
                        shortLabel={ratio}
                        description={ratio === "2.39:1" ? "Anamórfico · genera en 21:9." : ratio === "9:16" ? "Vertical social." : "Composición segura."}
                        onClick={() => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, aspectRatio: ratio } }))}
                      />
                    ))}
                  </ChoiceGrid>
                </DirectionSection>

                <DirectionSection title="Luz" className="lg:pl-3">
                  <ChoiceGrid columns={3}>
                    {lightingStyles.map((lighting) => (
                      <DirectionChoiceCard
                        key={lighting}
                        active={safeData.visualDirection.lightingStyle === lighting}
                        icon={
                          lighting === "dark" ? (
                            <Moon size={14} strokeWidth={2} />
                          ) : lighting === "bright" ? (
                            <Sun size={14} strokeWidth={2} />
                          ) : (
                            <SunMedium size={14} strokeWidth={2} />
                          )
                        }
                        title={CINE_LIGHTING_STYLE_LABELS[lighting]}
                        shortLabel={CINE_LIGHTING_STYLE_LABELS[lighting]}
                        description={CINE_LIGHTING_STYLE_DESCRIPTIONS[lighting]}
                        onClick={() => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, lightingStyle: lighting } }))}
                      />
                    ))}
                  </ChoiceGrid>
                </DirectionSection>
              </div>

              <DirectionSection title="Estilo visual">
                <ChoiceGrid columns={8}>
                  {visualStyles.map((style) => (
                    <DirectionChoiceCard
                      key={style}
                      active={safeData.visualDirection.visualStyle === style}
                      icon={CINE_VISUAL_STYLE_ICONS[style]}
                      title={CINE_VISUAL_STYLE_LABELS[style]}
                      shortLabel={CINE_VISUAL_STYLE_SHORT_LABELS[style]}
                      description={CINE_VISUAL_STYLE_DESCRIPTIONS[style]}
                      onClick={() => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, visualStyle: style } }))}
                    />
                  ))}
                </ChoiceGrid>
              </DirectionSection>

              <DirectionSection title="Color grading">
                <ChoiceGrid columns={10}>
                  {colorGradings.map((grading) => (
                    <DirectionChoiceCard
                      key={grading}
                      active={safeData.visualDirection.colorGrading === grading}
                      icon={<CineColorGradingIcon grading={grading} />}
                      title={CINE_COLOR_GRADING_LABELS[grading]}
                      shortLabel={CINE_COLOR_GRADING_SHORT_LABELS[grading]}
                      description={CINE_COLOR_GRADING_DESCRIPTIONS[grading]}
                      onClick={() => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, colorGrading: grading } }))}
                    />
                  ))}
                </ChoiceGrid>
              </DirectionSection>

              <DirectionSection title="Notas de dirección">
                <div className="grid gap-0 border-t border-l border-white/10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:divide-x lg:divide-white/10">
                  <div className="border-b border-r border-white/10 p-2 lg:border-b-0">
                    <FieldLabel>Dirección visual</FieldLabel>
                    <TextArea
                      value={safeData.visualDirection.globalStylePrompt ?? ""}
                      onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, globalStylePrompt: event.target.value } }))}
                      rows={2}
                      placeholder="Ópticas, textura, atmósfera..."
                      className="min-h-0 py-1.5 text-[12px]"
                    />
                  </div>
                  <div className="border-b border-r border-white/10 p-2 lg:border-b-0">
                    <FieldLabel>Cámara</FieldLabel>
                    <TextInput
                      value={safeData.visualDirection.cameraStyle ?? ""}
                      onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, cameraStyle: event.target.value } }))}
                      placeholder="Mano suave, ópticas naturales..."
                      className="py-1.5 text-[12px]"
                    />
                  </div>
                  <div className="flex items-center border-b border-white/10 p-2 lg:border-b-0 lg:justify-center">
                    <DirectionInlineToggle
                      checked={Boolean(safeData.visualDirection.useBrain)}
                      onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, useBrain: event.target.checked } }))}
                      label="Usar Brain"
                    />
                  </div>
                </div>
              </DirectionSection>
            </div>
          ) : null}

          {activeTab === "script" ? (
            <div className="mx-auto grid max-w-6xl gap-0 xl:grid-cols-[1fr_360px] xl:divide-x xl:divide-white/10">
              <CineStudioSection kicker="Paso 2" title="Guion">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-xl text-sm leading-relaxed text-white/45">
                    Pega un texto o importa el guion conectado. Después analízalo para desbloquear reparto, fondos, storyboard y salida.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton disabled={!script.trim() || analysisState.status === "running"} onClick={() => void runAnalysis()}>
                      <Wand2 size={14} />
                      {analysisState.status === "running" ? "Analizando..." : "Analiza el guion"}
                    </PrimaryButton>
                    {workflowSnapshot.hasAnalysis ? (
                      <PillButton disabled={!script.trim()} onClick={() => mutations.createStoryboard(script)}>
                        <Clapperboard size={14} />Crear storyboard
                      </PillButton>
                    ) : null}
                  </div>
                </div>
                {!workflowSnapshot.hasAnalysis && script.trim() ? (
                  <div className="mb-4 border-b border-[var(--foldder-studio-accent,#de323f)]/25 bg-[var(--foldder-studio-accent,#de323f)]/10 px-4 py-3 text-xs leading-relaxed text-white/72">
                    Tienes texto en el guion. Pulsa <strong className="font-black uppercase tracking-[0.06em]">Analiza el guion</strong> para continuar.
                  </div>
                ) : null}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="flex h-10 divide-x divide-white/10 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setAnalyzerMode("ai")}
                      className={cx(
                        "px-3 text-[10px] font-black uppercase tracking-[0.1em] transition",
                        analyzerMode === "ai" ? "bg-white text-slate-950" : "bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white/75",
                      )}
                    >
                      Analizar con IA
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnalyzerMode("local")}
                      className={cx(
                        "px-3 text-[10px] font-black uppercase tracking-[0.1em] transition",
                        analyzerMode === "local" ? "bg-white text-slate-950" : "bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white/75",
                      )}
                    >
                      Parser local
                    </button>
                  </div>
                  <p className={cx(
                    "text-xs",
                    analysisState.status === "fallback" ? "text-amber-100/75" : "text-white/42",
                  )}>
                    {analysisState.message || "Por defecto usa IA; si falla, cae al analizador local sin perder el guion."}
                  </p>
                </div>
                {sourceScriptText ? (
                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                    <div className="min-w-0 text-sm text-cyan-50/80">Guion conectado disponible</div>
                    <PillButton onClick={() => mutations.useConnectedScript(sourceScriptText, sourceScriptNodeId)}>Usar conectado</PillButton>
                  </div>
                ) : null}
                <TextArea
                  value={safeData.manualScript ?? ""}
                  onChange={(event) => mutations.commit((draft) => ({ ...draft, manualScript: event.target.value }))}
                  placeholder="Pega aqui el guion, texto narrativo o estructura de escenas..."
                  className="min-h-[360px]"
                />
              </CineStudioSection>
              <CineStudioSection title="Dirección aplicada" className="xl:pl-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <PillButton onClick={() => setActiveTab("direction")}>Editar dirección</PillButton>
                </div>
                <StatRow>
                  <Stat label="Pieza" value={CINE_MODE_LABELS[safeData.visualDirection.mode]} />
                  <Stat label="Formato" value={safeData.visualDirection.aspectRatio} />
                </StatRow>
                <StatRow>
                  <Stat label="Estilo" value={CINE_VISUAL_STYLE_LABELS[safeData.visualDirection.visualStyle]} />
                  <Stat label="Color" value={CINE_COLOR_GRADING_LABELS[safeData.visualDirection.colorGrading]} />
                </StatRow>
                <StatRow>
                  <Stat label="Luz" value={CINE_LIGHTING_STYLE_LABELS[safeData.visualDirection.lightingStyle]} />
                </StatRow>
                <p className="mt-4 text-xs leading-relaxed text-white/42">
                  El análisis usará esta dirección para crear escenas, localizaciones, personajes, cámara y atmósfera.
                </p>
              </CineStudioSection>
              {safeData.detected ? (
                <CineStudioSection className="xl:col-span-2" title="Análisis">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <PillButton onClick={() => setActiveTab("cast")}>Ir a producción <ArrowRight size={13} /></PillButton>
                  </div>
                  <StatRow>
                    <Stat label="Tono" value={safeData.detected.tone || "-"} />
                    <Stat label="Modo sugerido" value={safeData.detected.suggestedMode ? CINE_MODE_LABELS[safeData.detected.suggestedMode] : "-"} />
                    <Stat label="Escenas" value={safeData.scenes.length} />
                  </StatRow>
                  <p className="mt-4 text-sm leading-relaxed text-white/55">{safeData.detected.summary}</p>
                </CineStudioSection>
              ) : null}
            </div>
          ) : null}

          {activeTab === "cast" ? (
            !isCineTabUnlocked("cast", workflowSnapshot) ? (
              renderLockedTab("cast")
            ) : (
            <div className="mx-auto max-w-[1500px]">
              <CineStudioSection kicker="Producción" title="Reparto">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white/45">Identidad visual de personajes. Primero imagen, después detalles.</p>
                  <PrimaryButton onClick={() => mutations.addCharacter()}><Plus size={14} />Añadir personaje</PrimaryButton>
                </div>
              </CineStudioSection>

              <CineStudioAssetCard className="mb-3">
                <div className="grid gap-0 lg:grid-cols-[420px_1fr]">
                  <CineVisualAssetHero src={characterSheetAsset} s3Key={characterSheetS3Key} title="Identidad visual del reparto" kicker="Hoja de continuidad" subtitle={`${safeData.characters.length} personajes incluidos · layout ${getCineCharacterSheetLayout(safeData)}`} status={safeData.continuity?.characterSheet?.status ?? "sin hoja"} icon={<Users size={34} />} />
                  <div className="flex flex-col justify-between p-5">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">Character continuity sheet</div>
                      <h3 className="mt-1 text-lg font-semibold">Mantener rostros, escala, vestuario y rasgos bloqueados entre escenas.</h3>
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/48">Esta hoja funciona como referencia global para frames. No genera vídeo ni abre Nano; solo refuerza continuidad visual.</p>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <label className="flex h-10 items-center gap-2 border-b border-white/10 px-0 py-2 text-xs font-semibold text-white/65">
                        <input type="checkbox" checked={Boolean(safeData.continuity?.useCharacterSheetForFrames)} onChange={(event) => mutations.commit((draft) => ({ ...draft, continuity: { ...draft.continuity, useCharacterSheetForFrames: event.target.checked } }))} />
                        Usar en frames
                      </label>
                      <PillButton disabled={!safeData.characters.length || Boolean(generatingTarget)} onClick={() => void generateImageInCine(characterSheetSession("generate"), "character-sheet")}><Camera size={13} />{generatingTarget === "character-sheet" ? "Generando 2K..." : characterSheetAsset ? "Regenerar hoja" : "Crear hoja"}</PillButton>
                      <PillButton disabled={!onOpenImageStudio || !characterSheetAsset} onClick={() => void openSheetImageStudio(characterSheetSession("edit"))}>Editar</PillButton>
                    </div>
                  </div>
                </div>
              </CineStudioAssetCard>

              <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {safeData.characters.map((character) => {
                  const asset = getEffectiveCineCharacterAsset(character);
                  const s3Key = getEffectiveCineCharacterS3Key(character);
                  const status = character.approvedImageAssetId ? "aprobado" : character.editedImageAssetId ? "editado" : character.generatedImageAssetId ? "generado" : "pendiente";
                  return (
                    <CineStudioAssetCard key={character.id}>
                      <CineVisualAssetHero src={asset} s3Key={s3Key} title={character.name || "Personaje"} kicker={character.role === "protagonist" ? "Protagonista" : character.role} subtitle={character.description || character.visualPrompt || "Referencia visual pendiente."} status={status} icon={<Users size={34} />} />
                      <div className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <CineStudioBadge tone="accent">{character.role}</CineStudioBadge>
                          {character.isLocked ? <CineStudioBadge tone="success">Identidad bloqueada</CineStudioBadge> : null}
                          {character.wardrobe ? <CineStudioBadge tone="neutral">Vestuario</CineStudioBadge> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <PillButton disabled={Boolean(generatingTarget)} onClick={() => void generateImageInCine(characterSession(character, "generate"), `character:${character.id}`)}><Camera size={13} />{generatingTarget === `character:${character.id}` ? "Generando 2K..." : asset ? "Regenerar" : "Generar"}</PillButton>
                          <PillButton disabled={!onOpenImageStudio || !asset} onClick={() => void openCharacterImageStudio(character, "edit")}>Editar</PillButton>
                          <PillButton onClick={() => mutations.patchCharacter(character.id, { isLocked: !character.isLocked })}>{character.isLocked ? <Lock size={13} /> : <Unlock size={13} />}{character.isLocked ? "Bloqueado" : "Bloquear"}</PillButton>
                        </div>
                        <details className="mt-3 border-t border-white/10 pt-3">
                          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">Ver detalles</summary>
                          <div className="mt-3 grid gap-3">
                            <div><FieldLabel>Nombre</FieldLabel><TextInput value={character.name} onChange={(event) => mutations.patchCharacter(character.id, { name: event.target.value })} className="text-base font-semibold" /></div>
                            <div><FieldLabel>Rol</FieldLabel><Select value={character.role} onChange={(event) => mutations.patchCharacter(character.id, { role: event.target.value as CineCharacter["role"] })}><option value="protagonist">Protagonista</option><option value="secondary">Secundario</option><option value="extra">Extra</option><option value="object">Objeto</option></Select></div>
                            <div><FieldLabel>Descripción</FieldLabel><TextArea rows={3} value={character.description} onChange={(event) => mutations.patchCharacter(character.id, { description: event.target.value })} /></div>
                            <div><FieldLabel>Prompt visual</FieldLabel><TextArea rows={4} value={character.visualPrompt} onChange={(event) => mutations.patchCharacter(character.id, { visualPrompt: event.target.value })} /></div>
                            <div><FieldLabel>Negative prompt</FieldLabel><TextInput value={character.negativePrompt ?? ""} onChange={(event) => mutations.patchCharacter(character.id, { negativePrompt: event.target.value })} /></div>
                            <div><FieldLabel>Rasgos bloqueados</FieldLabel><TextInput value={character.lockedTraits.join(", ")} onChange={(event) => mutations.patchCharacter(character.id, { lockedTraits: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="pelo, edad, vestuario, gesto..." /></div>
                            <div><FieldLabel>Vestuario</FieldLabel><TextInput value={character.wardrobe ?? ""} onChange={(event) => mutations.patchCharacter(character.id, { wardrobe: event.target.value })} /></div>
                            <div><FieldLabel>Rango emocional</FieldLabel><TextInput value={(character.emotionalRange ?? []).join(", ")} onChange={(event) => mutations.patchCharacter(character.id, { emotionalRange: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></div>
                            <div><FieldLabel>Notas</FieldLabel><TextArea rows={2} value={character.notes ?? ""} onChange={(event) => mutations.patchCharacter(character.id, { notes: event.target.value })} /></div>
                            <div className="flex flex-wrap gap-2"><PillButton onClick={() => mutations.duplicateCharacter(character.id)}><Copy size={13} />Duplicar</PillButton><PillButton onClick={() => mutations.removeCharacter(character.id)} className="text-rose-100"><Trash2 size={13} />Eliminar</PillButton></div>
                          </div>
                        </details>
                      </div>
                    </CineStudioAssetCard>
                  );
                })}
              </div>
            </div>
            )
          ) : null}

          {activeTab === "backgrounds" ? (
            !isCineTabUnlocked("backgrounds", workflowSnapshot) ? (
              renderLockedTab("backgrounds")
            ) : (
            <div className="mx-auto max-w-[1500px]">
              <CineStudioSection kicker="Producción" title="Fondos">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white/45">Localizaciones reutilizables. Imagen, atmósfera y continuidad antes que formulario.</p>
                  <PrimaryButton onClick={() => mutations.addBackground()}><Plus size={14} />Añadir fondo</PrimaryButton>
                </div>
              </CineStudioSection>

              <CineStudioAssetCard className="mb-3">
                <div className="grid gap-0 lg:grid-cols-[420px_1fr]">
                  <CineVisualAssetHero src={locationSheetAsset} s3Key={locationSheetS3Key} title="Coherencia visual de fondos" kicker="Hoja de localizaciones" subtitle={`${safeData.backgrounds.length} fondos incluidos · layout ${safeData.backgrounds.length <= 1 ? "single" : "grid"}`} status={safeData.continuity?.locationSheet?.status ?? "sin hoja"} icon={<Map size={34} />} />
                  <div className="flex flex-col justify-between p-5">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">Location continuity sheet</div>
                      <h3 className="mt-1 text-lg font-semibold">Conservar arquitectura, luz, texturas y atmósfera entre escenas.</h3>
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/48">Esta hoja compone las localizaciones como referencia global para los frames. No crea vídeo ni cambia el VideoNode.</p>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <label className="flex h-10 items-center gap-2 border-b border-white/10 px-0 py-2 text-xs font-semibold text-white/65"><input type="checkbox" checked={Boolean(safeData.continuity?.useLocationSheetForFrames)} onChange={(event) => mutations.commit((draft) => ({ ...draft, continuity: { ...draft.continuity, useLocationSheetForFrames: event.target.checked } }))} />Usar en frames</label>
                      <PillButton disabled={!safeData.backgrounds.length || Boolean(generatingTarget)} onClick={() => void generateImageInCine(locationSheetSession("generate"), "location-sheet")}><Camera size={13} />{generatingTarget === "location-sheet" ? "Generando 2K..." : locationSheetAsset ? "Regenerar hoja" : "Crear hoja"}</PillButton>
                      <PillButton disabled={!onOpenImageStudio || !locationSheetAsset} onClick={() => void openSheetImageStudio(locationSheetSession("edit"))}>Editar</PillButton>
                    </div>
                  </div>
                </div>
              </CineStudioAssetCard>

              <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {safeData.backgrounds.map((background) => {
                  const asset = getEffectiveCineBackgroundAsset(background);
                  const s3Key = getEffectiveCineBackgroundS3Key(background);
                  const status = background.approvedImageAssetId ? "aprobado" : background.editedImageAssetId ? "editado" : background.generatedImageAssetId ? "generado" : "pendiente";
                  return (
                    <CineStudioAssetCard key={background.id}>
                      <CineVisualAssetHero src={asset} s3Key={s3Key} title={background.name || "Fondo"} kicker={background.type ?? "Localización"} subtitle={background.description || background.visualPrompt || "Referencia visual pendiente."} status={status} icon={<Map size={34} />} />
                      <div className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <CineStudioBadge tone="accent">{background.type ?? "other"}</CineStudioBadge>
                          {background.isLocked ? <CineStudioBadge tone="success">Fondo bloqueado</CineStudioBadge> : null}
                          {background.lighting ? <CineStudioBadge tone="neutral">Luz definida</CineStudioBadge> : null}
                          {background.textures?.length ? <CineStudioBadge tone="neutral">Texturas</CineStudioBadge> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <PillButton disabled={Boolean(generatingTarget)} onClick={() => void generateImageInCine(backgroundSession(background, "generate"), `background:${background.id}`)}><Camera size={13} />{generatingTarget === `background:${background.id}` ? "Generando 2K..." : asset ? "Regenerar" : "Generar"}</PillButton>
                          <PillButton disabled={!onOpenImageStudio || !asset} onClick={() => void openBackgroundImageStudio(background, "edit")}>Editar</PillButton>
                          <PillButton onClick={() => mutations.patchBackground(background.id, { isLocked: !background.isLocked })}>{background.isLocked ? <Lock size={13} /> : <Unlock size={13} />}{background.isLocked ? "Bloqueado" : "Bloquear"}</PillButton>
                        </div>
                        <details className="mt-3 border-t border-white/10 pt-3">
                          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">Ver detalles</summary>
                          <div className="mt-3 grid gap-3">
                            <div><FieldLabel>Nombre</FieldLabel><TextInput value={background.name} onChange={(event) => mutations.patchBackground(background.id, { name: event.target.value })} className="text-base font-semibold" /></div>
                            <div><FieldLabel>Tipo</FieldLabel><Select value={background.type ?? "other"} onChange={(event) => mutations.patchBackground(background.id, { type: event.target.value as CineBackground["type"] })}><option value="interior">Interior</option><option value="exterior">Exterior</option><option value="natural">Natural</option><option value="urban">Urbano</option><option value="studio">Studio</option><option value="abstract">Abstracto</option><option value="other">Otro</option></Select></div>
                            <div><FieldLabel>Descripción</FieldLabel><TextArea rows={3} value={background.description} onChange={(event) => mutations.patchBackground(background.id, { description: event.target.value })} /></div>
                            <div><FieldLabel>Prompt visual</FieldLabel><TextArea rows={4} value={background.visualPrompt} onChange={(event) => mutations.patchBackground(background.id, { visualPrompt: event.target.value })} /></div>
                            <div><FieldLabel>Negative prompt</FieldLabel><TextInput value={background.negativePrompt ?? ""} onChange={(event) => mutations.patchBackground(background.id, { negativePrompt: event.target.value })} /></div>
                            <div><FieldLabel>Luz habitual</FieldLabel><TextInput value={background.lighting ?? ""} onChange={(event) => mutations.patchBackground(background.id, { lighting: event.target.value })} /></div>
                            <div><FieldLabel>Paleta</FieldLabel><TextInput value={(background.palette ?? []).join(", ")} onChange={(event) => mutations.patchBackground(background.id, { palette: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></div>
                            <div><FieldLabel>Texturas</FieldLabel><TextInput value={(background.textures ?? []).join(", ")} onChange={(event) => mutations.patchBackground(background.id, { textures: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></div>
                            <div><FieldLabel>Elementos bloqueados</FieldLabel><TextInput value={(background.lockedElements ?? []).join(", ")} onChange={(event) => mutations.patchBackground(background.id, { lockedElements: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></div>
                            <div><FieldLabel>Notas</FieldLabel><TextArea rows={2} value={background.notes ?? ""} onChange={(event) => mutations.patchBackground(background.id, { notes: event.target.value })} /></div>
                            <div className="flex flex-wrap gap-2"><PillButton onClick={() => mutations.duplicateBackground(background.id)}><Copy size={13} />Duplicar</PillButton><PillButton onClick={() => mutations.removeBackground(background.id)} className="text-rose-100"><Trash2 size={13} />Eliminar</PillButton></div>
                          </div>
                        </details>
                      </div>
                    </CineStudioAssetCard>
                  );
                })}
              </div>
            </div>
            )
          ) : null}

          {activeTab === "storyboard" ? (
            !isCineTabUnlocked("storyboard", workflowSnapshot) ? (
              renderLockedTab("storyboard")
            ) : (
            <div className="mx-auto max-w-[1500px]">
              <CineStudioSection kicker="Producción" title="Storyboard">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white/45">Cuadrícula visual de escenas. La imagen manda; los controles acompañan.</p>
                  <div className="flex flex-wrap gap-2">
                    <PillButton disabled={!selectedFrameCount || Boolean(generatingTarget)} onClick={() => void generateSelectedFrames()}><Camera size={13} />Generar seleccionados · {selectedFrameCount}</PillButton>
                    <PrimaryButton disabled={!script.trim()} onClick={() => mutations.createStoryboard(script)}><Sparkles size={14} />Generar storyboard completo</PrimaryButton>
                  </div>
                </div>
              </CineStudioSection>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-2 py-2">
                <div className="flex flex-wrap items-center divide-x divide-white/10">
                  <PillButton onClick={() => setStoryboardView("grid")} className={cx("border-0", storyboardView === "grid" ? "bg-white text-slate-950" : "")}>Vista grid</PillButton>
                  <PillButton onClick={() => setStoryboardView("list")} className={cx("border-0", storyboardView === "list" ? "bg-white text-slate-950" : "")}>Vista lista</PillButton>
                  <div className="px-2">
                    <Select className="w-auto min-w-[150px]" value={storyboardStatusFilter} onChange={(event) => setStoryboardStatusFilter(event.target.value as typeof storyboardStatusFilter)}>
                      <option value="all">Todos los estados</option>
                      <option value="empty">Pendientes</option>
                      <option value="draft">Prompt preparado</option>
                      <option value="generating">Generando</option>
                      <option value="generated">Generado</option>
                      <option value="edited">Editado</option>
                      <option value="approved">Aprobado</option>
                      <option value="error">Error</option>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CineStudioBadge tone="neutral">{selectedSceneCount} escenas seleccionadas</CineStudioBadge>
                  <PillButton onClick={() => setShowStoryboardDetails((value) => !value)}>{showStoryboardDetails ? "Ocultar detalles" : "Mostrar detalles"}</PillButton>
                </div>
              </div>

              <div className="mb-4 divide-y divide-white/10 border-b border-white/10">
                <div className={cx("px-4 py-3 text-xs leading-relaxed", characterSheetAsset && safeData.continuity?.useCharacterSheetForFrames ? "bg-emerald-500/10 text-emerald-50/72" : "bg-amber-500/10 text-amber-50/68")}>
                  {characterSheetAsset && safeData.continuity?.useCharacterSheetForFrames ? "Usando hoja de personajes como referencia en frames." : "Recomendado: crea una hoja de continuidad de personajes antes de generar frames para mantener identidad entre escenas."}
                </div>
                <div className={cx("px-4 py-3 text-xs leading-relaxed", locationSheetAsset && safeData.continuity?.useLocationSheetForFrames ? "bg-emerald-500/10 text-emerald-50/72" : "bg-amber-500/10 text-amber-50/68")}>
                  {locationSheetAsset && safeData.continuity?.useLocationSheetForFrames ? "Usando hoja de localizaciones como referencia en frames." : "Recomendado: crea una hoja de continuidad de localizaciones para mantener coherencia entre fondos."}
                </div>
              </div>

              <div className={cx("grid", storyboardView === "grid" ? "gap-0 md:grid-cols-2 2xl:grid-cols-3 md:divide-x md:divide-white/10" : "mx-auto max-w-5xl divide-y divide-white/10")}> 
                {filteredStoryboardScenes.map((scene) => {
                  const roles = cineSceneFrameRoles(scene);
                  const sceneSelected = roles.every((role) => Boolean(selectedFrames[`frame:${scene.id}:${role}`]));
                  const anySelected = roles.some((role) => Boolean(selectedFrames[`frame:${scene.id}:${role}`]));
                  const primaryFrame = scene.framesMode === "start_end" ? scene.frames.start || scene.frames.end : scene.frames.single;
                  const isSceneGenerating = roles.some((role) => generatingTarget === `frame:${scene.id}:${role}`);
                  const sceneStatus = cineFrameStatusLabel(primaryFrame?.status, isSceneGenerating);
                  const background = safeData.backgrounds.find((item) => item.id === scene.backgroundId);
                  const characters = scene.characters.map((characterId) => safeData.characters.find((character) => character.id === characterId)).filter((item): item is CineCharacter => Boolean(item));
                  const effectiveDirection = getEffectiveSceneVisualDirection(safeData, scene);
                  const hasVisualOverride = Boolean(scene.visualOverride?.visualStyle || scene.visualOverride?.colorGrading || scene.visualOverride?.lightingStyle);
                  const toggleSceneSelection = (checked: boolean) => {
                    setSelectedFrames((current) => {
                      const next = { ...current };
                      roles.forEach((role) => {
                        next[`frame:${scene.id}:${role}`] = checked;
                      });
                      return next;
                    });
                  };
                  return (
                    <CineStudioAssetCard key={scene.id} className={cx(anySelected ? "border-[var(--foldder-studio-accent,#de323f)]/55" : undefined)}>
                      <div className="relative aspect-[16/10] min-h-[240px] overflow-hidden bg-slate-950">
                        <CineStoryboardHero scene={scene} />
                        <label className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 shadow-lg backdrop-blur-md">
                          <input className="h-4 w-4 accent-cyan-300" type="checkbox" checked={sceneSelected} onChange={(event) => toggleSceneSelection(event.target.checked)} />
                        </label>
                        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
	                          <span className={cx("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] backdrop-blur-md", isSceneGenerating ? "border-cyan-200/25 bg-cyan-300/15 text-cyan-50" : primaryFrame?.status === "approved" ? "border-emerald-200/20 bg-emerald-300/12 text-emerald-50" : primaryFrame?.status === "error" ? "border-rose-200/20 bg-rose-300/12 text-rose-50" : "border-white/15 bg-black/40 text-white/68")}>{sceneStatus}</span>{hasVisualOverride ? <span className="rounded-full border border-violet-200/20 bg-violet-300/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-50 backdrop-blur-md">Estilo propio</span> : null}{scene.video?.status ? <span className={cx("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] backdrop-blur-md", scene.video.status === "prepared" ? "border-emerald-200/20 bg-emerald-300/12 text-emerald-50" : scene.video.status === "missing_frames" ? "border-amber-200/20 bg-amber-300/12 text-amber-50" : "border-white/15 bg-black/40 text-white/60")}>{cineVideoStatusLabel(scene.video.status)}</span> : null}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/88 via-black/48 to-transparent p-4 pt-16">
                          <div className="flex items-end justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/70">Escena {String(scene.order).padStart(2, "0")} · {scene.durationSeconds ?? scene.shot.durationSeconds ?? 5}s</div>
                              <h3 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em] text-white">{scene.title}</h3>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/58">
                                <CineCameraMotionIcon type={scene.shot.cameraMovementType ?? "none"} active compact />
                                <span>{CINE_SHOT_LABELS[scene.shot.shotType]}</span>
                                <span>·</span>
	                                <span>{CINE_CAMERA_MOVEMENT_LABELS[scene.shot.cameraMovementType ?? "none"]}</span>
	                                <span>·</span>
	                                <span>{CINE_VISUAL_STYLE_LABELS[effectiveDirection.visualStyle]}</span>
	                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {characters.length ? characters.map((character) => <CineStudioBadge key={character.id} tone="accent">{character.name}</CineStudioBadge>) : <CineStudioBadge tone="neutral">Sin personajes</CineStudioBadge>}
                          {background ? <CineStudioBadge tone="neutral">{background.name}</CineStudioBadge> : null}
                        </div>
                        {scene.onScreenText?.length ? <p className="mt-2 line-clamp-2 text-xs text-amber-50/62">Overlay: {scene.onScreenText.join(" / ")}</p> : null}

                        <div className="mt-3 grid gap-2">
                          {roles.map((role) => {
                            const frame = scene.frames[role];
                            const imageSrc = getEffectiveCineFrameAsset(frame);
                            const targetKey = `frame:${scene.id}:${role}`;
                            const isGenerating = generatingTarget === targetKey;
                            const isSelected = Boolean(selectedFrames[targetKey]);
                            const label = cineFrameLabel(role);
                            return (
                              <div key={role} className={cx("border-b border-white/10 py-2 transition last:border-b-0", isSelected ? "bg-[var(--foldder-studio-accent,#de323f)]/10" : undefined)}>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <label className="flex items-center gap-2 text-[11px] font-semibold text-white/68">
                                    <input type="checkbox" checked={isSelected} onChange={(event) => setSelectedFrames((current) => ({ ...current, [targetKey]: event.target.checked }))} />
                                    {label}
                                  </label>
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/32">{cineFrameStatusLabel(frame?.status, isGenerating)}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <PillButton onClick={() => mutations.prepareFrame(scene.id, role)}>Prompt</PillButton>
                                  <PillButton disabled={Boolean(generatingTarget)} onClick={() => void generateFrameSlot(scene, role)}><Camera size={13} />{isGenerating ? "Generando 2K..." : imageSrc ? "Regenerar" : "Generar"}</PillButton>
	                                  <PillButton disabled={!frame?.prompt} onClick={() => frame?.prompt && setPromptPreview({ title: `${scene.title} · ${label}`, prompt: frame.prompt, negativePrompt: frame.negativePrompt, details: [["Dirección", `${CINE_VISUAL_STYLE_LABELS[effectiveDirection.visualStyle]} · ${CINE_COLOR_GRADING_LABELS[effectiveDirection.colorGrading]} · ${CINE_LIGHTING_STYLE_LABELS[effectiveDirection.lightingStyle]}${hasVisualOverride ? " · estilo propio" : ""}`], ["Personajes", characters.map((character) => character.name).join(", ") || "-"], ["Fondo", background?.name || "-"], ["Visual notes", scene.visualNotes || "-"], ["Voice over", scene.voiceOver || "-"], ["Scene kind", scene.sceneKind || "-"], ["Cámara", [CINE_CAMERA_MOVEMENT_LABELS[scene.shot.cameraMovementType ?? "none"], scene.shot.cameraDescription || scene.shot.cameraMovement].filter(Boolean).join(" · ") || "-"], ["On-screen text", scene.onScreenText?.length ? `${scene.onScreenText.join(" / ")} (overlay externo, excluido de la imagen)` : "-"], ["Referencias", getCineFrameReferenceAssetIds(safeData, scene.id).join(", ") || "-"]] })}>Ver prompt</PillButton>
                                  <PillButton disabled={!onOpenImageStudio || !imageSrc} onClick={() => void openFrameImageStudio(scene, role, "edit")}>Editar</PillButton>
                                  <PillButton disabled={!imageSrc} onClick={() => mutations.commit((draft) => approveCineFrame(draft, scene.id, role))}><Check size={13} />Aprobar</PillButton>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <details className="mt-3 border-t border-white/10 pt-3" open={showStoryboardDetails}>
                          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">Ver detalles</summary>
                          <div className="mt-3 grid gap-3">
                            <div className="flex flex-wrap items-center gap-2"><TextInput value={scene.title} onChange={(event) => mutations.patchScene(scene.id, { title: event.target.value })} className="min-w-[220px] flex-1 text-base font-semibold" /><PillButton onClick={() => mutations.duplicateScene(scene.id)}><Copy size={13} />Duplicar</PillButton><PillButton onClick={() => mutations.removeScene(scene.id)} className="text-rose-100"><Trash2 size={13} />Eliminar</PillButton></div>
                            <div><FieldLabel>Texto original</FieldLabel><TextArea rows={3} value={scene.sourceText} onChange={(event) => mutations.patchScene(scene.id, { sourceText: event.target.value })} /></div>
                            <div><FieldLabel>Resumen visual</FieldLabel><TextArea rows={3} value={scene.visualSummary} onChange={(event) => mutations.patchScene(scene.id, { visualSummary: event.target.value })} /></div>
                            {(scene.voiceOver || scene.onScreenText?.length || scene.visualNotes || scene.sceneKind) ? <div className="divide-y divide-white/10 border-b border-white/10 py-3 text-xs leading-relaxed text-white/58">{scene.sceneKind ? <div className="pb-3"><span className="font-semibold uppercase tracking-wide text-white/35">Tipo</span><p className="mt-1 text-white/70">{scene.sceneKind}</p></div> : null}{scene.voiceOver ? <div className="py-3"><span className="font-semibold uppercase tracking-wide text-white/35">Voz en off</span><p className="mt-1 whitespace-pre-wrap text-white/70">{scene.voiceOver}</p></div> : null}{scene.onScreenText?.length ? <div className="py-3"><span className="font-semibold uppercase tracking-wide text-white/35">Texto en pantalla</span><ul className="mt-1 list-disc space-y-1 pl-4 text-white/70">{scene.onScreenText.map((text, idx) => <li key={`${scene.id}_text_${idx}`}>{text}</li>)}</ul><p className="mt-2 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-50/70">El texto en pantalla se conservará como overlay. No se recomienda quemarlo dentro del frame generado.</p></div> : null}{scene.visualNotes ? <div className="pt-3"><span className="font-semibold uppercase tracking-wide text-white/35">Notas visuales</span><p className="mt-1 whitespace-pre-wrap text-white/70">{scene.visualNotes}</p></div> : null}</div> : null}
                            <div><FieldLabel>Personajes</FieldLabel><div className="mt-2 flex flex-wrap gap-2">{safeData.characters.length ? safeData.characters.map((character) => { const active = scene.characters.includes(character.id); return <button key={character.id} type="button" onClick={() => mutations.patchScene(scene.id, { characters: active ? scene.characters.filter((id) => id !== character.id) : [...scene.characters, character.id] })} className={cx("rounded-full border px-3 py-1.5 text-[11px] font-semibold transition", active ? "border-cyan-200/35 bg-cyan-300/16 text-cyan-50" : "border-white/10 bg-white/[0.04] text-white/48 hover:text-white/80")}>{character.name}</button>; }) : <span className="text-xs text-white/35">Sin personajes detectados todavía.</span>}</div></div>
	                            <div className="grid gap-3 md:grid-cols-2"><div><FieldLabel>Fondo</FieldLabel><Select value={scene.backgroundId ?? ""} onChange={(event) => mutations.patchScene(scene.id, { backgroundId: event.target.value || undefined })}><option value="">Sin fondo</option>{safeData.backgrounds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div><FieldLabel>Tipo de plano</FieldLabel><Select value={scene.shot.shotType} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, shotType: event.target.value as CineShot["shotType"] } })}>{shotTypes.map((shot) => <option key={shot} value={shot}>{CINE_SHOT_LABELS[shot]}</option>)}</Select></div></div>
	                            <SceneCameraControls scene={scene} onPatch={(patch) => mutations.patchScene(scene.id, patch)} />
	                            <div className="border-b border-white/10 py-3">
	                              <div className="mb-3 flex items-center justify-between gap-3">
	                                <FieldLabel>Dirección de escena</FieldLabel>
	                                <button
	                                  type="button"
	                                  onClick={() => mutations.patchScene(scene.id, { visualOverride: hasVisualOverride ? undefined : {
	                                    visualStyle: safeData.visualDirection.visualStyle,
	                                    colorGrading: safeData.visualDirection.colorGrading,
	                                    lightingStyle: safeData.visualDirection.lightingStyle,
	                                  } })}
	                                  className={cx("rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition", hasVisualOverride ? "border-violet-200/25 bg-violet-300/12 text-violet-50" : "border-white/10 bg-white/[0.04] text-white/45 hover:text-white/75")}
	                                >
	                                  {hasVisualOverride ? "Usar global" : "Personalizar"}
	                                </button>
	                              </div>
	                              {hasVisualOverride ? (
	                                <div className="grid gap-3 md:grid-cols-3">
	                                  <div><FieldLabel>Estilo visual</FieldLabel><Select value={scene.visualOverride?.visualStyle ?? safeData.visualDirection.visualStyle} onChange={(event) => mutations.patchScene(scene.id, { visualOverride: { ...(scene.visualOverride ?? {}), visualStyle: event.target.value as CineVisualStyle } })}>{visualStyles.map((style) => <option key={style} value={style}>{CINE_VISUAL_STYLE_LABELS[style]}</option>)}</Select></div>
	                                  <div><FieldLabel>Color grading</FieldLabel><Select value={scene.visualOverride?.colorGrading ?? safeData.visualDirection.colorGrading} onChange={(event) => mutations.patchScene(scene.id, { visualOverride: { ...(scene.visualOverride ?? {}), colorGrading: event.target.value as CineColorGrading } })}>{colorGradings.map((grading) => <option key={grading} value={grading}>{CINE_COLOR_GRADING_LABELS[grading]}</option>)}</Select></div>
	                                  <div><FieldLabel>Luz</FieldLabel><Select value={scene.visualOverride?.lightingStyle ?? safeData.visualDirection.lightingStyle} onChange={(event) => mutations.patchScene(scene.id, { visualOverride: { ...(scene.visualOverride ?? {}), lightingStyle: event.target.value as CineLightingStyle } })}>{lightingStyles.map((lighting) => <option key={lighting} value={lighting}>{CINE_LIGHTING_STYLE_LABELS[lighting]}</option>)}</Select></div>
	                                </div>
	                              ) : (
	                                <p className="text-xs leading-relaxed text-white/42">
	                                  Usa dirección global: {CINE_VISUAL_STYLE_LABELS[effectiveDirection.visualStyle]} · {CINE_COLOR_GRADING_LABELS[effectiveDirection.colorGrading]} · {CINE_LIGHTING_STYLE_LABELS[effectiveDirection.lightingStyle]}.
	                                </p>
	                              )}
	                            </div>
	                            <div className="grid gap-3 md:grid-cols-2"><div><FieldLabel>Luz</FieldLabel><TextInput value={scene.shot.lighting ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, lighting: event.target.value } })} /></div><div><FieldLabel>Duración</FieldLabel><TextInput type="number" value={scene.shot.durationSeconds ?? scene.durationSeconds ?? 5} onChange={(event) => mutations.patchScene(scene.id, { durationSeconds: Number(event.target.value) || 5, shot: { ...scene.shot, durationSeconds: Number(event.target.value) || 5 } })} /></div></div>
                            <div className="grid gap-3 md:grid-cols-2"><div><FieldLabel>Mood</FieldLabel><TextInput value={scene.shot.mood ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, mood: event.target.value } })} /></div><div><FieldLabel>Acción</FieldLabel><TextInput value={scene.shot.action ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, action: event.target.value } })} /></div></div>
                            <div className="grid grid-cols-2 gap-2"><PillButton onClick={() => mutations.patchScene(scene.id, { framesMode: "single" })} className={scene.framesMode === "single" ? "bg-cyan-300/18 text-cyan-50" : ""}>1 frame</PillButton><PillButton onClick={() => mutations.patchScene(scene.id, { framesMode: "start_end" })} className={scene.framesMode === "start_end" ? "bg-cyan-300/18 text-cyan-50" : ""}>Inicio + final</PillButton></div>
                            <div className="border-b border-white/10 py-3"><FieldLabel>Referencias usadas</FieldLabel><div className="mt-2 flex flex-wrap gap-2">{characterSheetAsset && safeData.continuity?.useCharacterSheetForFrames ? <CineStudioBadge tone="success">Hoja personajes</CineStudioBadge> : null}{locationSheetAsset && safeData.continuity?.useLocationSheetForFrames ? <CineStudioBadge tone="success">Hoja localizaciones</CineStudioBadge> : null}{characters.map((character) => <CineStudioBadge key={character.id} tone={getEffectiveCineCharacterAsset(character) ? "accent" : "warn"}>{character.name}</CineStudioBadge>)}{background ? <CineStudioBadge tone={getEffectiveCineBackgroundAsset(background) ? "accent" : "warn"}>{background.name}</CineStudioBadge> : null}</div></div>
                            <div className="divide-y divide-white/10">{roles.map((role) => { const frame = scene.frames[role]; return frame?.prompt ? <div key={role} className="py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{cineFrameLabel(role)} · prompt</div><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-white/58">{frame.prompt}</pre>{frame.negativePrompt ? <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-rose-50/45">Negative: {frame.negativePrompt}</pre> : null}</div> : null; })}</div>
                            <div className="flex flex-wrap gap-2"><PrimaryButton onClick={() => mutations.prepareAllSceneFrames(scene.id)}>Construir prompts de escena</PrimaryButton><PillButton onClick={() => mutations.prepareVideo(scene.id)}>Preparar para vídeo</PillButton></div>
                          </div>
                        </details>
                      </div>
                    </CineStudioAssetCard>
                  );
                })}
              </div>
            </div>
            )
          ) : null}

          {activeTab === "output" ? (
            !isCineTabUnlocked("output", workflowSnapshot) ? (
              renderLockedTab("output")
            ) : (
            <div className="mx-auto max-w-[1500px]">
              <CineStudioSection kicker="Producción" title="Salida">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white/45">Generación de vídeo por escena desde los frames aprobados del storyboard.</p>
                    {videoPrepareSummary ? <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-50/65">{videoPrepareSummary}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PillButton onClick={prepareAllVideoPlans}><Film size={13} />Preparar todas</PillButton>
                    <PrimaryButton onClick={() => void navigator.clipboard?.writeText(JSON.stringify(exportPlan, null, 2))}><Layers size={14} />Copiar plan JSON</PrimaryButton>
                  </div>
                </div>
              </CineStudioSection>
              <CineStudioSection kicker="Conexión de salida" title={`media_list · ${mediaListOutput.items.length} items`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <p className="max-w-2xl text-sm leading-relaxed text-white/45">
                    Lista ordenada de medios generados por Cine, con título, orden, escena y metadata rica.
                  </p>
                  <CineStudioBadge tone="accent">{mediaListOutput.status}</CineStudioBadge>
                </div>
                <div className="mt-4 grid gap-0 lg:grid-cols-[1fr_360px] lg:divide-x lg:divide-white/10">
                  <div className="grid grid-cols-3 divide-x divide-white/10 border border-white/10 md:grid-cols-5 lg:pr-4">
                    {mediaListPreviewItems.length ? mediaListPreviewItems.map((item) => (
                      <div key={item.id} className="overflow-hidden border-b border-white/10 bg-black/20">
                        <div className="aspect-video">
                          <CineMediaListPreviewThumb item={item} />
                        </div>
                        <div className="truncate px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">{item.role}</div>
                      </div>
                    )) : (
                      <div className="col-span-full border-b border-dashed border-white/12 bg-white/[0.035] px-4 py-6 text-center text-sm text-white/38">
                        La media_list existe, pero todavía no contiene assets visibles.
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-white/10 text-xs text-white/62 lg:pl-4">
                    <label className="flex h-10 items-center justify-between py-2">
                      <span>Incluir vídeos</span>
                      <input type="checkbox" checked={safeData.mediaListOutputConfig?.includeVideos ?? true} onChange={(event) => mutations.commit((draft) => ({ ...draft, mediaListOutputConfig: { ...draft.mediaListOutputConfig, includeVideos: event.target.checked } }))} />
                    </label>
                    <label className="flex h-10 items-center justify-between py-2">
                      <span>Solo vídeos aprobados</span>
                      <input type="checkbox" checked={Boolean(safeData.mediaListOutputConfig?.includeOnlyApprovedVideos)} onChange={(event) => mutations.commit((draft) => ({ ...draft, mediaListOutputConfig: { ...draft.mediaListOutputConfig, includeOnlyApprovedVideos: event.target.checked } }))} />
                    </label>
                    <label className="flex h-10 items-center justify-between py-2">
                      <span>Incluir frames</span>
                      <input type="checkbox" checked={safeData.mediaListOutputConfig?.includeFrames ?? true} onChange={(event) => mutations.commit((draft) => ({ ...draft, mediaListOutputConfig: { ...draft.mediaListOutputConfig, includeFrames: event.target.checked } }))} />
                    </label>
                    <label className="flex h-10 items-center justify-between py-2">
                      <span>Incluir sheets</span>
                      <input type="checkbox" checked={safeData.mediaListOutputConfig?.includeSheets ?? true} onChange={(event) => mutations.commit((draft) => ({ ...draft, mediaListOutputConfig: { ...draft.mediaListOutputConfig, includeSheets: event.target.checked } }))} />
                    </label>
                    <label className="flex h-10 items-center justify-between py-2">
                      <span>Incluir personajes/fondos</span>
                      <input type="checkbox" checked={Boolean(safeData.mediaListOutputConfig?.includeCharacters || safeData.mediaListOutputConfig?.includeBackgrounds)} onChange={(event) => mutations.commit((draft) => ({ ...draft, mediaListOutputConfig: { ...draft.mediaListOutputConfig, includeCharacters: event.target.checked, includeBackgrounds: event.target.checked } }))} />
                    </label>
                    <label className="flex h-10 items-center justify-between py-2">
                      <span>Incluir placeholders</span>
                      <input type="checkbox" checked={safeData.mediaListOutputConfig?.includePlaceholders ?? true} onChange={(event) => mutations.commit((draft) => ({ ...draft, mediaListOutputConfig: { ...draft.mediaListOutputConfig, includePlaceholders: event.target.checked } }))} />
                    </label>
                  </div>
                </div>
              </CineStudioSection>
              <div className="grid gap-0 md:grid-cols-2 2xl:grid-cols-3 md:divide-x md:divide-white/10">
                {safeData.scenes.map((scene) => {
	                  const plan = scene.video ?? prepareSceneForVideo(safeData, scene.id, nodeId);
	                  const videoSrc = getEffectiveCineVideoAsset(plan);
	                  const videoKey = getEffectiveCineVideoS3Key(plan);
	                  const missing = cineMissingFramesLabel(plan.missingFrames);
	                  const isVideoGenerating = generatingTarget === `video:${scene.id}`;
	                  const isVideoStaleGenerating = !isVideoGenerating && plan.status === "generating";
	                  const hasGeneratedVideo = Boolean(videoSrc);
	                  return (
	                    <CineStudioAssetCard key={scene.id} className={cx(plan.status === "generated" ? "border-[var(--foldder-studio-accent,#de323f)]/45" : plan.status === "prepared" ? "border-emerald-400/35" : plan.status === "missing_frames" ? "border-amber-400/35" : plan.status === "error" ? "border-rose-400/35" : undefined)}>
	                      <div className="relative aspect-[16/9] min-h-[220px] overflow-hidden bg-slate-950">
	                        {hasGeneratedVideo ? <CineVideoPreview src={videoSrc} s3Key={videoKey} posterScene={scene} /> : <CineStoryboardHero scene={scene} />}
	                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/88 via-black/42 to-transparent p-4 pt-14">
	                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/70">Escena {String(scene.order).padStart(2, "0")} · {plan.durationSeconds}s · {cineVideoModeLabel(plan.mode)}</div>
	                          <h3 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em] text-white">{scene.title}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/58">
                            <CineCameraMotionIcon type={scene.shot.cameraMovementType ?? "none"} active compact />
                            <span>{CINE_CAMERA_MOVEMENT_LABELS[scene.shot.cameraMovementType ?? "none"]}</span>
                          </div>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
	                          <CineStudioBadge tone={plan.status === "generated" || isVideoGenerating ? "accent" : isVideoStaleGenerating ? "warn" : plan.status === "prepared" ? "success" : plan.status === "missing_frames" ? "warn" : plan.status === "error" ? "error" : "neutral"}>{isVideoGenerating ? "Generando vídeo" : isVideoStaleGenerating ? "Generación interrumpida" : cineVideoStatusLabel(plan.status)}</CineStudioBadge>
		                          <CineStudioBadge tone="neutral">
		                            {plan.mode === "start_end_frames" ? "2 frames a Veo" : "1 frame a Veo"}
		                          </CineStudioBadge>
	                          {plan.videoProvider ? <CineStudioBadge tone="neutral">{cineVideoProviderLabel(plan.videoProvider)}</CineStudioBadge> : null}
	                        </div>
	                        {missing ? <p className="mt-3 border-b border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-50/72">Falta: {missing}</p> : null}
	                        {plan.errorMessage ? <p className="mt-3 border-b border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-50/72">{plan.errorMessage}</p> : null}
	                        {plan.overlayTextPlan?.texts?.length ? <p className="mt-3 line-clamp-2 text-xs text-amber-50/62">Overlay externo: {(plan.overlayTextPlan?.texts ?? []).join(" / ")}</p> : null}
	                        {plan.voiceoverPlan?.text ? <p className="mt-2 line-clamp-2 text-xs text-white/42">Voz en off preparada para pista posterior.</p> : null}
	                        <div className="mt-4 flex flex-wrap gap-2">
	                          <PillButton onClick={() => mutations.prepareVideo(scene.id)}>Preparar escena</PillButton>
	                          <PrimaryButton disabled={Boolean(missing) || isVideoGenerating || Boolean(generatingTarget && generatingTarget !== `video:${scene.id}`)} onClick={() => void generateSceneVideo(scene)}><Film size={14} />{isVideoGenerating ? "Generando..." : hasGeneratedVideo ? "Regenerar vídeo" : "Generar vídeo"}</PrimaryButton>
	                          <PillButton onClick={() => setPromptPreview({
	                            title: `${scene.title} · plan de vídeo`,
	                            prompt: plan.prompt,
                            negativePrompt: plan.negativePrompt,
                            details: [
                              ["Estado", cineVideoStatusLabel(plan.status)],
                              ["Modo", cineVideoModeLabel(plan.mode)],
                              ["Duración", `${plan.durationSeconds}s`],
                              ["Camera prompt", plan.cameraPrompt || "-"],
                              ["Acción visual", plan.visualAction || "-"],
                              ["Intención emocional", plan.emotionalIntent || "-"],
                              ["Voice over", plan.voiceoverPlan?.text || "-"],
	                              ["Overlay", plan.overlayTextPlan?.texts?.length ? `${(plan.overlayTextPlan?.texts ?? []).join(" / ")} · no renderizar en vídeo` : "-"],
	                              ["Frames", [plan.singleFrameAssetId, plan.startFrameAssetId, plan.endFrameAssetId].filter(Boolean).join(", ") || "-"],
	                              ["Referencias", (plan.referenceAssetIds ?? []).join(", ") || "-"],
	                              ["Proveedor", plan.videoProvider ? cineVideoProviderLabel(plan.videoProvider) : cineVideoProviderLabel("gemini")],
	                              ["Vídeo", videoSrc || "-"],
	                            ],
	                          })}>Ver plan</PillButton>
                        </div>
                      </div>
                    </CineStudioAssetCard>
                  );
                })}
              </div>
            </div>
            )
          ) : null}
      </main>
      {generationMessage ? (
        <div
          className={cx(
            "flex h-10 shrink-0 items-center border-t border-white/10 px-4 text-[10px] font-black uppercase tracking-[0.08em]",
            generatingTarget ? "bg-[var(--foldder-studio-accent,#de323f)]/18 text-white" : "bg-white/[0.04] text-white/55",
          )}
        >
          {generationMessage}
        </div>
      ) : null}
      {promptPreview ? (
        <div className="fixed inset-0 z-[100100] flex items-start justify-center bg-black/55 p-4 pt-[4.5rem] sm:items-center sm:p-6">
          <div className="max-h-[82vh] w-full max-w-3xl overflow-hidden border border-white/12 bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
            <div className="flex h-10 items-stretch border-b border-white/10 bg-white/[0.08]">
              <div className="flex min-w-0 flex-1 flex-col justify-center px-4">
                <div className="text-[9px] font-black uppercase tracking-[0.12em] text-white/38">Plan / prompt</div>
                <h3 className="truncate text-[11px] font-black uppercase tracking-[0.06em] text-white">{promptPreview.title}</h3>
              </div>
              <button type="button" onClick={() => setPromptPreview(null)} className="flex h-10 w-10 items-center justify-center border-l border-white/10 text-white/65 hover:bg-white/[0.08] hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="custom-scrollbar max-h-[60vh] overflow-auto p-4">
              {promptPreview.details?.length ? (
                <div className="mb-4 grid gap-2 border border-white/10 bg-white/[0.04] p-3 text-xs text-white/60">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Datos usados</div>
                  {promptPreview.details.map(([label, value]) => (
                    <div key={label} className="grid gap-1 sm:grid-cols-[140px_1fr]">
                      <span className="font-semibold text-white/45">{label}</span>
                      <span className="whitespace-pre-wrap text-white/72">{value}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mb-2 text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Prompt final</div>
              <pre className="whitespace-pre-wrap border border-white/10 bg-black/24 p-4 text-sm leading-relaxed text-white/72">{promptPreview.prompt}</pre>
              {promptPreview.negativePrompt ? (
                <>
                  <div className="mb-2 mt-4 text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Negative prompt</div>
                  <pre className="whitespace-pre-wrap border border-rose-400/15 bg-rose-400/8 p-4 text-xs leading-relaxed text-rose-50/68">{promptPreview.negativePrompt}</pre>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return <StudioNodePortal>{shell}</StudioNodePortal>;
}
