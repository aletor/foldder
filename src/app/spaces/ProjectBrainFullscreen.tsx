"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Bot,
  Brain,
  ChevronDown,
  ChevronUp,
  Droplets,
  Edit3,
  ExternalLink,
  FileText,
  Globe,
  ImageIcon,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  X,
  XIcon,
} from "lucide-react";
import {
  AUDIENCE_PERSONA_CATALOG,
  MAX_KNOWLEDGE_DOC_BYTES,
  MAX_LOGO_BYTES,
  normalizeProjectAssets,
  defaultBrainVisualStyle,
  type BrainVisualStyleSlotKey,
  type BrainGeneratedPiece,
  type BrainPersona,
  type BrainVoiceExample,
  type KnowledgeDocumentEntry,
  type ProjectAssetsMetadata,
} from "./project-assets-metadata";
import { readResponseJson } from "@/lib/read-response-json";
import { fireAndForgetDeleteS3Keys } from "@/lib/s3-delete-client";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

type Props = {
  open: boolean;
  onClose: () => void;
  assetsMetadata: unknown;
  onAssetsMetadataChange: (next: ProjectAssetsMetadata) => void;
};

type MessageType = "" | "error" | "success" | "info";
type LogoSlotId = "positive" | "negative";
type BrainTab = "knowledge" | "voice" | "personas" | "messages" | "facts";

type BrainChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Array<{ id: string; name: string; score: number }>;
  suggestedUploads?: string[];
};

type GeneratedPreview = {
  internalPrompt: string;
  draft: string;
  critique: string;
  score: number;
  issues: string[];
  revised: string;
  sources: {
    core: Array<{ id: string; name: string }>;
    context: Array<{ id: string; name: string }>;
  };
};

function readFileDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error("FILE_TOO_LARGE"));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("READ_ERROR"));
    r.readAsDataURL(file);
  });
}

async function rasterizeDataUrlToPng(dataUrl: string, maxSide = 1024): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w0 = Math.max(1, img.naturalWidth || img.width || 1);
        const h0 = Math.max(1, img.naturalHeight || img.height || 1);
        const scale = Math.min(1, maxSide / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function tryNormalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function computeAdnScore(assets: ReturnType<typeof normalizeProjectAssets>) {
  const totalVoiceSignals =
    assets.strategy.voiceExamples.length +
    assets.strategy.approvedPhrases.length +
    assets.strategy.tabooPhrases.length;
  const voiceScore = Math.min(100, Math.round((totalVoiceSignals / 10) * 100));
  const personasScore = Math.min(100, Math.round((assets.strategy.personas.length / 4) * 100));
  const msgScore = Math.min(100, Math.round((assets.strategy.funnelMessages.length / 8) * 100));
  const marketSignals = assets.knowledge.documents.filter(
    (d) => d.scope === "context" && d.status === "Analizado",
  ).length;
  const marketScore = Math.min(100, Math.round((marketSignals / 6) * 100));
  const total = Math.round((voiceScore + personasScore + msgScore + marketScore) / 4);
  return { total, voiceScore, personasScore, msgScore, marketScore };
}

function LogoDropSlot({
  label,
  description,
  dataUrl,
  slotId,
  onPick,
  onClear,
  disabled,
  compact,
}: {
  label: string;
  description: string;
  dataUrl: string | null;
  slotId: LogoSlotId;
  onPick: (slot: LogoSlotId, file: File) => void;
  onClear: (slot: LogoSlotId) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) onPick(slotId, f);
  };

  return (
    <div className={`min-w-0 ${compact ? "" : "flex-1"}`}>
      <p
        className={`mb-1 font-black uppercase tracking-[0.14em] text-zinc-600 ${compact ? "text-[8px]" : "text-[10px]"}`}
        title={compact ? description : undefined}
      >
        {label}
      </p>
      {!compact && <p className="mb-2 text-[11px] leading-snug text-zinc-600">{description}</p>}
      <div
        role="button"
        tabIndex={0}
        title={compact ? description : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden border-2 border-dashed transition ${
          compact ? "min-h-[76px] rounded-lg" : "min-h-[140px] rounded-2xl"
        } ${
          dragOver
            ? "border-amber-400 bg-amber-50"
            : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100"
        }`}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(slotId, f);
            e.target.value = "";
          }}
        />
        {dataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt=""
              className={`max-w-full object-contain ${compact ? "max-h-14 p-1.5" : "max-h-[120px] p-3"}`}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear(slotId);
              }}
              className={`absolute rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-100 hover:text-zinc-900 ${
                compact ? "right-1 top-1 p-1" : "right-2 top-2 p-1.5"
              }`}
              aria-label="Quitar logo"
            >
              <Trash2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2} />
            </button>
          </>
        ) : (
          <div
            className={`flex flex-col items-center text-center ${compact ? "gap-1 px-2 py-2" : "gap-2 px-4 py-6"}`}
          >
            <ImageIcon
              className={`text-zinc-400 ${compact ? "h-5 w-5" : "h-8 w-8"}`}
              strokeWidth={1.25}
              aria-hidden
            />
            <span className={`font-semibold text-zinc-600 ${compact ? "text-[9px] leading-tight" : "text-[11px]"}`}>
              {compact ? "Soltar / elegir" : "Suelta o elige imagen"}
            </span>
            {!compact && (
              <span className="text-[10px] text-zinc-500">
                PNG, JPG, WebP o SVG · máx. {Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  compact?: boolean;
}) {
  const id = React.useId();
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const pickerValue = /^#[0-9A-Fa-f]{6}$/i.test(value) ? value : "#000000";

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-1" : "flex-1 gap-1.5"}`}>
      <label
        htmlFor={id}
        className={`font-bold uppercase tracking-wide text-zinc-600 ${compact ? "text-[8px]" : "text-[10px]"}`}
      >
        {label}
      </label>
      <div
        className={`flex items-center gap-1.5 border border-zinc-200 bg-white ${compact ? "rounded-lg px-1.5 py-1" : "gap-2 rounded-xl px-2 py-1.5"}`}
      >
        <input
          id={id}
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className={`cursor-pointer shrink-0 overflow-hidden rounded border border-zinc-200 bg-transparent p-0 ${
            compact ? "h-7 w-8" : "h-9 w-11"
          }`}
          aria-label={label}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const raw = text.trim();
            const v = raw.startsWith("#") ? raw : `#${raw}`;
            if (/^#[0-9A-Fa-f]{6}$/i.test(v)) {
              onChange(`#${v.slice(1).toLowerCase()}`);
            } else {
              setText(value);
            }
          }}
          className={`min-w-0 flex-1 bg-transparent font-mono text-zinc-900 outline-none placeholder:text-zinc-400 ${
            compact ? "text-[10px]" : "text-[12px]"
          }`}
          placeholder="#000000"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function ProjectBrainFullscreen({
  open,
  onClose,
  assetsMetadata,
  onAssetsMetadataChange,
}: Props) {
  const assets = useMemo(() => normalizeProjectAssets(assetsMetadata), [assetsMetadata]);
  const adn = useMemo(() => computeAdnScore(assets), [assets]);
  const assetsMetadataRef = useRef<unknown>(assetsMetadata);

  useEffect(() => {
    assetsMetadataRef.current = assetsMetadata;
  }, [assetsMetadata]);

  const [activeTab, setActiveTab] = useState<BrainTab>("knowledge");

  const [urlDraftCore, setUrlDraftCore] = useState("");
  const [urlDraftContext, setUrlDraftContext] = useState("");
  const [coreFiles, setCoreFiles] = useState<File[]>([]);
  const [contextFiles, setContextFiles] = useState<File[]>([]);
  const [isDraggingCoreFiles, setIsDraggingCoreFiles] = useState(false);
  const [isDraggingContextFiles, setIsDraggingContextFiles] = useState(false);
  const [uploadingScope, setUploadingScope] = useState<"core" | "context" | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState("all");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<{ text: string; type: MessageType }>({ text: "", type: "" });

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<BrainChatMessage[]>([
    {
      id: "brain-chat-welcome",
      role: "assistant",
      text:
        "Soy Brain Copilot. Preguntame sobre el contenido que hayas subido y analizado. Si falta contexto, te sugerire que documentos o URLs subir.",
    },
  ]);

  const [voiceText, setVoiceText] = useState("");
  const [voiceKind, setVoiceKind] = useState<BrainVoiceExample["kind"]>("approved_voice");
  const [newTaboo, setNewTaboo] = useState("");
  const [newApprovedPhrase, setNewApprovedPhrase] = useState("");
  const [newLanguageTrait, setNewLanguageTrait] = useState("");
  const [newSyntaxPattern, setNewSyntaxPattern] = useState("");
  const [newPreferredTerm, setNewPreferredTerm] = useState("");
  const [newForbiddenTerm, setNewForbiddenTerm] = useState("");
  const [channelIntensityName, setChannelIntensityName] = useState("");
  const [channelIntensityValue, setChannelIntensityValue] = useState(60);

  const [personaName, setPersonaName] = useState("");
  const [personaPain, setPersonaPain] = useState("");
  const [personaChannel, setPersonaChannel] = useState("");
  const [personaSophistication, setPersonaSophistication] = useState("");
  const [personaTags, setPersonaTags] = useState("");
  const [personaObjections, setPersonaObjections] = useState("");
  const [personaProofNeeded, setPersonaProofNeeded] = useState("");
  const [personaAttentionTriggers, setPersonaAttentionTriggers] = useState("");
  const [personaMarketSophistication, setPersonaMarketSophistication] = useState("");
  const [personaModalOpen, setPersonaModalOpen] = useState(false);

  const [funnelStageDraft, setFunnelStageDraft] = useState<
    "awareness" | "consideration" | "conversion" | "retention"
  >("awareness");
  const [funnelTextDraft, setFunnelTextDraft] = useState("");
  const [messageClaimDraft, setMessageClaimDraft] = useState("");
  const [messageSupportDraft, setMessageSupportDraft] = useState("");
  const [messageAudienceDraft, setMessageAudienceDraft] = useState("");
  const [messageChannelDraft, setMessageChannelDraft] = useState("");
  const [messageCtaDraft, setMessageCtaDraft] = useState("");
  const [messageEvidenceDraft, setMessageEvidenceDraft] = useState("");

  const [briefObjective, setBriefObjective] = useState("");
  const [briefChannel, setBriefChannel] = useState("");
  const [briefPersonaId, setBriefPersonaId] = useState("");
  const [briefFunnel, setBriefFunnel] = useState<
    "awareness" | "consideration" | "conversion" | "retention"
  >("awareness");
  const [briefAsk, setBriefAsk] = useState("");
  const [generatingPiece, setGeneratingPiece] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState<GeneratedPreview | null>(null);
  const [pieceFeedbackNote, setPieceFeedbackNote] = useState("");
  const [factsVerificationFilter, setFactsVerificationFilter] = useState<"all" | "verified" | "interpreted">("verified");
  const [factsStrengthFilter, setFactsStrengthFilter] = useState<"all" | "fuerte" | "media" | "debil">("fuerte");
  const [visualStyleLoadingBySlot, setVisualStyleLoadingBySlot] = useState<
    Partial<Record<BrainVisualStyleSlotKey, boolean>>
  >({});
  const [visualStyleRefreshing, setVisualStyleRefreshing] = useState(false);
  const visualAutoFillAttemptedRef = useRef(false);
  const visualPresignRefreshRef = useRef<{ signature: string; at: number } | null>(null);
  const visualStyleRef = useRef(assets.strategy.visualStyle);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, type: MessageType = "info") => {
    setMessage({ text: msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage({ text: "", type: "" }), 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const patch = useCallback(
    (fn: (a: ProjectAssetsMetadata) => ProjectAssetsMetadata) => {
      const base = normalizeProjectAssets(assetsMetadataRef.current);
      onAssetsMetadataChange(fn(base));
    },
    [onAssetsMetadataChange],
  );

  const setBrand = useCallback(
    (partial: Partial<ProjectAssetsMetadata["brand"]>) => {
      patch((a) => ({ ...a, brand: { ...a.brand, ...partial } }));
    },
    [patch],
  );

  const setKnowledge = useCallback(
    (next: Partial<ProjectAssetsMetadata["knowledge"]>) => {
      patch((a) => ({
        ...a,
        knowledge: {
          ...a.knowledge,
          ...next,
          urls: next.urls ?? a.knowledge.urls,
          documents: next.documents ?? a.knowledge.documents,
        },
      }));
    },
    [patch],
  );

  const setStrategy = useCallback(
    (next: Partial<ProjectAssetsMetadata["strategy"]>) => {
      patch((a) => ({
        ...a,
        strategy: {
          ...a.strategy,
          ...next,
          voiceExamples: next.voiceExamples ?? a.strategy.voiceExamples,
          tabooPhrases: next.tabooPhrases ?? a.strategy.tabooPhrases,
          approvedPhrases: next.approvedPhrases ?? a.strategy.approvedPhrases,
          languageTraits: next.languageTraits ?? a.strategy.languageTraits,
          syntaxPatterns: next.syntaxPatterns ?? a.strategy.syntaxPatterns,
          preferredTerms: next.preferredTerms ?? a.strategy.preferredTerms,
          forbiddenTerms: next.forbiddenTerms ?? a.strategy.forbiddenTerms,
          channelIntensity: next.channelIntensity ?? a.strategy.channelIntensity,
          allowAbsoluteClaims: next.allowAbsoluteClaims ?? a.strategy.allowAbsoluteClaims,
          personas: next.personas ?? a.strategy.personas,
          funnelMessages: next.funnelMessages ?? a.strategy.funnelMessages,
          messageBlueprints: next.messageBlueprints ?? a.strategy.messageBlueprints,
          factsAndEvidence: next.factsAndEvidence ?? a.strategy.factsAndEvidence,
          generatedPieces: next.generatedPieces ?? a.strategy.generatedPieces,
          approvedPatterns: next.approvedPatterns ?? a.strategy.approvedPatterns,
          rejectedPatterns: next.rejectedPatterns ?? a.strategy.rejectedPatterns,
          visualStyle: next.visualStyle ?? a.strategy.visualStyle,
        },
      }));
    },
    [patch],
  );

  const setVisualStyleSlot = useCallback(
    (
      key: BrainVisualStyleSlotKey,
      patchSlot: Partial<ProjectAssetsMetadata["strategy"]["visualStyle"][BrainVisualStyleSlotKey]>,
    ) => {
      patch((a) => ({
        ...a,
        strategy: {
          ...a.strategy,
          visualStyle: {
            ...a.strategy.visualStyle,
            [key]: {
              ...a.strategy.visualStyle[key],
              ...patchSlot,
              key,
            },
          },
        },
      }));
    },
    [patch],
  );

  const visualPresignSignature = useMemo(() => {
    const keys = new Set<string>();
    const slotKeys: BrainVisualStyleSlotKey[] = ["protagonist", "environment", "textures", "people"];
    for (const k of slotKeys) {
      const slot = assets.strategy.visualStyle?.[k];
      if (slot?.imageS3Key) {
        keys.add(slot.imageS3Key);
        continue;
      }
      const url = slot?.imageUrl?.trim();
      if (!url) continue;
      const parsed = tryExtractKnowledgeFilesKeyFromUrl(url);
      if (parsed) keys.add(parsed);
    }
    return Array.from(keys).sort().join("|");
  }, [assets.strategy.visualStyle]);

  useEffect(() => {
    visualStyleRef.current = assets.strategy.visualStyle;
  }, [assets.strategy.visualStyle]);

  useEffect(() => {
    if (!open) return;
    if (!visualPresignSignature) return;
    const now = Date.now();
    if (
      visualPresignRefreshRef.current &&
      visualPresignRefreshRef.current.signature === visualPresignSignature &&
      now - visualPresignRefreshRef.current.at < 60_000
    ) {
      return;
    }
    visualPresignRefreshRef.current = { signature: visualPresignSignature, at: now };
    let cancelled = false;
    const keys = new Set<string>();
    const slotKeys: BrainVisualStyleSlotKey[] = ["protagonist", "environment", "textures", "people"];
    for (const k of slotKeys) {
      const slot = visualStyleRef.current?.[k];
      if (slot?.imageS3Key) {
        keys.add(slot.imageS3Key);
        continue;
      }
      const url = slot?.imageUrl?.trim();
      if (!url) continue;
      const parsed = tryExtractKnowledgeFilesKeyFromUrl(url);
      if (parsed) keys.add(parsed);
    }
    if (keys.size === 0) return;
    setVisualStyleRefreshing(true);
    (async () => {
      try {
        const res = await fetch("/api/spaces/s3-presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: Array.from(keys) }),
        });
        const data = await readResponseJson<{ urls?: Record<string, string> }>(
          res,
          "POST /api/spaces/s3-presign",
        );
        if (!res.ok || !data?.urls || cancelled) return;
        const refreshed = data.urls;
        const nextVisual = { ...visualStyleRef.current };
        let changed = false;
        for (const k of slotKeys) {
          const slot = nextVisual[k];
          const key = slot.imageS3Key || (slot.imageUrl ? tryExtractKnowledgeFilesKeyFromUrl(slot.imageUrl) : null);
          if (!key || !refreshed[key] || refreshed[key] === slot.imageUrl) continue;
          changed = true;
          nextVisual[k] = { ...slot, imageUrl: refreshed[key], imageS3Key: key };
        }
        if (changed) {
          setStrategy({ visualStyle: nextVisual });
        }
      } catch {
        // noop
      } finally {
        if (!cancelled) setVisualStyleRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, setStrategy, visualPresignSignature]);

  const uploadLocalImageForVisualStyle = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/runway/upload", { method: "POST", body: fd });
    const data = await readResponseJson<{ url?: string; s3Key?: string; error?: string }>(
      res,
      "POST /api/runway/upload",
    );
    if (!res.ok || !data?.url) throw new Error(data?.error || "No se pudo subir la imagen.");
    return { url: data.url, s3Key: data.s3Key };
  }, []);

  const prepareLogoRefsForNano = useCallback(async (): Promise<string[]> => {
    const refs: string[] = [];
    const push = (v?: string | null) => {
      if (typeof v !== "string") return;
      const t = v.trim();
      if (!t) return;
      if (!refs.includes(t)) refs.push(t);
    };
    const logos = [assets.brand.logoPositive, assets.brand.logoNegative];
    for (const logo of logos) {
      if (!logo) continue;
      if (logo.startsWith("data:image/svg+xml") || logo.startsWith("data:image/svg+xml;")) {
        const png = await rasterizeDataUrlToPng(logo, 1024);
        if (png) push(png);
      } else {
        push(logo);
      }
    }
    return refs.slice(0, 2);
  }, [assets.brand.logoNegative, assets.brand.logoPositive]);

  const buildVisualPrompt = useCallback(
    (slotKey: BrainVisualStyleSlotKey, description: string) => {
      const slotLabel =
        slotKey === "protagonist"
          ? "Protagonista"
          : slotKey === "environment"
            ? "Entorno"
            : slotKey === "textures"
              ? "Texturas"
              : "Personas";
      const voiceHints = (assets.strategy.languageTraits || []).slice(0, 6).join(", ");
      const termsHints = (assets.strategy.preferredTerms || []).slice(0, 8).join(", ");
      const msgHints = (assets.strategy.approvedPhrases || []).slice(0, 5).join(" | ");
      return [
        `Genera una imagen de referencia de dirección de arte para la marca.`,
        `Bloque: ${slotLabel}.`,
        `Descripción objetivo: ${description || "Mantener coherencia visual de marca."}`,
        `Paleta obligatoria: primaria ${assets.brand.colorPrimary}, secundaria ${assets.brand.colorSecondary}, acento ${assets.brand.colorAccent}.`,
        `Rasgos de tono de marca: ${voiceHints || "profesional, claro, contemporáneo"}.`,
        `Términos clave: ${termsHints || "producto, flujo, control creativo"}.`,
        `Mensajes aprobados: ${msgHints || "narrativa enfocada en valor real y claridad"}.`,
        `Estilo visual: editorial premium, composición limpia, luz natural/cinemática controlada, sin clichés de stock.`,
        `No incluyas texto largo en la imagen ni marcas de agua.`,
      ].join("\n");
    },
    [
      assets.brand.colorAccent,
      assets.brand.colorPrimary,
      assets.brand.colorSecondary,
      assets.strategy.approvedPhrases,
      assets.strategy.languageTraits,
      assets.strategy.preferredTerms,
    ],
  );

  const generateVisualStyleSlotImage = useCallback(
    async (
      key: BrainVisualStyleSlotKey,
      force = false,
      descriptionOverride?: string,
      options?: { silentError?: boolean; retryOnFailure?: boolean },
    ): Promise<boolean> => {
      const slot = assets.strategy.visualStyle[key];
      if (!force && slot.imageUrl) return true;
      const description = (descriptionOverride ?? slot.description ?? "").trim();
      if (!description) return false;
      setVisualStyleLoadingBySlot((prev) => ({ ...prev, [key]: true }));
      try {
        const logoRefs = await prepareLogoRefsForNano();
        const prompt = buildVisualPrompt(key, description);
        const maxAttempts = options?.retryOnFailure ? 2 : 1;
        let outputUrl: string | null = null;
        let outputKey: string | undefined;
        let lastError: unknown = null;

        const tryReq = async (images: string[]) => {
          const res = await fetch("/api/gemini/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              images,
              model: "flash31",
              resolution: "0.5k",
              aspect_ratio: "16:9",
            }),
          });
          const data = await readResponseJson<{ output?: string; key?: string; error?: string }>(
            res,
            "POST /api/gemini/generate",
          );
          if (!res.ok || !data?.output) throw new Error(data?.error || "No se pudo generar imagen.");
          outputUrl = data.output;
          outputKey = data.key;
        };

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          try {
            try {
              await tryReq(logoRefs);
            } catch {
              await tryReq([]);
            }
            break;
          } catch (err) {
            lastError = err;
            if (attempt < maxAttempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1200));
              continue;
            }
          }
        }
        if (!outputUrl) throw (lastError instanceof Error ? lastError : new Error("No se recibió imagen de Nano Banana."));
        setVisualStyleSlot(key, {
          imageUrl: outputUrl,
          imageS3Key: outputKey,
          prompt,
          source: "auto",
        });
        return true;
      } catch (error) {
        if (!options?.silentError) {
          showToast(error instanceof Error ? error.message : "No se pudo generar la imagen de estilo.", "error");
        }
        return false;
      } finally {
        setVisualStyleLoadingBySlot((prev) => ({ ...prev, [key]: false }));
      }
    },
    [assets.strategy.visualStyle, buildVisualPrompt, prepareLogoRefsForNano, setVisualStyleSlot, showToast],
  );

  const autoGenerateMissingVisualSlots = useCallback(
    async (
      visualOverride?: ProjectAssetsMetadata["strategy"]["visualStyle"],
      force = false,
    ) => {
      const visual = visualOverride || assets.strategy.visualStyle || defaultBrainVisualStyle();
      const keys: BrainVisualStyleSlotKey[] = ["protagonist", "people", "environment", "textures"];
      let failed = 0;
      for (const key of keys) {
        const slot = visual[key];
        const description = (slot?.description || "").trim();
        if (!description) continue;
        if (!force && slot?.imageUrl) continue;
        const ok = await generateVisualStyleSlotImage(key, force, description, {
          silentError: true,
          retryOnFailure: true,
        });
        if (!ok) failed += 1;
      }
      if (failed > 0) {
        showToast(
          `No se pudieron generar ${failed} bloque(s) visual(es) automáticamente. Puedes regenerarlos manualmente.`,
          "info",
        );
      }
    },
    [assets.strategy.visualStyle, generateVisualStyleSlotImage, showToast],
  );

  useEffect(() => {
    if (!open) {
      visualAutoFillAttemptedRef.current = false;
      return;
    }
    if (visualAutoFillAttemptedRef.current) return;
    const visual = assets.strategy.visualStyle || defaultBrainVisualStyle();
    const hasMissing = (["protagonist", "environment", "textures", "people"] as BrainVisualStyleSlotKey[]).some(
      (k) => {
        const slot = visual[k];
        return !!slot?.description?.trim() && !slot?.imageUrl;
      },
    );
    if (!hasMissing) return;
    visualAutoFillAttemptedRef.current = true;
    void autoGenerateMissingVisualSlots(visual, false);
  }, [open, assets.strategy.visualStyle, autoGenerateMissingVisualSlots]);

  const filteredFactsForGeneration = useMemo(
    () =>
      assets.strategy.factsAndEvidence.filter((f) => {
        const verificationOk =
          factsVerificationFilter === "all" ||
          (factsVerificationFilter === "verified" && f.verified) ||
          (factsVerificationFilter === "interpreted" && f.interpreted);
        const strengthOk = factsStrengthFilter === "all" || f.strength === factsStrengthFilter;
        return verificationOk && strengthOk;
      }),
    [assets.strategy.factsAndEvidence, factsStrengthFilter, factsVerificationFilter],
  );

  const onLogoPick = useCallback(
    async (slot: LogoSlotId, file: File) => {
      if (!file.type.startsWith("image/")) {
        showToast("Usa una imagen (PNG, JPG, WebP o SVG).", "error");
        return;
      }
      try {
        const dataUrl = await readFileDataUrl(file, MAX_LOGO_BYTES);
        setBrand(slot === "positive" ? { logoPositive: dataUrl } : { logoNegative: dataUrl });
      } catch (e) {
        if ((e as Error).message === "FILE_TOO_LARGE") {
          showToast(`El logo supera ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB.`, "error");
        } else {
          showToast("No se pudo leer el archivo.", "error");
        }
      }
    },
    [setBrand, showToast],
  );

  const onLogoClear = useCallback(
    (slot: LogoSlotId) => {
      setBrand(slot === "positive" ? { logoPositive: null } : { logoNegative: null });
    },
    [setBrand],
  );

  const handleUpload = useCallback(
    async (scope: "core" | "context") => {
      const files = scope === "core" ? coreFiles : contextFiles;
      if (files.length === 0) return;
      setUploadingScope(scope);
      setMessage({ text: "", type: "" });
      const formData = new FormData();
      files.forEach((f) => formData.append("file", f));
      formData.append("scope", scope);
      if (scope === "context") formData.append("contextKind", "general");

      try {
        const response = await fetch("/api/spaces/brain/knowledge/upload", {
          method: "POST",
          body: formData,
        });
        const data = await readResponseJson<{
          message?: string;
          documents?: KnowledgeDocumentEntry[];
          rejected?: Array<{ name?: string; reason?: string }>;
          error?: string;
        }>(response, "POST /api/spaces/brain/knowledge/upload");
        if (!response.ok) throw new Error(data?.error || "Error subiendo archivos");
        const nextDocs = [...assets.knowledge.documents, ...(data?.documents || [])];
        setKnowledge({ documents: nextDocs });
        if (scope === "core") setCoreFiles([]);
        else setContextFiles([]);
        const skipped = data?.rejected?.length || 0;
        if ((data?.documents?.length || 0) === 0 && skipped > 0) {
          showToast(`Ningún archivo compatible. ${skipped} omitido(s).`, "error");
        } else if (skipped > 0) {
          showToast(`${data?.message || "Archivos subidos"} (${skipped} omitido(s)).`, "info");
        } else {
          showToast(data?.message || "Archivos subidos", "success");
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Falló la subida de archivos", "error");
      } finally {
        setUploadingScope(null);
      }
    },
    [assets.knowledge.documents, contextFiles, coreFiles, setKnowledge, showToast],
  );

  const handleAddUrl = useCallback(
    async (scope: "core" | "context") => {
      const draft = scope === "core" ? urlDraftCore : urlDraftContext;
      const normalized = tryNormalizeUrl(draft);
      if (!normalized) {
        showToast("Introduce una URL válida (https://…)", "error");
        return;
      }

      if (assets.knowledge.urls.includes(normalized)) {
        showToast("Esa URL ya está en la lista.", "info");
        return;
      }

      setUploadingScope(scope);
      setMessage({ text: "Extrayendo contenido de la URL...", type: "info" });
      try {
        const response = await fetch("/api/spaces/brain/knowledge/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: normalized,
            scope,
            contextKind: scope === "context" ? "general" : undefined,
          }),
        });
        const data = await readResponseJson<{ error?: string; document?: KnowledgeDocumentEntry }>(
          response,
          "POST /api/spaces/brain/knowledge/url",
        );
        if (!response.ok) throw new Error(data?.error || "Error al procesar URL");
        setKnowledge({
          urls: [...assets.knowledge.urls, normalized],
          documents: data?.document ? [...assets.knowledge.documents, data.document] : assets.knowledge.documents,
        });
        if (scope === "core") setUrlDraftCore("");
        else setUrlDraftContext("");
        showToast("URL añadida con éxito", "success");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Error al procesar URL", "error");
      } finally {
        setUploadingScope(null);
      }
    },
    [
      assets.knowledge.documents,
      assets.knowledge.urls,
      setKnowledge,
      showToast,
      urlDraftContext,
      urlDraftCore,
    ],
  );

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setMessage({ text: "Analizando documentos con IA...", type: "info" });
    try {
      const response = await fetch("/api/spaces/brain/knowledge/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: assets.knowledge.documents,
          strategy: assets.strategy,
        }),
      });
      const data = await readResponseJson<{
        error?: string;
        message?: string;
        documents?: KnowledgeDocumentEntry[];
        corporateContext?: string;
        strategy?: ProjectAssetsMetadata["strategy"];
      }>(response, "POST /api/spaces/brain/knowledge/analyze");
      if (!response.ok) throw new Error(data?.error || "Error analizando documentos");
      setKnowledge({
        documents: data?.documents || assets.knowledge.documents,
        corporateContext: data?.corporateContext || "",
      });
      if (data?.strategy) {
        setStrategy(data.strategy);
        if (!briefPersonaId && data.strategy.personas[0]?.id) {
          setBriefPersonaId(data.strategy.personas[0].id);
        }
        const visual = data.strategy.visualStyle || defaultBrainVisualStyle();
        void autoGenerateMissingVisualSlots(visual, false);
      }
      showToast(data?.message || "Análisis completado", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Error analizando documentos.", "error");
    } finally {
      setAnalyzing(false);
    }
  }, [
    assets.knowledge.documents,
    assets.strategy,
    autoGenerateMissingVisualSlots,
    briefPersonaId,
    setKnowledge,
    setStrategy,
    showToast,
  ]);

  const handleOpenOriginal = useCallback(
    async (doc: KnowledgeDocumentEntry) => {
      if (doc.format === "url" && doc.originalSourceUrl) {
        window.open(doc.originalSourceUrl, "_blank");
        return;
      }
      if (!doc.s3Path) {
        showToast("Documento legacy sin ruta S3", "error");
        return;
      }
      try {
        const resp = await fetch(`/api/spaces/brain/knowledge/view?key=${encodeURIComponent(doc.s3Path)}`);
        if (!resp.ok) throw new Error("Error generating view URL");
        const parsed = await readResponseJson<{ url?: string }>(resp, "GET /api/spaces/brain/knowledge/view");
        if (!parsed?.url) throw new Error("Error generating view URL");
        window.open(parsed.url, "_blank");
      } catch {
        showToast("No se pudo abrir el archivo original", "error");
      }
    },
    [showToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("¿Seguro que quieres eliminar este documento?")) return;
      setIsDeleting(id);
      try {
        const doc = assets.knowledge.documents.find((d) => d.id === id);
        if (doc?.s3Path) fireAndForgetDeleteS3Keys([doc.s3Path]);
        setKnowledge({ documents: assets.knowledge.documents.filter((d) => d.id !== id) });
        showToast("Documento eliminado", "success");
      } catch {
        showToast("No se pudo eliminar el documento", "error");
      } finally {
        setIsDeleting(null);
      }
    },
    [assets.knowledge.documents, setKnowledge, showToast],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startEditing = useCallback((doc: KnowledgeDocumentEntry) => {
    setEditingDocId(doc.id);
    try {
      setEditForm(JSON.parse(doc.extractedContext || "{}"));
    } catch {
      setEditForm({ raw: doc.extractedContext || "" });
    }
  }, []);

  const handleSaveAdn = useCallback(
    async (docId: string) => {
      try {
        const response = await fetch("/api/spaces/brain/knowledge/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: docId, context: editForm, documents: assets.knowledge.documents }),
        });
        const data = await readResponseJson<{
          error?: string;
          documents?: KnowledgeDocumentEntry[];
          corporateContext?: string;
        }>(response, "POST /api/spaces/brain/knowledge/update");
        if (!response.ok) throw new Error(data?.error || "No se pudo guardar ADN");
        setKnowledge({
          documents: data?.documents || assets.knowledge.documents,
          corporateContext: data?.corporateContext || assets.knowledge.corporateContext || "",
        });
        setEditingDocId(null);
        showToast("Cerebro corporativo actualizado", "success");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Error guardando ADN", "error");
      }
    },
    [assets.knowledge.corporateContext, assets.knowledge.documents, editForm, setKnowledge, showToast],
  );

  const submitChatQuestion = useCallback(async () => {
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    const userMsg: BrainChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: question,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/spaces/brain/knowledge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, documents: assets.knowledge.documents }),
      });

      const data = await readResponseJson<{
        error?: string;
        answer?: string;
        sources?: Array<{ id: string; name: string; score: number }>;
        suggestedUploads?: string[];
      }>(response, "POST /api/spaces/brain/knowledge/chat");

      if (!response.ok) throw new Error(data?.error || "No se pudo responder la pregunta.");

      const aiMsg: BrainChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data?.answer || "No pude responder con el contexto actual.",
        sources: data?.sources || [],
        suggestedUploads: data?.suggestedUploads || [],
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      const aiErr: BrainChatMessage = {
        id: `a-err-${Date.now()}`,
        role: "assistant",
        text:
          error instanceof Error ? error.message : "No pude completar la respuesta. Intenta de nuevo.",
      };
      setChatMessages((prev) => [...prev, aiErr]);
    } finally {
      setChatLoading(false);
    }
  }, [assets.knowledge.documents, chatInput, chatLoading]);

  const addVoiceExample = useCallback(() => {
    const text = voiceText.trim();
    if (!text) return;
    const next: BrainVoiceExample = {
      id: crypto.randomUUID(),
      kind: voiceKind,
      text,
      label:
        voiceKind === "approved_voice"
          ? "Aprobado"
          : voiceKind === "forbidden_voice"
          ? "Prohibido"
          : undefined,
    };
    setStrategy({ voiceExamples: [...assets.strategy.voiceExamples, next] });
    setVoiceText("");
  }, [assets.strategy.voiceExamples, setStrategy, voiceKind, voiceText]);

  const removeVoiceExample = useCallback(
    (id: string) => {
      setStrategy({ voiceExamples: assets.strategy.voiceExamples.filter((v) => v.id !== id) });
    },
    [assets.strategy.voiceExamples, setStrategy],
  );

  const addTagItem = useCallback(
    (kind: "taboo" | "approved", value: string) => {
      const text = value.trim();
      if (!text) return;
      if (kind === "taboo") {
        if (assets.strategy.tabooPhrases.includes(text)) return;
        setStrategy({ tabooPhrases: [...assets.strategy.tabooPhrases, text] });
      } else {
        if (assets.strategy.approvedPhrases.includes(text)) return;
        setStrategy({ approvedPhrases: [...assets.strategy.approvedPhrases, text] });
      }
    },
    [assets.strategy.approvedPhrases, assets.strategy.tabooPhrases, setStrategy],
  );

  const removeTagItem = useCallback(
    (kind: "taboo" | "approved", idx: number) => {
      if (kind === "taboo") {
        setStrategy({ tabooPhrases: assets.strategy.tabooPhrases.filter((_, i) => i !== idx) });
      } else {
        setStrategy({ approvedPhrases: assets.strategy.approvedPhrases.filter((_, i) => i !== idx) });
      }
    },
    [assets.strategy.approvedPhrases, assets.strategy.tabooPhrases, setStrategy],
  );

  const addStringListItem = useCallback(
    (kind: "languageTraits" | "syntaxPatterns" | "preferredTerms" | "forbiddenTerms", value: string) => {
      const text = value.trim();
      if (!text) return;
      const current = assets.strategy[kind] || [];
      if (current.includes(text)) return;
      setStrategy({ [kind]: [...current, text] });
    },
    [assets.strategy, setStrategy],
  );

  const removeStringListItem = useCallback(
    (kind: "languageTraits" | "syntaxPatterns" | "preferredTerms" | "forbiddenTerms", idx: number) => {
      const current = assets.strategy[kind] || [];
      setStrategy({ [kind]: current.filter((_, i) => i !== idx) });
    },
    [assets.strategy, setStrategy],
  );

  const addChannelIntensity = useCallback(() => {
    const channel = channelIntensityName.trim();
    if (!channel) return;
    const intensity = Math.max(0, Math.min(100, Number(channelIntensityValue) || 0));
    const others = (assets.strategy.channelIntensity || []).filter(
      (x) => x.channel.toLowerCase() !== channel.toLowerCase(),
    );
    setStrategy({ channelIntensity: [...others, { channel, intensity }] });
    setChannelIntensityName("");
    setChannelIntensityValue(60);
  }, [assets.strategy.channelIntensity, channelIntensityName, channelIntensityValue, setStrategy]);

  const removeChannelIntensity = useCallback(
    (idx: number) => {
      setStrategy({ channelIntensity: assets.strategy.channelIntensity.filter((_, i) => i !== idx) });
    },
    [assets.strategy.channelIntensity, setStrategy],
  );

  const addPersona = useCallback(() => {
    if (!personaName.trim()) return;
    const persona: BrainPersona = {
      id: crypto.randomUUID(),
      name: personaName.trim(),
      pain: personaPain.trim(),
      channel: personaChannel.trim(),
      sophistication: personaSophistication.trim(),
      tags: personaTags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      objections: personaObjections.split(",").map((x) => x.trim()).filter(Boolean),
      proofNeeded: personaProofNeeded.split(",").map((x) => x.trim()).filter(Boolean),
      attentionTriggers: personaAttentionTriggers.split(",").map((x) => x.trim()).filter(Boolean),
      marketSophistication: personaMarketSophistication.trim() || undefined,
    };
    setStrategy({ personas: [...assets.strategy.personas, persona] });
    setPersonaName("");
    setPersonaPain("");
    setPersonaChannel("");
    setPersonaSophistication("");
    setPersonaTags("");
    setPersonaObjections("");
    setPersonaProofNeeded("");
    setPersonaAttentionTriggers("");
    setPersonaMarketSophistication("");
  }, [
    assets.strategy.personas,
    personaChannel,
    personaName,
    personaPain,
    personaObjections,
    personaProofNeeded,
    personaAttentionTriggers,
    personaMarketSophistication,
    personaSophistication,
    personaTags,
    setStrategy,
  ]);

  const addCatalogPersona = useCallback(
    (persona: BrainPersona) => {
      if (assets.strategy.personas.some((p) => p.id === persona.id)) return;
      setStrategy({ personas: [...assets.strategy.personas, persona] });
      if (!briefPersonaId) setBriefPersonaId(persona.id);
    },
    [assets.strategy.personas, briefPersonaId, setStrategy],
  );

  const removePersona = useCallback(
    (id: string) => {
      setStrategy({ personas: assets.strategy.personas.filter((p) => p.id !== id) });
      if (briefPersonaId === id) setBriefPersonaId("");
    },
    [assets.strategy.personas, briefPersonaId, setStrategy],
  );

  const addFunnelMessage = useCallback(() => {
    const text = funnelTextDraft.trim();
    if (!text) return;
    setStrategy({
      funnelMessages: [
        ...assets.strategy.funnelMessages,
        { id: crypto.randomUUID(), stage: funnelStageDraft, text },
      ],
    });
    setFunnelTextDraft("");
  }, [assets.strategy.funnelMessages, funnelStageDraft, funnelTextDraft, setStrategy]);

  const removeFunnelMessage = useCallback(
    (id: string) => {
      setStrategy({ funnelMessages: assets.strategy.funnelMessages.filter((m) => m.id !== id) });
    },
    [assets.strategy.funnelMessages, setStrategy],
  );

  const addMessageBlueprint = useCallback(() => {
    const claim = messageClaimDraft.trim();
    if (!claim) return;
    setStrategy({
      messageBlueprints: [
        ...assets.strategy.messageBlueprints,
        {
          id: crypto.randomUUID(),
          claim,
          support: messageSupportDraft.trim(),
          audience: messageAudienceDraft.trim(),
          channel: messageChannelDraft.trim(),
          stage: funnelStageDraft,
          cta: messageCtaDraft.trim(),
          evidence: messageEvidenceDraft
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        },
      ],
    });
    setMessageClaimDraft("");
    setMessageSupportDraft("");
    setMessageAudienceDraft("");
    setMessageChannelDraft("");
    setMessageCtaDraft("");
    setMessageEvidenceDraft("");
  }, [
    assets.strategy.messageBlueprints,
    funnelStageDraft,
    messageAudienceDraft,
    messageChannelDraft,
    messageClaimDraft,
    messageCtaDraft,
    messageEvidenceDraft,
    messageSupportDraft,
    setStrategy,
  ]);

  const removeMessageBlueprint = useCallback(
    (id: string) => {
      setStrategy({
        messageBlueprints: assets.strategy.messageBlueprints.filter((m) => m.id !== id),
      });
    },
    [assets.strategy.messageBlueprints, setStrategy],
  );

  const generateWithBriefing = useCallback(async () => {
    if (!briefObjective.trim() || !briefChannel.trim() || !briefPersonaId || !briefFunnel) {
      showToast("Completa objetivo, canal, persona y etapa del funnel.", "error");
      return;
    }
    setGeneratingPiece(true);
    try {
      const res = await fetch("/api/spaces/brain/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing: {
            objective: briefObjective,
            channel: briefChannel,
            personaId: briefPersonaId,
            funnelStage: briefFunnel,
            ask: briefAsk,
          },
          documents: assets.knowledge.documents,
          strategy: assets.strategy,
          officialFacts: filteredFactsForGeneration,
        }),
      });
      const data = await readResponseJson<{
        error?: string;
        internalPrompt?: string;
        draft?: string;
        critique?: string;
        score?: number;
        issues?: string[];
        revised?: string;
        sources?: { core: Array<{ id: string; name: string }>; context: Array<{ id: string; name: string }> };
      }>(res, "POST /api/spaces/brain/content/generate");
      if (!res.ok) throw new Error(data?.error || "No se pudo generar la pieza");
      setGeneratedPreview({
        internalPrompt: data?.internalPrompt || "",
        draft: data?.draft || "",
        critique: data?.critique || "",
        score: typeof data?.score === "number" ? data.score : 50,
        issues: data?.issues || [],
        revised: data?.revised || data?.draft || "",
        sources: data?.sources || { core: [], context: [] },
      });
      showToast("Pieza generada y evaluada por modo crítico.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error generando pieza", "error");
    } finally {
      setGeneratingPiece(false);
    }
  }, [
    assets.knowledge.documents,
    assets.strategy,
    briefAsk,
    briefChannel,
    briefFunnel,
    briefObjective,
    briefPersonaId,
    filteredFactsForGeneration,
    showToast,
  ]);

  const registerLearning = useCallback(
    (decision: "approved" | "rejected") => {
      if (!generatedPreview) return;
      const piece: BrainGeneratedPiece = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        objective: briefObjective,
        channel: briefChannel,
        personaId: briefPersonaId,
        funnelStage: briefFunnel,
        prompt: generatedPreview.internalPrompt,
        draft: generatedPreview.draft,
        critique: generatedPreview.critique,
        revised: generatedPreview.revised,
        status: decision,
        notes: pieceFeedbackNote || undefined,
      };
      const approvedPatterns = [...assets.strategy.approvedPatterns];
      const rejectedPatterns = [...assets.strategy.rejectedPatterns];

      const firstLine = (generatedPreview.revised || generatedPreview.draft).split("\n").find((x) => x.trim()) || "";
      const normalized = firstLine.trim().slice(0, 160);
      if (decision === "approved" && normalized) {
        approvedPatterns.push(normalized);
      }
      if (decision === "rejected" && normalized) {
        rejectedPatterns.push(normalized);
      }

      const voiceExamples = [...assets.strategy.voiceExamples];
      voiceExamples.push({
        id: crypto.randomUUID(),
        kind: decision === "approved" ? "good_piece" : "bad_piece",
        text: (generatedPreview.revised || generatedPreview.draft).slice(0, 600),
        label: decision === "approved" ? "Pieza aprobada" : "Pieza rechazada",
      });

      setStrategy({
        generatedPieces: [piece, ...assets.strategy.generatedPieces].slice(0, 60),
        approvedPatterns: [...new Set(approvedPatterns)].slice(0, 120),
        rejectedPatterns: [...new Set(rejectedPatterns)].slice(0, 120),
        voiceExamples,
      });

      setPieceFeedbackNote("");
      showToast(
        decision === "approved"
          ? "Aprendizaje registrado: patrón aprobado"
          : "Aprendizaje registrado: patrón a evitar",
        "success",
      );
    },
    [
      assets.strategy.approvedPatterns,
      assets.strategy.generatedPieces,
      assets.strategy.rejectedPatterns,
      assets.strategy.voiceExamples,
      briefChannel,
      briefFunnel,
      briefObjective,
      briefPersonaId,
      generatedPreview,
      pieceFeedbackNote,
      setStrategy,
      showToast,
    ],
  );

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (personaModalOpen) {
        setPersonaModalOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, personaModalOpen]);

  if (!open) return null;

  const existingFormats = Array.from(new Set(assets.knowledge.documents.map((d) => d.format).filter(Boolean)));
  const filterTabs = ["all", "core", "context", ...existingFormats] as string[];
  const docsFiltered = assets.knowledge.documents.filter((d) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "core") return d.scope !== "context";
    if (activeFilter === "context") return d.scope === "context";
    return d.format === activeFilter;
  });

  const analyzedCount = assets.knowledge.documents.filter((d) => d.status === "Analizado").length;
  const selectedPersonaIds = new Set(assets.strategy.personas.map((p) => p.id));
  const personaCatalogRemaining = AUDIENCE_PERSONA_CATALOG.filter((p) => !selectedPersonaIds.has(p.id));

  const shell = (
    <div
      className="fixed inset-0 z-[100080] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-brain-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50">
            <Brain className="h-5 w-5 text-violet-700" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 id="project-brain-title" className="text-base font-black uppercase tracking-wide text-zinc-900">
              BRAIN
            </h1>
            <p className="text-[11px] text-zinc-500">Identidad · conocimiento · ADN de marca</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-500">
            ADN {adn.total}/100
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-zinc-800 transition hover:bg-zinc-100"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            Cerrar
          </button>
        </div>
      </header>

      {message.text && (
        <div
          role="status"
          className={`fixed left-1/2 top-[4.5rem] z-[100090] max-w-[min(460px,92vw)] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-center text-[12px] font-semibold shadow-lg ${
            message.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-6 xl:grid-cols-[300px_1fr]">
          <aside className="space-y-5">
            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">Identidad visual</p>
              <LogoDropSlot
                compact
                label="Logo +"
                description="Fondos claros"
                dataUrl={assets.brand.logoPositive}
                slotId="positive"
                onPick={onLogoPick}
                onClear={onLogoClear}
              />
              <div className="mt-2" />
              <LogoDropSlot
                compact
                label="Logo -"
                description="Fondos oscuros"
                dataUrl={assets.brand.logoNegative}
                slotId="negative"
                onPick={onLogoPick}
                onClear={onLogoClear}
              />
              <div className="mt-3 border-t border-zinc-200 pt-3">
                <span className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600">
                  <Droplets className="h-3 w-3 text-amber-600" aria-hidden />
                  Paleta
                </span>
                <div className="space-y-2">
                  <ColorField compact label="Primario" value={assets.brand.colorPrimary} onChange={(h) => setBrand({ colorPrimary: h })} />
                  <ColorField compact label="Secundario" value={assets.brand.colorSecondary} onChange={(h) => setBrand({ colorSecondary: h })} />
                  <ColorField compact label="Acento" value={assets.brand.colorAccent} onChange={(h) => setBrand({ colorAccent: h })} />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">Salud del ADN</p>
              <p className="mb-3 text-2xl font-black text-violet-700">{adn.total} <span className="text-xs font-semibold text-zinc-500">/100</span></p>
              {[
                ["Voz y tono", adn.voiceScore, "bg-violet-500"],
                ["Personas", adn.personasScore, "bg-amber-500"],
                ["Mensajes", adn.msgScore, "bg-sky-500"],
                ["Datos mercado", adn.marketScore, "bg-rose-500"],
              ].map(([label, value, klass]) => (
                <div key={String(label)} className="mb-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-600">
                    <span>{String(label)}</span>
                    <span>{Number(value)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-200">
                    <div className={`h-1.5 rounded-full ${String(klass)}`} style={{ width: `${Number(value)}%` }} />
                  </div>
                </div>
              ))}
            </section>
          </aside>

          <section className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                ["knowledge", "Conocimiento"],
                ["voice", "Voz y tono"],
                ["personas", "Personas"],
                ["messages", "Mensajes"],
                ["facts", "Hechos y pruebas"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as BrainTab)}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ${
                    activeTab === id
                      ? "border-violet-700 bg-violet-700 text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "knowledge" && (
              <>
                <div className="mb-4 flex flex-wrap items-start gap-3 border-b border-zinc-200 pb-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                    <BookOpen className="h-5 w-5 text-sky-600" strokeWidth={1.5} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-900">Pozo de conocimiento</h2>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">
                      Ingesta CORE y CONTEXTO + extracción de ADN con data numérica.
                    </p>
                  </div>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wide shadow ${
                      analyzing
                        ? "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400"
                        : "border border-zinc-800 bg-zinc-900 text-white hover:bg-black"
                    }`}
                  >
                    {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                    {analyzing ? "Analizando..." : "Extraer ADN"}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-sky-200 bg-white p-4">
                    <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-sky-700">Ingesta empresa (CORE)</p>
                    <p className="mb-3 text-[11px] text-zinc-600">Documentos propios · tono · verdad de marca</p>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingCoreFiles(true);
                      }}
                      onDragLeave={() => setIsDraggingCoreFiles(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingCoreFiles(false);
                        if (e.dataTransfer.files?.length) {
                          setCoreFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
                        }
                      }}
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.multiple = true;
                        input.accept = ".pdf,.docx,.txt,.md,.rtf,.jpg,.jpeg,.png,.webp";
                        input.onchange = () => {
                          if (input.files?.length) {
                            setCoreFiles((prev) => [...prev, ...Array.from(input.files || [])]);
                          }
                        };
                        input.click();
                      }}
                      className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center ${
                        isDraggingCoreFiles
                          ? "border-sky-400 bg-sky-50"
                          : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                      }`}
                    >
                      <Plus className="mb-2 h-7 w-7 text-zinc-400" />
                      <span className="text-[12px] font-semibold text-zinc-700">Arrastra documentos CORE</span>
                      <span className="mt-1 text-[11px] text-zinc-500">PDF · DOCX · TXT · MD · JPG · WEBP · máx {Math.round(MAX_KNOWLEDGE_DOC_BYTES / 1024 / 1024)} MB</span>
                    </div>
                    {coreFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {coreFiles.map((f, i) => (
                          <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium text-zinc-800">{f.name}</p>
                              <p className="text-[10px] text-zinc-500">{formatSize(f.size)}</p>
                            </div>
                            <button onClick={() => setCoreFiles((p) => p.filter((_, idx) => idx !== i))} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => void handleUpload("core")} disabled={uploadingScope !== null} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50">
                          {uploadingScope === "core" ? "Subiendo..." : "Sincronizar Core"}
                        </button>
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <input value={urlDraftCore} onChange={(e) => setUrlDraftCore(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAddUrl("core"))} placeholder="https://web-empresa.com/recurso" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                      <button onClick={() => void handleAddUrl("core")} disabled={!urlDraftCore || uploadingScope !== null} className="rounded-xl border border-sky-500/50 bg-sky-50 px-3 py-2 text-[11px] font-bold uppercase text-sky-800 disabled:opacity-50">Añadir</button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-white p-4">
                    <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-amber-700">Ingesta contexto (mercado)</p>
                    <p className="mb-3 text-[11px] text-zinc-600">Benchmarks · competencia · informes (no contamina tono)</p>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingContextFiles(true);
                      }}
                      onDragLeave={() => setIsDraggingContextFiles(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingContextFiles(false);
                        if (e.dataTransfer.files?.length) {
                          setContextFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
                        }
                      }}
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.multiple = true;
                        input.accept = ".pdf,.docx,.txt,.md,.rtf,.jpg,.jpeg,.png,.webp";
                        input.onchange = () => {
                          if (input.files?.length) {
                            setContextFiles((prev) => [...prev, ...Array.from(input.files || [])]);
                          }
                        };
                        input.click();
                      }}
                      className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center ${
                        isDraggingContextFiles
                          ? "border-amber-400 bg-amber-50"
                          : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                      }`}
                    >
                      <Plus className="mb-2 h-7 w-7 text-zinc-400" />
                      <span className="text-[12px] font-semibold text-zinc-700">Arrastra documentos contexto</span>
                      <span className="mt-1 text-[11px] text-zinc-500">Informes mercado/competencia · máx {Math.round(MAX_KNOWLEDGE_DOC_BYTES / 1024 / 1024)} MB</span>
                    </div>
                    {contextFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {contextFiles.map((f, i) => (
                          <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium text-zinc-800">{f.name}</p>
                              <p className="text-[10px] text-zinc-500">{formatSize(f.size)}</p>
                            </div>
                            <button onClick={() => setContextFiles((p) => p.filter((_, idx) => idx !== i))} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => void handleUpload("context")} disabled={uploadingScope !== null} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50">
                          {uploadingScope === "context" ? "Subiendo..." : "Sincronizar Contexto"}
                        </button>
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <input value={urlDraftContext} onChange={(e) => setUrlDraftContext(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAddUrl("context"))} placeholder="https://informe-mercado.com/recurso" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                      <button onClick={() => void handleAddUrl("context")} disabled={!urlDraftContext || uploadingScope !== null} className="rounded-xl border border-amber-500/50 bg-amber-50 px-3 py-2 text-[11px] font-bold uppercase text-amber-800 disabled:opacity-50">Añadir</button>
                    </div>
                  </div>
                </div>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">
                        Estilo gráfico (ADN visual)
                      </h3>
                      <p className="mt-1 text-[11px] text-zinc-600">
                        Se autogenera desde documentos analizados: protagonista, entorno, texturas y personas.
                      </p>
                    </div>
                    {visualStyleRefreshing && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        refrescando
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {(["protagonist", "environment", "textures", "people"] as BrainVisualStyleSlotKey[]).map(
                      (key) => {
                        const slot = assets.strategy.visualStyle[key];
                        const loading = Boolean(visualStyleLoadingBySlot[key]);
                        const description = slot.description || "";
                        return (
                          <article key={key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600">
                              {slot.title}
                            </p>
                            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                              {slot.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={slot.imageUrl}
                                  alt={slot.title}
                                  className="h-36 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-36 w-full items-center justify-center text-[11px] text-zinc-500">
                                  Sin imagen aún
                                </div>
                              )}
                            </div>
                            <textarea
                              value={description}
                              onChange={(e) =>
                                setVisualStyleSlot(key, {
                                  description: e.target.value,
                                  source: slot.source === "manual" ? "manual" : "auto",
                                })
                              }
                              placeholder="Describe qué debe representarse en este eje visual..."
                              className="mt-2 h-20 w-full rounded-xl border border-zinc-200 bg-white p-2 text-[12px] text-zinc-800"
                            />
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void generateVisualStyleSlotImage(key, true)}
                                disabled={loading || !description.trim()}
                                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
                              >
                                {loading ? "Generando..." : slot.imageUrl ? "Regenerar" : "Generar imagen"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const input = document.createElement("input");
                                  input.type = "file";
                                  input.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
                                  input.onchange = async () => {
                                    const file = input.files?.[0];
                                    if (!file) return;
                                    try {
                                      const uploaded = await uploadLocalImageForVisualStyle(file);
                                      setVisualStyleSlot(key, {
                                        imageUrl: uploaded.url,
                                        imageS3Key: uploaded.s3Key,
                                        source: "manual",
                                      });
                                      showToast("Imagen manual aplicada al ADN visual.", "success");
                                    } catch (error) {
                                      showToast(
                                        error instanceof Error ? error.message : "No se pudo subir la imagen.",
                                        "error",
                                      );
                                    }
                                  };
                                  input.click();
                                }}
                                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
                              >
                                Sustituir desde disco
                              </button>
                            </div>
                          </article>
                        );
                      },
                    )}
                  </div>
                </section>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">Inventario de sabiduría · {assets.knowledge.documents.length} activos</h3>
                    <div className="flex flex-wrap gap-2">
                      {filterTabs.map((f) => (
                        <button key={f} onClick={() => setActiveFilter(f)} className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${activeFilter === f ? "border-violet-700 bg-violet-700 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  {docsFiltered.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-8 text-center text-[12px] text-zinc-500">Bandeja vacía.</p>
                  ) : (
                    <ul className="space-y-3">
                      {docsFiltered.map((doc) => (
                        <li key={doc.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {doc.format === "image" ? <ImageIcon className="h-4 w-4 text-zinc-500" /> : doc.format === "url" ? <Globe className="h-4 w-4 text-zinc-500" /> : <FileText className="h-4 w-4 text-zinc-500" />}
                                <p className="truncate text-[12px] font-semibold text-zinc-900">{doc.name}</p>
                                <span className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-black uppercase text-zinc-500">{doc.format || "doc"}</span>
                                <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase ${doc.scope === "context" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>{doc.scope === "context" ? "Contexto" : "Core"}</span>
                              </div>
                              <p className="mt-1 text-[10px] text-zinc-500">{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString("es-ES") : "sin fecha"} · {formatSize(doc.size)} · status: {doc.status || "Subido"}</p>
                              {doc.errorMessage && <p className="mt-1 text-[10px] text-rose-600">{doc.errorMessage}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => void handleOpenOriginal(doc)} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"><span className="inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" />Original</span></button>
                              {doc.status === "Analizado" && doc.extractedContext && (
                                <button onClick={() => toggleExpand(doc.id)} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"><span className="inline-flex items-center gap-1">{expandedDocs.has(doc.id) ? <>Colapsar ADN <ChevronUp className="h-3.5 w-3.5" /></> : <>Ver ADN <ChevronDown className="h-3.5 w-3.5" /></>}</span></button>
                              )}
                              <button onClick={() => void handleDelete(doc.id)} disabled={isDeleting === doc.id} className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label="Eliminar">{isDeleting === doc.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                            </div>
                          </div>
                          {doc.status === "Analizado" && doc.extractedContext && expandedDocs.has(doc.id) && (
                            <div className="mt-3 border-t border-zinc-200 pt-3">
                              {editingDocId === doc.id ? (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600">Editando ADN</p>
                                    <div className="flex gap-2">
                                      <button onClick={() => setEditingDocId(null)} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 hover:bg-zinc-100"><span className="inline-flex items-center gap-1"><XIcon className="h-3.5 w-3.5" />Cancelar</span></button>
                                      <button onClick={() => void handleSaveAdn(doc.id)} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-black"><span className="inline-flex items-center gap-1"><Save className="h-3.5 w-3.5" />Guardar</span></button>
                                    </div>
                                  </div>
                                  <textarea value={JSON.stringify(editForm, null, 2)} onChange={(e) => { try { setEditForm(JSON.parse(e.target.value)); } catch { setEditForm({ raw: e.target.value }); } }} className="h-56 w-full rounded-xl border border-zinc-200 bg-white p-3 font-mono text-[12px] text-zinc-900 outline-none focus:border-sky-500" />
                                </div>
                              ) : (
                                <div>
                                  <div className="mb-2 flex justify-end">
                                    <button onClick={() => startEditing(doc)} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 hover:bg-zinc-100"><span className="inline-flex items-center gap-1"><Edit3 className="h-3.5 w-3.5" />Editar matriz</span></button>
                                  </div>
                                  {doc.insights && (
                                    <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                                      <article className="rounded-xl border border-zinc-200 bg-white p-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Claims extraídos</p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {doc.insights.claims.length === 0 && <span className="text-[10px] text-zinc-500">Sin claims</span>}
                                          {doc.insights.claims.map((x, i) => <span key={`${doc.id}-c-${i}`} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-800">{x}</span>)}
                                        </div>
                                      </article>
                                      <article className="rounded-xl border border-zinc-200 bg-white p-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Métricas detectadas</p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {doc.insights.metrics.length === 0 && <span className="text-[10px] text-zinc-500">Sin métricas</span>}
                                          {doc.insights.metrics.map((x, i) => <span key={`${doc.id}-m-${i}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-800">{x}</span>)}
                                        </div>
                                      </article>
                                      <article className="rounded-xl border border-zinc-200 bg-white p-2.5 lg:col-span-2">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Uso potencial · frescura · fiabilidad · piezas usadas</p>
                                        <p className="mt-1 text-[11px] text-zinc-700">
                                          Uso: {(doc.insights.potentialUse || []).join(" · ") || "No definido"}.
                                          Frescura: {doc.insights.freshness || "sin fecha"}.
                                          Fiabilidad: {doc.insights.reliability || 0}/100.
                                          Piezas: {(doc.insights.usedInPieces || []).length}.
                                        </p>
                                      </article>
                                    </div>
                                  )}
                                  <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">JSON ADN</p>
                                  <pre className="whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-800">{doc.extractedContext}</pre>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex items-start gap-2">
                    <span className="mt-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 text-zinc-600"><MessageSquareText className="h-4 w-4" /></span>
                    <div>
                      <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">Conversar con Brain</h3>
                      <p className="mt-1 text-[11px] text-zinc-600">Responde solo con contenido subido y analizado.</p>
                    </div>
                  </div>

                  <div className="max-h-[300px] space-y-2 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    {chatMessages.map((m) => (
                      <article key={m.id} className={`rounded-xl border px-3 py-2 ${m.role === "user" ? "ml-8 border-sky-200 bg-sky-50" : "mr-8 border-zinc-200 bg-white"}`}>
                        <p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">{m.role === "user" ? "Tú" : "Brain"}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">{m.text}</p>
                        {m.sources && m.sources.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{m.sources.map((s) => <span key={`${m.id}-${s.id}`} className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600">{s.name}</span>)}</div>}
                        {m.suggestedUploads && m.suggestedUploads.length > 0 && <div className="mt-2"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Ideas para subir más</p><div className="mt-1 flex flex-wrap gap-1.5">{m.suggestedUploads.map((s, idx) => <span key={`${m.id}-${idx}`} className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">{s}</span>)}</div></div>}
                      </article>
                    ))}
                    {chatLoading && <article className="mr-8 rounded-xl border border-zinc-200 bg-white px-3 py-2"><p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">Brain</p><p className="mt-1 inline-flex items-center gap-2 text-[12px] text-zinc-700"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Pensando...</p></article>}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void submitChatQuestion())} placeholder="Pregunta sobre el contenido de Brain..." className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px]" />
                    <button onClick={() => void submitChatQuestion()} disabled={chatLoading || !chatInput.trim()} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" />Enviar</button>
                  </div>
                </section>
              </>
            )}

            {activeTab === "voice" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Ejemplos reales de voz</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">El modelo aprende por analogía: ejemplos aprobados/prohibidos y piezas reales.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <select value={voiceKind} onChange={(e) => setVoiceKind(e.target.value as BrainVoiceExample["kind"])} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="approved_voice">Voz aprobada</option>
                      <option value="forbidden_voice">Voz prohibida</option>
                      <option value="good_piece">Pieza que sí suena</option>
                      <option value="bad_piece">Pieza que NO suena</option>
                    </select>
                    <input value={voiceText} onChange={(e) => setVoiceText(e.target.value)} placeholder="Añade frase o ejemplo real" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <button onClick={addVoiceExample} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {assets.strategy.voiceExamples.length === 0 && <p className="text-[12px] text-zinc-500">Aún no hay ejemplos guardados.</p>}
                    {assets.strategy.voiceExamples.map((v) => (
                      <div key={v.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{v.kind}</span>
                          <button onClick={() => removeVoiceExample(v.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-zinc-800">{v.text}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Tabús y frases aprobadas</h3>
                  <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Tabú de marca</p>
                      <div className="flex gap-2">
                        <input value={newTaboo} onChange={(e) => setNewTaboo(e.target.value)} placeholder="frase a evitar" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addTagItem("taboo", newTaboo); setNewTaboo(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.tabooPhrases.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeTagItem("taboo", i)} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Frases aprobadas</p>
                      <div className="flex gap-2">
                        <input value={newApprovedPhrase} onChange={(e) => setNewApprovedPhrase(e.target.value)} placeholder="frase aprobada" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addTagItem("approved", newApprovedPhrase); setNewApprovedPhrase(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.approvedPhrases.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeTagItem("approved", i)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{x} ×</button>)}</div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Ingeniería de voz (funcional)</h3>
                  <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Rasgos de lenguaje</p>
                      <div className="flex gap-2">
                        <input value={newLanguageTrait} onChange={(e) => setNewLanguageTrait(e.target.value)} placeholder="ej: directo, preciso, anti-humo" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("languageTraits", newLanguageTrait); setNewLanguageTrait(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.languageTraits.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("languageTraits", i)} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] text-indigo-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Patrones de sintaxis</p>
                      <div className="flex gap-2">
                        <input value={newSyntaxPattern} onChange={(e) => setNewSyntaxPattern(e.target.value)} placeholder="ej: frases cortas + cierre accionable" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("syntaxPatterns", newSyntaxPattern); setNewSyntaxPattern(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.syntaxPatterns.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("syntaxPatterns", i)} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Términos preferidos</p>
                      <div className="flex gap-2">
                        <input value={newPreferredTerm} onChange={(e) => setNewPreferredTerm(e.target.value)} placeholder="ej: control creativo, flujo unificado" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("preferredTerms", newPreferredTerm); setNewPreferredTerm(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.preferredTerms.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("preferredTerms", i)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Términos prohibidos</p>
                      <div className="flex gap-2">
                        <input value={newForbiddenTerm} onChange={(e) => setNewForbiddenTerm(e.target.value)} placeholder="ej: mejor del mundo, garantía total" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("forbiddenTerms", newForbiddenTerm); setNewForbiddenTerm(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.forbiddenTerms.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("forbiddenTerms", i)} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700">{x} ×</button>)}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-zinc-600">Intensidad por canal</p>
                      <div className="mt-2 flex items-center gap-2">
                        <input value={channelIntensityName} onChange={(e) => setChannelIntensityName(e.target.value)} placeholder="LinkedIn, Email, Instagram..." className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                        <input type="number" min={0} max={100} value={channelIntensityValue} onChange={(e) => setChannelIntensityValue(Number(e.target.value) || 0)} className="w-20 rounded-xl border border-zinc-200 bg-white px-2 py-2 text-[12px]" />
                        <button onClick={addChannelIntensity} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {assets.strategy.channelIntensity.map((x, i) => (
                          <div key={`${x.channel}-${i}`} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px]">
                            <span>{x.channel}</span>
                            <span className="inline-flex items-center gap-2"><strong>{x.intensity}%</strong><button onClick={() => removeChannelIntensity(i)} className="text-rose-600">×</button></span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-zinc-600">Claims absolutos</p>
                      <div className="mt-2 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
                        <span className="text-[12px] text-zinc-700">Permitir absolutos (“el mejor”, “siempre”)</span>
                        <button onClick={() => setStrategy({ allowAbsoluteClaims: !assets.strategy.allowAbsoluteClaims })} className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${assets.strategy.allowAbsoluteClaims ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-zinc-300 bg-zinc-100 text-zinc-700"}`}>
                          {assets.strategy.allowAbsoluteClaims ? "Permitidos" : "Bloqueados"}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "personas" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Personas de audiencia</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">Mostramos solo las personas relevantes para este proyecto. El resto está en “+ Nueva persona”.</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {assets.strategy.personas.length === 0 && <p className="text-[12px] text-zinc-500">No hay personas aún.</p>}
                    {assets.strategy.personas.map((p) => (
                      <article key={p.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-[13px] font-black text-zinc-900">{p.name}</h4>
                          <button onClick={() => removePersona(p.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-600">Dolor: {p.pain || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Canal: {p.channel || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Sofisticación: {p.sophistication || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Objeciones: {(p.objections || []).slice(0, 2).join(" · ") || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Prueba necesaria: {(p.proofNeeded || []).slice(0, 2).join(" · ") || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Disparadores: {(p.attentionTriggers || []).slice(0, 2).join(" · ") || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Sofisticación mercado: {p.marketSophistication || "-"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">{p.tags.map((t, i) => <span key={`${p.id}-${t}-${i}`} className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-600">{t}</span>)}</div>
                      </article>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPersonaModalOpen(true)}
                      className="flex min-h-[182px] items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-lg font-semibold text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
                    >
                      + Nueva persona
                    </button>
                  </div>
                </section>

                {personaModalOpen && (
                  <div className="fixed inset-0 z-[100120] flex items-center justify-center bg-black/40 p-4">
                    <div className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">Añadir Nueva Persona</h4>
                          <p className="mt-1 text-[12px] text-zinc-600">Selecciona del catálogo restante o crea una persona manual.</p>
                        </div>
                        <button onClick={() => setPersonaModalOpen(false)} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700">
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {personaCatalogRemaining.length === 0 && (
                          <p className="text-[12px] text-zinc-500">No quedan perfiles predefinidos por adjuntar.</p>
                        )}
                        {personaCatalogRemaining.map((persona) => (
                          <article key={persona.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <h5 className="text-[13px] font-black text-zinc-900">{persona.name}</h5>
                              <button
                                onClick={() => addCatalogPersona(persona)}
                                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
                              >
                                Adjuntar
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] text-zinc-600">{persona.pain}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {[...persona.tags, persona.channel].slice(0, 4).map((tag, i) => (
                                <span key={`${persona.id}-${tag}-${i}`} className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-600">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>

                      <section className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <h5 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">Creación manual (opción B)</h5>
                        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="Nombre persona" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaPain} onChange={(e) => setPersonaPain(e.target.value)} placeholder="Dolor principal" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaChannel} onChange={(e) => setPersonaChannel(e.target.value)} placeholder="Canal principal" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaSophistication} onChange={(e) => setPersonaSophistication(e.target.value)} placeholder="Nivel de sofisticación" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaMarketSophistication} onChange={(e) => setPersonaMarketSophistication(e.target.value)} placeholder="Sofisticación del mercado" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaTags} onChange={(e) => setPersonaTags(e.target.value)} placeholder="Tags (coma separada)" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                          <input value={personaObjections} onChange={(e) => setPersonaObjections(e.target.value)} placeholder="Objeciones (coma separada)" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                          <input value={personaProofNeeded} onChange={(e) => setPersonaProofNeeded(e.target.value)} placeholder="Prueba que necesita (coma separada)" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                          <input value={personaAttentionTriggers} onChange={(e) => setPersonaAttentionTriggers(e.target.value)} placeholder="Disparadores de atención (coma separada)" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button onClick={addPersona} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir persona manual</button>
                        </div>
                      </section>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "messages" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Matriz de mensajes (claim + soporte)</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    <input value={messageClaimDraft} onChange={(e) => setMessageClaimDraft(e.target.value)} placeholder="Claim" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageSupportDraft} onChange={(e) => setMessageSupportDraft(e.target.value)} placeholder="Soporte" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageAudienceDraft} onChange={(e) => setMessageAudienceDraft(e.target.value)} placeholder="Audiencia" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageChannelDraft} onChange={(e) => setMessageChannelDraft(e.target.value)} placeholder="Canal" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <select value={funnelStageDraft} onChange={(e) => setFunnelStageDraft(e.target.value as "awareness" | "consideration" | "conversion" | "retention")} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="awareness">Awareness</option>
                      <option value="consideration">Consideración</option>
                      <option value="conversion">Conversión</option>
                      <option value="retention">Retención</option>
                    </select>
                    <input value={messageCtaDraft} onChange={(e) => setMessageCtaDraft(e.target.value)} placeholder="CTA" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageEvidenceDraft} onChange={(e) => setMessageEvidenceDraft(e.target.value)} placeholder="Evidencia asociada (coma separada)" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] lg:col-span-2" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={addMessageBlueprint} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir fila de matriz</button>
                    <button onClick={addFunnelMessage} className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-700">Añadir mensaje simple</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {assets.strategy.messageBlueprints.map((m) => (
                      <div key={m.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">{m.stage}</span>
                          <button onClick={() => removeMessageBlueprint(m.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[12px] text-zinc-900"><strong>Claim:</strong> {m.claim}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>Soporte:</strong> {m.support || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>Audiencia:</strong> {m.audience || "-"} · <strong>Canal:</strong> {m.channel || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>CTA:</strong> {m.cta || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>Evidencia:</strong> {(m.evidence || []).join(" | ") || "-"}</p>
                      </div>
                    ))}
                    {assets.strategy.funnelMessages.length > 0 && (
                      <details className="rounded-xl border border-zinc-200 bg-white p-2.5">
                        <summary className="cursor-pointer text-[11px] font-semibold text-zinc-700">Mensajes simples legacy ({assets.strategy.funnelMessages.length})</summary>
                        <div className="mt-2 space-y-2">
                          {assets.strategy.funnelMessages.map((m) => (
                            <div key={m.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">{m.stage}</span>
                                <button onClick={() => removeFunnelMessage(m.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                              <p className="mt-1 text-[12px] text-zinc-800">{m.text}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Briefing estructurado (antes de generar)</h3>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Fuentes oficiales activas para generación: {filteredFactsForGeneration.length} (según filtros de “Hechos y pruebas”).
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    <input value={briefObjective} onChange={(e) => setBriefObjective(e.target.value)} placeholder="Objetivo de la pieza" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={briefChannel} onChange={(e) => setBriefChannel(e.target.value)} placeholder="Canal (LinkedIn, blog, etc.)" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <select value={briefPersonaId} onChange={(e) => setBriefPersonaId(e.target.value)} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="">Selecciona persona</option>
                      {assets.strategy.personas.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select value={briefFunnel} onChange={(e) => setBriefFunnel(e.target.value as "awareness" | "consideration" | "conversion" | "retention")} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="awareness">Awareness</option>
                      <option value="consideration">Consideración</option>
                      <option value="conversion">Conversión</option>
                      <option value="retention">Retención</option>
                    </select>
                    <textarea value={briefAsk} onChange={(e) => setBriefAsk(e.target.value)} placeholder="Instrucción adicional (opcional)" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] lg:col-span-2" rows={3} />
                  </div>
                  <button onClick={() => void generateWithBriefing()} disabled={generatingPiece} className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50">{generatingPiece ? "Generando..." : "Crear pieza con este ADN"}</button>
                </section>

                {generatedPreview && (
                  <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Modo crítico automático</h3>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">Score {generatedPreview.score}/100</span>
                    </div>
                    {generatedPreview.issues.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{generatedPreview.issues.map((i, idx) => <span key={`${i}-${idx}`} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">{i}</span>)}</div>}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Borrador inicial</p>
                        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">{generatedPreview.draft}</pre>
                      </article>
                      <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Versión revisada</p>
                        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">{generatedPreview.revised}</pre>
                      </article>
                    </div>
                    <article className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Crítica</p>
                      <p className="text-[12px] leading-relaxed text-zinc-800">{generatedPreview.critique}</p>
                    </article>
                    <div className="mt-3">
                      <textarea value={pieceFeedbackNote} onChange={(e) => setPieceFeedbackNote(e.target.value)} placeholder="Nota del equipo (opcional)" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" rows={2} />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={() => registerLearning("approved")} className="rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Aprobar y aprender</button>
                        <button onClick={() => registerLearning("rejected")} className="rounded-xl border border-rose-600 bg-rose-600 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Rechazar y aprender</button>
                      </div>
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Bucle de aprendizaje</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">Lo aprobado y rechazado vuelve al ADN para afinar futuras piezas.</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Patrones aprobados</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.approvedPatterns.slice(0, 20).map((p, i) => <span key={`${p}-${i}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">{p}</span>)}</div>
                    </article>
                    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Patrones a evitar</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.rejectedPatterns.slice(0, 20).map((p, i) => <span key={`${p}-${i}`} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">{p}</span>)}</div>
                    </article>
                  </div>
                  <div className="mt-3 space-y-2">
                    {assets.strategy.generatedPieces.slice(0, 8).map((g) => (
                      <article key={g.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-zinc-800">{g.objective || "Pieza"}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.status === "approved" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : g.status === "rejected" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-zinc-200 bg-white text-zinc-600"}`}>{g.status}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-500">{new Date(g.createdAt).toLocaleString("es-ES")} · {g.channel} · {g.funnelStage}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "facts" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Hechos y pruebas</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">
                    Este módulo separa afirmaciones verificadas vs interpretadas y muestra el respaldo documental.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <select
                      value={factsVerificationFilter}
                      onChange={(e) => setFactsVerificationFilter(e.target.value as "all" | "verified" | "interpreted")}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]"
                    >
                      <option value="all">Verificación: Todas</option>
                      <option value="verified">Verificación: Solo verificadas</option>
                      <option value="interpreted">Verificación: Solo interpretadas</option>
                    </select>
                    <select
                      value={factsStrengthFilter}
                      onChange={(e) => setFactsStrengthFilter(e.target.value as "all" | "fuerte" | "media" | "debil")}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]"
                    >
                      <option value="all">Fuerza: Todas</option>
                      <option value="fuerte">Fuerza: Fuerte</option>
                      <option value="media">Fuerza: Media</option>
                      <option value="debil">Fuerza: Débil</option>
                    </select>
                    <button
                      onClick={() => { setFactsVerificationFilter("verified"); setFactsStrengthFilter("fuerte"); }}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-700"
                    >
                      Reset recomendado
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {filteredFactsForGeneration.length === 0 && (
                      <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-[12px] text-zinc-500">
                        Aún no hay hechos detectados. Ejecuta “Analizar documentos”.
                      </p>
                    )}
                    {filteredFactsForGeneration.map((f) => (
                      <article key={f.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${f.verified ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                            {f.verified ? "Verificado" : "Interpretado"}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${f.strength === "fuerte" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : f.strength === "media" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                            Fuerza: {f.strength}
                          </span>
                        </div>
                        <p className="mt-2 text-[12px] font-semibold text-zinc-900">{f.claim}</p>
                        <p className="mt-1 text-[11px] text-zinc-700">
                          Evidencia: {f.evidence.length > 0 ? f.evidence.join(" | ") : "Sin evidencia explícita"}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          Fuentes: {f.sourceDocIds.length > 0 ? f.sourceDocIds.join(", ") : "sin fuente id"}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </section>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-[11px] text-zinc-600 sm:px-6">
        <p>
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />{" "}
          {analyzedCount} activos analizados · ADN listo para generación
        </p>
        <p>Los datos de Brain se guardan con el proyecto al pulsar Guardar.</p>
      </footer>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
