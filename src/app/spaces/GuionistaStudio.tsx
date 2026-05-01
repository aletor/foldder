"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  PenLine,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import {
  createGuionistaApproaches,
  createGuionistaVersion,
  createSocialAdaptations,
  transformGuionistaVersion,
} from "./guionista-engine";
import { runGuionistaAi } from "./guionista-ai-client";
import {
  GUI_DEFAULT_SETTINGS,
  GUI_FORMAT_LABELS,
  buildGuionistaAssetFromVersion,
  nowIso,
  normalizeGuionistaData,
  normalizeGuionistaSettings,
  plainTextFromMarkdown,
  type GuionistaApproach,
  type GuionistaBrainContext,
  type GuionistaFormat,
  type GuionistaGeneratedTextAssetsMetadata,
  type GuionistaNodeData,
  type GuionistaReviewComment,
  type GuionistaSettings,
  type GuionistaSocialAdaptation,
  type GuionistaTextAsset,
  type GuionistaVersion,
} from "./guionista-types";
import { StudioNodePortal } from "./studio-node/studio-node-architecture";

const FORMAT_OPTIONS: Array<{ id: GuionistaFormat; title: string; help: string }> = [
  { id: "post", title: "Post", help: "LinkedIn, redes o publicaciones cortas." },
  { id: "article", title: "Artículo", help: "Texto editorial, blog u opinión." },
  { id: "script", title: "Guion", help: "Vídeo, voz en off o narración." },
  { id: "scenes", title: "Escenas", help: "Secuencias visuales y storyboard textual." },
  { id: "slides", title: "Slides", help: "Estructura para presentación." },
  { id: "campaign", title: "Campaña", help: "Claims, titulares, bajadas y CTAs." },
  { id: "rewrite", title: "Reescribir", help: "Mejorar o adaptar un texto existente." },
];

const TRANSFORM_ACTIONS = ["Mas corto", "Mas claro", "Mas humano", "Mas directo"];
const TONE_ACTIONS = ["Mas premium", "Mas ironico"];
const DERIVATIVE_ACTIONS = ["Crear titulares", "Adaptar a redes", "Convertir en slides", "Convertir en guion"];

const ACTION_LABELS: Record<string, string> = {
  "Mas corto": "Más corto",
  "Mas claro": "Más claro",
  "Mas humano": "Más humano",
  "Mas directo": "Más directo",
  "Mas premium": "Más premium",
  "Mas ironico": "Más irónico",
  "Crear titulares": "Crear titulares",
  "Adaptar a redes": "Adaptar a redes",
  "Convertir en slides": "Slides",
  "Convertir en guion": "Guion",
};

type Props = {
  nodeId: string;
  data: GuionistaNodeData;
  generatedTextAssets?: GuionistaGeneratedTextAssetsMetadata;
  openAssetId?: string | null;
  initialBriefing?: string;
  brainConnected?: boolean;
  brainHints?: string[];
  brainContext?: GuionistaBrainContext;
  onChange: (patch: Partial<GuionistaNodeData>) => void;
  onSaveAsset?: (asset: GuionistaTextAsset) => void;
  onClose: () => void;
};

type SaveState = "idle" | "dirty" | "saving" | "saved";
type StudioStage = "create" | "approaches" | "editor" | "social" | "derivative";
type DetailPanel = "settings" | "adaptations" | "review" | "brain";
type DerivativeView = {
  action: string;
  version: GuionistaVersion;
  sourceVersionId?: string;
};

type MarkdownSection = {
  title: string;
  body: string;
};

function versionLabel(index: number, version: GuionistaVersion) {
  return `V${index + 1} · ${version.label || "Borrador"}`;
}

function mergeVersionIntoData(data: GuionistaNodeData, version: GuionistaVersion, versions: GuionistaVersion[]): Partial<GuionistaNodeData> {
  return {
    title: version.title,
    format: version.format,
    versions,
    activeVersionId: version.id,
    value: version.markdown,
    promptValue: version.markdown,
    updatedAt: new Date().toISOString(),
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">{children}</label>;
}

function relativeTimeFromIso(iso?: string): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const diffSeconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSeconds < 10) return "ahora";
  if (diffSeconds < 60) return `hace ${diffSeconds} s`;
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

function assetSignature(title: string | undefined, version: GuionistaVersion | null): string {
  return JSON.stringify({
    title: title || version?.title || "",
    versionId: version?.id || "",
    markdown: version?.markdown || "",
    format: version?.format || "",
  });
}

function saveStateLabel(saveState: SaveState, hasAsset: boolean, lastSavedRelative?: string | null): string {
  if (saveState === "saving") return "Guardando…";
  if (saveState === "saved") return `Guardado${lastSavedRelative ? ` · ${lastSavedRelative}` : ""}`;
  if (saveState === "dirty") return hasAsset ? "Cambios sin guardar" : "Sin guardar";
  return "Sin guardar";
}

function saveStateClass(saveState: SaveState): string {
  if (saveState === "saved") return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  if (saveState === "saving") return "border-amber-200/20 bg-amber-200/10 text-amber-50";
  if (saveState === "dirty") return "border-orange-300/20 bg-orange-300/10 text-orange-100";
  return "border-white/10 bg-white/[0.06] text-white/52";
}

function markdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split("\n");
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1].trim(), body: "" };
      continue;
    }
    if (!current) current = { title: "Texto", body: "" };
    current.body += `${line}\n`;
  }
  if (current) sections.push(current);
  return sections.map((section) => ({ ...section, body: section.body.trim() })).filter((section) => section.title || section.body);
}

function extractBullets(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function parseHeadlines(markdown: string): string[] {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bullets = lines
    .filter((line) => /^[-•*]\s+/.test(line))
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
  const headlines = (bullets.length ? bullets : lines.filter((line) => !line.startsWith("#")).slice(0, 5)).slice(0, 5);
  while (headlines.length < 5) {
    headlines.push(`Titular editorial ${headlines.length + 1}`);
  }
  return headlines;
}

function formatName(format?: GuionistaFormat) {
  return format ? GUI_FORMAT_LABELS[format] : "Texto";
}

function assetKindLabel(asset: GuionistaTextAsset): string {
  const platform = asset.platform === "Short" ? "Short caption" : asset.platform;
  return [GUI_FORMAT_LABELS[asset.type], platform].filter(Boolean).join(" · ");
}

function clipText(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function actionName(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function ActionChip({
  action,
  loadingAction,
  onClick,
}: {
  action: string;
  loadingAction: string | null;
  onClick: (action: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(action)}
      disabled={loadingAction === `quick:${action}`}
      className="rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-2 text-[11px] font-light text-white/70 transition hover:border-white/18 hover:bg-white/[0.085] hover:text-white disabled:cursor-wait disabled:opacity-45"
    >
      {actionName(action)}
    </button>
  );
}

function BrainPill({
  brainConnected,
  onClick,
}: {
  brainConnected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-light transition ${
        brainConnected
          ? "border-sky-200/20 bg-sky-200/10 text-sky-50 hover:bg-sky-200/14"
          : "border-white/10 bg-white/[0.05] text-white/55 hover:bg-white/[0.08]"
      }`}
    >
      <Brain className="h-3.5 w-3.5" strokeWidth={1.6} />
      {brainConnected ? "Usando ADN del proyecto" : "Sin Brain"}
    </button>
  );
}

function StructuredPreview({ version }: { version: GuionistaVersion }) {
  if (version.format === "scenes") return <ScenesPreview markdown={version.markdown} />;
  if (version.format === "slides") return <SlidesPreview markdown={version.markdown} />;
  if (version.format === "script") return <ScriptPreview markdown={version.markdown} />;
  if (version.format === "rewrite") return <RewritePreview markdown={version.markdown} />;
  return null;
}

function ScenesPreview({ markdown }: { markdown: string }) {
  const scenes = markdownSections(markdown).filter((section) => /escena|scene/i.test(section.title));
  if (!scenes.length) return null;
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      {scenes.slice(0, 8).map((scene, index) => (
        <article key={`${scene.title}-${index}`} className="rounded-[22px] border border-amber-100/12 bg-amber-100/[0.055] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/55">Escena {index + 1}</p>
          <h4 className="mt-1 text-base font-light text-amber-50">{scene.title.replace(/^Escena\s*\d+\s*[·.-]?\s*/i, "") || scene.title}</h4>
          <p className="mt-3 whitespace-pre-line text-[13px] font-light leading-relaxed text-white/62">{scene.body}</p>
        </article>
      ))}
    </div>
  );
}

function SlidesPreview({ markdown }: { markdown: string }) {
  const slides = markdownSections(markdown).filter((section) => /slide/i.test(section.title));
  if (!slides.length) return null;
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      {slides.slice(0, 10).map((slide, index) => (
        <article key={`${slide.title}-${index}`} className="rounded-[22px] border border-sky-100/12 bg-sky-100/[0.055] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/55">Slide {index + 1}</p>
          <h4 className="mt-1 text-base font-light text-sky-50">{slide.title.replace(/^Slide\s*\d+\s*[·.-]?\s*/i, "") || slide.title}</h4>
          <ul className="mt-3 space-y-1.5 text-[13px] font-light leading-relaxed text-white/62">
            {extractBullets(slide.body).slice(0, 7).map((bullet) => (
              <li key={bullet}>• {bullet}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function ScriptPreview({ markdown }: { markdown: string }) {
  const sections = markdownSections(markdown).filter((section) => section.title !== "Texto");
  if (!sections.length) return null;
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-3">
      {sections.slice(0, 6).map((section) => (
        <article key={section.title} className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">{section.title}</p>
          <p className="mt-3 whitespace-pre-line text-[13px] font-light leading-relaxed text-white/62">{section.body}</p>
        </article>
      ))}
    </div>
  );
}

function RewritePreview({ markdown }: { markdown: string }) {
  const sections = markdownSections(markdown);
  const original = sections.find((section) => /original/i.test(section.title));
  const rewritten = sections.find((section) => /reescrito|rewrite|nuevo/i.test(section.title));
  if (!original && !rewritten) return null;
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      <article className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">Texto original</p>
        <p className="mt-3 whitespace-pre-line text-[13px] font-light leading-relaxed text-white/58">{original?.body || "Sin original detectado."}</p>
      </article>
      <article className="rounded-[22px] border border-emerald-100/12 bg-emerald-100/[0.055] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/55">Texto reescrito</p>
        <p className="mt-3 whitespace-pre-line text-[13px] font-light leading-relaxed text-white/64">{rewritten?.body || "Sin reescritura detectada."}</p>
      </article>
    </div>
  );
}

function DerivativePreview({
  derivative,
  onBack,
  onAcceptVersion,
  onUseHeadline,
}: {
  derivative: DerivativeView;
  onBack: () => void;
  onAcceptVersion: () => void;
  onUseHeadline: (headline: string) => void;
}) {
  const isHeadline = derivative.action === "Crear titulares";
  const headlines = isHeadline ? parseHeadlines(derivative.version.markdown) : [];

  return (
    <div className="mx-auto max-w-5xl py-2">
      <button type="button" onClick={onBack} className="text-[11px] font-light uppercase tracking-[0.18em] text-white/45 hover:text-white">
        Volver al texto
      </button>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-light uppercase tracking-[0.24em] text-white/40">Derivado editorial</p>
          <h2 className="mt-1 text-3xl font-light text-white">{actionName(derivative.action)}</h2>
          <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-white/52">
            Este contenido nace de la versión activa, pero no sustituye al documento principal hasta que tú lo decidas.
          </p>
        </div>
        {!isHeadline && (
          <button type="button" onClick={onAcceptVersion} className="rounded-full bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black hover:bg-amber-100">
            Guardar como versión
          </button>
        )}
      </div>

      {isHeadline ? (
        <div className="mt-8 grid gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">Titulares propuestos</p>
          {headlines.map((headline, index) => (
            <div key={`${headline}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-white/10 bg-white/[0.045] px-4 py-3">
              <p className="min-w-0 flex-1 text-lg font-light leading-snug text-white">{headline}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void navigator.clipboard?.writeText(headline)} className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-white/55 hover:bg-white/10 hover:text-white">
                  Copiar
                </button>
                <button type="button" onClick={() => onUseHeadline(headline)} className="rounded-full bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-black hover:bg-amber-100">
                  Usar como título
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-[30px] border border-white/10 bg-white/[0.04] p-5">
          <StructuredPreview version={derivative.version} />
          <textarea
            readOnly
            value={derivative.version.markdown}
            className="min-h-[42vh] w-full resize-none rounded-[24px] border border-white/8 bg-[#f5efe3] px-6 py-5 font-serif text-[17px] leading-[1.78] text-[#191714] outline-none"
          />
        </div>
      )}
    </div>
  );
}

function DetailDrawer({
  activePanel,
  setActivePanel,
  settingsOpen,
  setSettingsOpen,
  brainOpen,
  setBrainOpen,
  normalizedSettings,
  updateSettings,
  brainConnected,
  brainHints,
  savedMessage,
  selectedText,
  commentDraft,
  setCommentDraft,
  comments,
  globalAdjustmentNotes,
  setGlobalAdjustmentNotes,
  onGlobalAdjustmentNotesBlur,
  onAddComment,
  onApplyComment,
  onApplyAllComments,
  onResolveComment,
  onApplyGlobalNotes,
  onQuickAction,
  loadingAction,
}: {
  activePanel: DetailPanel;
  setActivePanel: (panel: DetailPanel) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  brainOpen: boolean;
  setBrainOpen: (open: boolean) => void;
  normalizedSettings: GuionistaSettings;
  updateSettings: (patch: Partial<GuionistaSettings>) => void;
  brainConnected: boolean;
  brainHints: string[];
  savedMessage: string | null;
  selectedText: string;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  comments: GuionistaReviewComment[];
  globalAdjustmentNotes: string;
  setGlobalAdjustmentNotes: (value: string) => void;
  onGlobalAdjustmentNotesBlur: () => void;
  onAddComment: () => void;
  onApplyComment: (comment: GuionistaReviewComment) => void;
  onApplyAllComments: () => void;
  onResolveComment: (commentId: string) => void;
  onApplyGlobalNotes: () => void;
  onQuickAction: (action: string) => void;
  loadingAction: string | null;
}) {
  const panels: Array<{ id: DetailPanel; label: string }> = [
    { id: "settings", label: "Ajustes" },
    { id: "adaptations", label: "Adaptaciones" },
    { id: "review", label: "Revisión" },
    { id: "brain", label: "Brain" },
  ];

  return (
    <aside className="h-full min-h-0 w-[250px] shrink-0 overflow-hidden rounded-[26px] border border-white/10 bg-black/22 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
      <div className="grid grid-cols-4 gap-1">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            onClick={() => setActivePanel(panel.id)}
            className={`min-w-0 rounded-full px-1.5 py-1.5 text-[7.5px] font-semibold uppercase tracking-[0.08em] ${
              activePanel === panel.id ? "bg-white text-black" : "border border-white/10 bg-white/[0.05] text-white/48 hover:text-white"
            }`}
            title={panel.label}
          >
            {panel.label}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-[calc(100vh-170px)] overflow-y-auto pr-1">
        {activePanel === "settings" && (
        <section>
          <button type="button" onClick={() => setSettingsOpen(!settingsOpen)} className="flex w-full items-center justify-between text-left">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Ajustes de escritura</span>
            <ChevronDown className={`h-4 w-4 transition ${settingsOpen ? "rotate-180" : ""}`} />
          </button>
          {settingsOpen && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Idioma</FieldLabel>
                  <select value={normalizedSettings.language} onChange={(event) => updateSettings({ language: event.target.value as GuionistaSettings["language"] })} className="mt-1 w-full rounded-xl bg-black/35 px-2 py-2 text-xs outline-none">
                    <option value="auto">Automático</option>
                    <option value="es">Español</option>
                    <option value="en">Inglés</option>
                    <option value="ca">Catalán</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Longitud</FieldLabel>
                  <select value={normalizedSettings.length} onChange={(event) => updateSettings({ length: event.target.value as GuionistaSettings["length"] })} className="mt-1 w-full rounded-xl bg-black/35 px-2 py-2 text-xs outline-none">
                    <option value="short">Corto</option>
                    <option value="medium">Medio</option>
                    <option value="long">Largo</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Tono</FieldLabel>
                  <select value={normalizedSettings.tone} onChange={(event) => updateSettings({ tone: event.target.value as GuionistaSettings["tone"] })} className="mt-1 w-full rounded-xl bg-black/35 px-2 py-2 text-xs outline-none">
                    <option value="natural">Natural</option>
                    <option value="professional">Profesional</option>
                    <option value="premium">Premium</option>
                    <option value="institutional">Institucional</option>
                    <option value="ironic">Irónico</option>
                    <option value="emotional">Emocional</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Objetivo</FieldLabel>
                  <select value={normalizedSettings.goal} onChange={(event) => updateSettings({ goal: event.target.value as GuionistaSettings["goal"] })} className="mt-1 w-full rounded-xl bg-black/35 px-2 py-2 text-xs outline-none">
                    <option value="explain">Explicar</option>
                    <option value="convince">Convencer</option>
                    <option value="sell">Vender</option>
                    <option value="present">Presentar</option>
                    <option value="inspire">Inspirar</option>
                    <option value="conversation">Abrir conversación</option>
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel>Audiencia</FieldLabel>
                <input value={normalizedSettings.audience} onChange={(event) => updateSettings({ audience: event.target.value })} className="mt-1 w-full rounded-xl bg-black/35 px-3 py-2 text-xs outline-none" />
              </div>
              <div>
                <FieldLabel>Instrucciones extra</FieldLabel>
                <textarea value={normalizedSettings.extraInstructions} onChange={(event) => updateSettings({ extraInstructions: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl bg-black/35 px-3 py-2 text-xs outline-none" />
              </div>
            </div>
          )}
        </section>
      )}

      {activePanel === "adaptations" && (
        <section className="space-y-5">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/34">Transformar</p>
            <div className="flex flex-wrap gap-2">
              {TRANSFORM_ACTIONS.map((action) => <ActionChip key={action} action={action} loadingAction={loadingAction} onClick={onQuickAction} />)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/34">Tono</p>
            <div className="flex flex-wrap gap-2">
              {TONE_ACTIONS.map((action) => <ActionChip key={action} action={action} loadingAction={loadingAction} onClick={onQuickAction} />)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/34">Crear derivados</p>
            <div className="flex flex-wrap gap-2">
              {DERIVATIVE_ACTIONS.map((action) => <ActionChip key={action} action={action} loadingAction={loadingAction} onClick={onQuickAction} />)}
            </div>
          </div>
        </section>
      )}

      {activePanel === "brain" && (
        <section className="text-[12px] font-light leading-relaxed text-white/60">
          <button type="button" onClick={() => setBrainOpen(!brainOpen)} className="mb-4 flex w-full items-center justify-between text-left">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
              <Brain className="h-4 w-4" /> Contexto Brain
            </span>
            {brainConnected ? <Check className="h-4 w-4 text-emerald-300" /> : <X className="h-4 w-4 text-white/35" />}
          </button>
          {brainConnected ? (
            <div className="space-y-2">
              <p>Brain está usando contexto editorial resumido:</p>
              {(brainHints.length ? brainHints : ["Tono del proyecto", "Contexto del proyecto", "Claims aprobados", "Frases a evitar", "Notas relevantes", "Estilo editorial"]).slice(0, 7).map((hint) => (
                <p key={hint} className="flex items-center gap-2"><Check className="h-3 w-3 text-emerald-300" /> {hint}</p>
              ))}
            </div>
          ) : (
            <p>Sin Brain conectado. Usará solo tu briefing y los ajustes de escritura.</p>
          )}
          {!brainOpen && <p className="mt-4 text-white/35">Sin trazas técnicas ni JSON. Solo dirección editorial útil.</p>}
        </section>
      )}

      {activePanel === "review" && (
        <section className="space-y-5 text-[12px] font-light leading-relaxed text-white/58">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Comentarios</p>
                <p className="mt-1 text-white/35">{comments.filter((comment) => comment.status === "pending").length} pendientes</p>
              </div>
              <button
                type="button"
                onClick={onApplyAllComments}
                disabled={!comments.some((comment) => comment.status === "pending") || loadingAction === "review:all"}
                className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/58 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              >
                Aplicar todos
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Selección actual</p>
              <p className="mt-2 min-h-10 rounded-xl bg-black/24 px-3 py-2 text-white/54">
                {selectedText ? `“${clipText(selectedText, 180)}”` : "Selecciona un fragmento del editor para comentarlo."}
              </p>
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Escribe el comentario editorial sobre la selección…"
                className="mt-3 min-h-20 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/72 outline-none placeholder:text-white/25 focus:border-amber-200/35"
              />
              <button
                type="button"
                onClick={onAddComment}
                disabled={!selectedText || !commentDraft.trim()}
                className="mt-3 rounded-full bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-black transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Comentar selección
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {comments.length === 0 && (
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-white/35">
                  Aún no hay comentarios editoriales en este texto.
                </p>
              )}
              {comments.map((comment) => (
                <article key={comment.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] ${
                      comment.status === "pending"
                        ? "bg-amber-200/12 text-amber-100"
                        : comment.status === "applied"
                          ? "bg-emerald-200/12 text-emerald-100"
                          : "bg-white/8 text-white/38"
                    }`}>
                      {comment.status}
                    </span>
                  </div>
                  <p className="mt-3 text-[11px] text-white/38">“{clipText(comment.selectedText, 150)}”</p>
                  <p className="mt-2 text-[12px] text-white/68">{comment.comment}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onApplyComment(comment)}
                      disabled={comment.status !== "pending" || loadingAction === `review:${comment.id}`}
                      className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/58 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolveComment(comment.id)}
                      disabled={comment.status === "resolved"}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/42 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Resolver
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="border-t border-white/8 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Notas de ajuste</p>
            <textarea
              value={globalAdjustmentNotes}
              onChange={(event) => setGlobalAdjustmentNotes(event.target.value)}
              onBlur={onGlobalAdjustmentNotesBlur}
              placeholder="Indica un ajuste general para todo el texto…"
              className="mt-3 min-h-28 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/72 outline-none placeholder:text-white/25 focus:border-amber-200/35"
            />
            <button
              type="button"
              onClick={onApplyGlobalNotes}
              disabled={!globalAdjustmentNotes.trim() || loadingAction === "review:global"}
              className="mt-3 rounded-full bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-black transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Aplicar notas al texto
            </button>
          </div>
        </section>
      )}

        {savedMessage && <p className="mt-4 rounded-2xl bg-emerald-300/12 px-3 py-2 text-[11px] text-emerald-100">{savedMessage}</p>}
      </div>
    </aside>
  );
}

export function GuionistaStudio({
  nodeId,
  data,
  generatedTextAssets,
  openAssetId,
  initialBriefing,
  brainConnected = false,
  brainHints = [],
  brainContext,
  onChange,
  onSaveAsset,
  onClose,
}: Props) {
  const normalized = useMemo(() => normalizeGuionistaData(data), [data]);
  const [stage, setStage] = useState<StudioStage>(normalized.versions?.length ? "editor" : "create");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [brainOpen, setBrainOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<DetailPanel>("settings");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [socialPack, setSocialPack] = useState<GuionistaSocialAdaptation[]>([]);
  const [derivativeView, setDerivativeView] = useState<DerivativeView | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const retryLastActionRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const versions = useMemo(() => normalized.versions ?? [], [normalized.versions]);
  const comments = useMemo(() => normalized.comments ?? [], [normalized.comments]);
  const current = useMemo(
    () => versions.find((version) => version.id === normalized.activeVersionId) ?? versions.at(-1) ?? null,
    [normalized.activeVersionId, versions],
  );
  const activeAsset = useMemo(
    () => generatedTextAssets?.items.find((asset) => asset.id === (openAssetId || normalized.assetId)) ?? null,
    [generatedTextAssets?.items, normalized.assetId, openAssetId],
  );
  const sourceAsset = useMemo(() => {
    if (!activeAsset?.sourceAssetId) return null;
    return generatedTextAssets?.items.find((asset) => asset.id === activeAsset.sourceAssetId) ?? null;
  }, [activeAsset?.sourceAssetId, generatedTextAssets?.items]);
  const sourceAssetLabel = useMemo(() => {
    if (!activeAsset?.sourceAssetId) return null;
    if (!sourceAsset) return "Origen no disponible";
    return `${sourceAsset.title} · ${assetKindLabel(sourceAsset)}`;
  }, [activeAsset?.sourceAssetId, sourceAsset]);
  const currentSignature = useMemo(
    () => assetSignature(current?.title || normalized.title, current),
    [current, normalized.title],
  );
  const savedSignature = useMemo(() => {
    if (!activeAsset) return "";
    const version = activeAsset.versions.find((item) => item.id === activeAsset.activeVersionId) ?? activeAsset.versions.at(-1) ?? null;
    return assetSignature(activeAsset.title, version);
  }, [activeAsset]);
  const lastSavedRelative = useMemo(() => relativeTimeFromIso(lastSavedAt ?? activeAsset?.updatedAt), [activeAsset?.updatedAt, lastSavedAt]);
  const normalizedSettings = useMemo(() => normalizeGuionistaSettings(normalized.settings), [normalized.settings]);

  useEffect(() => {
    if (!initialBriefing || normalized.briefing) return;
    onChange({ briefing: initialBriefing });
  }, [initialBriefing, normalized.briefing, onChange]);

  useEffect(() => {
    if (!activeAsset) return;
    const active = activeAsset.versions.find((version) => version.id === activeAsset.activeVersionId) ?? activeAsset.versions.at(-1);
    if (!active) return;
    onChange({
      assetId: activeAsset.id,
      title: activeAsset.title,
      format: activeAsset.type,
      versions: activeAsset.versions,
      activeVersionId: active.id,
      value: active.markdown,
      promptValue: active.markdown,
      status: activeAsset.status,
      comments: activeAsset.comments ?? [],
      globalAdjustmentNotes: activeAsset.globalAdjustmentNotes ?? "",
      updatedAt: new Date().toISOString(),
    });
    setLastSavedAt(activeAsset.updatedAt);
    setSaveState("saved");
    setStage("editor");
    // Load each asset only when the requested id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAsset?.id]);

  useEffect(() => {
    if (!current) {
      setSaveState(activeAsset ? "saved" : "idle");
      return;
    }
    if (!activeAsset) {
      setSaveState("dirty");
      return;
    }
    setSaveState(currentSignature === savedSignature ? "saved" : "dirty");
  }, [activeAsset, current, currentSignature, savedSignature]);

  const beginLoading = useCallback((action: string, label: string) => {
    setLoadingAction(action);
    setLoadingLabel(label);
    setGenerationError(null);
  }, []);

  const endLoading = useCallback(() => {
    setLoadingAction(null);
    setLoadingLabel(null);
  }, []);

  const setRetryableError = useCallback((retry: () => void) => {
    retryLastActionRef.current = retry;
    setGenerationError("No se pudo generar. Reintentar.");
  }, []);

  const updateSettings = (patch: Partial<GuionistaSettings>) => {
    onChange({ settings: { ...normalizedSettings, ...patch }, updatedAt: new Date().toISOString() });
  };

  const persistReviewState = useCallback((nextComments: GuionistaReviewComment[], nextGlobalNotes: string) => {
    onChange({
      comments: nextComments,
      globalAdjustmentNotes: nextGlobalNotes,
      updatedAt: new Date().toISOString(),
    });
    if (activeAsset && onSaveAsset) {
      onSaveAsset({
        ...activeAsset,
        comments: nextComments,
        globalAdjustmentNotes: nextGlobalNotes,
        updatedAt: nowIso(),
      });
    }
  }, [activeAsset, onChange, onSaveAsset]);

  const renameCurrent = useCallback((title: string) => {
    if (!current) {
      onChange({ title, updatedAt: new Date().toISOString() });
      return;
    }
    const next = { ...current, title };
    onChange(mergeVersionIntoData(normalized, next, versions.map((version) => (version.id === current.id ? next : version))));
  }, [current, normalized, onChange, versions]);

  const createApproaches = useCallback(async () => {
    const request = {
      briefing: normalized.briefing || initialBriefing || "",
      format: normalized.format || "post",
      settings: normalized.settings || GUI_DEFAULT_SETTINGS,
      brainContext: brainConnected ? brainContext : { enabled: false },
    };
    beginLoading("approaches", "Creando enfoques…");
    try {
      const response = await runGuionistaAi({ task: "approaches", ...request });
      if (response.task !== "approaches") throw new Error("Respuesta inesperada.");
      onChange({ approaches: response.approaches, updatedAt: new Date().toISOString() });
      setStage("approaches");
      retryLastActionRef.current = null;
    } catch {
      if (!normalized.approaches?.length) {
        const approaches = createGuionistaApproaches({
          ...request,
          brainHints,
        });
        onChange({ approaches, updatedAt: new Date().toISOString() });
        setStage("approaches");
      }
      setRetryableError(() => {
        void createApproaches();
      });
    } finally {
      endLoading();
    }
  }, [beginLoading, brainConnected, brainContext, brainHints, endLoading, initialBriefing, normalized.approaches?.length, normalized.briefing, normalized.format, normalized.settings, onChange, setRetryableError]);

  const writeVersion = useCallback(async (approach?: GuionistaApproach | null) => {
    const request = {
      briefing: normalized.briefing || initialBriefing || "",
      format: normalized.format || "post",
      settings: normalized.settings || GUI_DEFAULT_SETTINGS,
      approach,
      brainContext: brainConnected ? brainContext : { enabled: false },
    };
    const actionKey = `draft:${approach?.id ?? "direct"}`;
    beginLoading(actionKey, "Escribiendo texto…");
    try {
      const response = await runGuionistaAi({ task: "draft", ...request });
      if (response.task !== "draft") throw new Error("Respuesta inesperada.");
      onChange({
        ...mergeVersionIntoData(normalized, response.version, [...versions, response.version]),
        selectedApproachId: approach?.id,
      });
      setStage("editor");
      retryLastActionRef.current = null;
    } catch {
      if (versions.length === 0) {
        const version = createGuionistaVersion({
          ...request,
          brainHints: brainConnected ? brainHints : [],
          label: approach ? "Primer borrador" : "Borrador directo",
        });
        onChange({
          ...mergeVersionIntoData(normalized, version, [version]),
          selectedApproachId: approach?.id,
        });
        setStage("editor");
      }
      setRetryableError(() => {
        void writeVersion(approach);
      });
    } finally {
      endLoading();
    }
  }, [beginLoading, brainConnected, brainContext, brainHints, endLoading, initialBriefing, normalized, onChange, setRetryableError, versions]);

  const updateActiveMarkdown = (markdown: string) => {
    if (!current) return;
    const nextVersion: GuionistaVersion = {
      ...current,
      markdown,
      plainText: plainTextFromMarkdown(markdown),
    };
    const nextVersions = versions.map((version) => (version.id === current.id ? nextVersion : version));
    onChange({
      ...mergeVersionIntoData(normalized, nextVersion, nextVersions),
      updatedAt: new Date().toISOString(),
    });
  };

  const captureEditorSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
    setSelectedText(selection);
  }, []);

  const addReviewComment = useCallback(() => {
    if (!current || !selectedText.trim() || !commentDraft.trim()) return;
    const now = nowIso();
    const comment: GuionistaReviewComment = {
      id: `gui_comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      selectedText: selectedText.trim(),
      comment: commentDraft.trim(),
      status: "pending",
      sourceVersionId: current.id,
      createdAt: now,
      updatedAt: now,
    };
    persistReviewState([...comments, comment], normalized.globalAdjustmentNotes || "");
    setCommentDraft("");
    setSelectedText("");
  }, [commentDraft, comments, current, normalized.globalAdjustmentNotes, persistReviewState, selectedText]);

  const updateReviewCommentStatus = useCallback((commentId: string, status: GuionistaReviewComment["status"]) => {
    const next = comments.map((comment) =>
      comment.id === commentId ? { ...comment, status, updatedAt: nowIso() } : comment,
    );
    persistReviewState(next, normalized.globalAdjustmentNotes || "");
  }, [comments, normalized.globalAdjustmentNotes, persistReviewState]);

  const applyReview = useCallback(async (mode: "single" | "all" | "global", targetComment?: GuionistaReviewComment) => {
    if (!current) return;
    const pendingComments = mode === "single"
      ? targetComment && targetComment.status === "pending" ? [targetComment] : []
      : mode === "all"
        ? comments.filter((comment) => comment.status === "pending")
        : [];
    const globalNotes = mode === "global" ? normalized.globalAdjustmentNotes || "" : "";
    if (mode !== "global" && pendingComments.length === 0) return;
    if (mode === "global" && !globalNotes.trim()) return;

    const loadingKey = mode === "single" && targetComment ? `review:${targetComment.id}` : mode === "all" ? "review:all" : "review:global";
    const loadingCopy = mode === "single"
      ? "Aplicando comentario…"
      : mode === "all"
        ? "Aplicando comentarios…"
        : "Aplicando notas…";
    const task = mode === "single" ? "apply_comment" : mode === "all" ? "apply_comments" : "apply_global_notes";
    beginLoading(loadingKey, loadingCopy);
    try {
      const response = await runGuionistaAi({
        task,
        briefing: normalized.briefing || initialBriefing || "",
        format: current.format,
        settings: normalized.settings || GUI_DEFAULT_SETTINGS,
        currentVersion: current,
        comment: mode === "single" ? targetComment : undefined,
        comments: pendingComments,
        globalNotes,
        brainContext: brainConnected ? brainContext : { enabled: false },
      });
      if (response.task !== task) throw new Error("Respuesta inesperada.");
      const nextVersions = [...versions, response.version];
      const nextComments = mode === "global"
        ? comments
        : comments.map((comment) =>
            pendingComments.some((pending) => pending.id === comment.id)
              ? { ...comment, status: "applied" as const, updatedAt: nowIso() }
              : comment,
          );
      onChange({
        ...mergeVersionIntoData(normalized, response.version, nextVersions),
        comments: nextComments,
        globalAdjustmentNotes: normalized.globalAdjustmentNotes || "",
      });
      if (activeAsset && onSaveAsset) {
        onSaveAsset({
          ...activeAsset,
          versions: nextVersions,
          activeVersionId: response.version.id,
          markdown: response.version.markdown,
          plainText: response.version.plainText,
          preview: plainTextFromMarkdown(response.version.markdown).slice(0, 150),
          updatedAt: nowIso(),
          comments: nextComments,
          globalAdjustmentNotes: normalized.globalAdjustmentNotes || "",
        });
      }
      retryLastActionRef.current = null;
      setStage("editor");
    } catch {
      setRetryableError(() => {
        void applyReview(mode, targetComment);
      });
    } finally {
      endLoading();
    }
  }, [activeAsset, beginLoading, brainConnected, brainContext, comments, current, endLoading, initialBriefing, normalized, onChange, onSaveAsset, setRetryableError, versions]);

  const createDerivative = useCallback(async (action: string, targetFormat?: GuionistaFormat) => {
    if (!current) return;
    beginLoading(`quick:${action}`, action === "Adaptar a redes" ? "Adaptando a redes…" : "Escribiendo texto…");
    try {
      const response = await runGuionistaAi({
        task: "transform",
        briefing: normalized.briefing || initialBriefing || "",
        format: current.format,
        settings: normalized.settings || GUI_DEFAULT_SETTINGS,
        currentVersion: current,
        action,
        targetFormat,
        brainContext: brainConnected ? brainContext : { enabled: false },
      });
      if (response.task !== "transform") throw new Error("Respuesta inesperada.");
      setDerivativeView({ action, version: response.version, sourceVersionId: current.id });
      setStage("derivative");
      retryLastActionRef.current = null;
    } catch {
      const fallback = transformGuionistaVersion(current, action, targetFormat);
      setDerivativeView({ action, version: fallback, sourceVersionId: current.id });
      setStage("derivative");
      setRetryableError(() => {
        void createDerivative(action, targetFormat);
      });
    } finally {
      endLoading();
    }
  }, [beginLoading, brainConnected, brainContext, current, endLoading, initialBriefing, normalized.briefing, normalized.settings, setRetryableError]);

  const applyQuickAction = useCallback(async (action: string) => {
    if (!current) return;
    if (action === "Adaptar a redes") {
      beginLoading(`quick:${action}`, "Adaptando a redes…");
      try {
        const response = await runGuionistaAi({
          task: "social",
          briefing: normalized.briefing || initialBriefing || "",
          format: current.format,
          settings: normalized.settings || GUI_DEFAULT_SETTINGS,
          currentVersion: current,
          sourceAssetId: normalized.assetId,
          sourceVersionId: current.id,
          brainContext: brainConnected ? brainContext : { enabled: false },
        });
        if (response.task !== "social") throw new Error("Respuesta inesperada.");
        setSocialPack(response.socialPack);
        retryLastActionRef.current = null;
      } catch {
        if (socialPack.length === 0) {
          setSocialPack(
            createSocialAdaptations({
              title: current.title,
              markdown: current.markdown,
              sourceAssetId: normalized.assetId,
              sourceVersionId: current.id,
            }),
          );
        }
        setRetryableError(() => {
          void applyQuickAction(action);
        });
      } finally {
        endLoading();
      }
      setStage("social");
      return;
    }
    if (action === "Crear titulares") {
      void createDerivative(action);
      return;
    }
    if (action === "Convertir en slides") {
      void createDerivative(action, "slides");
      return;
    }
    if (action === "Convertir en guion") {
      void createDerivative(action, "script");
      return;
    }
    beginLoading(`quick:${action}`, "Escribiendo texto…");
    try {
      const response = await runGuionistaAi({
        task: "transform",
        briefing: normalized.briefing || initialBriefing || "",
        format: current.format,
        settings: normalized.settings || GUI_DEFAULT_SETTINGS,
        currentVersion: current,
        action,
        brainContext: brainConnected ? brainContext : { enabled: false },
      });
      if (response.task !== "transform") throw new Error("Respuesta inesperada.");
      onChange(mergeVersionIntoData(normalized, response.version, [...versions, response.version]));
      setStage("editor");
      retryLastActionRef.current = null;
    } catch {
      const fallback = transformGuionistaVersion(current, action);
      onChange(mergeVersionIntoData(normalized, fallback, [...versions, fallback]));
      setRetryableError(() => {
        void applyQuickAction(action);
      });
    } finally {
      endLoading();
    }
  }, [beginLoading, brainConnected, brainContext, createDerivative, current, endLoading, initialBriefing, normalized, onChange, setRetryableError, socialPack.length, versions]);

  const saveActiveAsset = () => {
    if (!current || !onSaveAsset) return;
    setSaveState("saving");
    const asset = buildGuionistaAssetFromVersion({
      existing: activeAsset,
      nodeId,
      format: current.format,
      title: current.title,
      version: current,
      versions,
      status: normalized.status || "draft",
      comments,
      globalAdjustmentNotes: normalized.globalAdjustmentNotes || "",
    });
    onSaveAsset(asset);
    onChange({ assetId: asset.id, updatedAt: asset.updatedAt });
    setLastSavedAt(asset.updatedAt || nowIso());
    setSaveState("saved");
    setSavedMessage("Guardado en Generated Media");
    window.setTimeout(() => setSavedMessage(null), 1800);
  };

  const saveSocialPack = () => {
    if (!onSaveAsset || !current) return;
    const sourceAsset = activeAsset ?? buildGuionistaAssetFromVersion({
      nodeId,
      format: current.format,
      title: current.title,
      version: current,
      versions,
      status: normalized.status || "draft",
      comments,
      globalAdjustmentNotes: normalized.globalAdjustmentNotes || "",
    });
    if (!activeAsset) {
      onSaveAsset(sourceAsset);
      onChange({ assetId: sourceAsset.id, updatedAt: sourceAsset.updatedAt });
      setLastSavedAt(sourceAsset.updatedAt || nowIso());
      setSaveState("saved");
    }
    for (const social of socialPack) {
      const existingSocialAsset =
        generatedTextAssets?.items.find(
          (asset) =>
            asset.type === "post" &&
            asset.sourceAssetId === sourceAsset.id &&
            asset.platform === social.platform,
        ) ?? null;
      const version: GuionistaVersion = {
        id: social.id,
        label: social.platform,
        title: social.title,
        format: "post",
        markdown: `${social.text}${social.hashtags?.length ? `\n\n${social.hashtags.join(" ")}` : ""}`,
        plainText: plainTextFromMarkdown(social.text),
        createdAt: social.createdAt,
        sourceAction: "Adaptar a redes",
        structured: {
          platform: social.platform,
          hashtags: social.hashtags ?? [],
          sourceAssetId: sourceAsset.id,
          sourceVersionId: social.sourceVersionId ?? current.id,
        },
      };
      onSaveAsset(
        buildGuionistaAssetFromVersion({
          existing: existingSocialAsset,
          format: "post",
          title: social.title,
          version,
          versions: [version],
          status: "draft",
          sourceAssetId: sourceAsset.id,
          sourceVersionId: current.id,
          platform: social.platform,
        }),
      );
    }
    setSavedMessage("Adaptaciones guardadas en Posts");
    window.setTimeout(() => setSavedMessage(null), 1800);
  };

  const acceptDerivativeAsVersion = () => {
    if (!derivativeView) return;
    const version = derivativeView.version;
    onChange(mergeVersionIntoData(normalized, version, [...versions, version]));
    setStage("editor");
  };

  const useHeadlineAsTitle = (headline: string) => {
    renameCurrent(headline);
    setStage("editor");
  };

  const documentTitle = current?.title || normalized.title || "Convierte pensamiento en narrativa";
  const layoutColumns = "lg:grid-cols-[minmax(0,1fr)_250px]";

  const shell = (
    <div className="fixed inset-0 z-[100090] flex flex-col bg-[#101114] text-white" role="dialog" aria-modal="true">
      <header className="shrink-0 border-b border-white/8 bg-[#0c0d10]/88 px-6 py-4 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-100/14 bg-amber-100/10 text-amber-100 shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
              <PenLine className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/48">Guionista</p>
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/22">·</span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/68">{formatName(current?.format || normalized.format)}</p>
              </div>
              <input
                value={documentTitle}
                onChange={(event) => renameCurrent(event.target.value)}
                className="mt-1 w-full max-w-[58vw] truncate bg-transparent text-[21px] font-light leading-tight tracking-tight text-white outline-none placeholder:text-white/25"
                placeholder="Título del texto"
              />
              {sourceAssetLabel && (
                <p className="mt-2 block max-w-[58vw] truncate text-left text-[11px] font-light text-white/38" title={sourceAssetLabel}>
                  Derivado de: {sourceAssetLabel}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`hidden rounded-full border px-3 py-1.5 text-[11px] font-light md:inline-flex ${saveStateClass(saveState)}`}>
              {saveStateLabel(saveState, !!activeAsset, lastSavedRelative)}
            </span>
            <BrainPill brainConnected={brainConnected} onClick={() => { setActivePanel("brain"); setBrainOpen(true); }} />
            {current && (
              <button type="button" onClick={saveActiveAsset} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-white/68 transition hover:bg-white/10 hover:text-white">
                <Save className="h-3.5 w-3.5" /> Guardar en Foldder
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/[0.06] p-2.5 text-white/65 transition hover:bg-white/12 hover:text-white" aria-label="Cerrar Guionista">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_18%_18%,rgba(253,176,75,0.13),transparent_32%),radial-gradient(circle_at_88%_20%,rgba(99,212,253,0.11),transparent_34%),linear-gradient(180deg,#121318,#08090b)] px-5 py-6">
        <div className={`mx-auto grid max-w-7xl gap-5 ${layoutColumns}`}>
          <section className="min-w-0 rounded-[34px] border border-white/8 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl md:p-7">
            {(loadingLabel || generationError) && (
              <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-[12px] font-light ${
                loadingLabel
                  ? "border-amber-200/18 bg-amber-200/10 text-amber-50"
                  : "border-rose-300/18 bg-rose-400/10 text-rose-100"
              }`}>
                <span>{loadingLabel || generationError}</span>
                {generationError && retryLastActionRef.current && !loadingAction && (
                  <button
                    type="button"
                    onClick={() => retryLastActionRef.current?.()}
                    className="rounded-full border border-rose-100/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-50 hover:bg-white/16"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            )}

            {stage === "create" && (
              <div className="mx-auto max-w-4xl py-8 md:py-12">
                <p className="text-[11px] font-light uppercase tracking-[0.28em] text-white/42">Guionista convierte pensamiento en narrativa</p>
                <h2 className="mt-4 text-5xl font-light tracking-tight text-white">¿Qué quieres escribir?</h2>
                <textarea
                  value={normalized.briefing || ""}
                  onChange={(event) => onChange({ briefing: event.target.value, updatedAt: new Date().toISOString() })}
                  placeholder="Escribe una idea, briefing, nota o pega un texto aquí. No hace falta que esté perfecto."
                  className="mt-8 min-h-56 w-full resize-y rounded-[30px] border border-white/9 bg-[#f4ead8] px-7 py-6 font-serif text-[19px] leading-[1.75] text-[#17140f] shadow-[0_24px_80px_rgba(0,0,0,0.22)] outline-none placeholder:text-[#17140f]/35 focus:border-amber-100/45"
                />
                <div className="mt-7 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
                  {FORMAT_OPTIONS.map((format) => (
                    <button
                      key={format.id}
                      type="button"
                      onClick={() => onChange({ format: format.id, updatedAt: new Date().toISOString() })}
                      className={`rounded-2xl border px-3 py-3 text-left transition ${
                        normalized.format === format.id
                          ? "border-amber-200/55 bg-amber-200/12 text-amber-50"
                          : "border-white/9 bg-white/[0.035] text-white/64 hover:bg-white/[0.07]"
                      }`}
                    >
                      <span className="block text-[12px] font-semibold uppercase tracking-[0.12em]">{format.title}</span>
                      <span className="mt-1 block text-[10px] font-light leading-snug opacity-58">{format.help}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-7 flex flex-wrap gap-3">
                  <button type="button" onClick={createApproaches} disabled={loadingAction === "approaches"} className="rounded-full bg-white px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-black shadow-xl transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-55">
                    Crear enfoques
                  </button>
                  <button type="button" onClick={() => writeVersion(null)} disabled={loadingAction === "draft:direct"} className="rounded-full border border-white/14 bg-white/[0.06] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-55">
                    Escribir directamente
                  </button>
                </div>
              </div>
            )}

            {stage === "approaches" && (
              <div className="py-4">
                <button type="button" onClick={() => setStage("create")} className="text-[11px] font-light uppercase tracking-[0.18em] text-white/45 hover:text-white">
                  Volver
                </button>
                <h2 className="mt-4 text-4xl font-light tracking-tight">Elige un enfoque editorial</h2>
                <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-white/48">Tres formas de convertir la misma idea en narrativa. Elige una y Guionista escribe el primer borrador.</p>
                <div className="mt-7 grid gap-4 md:grid-cols-3">
                  {(normalized.approaches ?? []).slice(0, 3).map((approach) => (
                    <article key={approach.id} className="flex min-h-72 flex-col rounded-[30px] border border-white/9 bg-white/[0.04] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
                      <Sparkles className="h-5 w-5 text-amber-200" strokeWidth={1.6} />
                      <h3 className="mt-5 text-2xl font-light leading-tight text-white">{approach.title}</h3>
                      <p className="mt-4 text-sm font-light leading-relaxed text-white/64">{approach.idea}</p>
                      <p className="mt-4 text-[11px] font-light uppercase tracking-[0.12em] text-white/42">Tono: {approach.tone}</p>
                      {approach.rationale && (
                        <p className="mt-3 text-[11px] font-light leading-relaxed text-white/42">{approach.rationale}</p>
                      )}
                      <button type="button" onClick={() => writeVersion(approach)} disabled={loadingAction === `draft:${approach.id}`} className="mt-auto rounded-full bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-55">
                        Usar este enfoque
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {stage === "editor" && current && (
              <div className="mx-auto max-w-5xl">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-light uppercase tracking-[0.24em] text-white/40">Documento activo</p>
                    <h2 className="mt-1 max-w-3xl text-4xl font-light tracking-tight text-white">{current.title}</h2>
                  </div>
                  <span className={`rounded-full border px-3 py-1.5 text-[11px] font-light md:hidden ${saveStateClass(saveState)}`}>
                    {saveStateLabel(saveState, !!activeAsset, lastSavedRelative)}
                  </span>
                </div>

                <div className="mt-7 flex flex-wrap items-center gap-3 border-y border-white/8 py-4">
                  <div className="mr-2 text-[12px] font-light text-white/52">
                    Versión actual: <span className="text-white/80">{versionLabel(Math.max(0, versions.findIndex((version) => version.id === current.id)), current)}</span>
                  </div>
                  {versions.map((version, index) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => onChange(mergeVersionIntoData(normalized, version, versions))}
                      className={`rounded-full px-3 py-1.5 text-[11px] transition ${version.id === current.id ? "bg-white text-black" : "border border-white/10 bg-white/[0.04] text-white/54 hover:bg-white/10 hover:text-white"}`}
                    >
                      V{index + 1}
                    </button>
                  ))}
                  <button type="button" onClick={() => onChange(mergeVersionIntoData(normalized, current, versions))} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white/45 transition hover:bg-white/10 hover:text-white">
                    Restaurar esta versión
                  </button>
                </div>

                <div className="mt-7 rounded-[34px] border border-white/8 bg-[#f5efe3] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.34)] md:p-7">
                  <StructuredPreview version={current} />
                  <textarea
                    ref={editorRef}
                    value={current.markdown}
                    onChange={(event) => updateActiveMarkdown(event.target.value)}
                    onSelect={captureEditorSelection}
                    onKeyUp={captureEditorSelection}
                    onMouseUp={captureEditorSelection}
                    className="min-h-[58vh] w-full resize-y rounded-[26px] border border-black/5 bg-[#fffaf0] px-7 py-6 font-serif text-[18px] leading-[1.82] text-[#15130f] shadow-inner outline-none placeholder:text-black/30 focus:border-amber-300/50"
                  />
                </div>
              </div>
            )}

            {stage === "social" && (
              <div className="mx-auto max-w-6xl">
                <button type="button" onClick={() => setStage("editor")} className="text-[11px] font-light uppercase tracking-[0.18em] text-white/45 hover:text-white">
                  Volver al texto
                </button>
                <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-light uppercase tracking-[0.24em] text-white/40">Derivado editorial</p>
                    <h2 className="mt-1 text-4xl font-light tracking-tight">Adaptaciones sociales</h2>
                    <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-white/52">Estas adaptaciones se guardarán como posts independientes en Generated Media.</p>
                  </div>
                  <button type="button" onClick={saveSocialPack} className="rounded-full bg-white px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-amber-100">
                    Guardar adaptaciones
                  </button>
                </div>
                <div className="mt-7 grid gap-4 md:grid-cols-2">
                  {socialPack.map((social, index) => (
                    <article key={social.id} className="rounded-[30px] border border-white/9 bg-white/[0.04] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100/70">{social.platform === "Short" ? "Short caption" : social.platform}</p>
                      <input
                        value={social.title}
                        onChange={(event) => setSocialPack((pack) => pack.map((item, i) => (i === index ? { ...item, title: event.target.value, updatedAt: new Date().toISOString() } : item)))}
                        className="mt-2 w-full bg-transparent text-xl font-light text-white outline-none"
                      />
                      <textarea
                        value={social.text}
                        onChange={(event) => setSocialPack((pack) => pack.map((item, i) => (i === index ? { ...item, text: event.target.value, updatedAt: new Date().toISOString() } : item)))}
                        className="mt-4 min-h-52 w-full resize-y rounded-[24px] border border-white/9 bg-[#f5efe3] px-5 py-4 font-serif text-[16px] leading-[1.7] text-[#16130f] outline-none focus:border-amber-200/45"
                      />
                      <input
                        value={(social.hashtags ?? []).join(" ")}
                        onChange={(event) => setSocialPack((pack) => pack.map((item, i) => (i === index ? { ...item, hashtags: event.target.value.split(/\s+/).filter(Boolean).slice(0, 5), updatedAt: new Date().toISOString() } : item)))}
                        placeholder="#hashtags"
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/70 outline-none placeholder:text-white/25"
                      />
                    </article>
                  ))}
                </div>
              </div>
            )}

            {stage === "derivative" && derivativeView && (
              <DerivativePreview
                derivative={derivativeView}
                onBack={() => setStage("editor")}
                onAcceptVersion={acceptDerivativeAsVersion}
                onUseHeadline={useHeadlineAsTitle}
              />
            )}
          </section>

          <DetailDrawer
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            settingsOpen={settingsOpen}
            setSettingsOpen={setSettingsOpen}
            brainOpen={brainOpen}
            setBrainOpen={setBrainOpen}
            normalizedSettings={normalizedSettings}
            updateSettings={updateSettings}
            brainConnected={brainConnected}
            brainHints={brainHints}
            savedMessage={savedMessage}
            selectedText={selectedText}
            commentDraft={commentDraft}
            setCommentDraft={setCommentDraft}
            comments={comments}
            globalAdjustmentNotes={normalized.globalAdjustmentNotes || ""}
            setGlobalAdjustmentNotes={(value) => onChange({ globalAdjustmentNotes: value, updatedAt: new Date().toISOString() })}
            onGlobalAdjustmentNotesBlur={() => persistReviewState(comments, normalized.globalAdjustmentNotes || "")}
            onAddComment={addReviewComment}
            onApplyComment={(comment) => {
              void applyReview("single", comment);
            }}
            onApplyAllComments={() => {
              void applyReview("all");
            }}
            onResolveComment={(commentId) => updateReviewCommentStatus(commentId, "resolved")}
            onApplyGlobalNotes={() => {
              void applyReview("global");
            }}
            onQuickAction={applyQuickAction}
            loadingAction={loadingAction}
          />
        </div>
      </main>
    </div>
  );

  return <StudioNodePortal>{shell}</StudioNodePortal>;
}
