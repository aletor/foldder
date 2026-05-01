"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Clapperboard,
  Copy,
  Film,
  Layers,
  Lock,
  Map,
  Plus,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { StandardStudioShellHeader, type StandardStudioShellConfig } from "./StandardStudioShell";
import {
  CINE_MODE_LABELS,
  CINE_SHOT_LABELS,
  CINE_STATUS_LABELS,
  createEmptyCineNodeData,
  makeCineId,
  type CineAspectRatio,
  type CineBackground,
  type CineCharacter,
  type CineFrame,
  type CineMode,
  type CineNodeData,
  type CineScene,
  type CineShot,
} from "./cine-types";
import {
  analyzeCineScript,
  applyCineAnalysisToData,
  createCineFrameDraft,
  prepareSceneForVideo,
} from "./cine-engine";
import { StudioNodePortal } from "./studio-node/studio-node-architecture";

type CineStudioTab = "script" | "cast" | "backgrounds" | "storyboard" | "output";

export type CineStudioProps = {
  nodeId: string;
  data: CineNodeData;
  onChange: (next: CineNodeData) => void;
  onClose: () => void;
  brainConnected?: boolean;
  sourceScriptText?: string;
  sourceScriptNodeId?: string;
  standardShell?: StandardStudioShellConfig | null;
};

const aspectRatios: CineAspectRatio[] = ["16:9", "9:16", "1:1", "4:5", "2.39:1"];
const cineModes = Object.keys(CINE_MODE_LABELS) as CineMode[];
const shotTypes = Object.keys(CINE_SHOT_LABELS) as CineShot["shotType"][];

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/40 focus:bg-white/[0.08]",
        props.className,
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full resize-y rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm leading-relaxed text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/40 focus:bg-white/[0.08]",
        props.className,
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "w-full rounded-2xl border border-white/10 bg-[#121722] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/40",
        props.className,
      )}
    />
  );
}

function PillButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
        props.className,
      )}
    />
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-200/25 bg-cyan-300/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-50 shadow-[0_12px_35px_rgba(34,211,238,0.10)] transition hover:bg-cyan-300/22 disabled:cursor-not-allowed disabled:opacity-40",
        props.className,
      )}
    />
  );
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-[28px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl", className)}>{children}</section>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function useCineMutations(data: CineNodeData, onChange: (next: CineNodeData) => void, nodeId: string, brainConnected?: boolean) {
  const commit = (producer: (draft: CineNodeData) => CineNodeData) => {
    const next = producer(data);
    onChange(updated({ ...next, status: nextStatus(next) }));
  };

  return {
    commit,
    analyze(script: string) {
      const analysis = analyzeCineScript(script);
      onChange(updated(applyCineAnalysisToData({ ...data, manualScript: script }, analysis)));
    },
    createStoryboard(script: string) {
      const analysis = analyzeCineScript(script);
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
      const video = prepareSceneForVideo(data, sceneId);
      commit((draft) => ({ ...draft, scenes: draft.scenes.map((scene) => scene.id === sceneId ? { ...scene, video, status: "ready_for_video" } : scene) }));
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

export function CineStudio({ nodeId, data, onChange, onClose, brainConnected = false, sourceScriptText = "", sourceScriptNodeId, standardShell }: CineStudioProps) {
  const [activeTab, setActiveTab] = useState<CineStudioTab>("script");
  const [promptPreview, setPromptPreview] = useState<{ title: string; prompt: string; negativePrompt?: string; details?: Array<[string, string]> } | null>(null);
  const safeData = data || createEmptyCineNodeData();
  const mutations = useCineMutations(safeData, onChange, nodeId, brainConnected);
  const script = safeData.manualScript || safeData.sourceScript?.text || sourceScriptText || "";
  const framesPrepared = safeData.scenes.reduce((count, scene) => count + [scene.frames.single, scene.frames.start, scene.frames.end].filter(Boolean).length, 0);
  const tabs: Array<{ id: CineStudioTab; label: string; icon: React.ReactNode }> = [
    { id: "script", label: "Guion", icon: <BookOpen size={14} /> },
    { id: "cast", label: "Reparto", icon: <Users size={14} /> },
    { id: "backgrounds", label: "Fondos", icon: <Map size={14} /> },
    { id: "storyboard", label: "Storyboard", icon: <Clapperboard size={14} /> },
    { id: "output", label: "Salida", icon: <Film size={14} /> },
  ];

  const exportPlan = useMemo(() => ({
    cineNodeId: nodeId,
    mode: safeData.mode,
    aspectRatio: safeData.visualDirection.aspectRatio,
    scenes: safeData.scenes.map((scene) => ({
      sceneId: scene.id,
      order: scene.order,
      title: scene.title,
      framesMode: scene.framesMode,
      video: scene.video,
      prompt: scene.video?.prompt,
    })),
  }), [nodeId, safeData.mode, safeData.scenes, safeData.visualDirection.aspectRatio]);

  const shell = (
    <div className="fixed inset-0 z-[100090] flex flex-col bg-[#05070b] text-white">
      {standardShell ? <StandardStudioShellHeader shell={standardShell} /> : null}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[-10%] h-[30rem] w-[30rem] rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-[-18%] left-[28%] h-[32rem] w-[32rem] rounded-full bg-amber-500/8 blur-3xl" />
      </div>
      <header className="relative z-10 flex shrink-0 items-center gap-4 border-b border-white/10 px-7 py-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.07] shadow-2xl">
          <Clapperboard size={22} className="text-cyan-100" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/60">Nodo Cine</div>
          <h1 className="truncate text-2xl font-semibold tracking-[-0.04em] text-white">Mesa de dirección audiovisual</h1>
        </div>
        <div className="ml-auto hidden grid-cols-4 gap-2 lg:grid">
          <Stat label="Escenas" value={safeData.scenes.length} />
          <Stat label="Reparto" value={safeData.characters.length} />
          <Stat label="Fondos" value={safeData.backgrounds.length} />
          <Stat label="Frames" value={framesPrepared} />
        </div>
        <div className="flex items-center gap-2">
          <span className={cx("rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em]", brainConnected ? "border-cyan-300/30 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.05] text-white/45")}>{brainConnected ? "Brain conectado" : "Sin Brain"}</span>
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 text-white/65 transition hover:bg-white/[0.12] hover:text-white">
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="relative z-10 flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 border-r border-white/10 p-5">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cx(
                  "mb-1 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.13em] transition last:mb-0",
                  activeTab === tab.id ? "bg-cyan-300/15 text-cyan-50 shadow-inner" : "text-white/48 hover:bg-white/[0.06] hover:text-white/80",
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Estado</div>
            <div className="mt-2 text-sm font-semibold text-white">{CINE_STATUS_LABELS[safeData.status]}</div>
            <p className="mt-2 text-xs leading-relaxed text-white/42">Cine prepara continuidad, frames y salida. No modifica VideoNode ni Brain.</p>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-7">
          {activeTab === "script" ? (
            <div className="mx-auto grid max-w-6xl gap-5 xl:grid-cols-[1fr_360px]">
              <SectionCard>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-[-0.03em]">Guion</h2>
                    <p className="mt-1 text-sm text-white/45">Pega un texto o importa el guion conectado desde Guionista.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton disabled={!script.trim()} onClick={() => mutations.analyze(script)}><Wand2 size={14} />Analizar guion</PrimaryButton>
                    <PillButton disabled={!script.trim()} onClick={() => mutations.createStoryboard(script)}><Clapperboard size={14} />Crear storyboard</PillButton>
                  </div>
                </div>
                {sourceScriptText ? (
                  <div className="mb-4 rounded-2xl border border-cyan-200/15 bg-cyan-300/8 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm text-cyan-50/80">Guion conectado disponible</div>
                      <PillButton onClick={() => mutations.useConnectedScript(sourceScriptText, sourceScriptNodeId)}>Usar conectado</PillButton>
                    </div>
                  </div>
                ) : null}
                <TextArea
                  value={safeData.manualScript ?? ""}
                  onChange={(event) => mutations.commit((draft) => ({ ...draft, manualScript: event.target.value }))}
                  placeholder="Pega aqui el guion, texto narrativo o estructura de escenas..."
                  className="min-h-[360px]"
                />
              </SectionCard>
              <SectionCard>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">Dirección</h3>
                <div className="mt-4 grid gap-4">
                  <div><FieldLabel>Modo</FieldLabel><Select value={safeData.mode} onChange={(event) => mutations.commit((draft) => ({ ...draft, mode: event.target.value as CineMode }))}>{cineModes.map((mode) => <option key={mode} value={mode}>{CINE_MODE_LABELS[mode]}</option>)}</Select></div>
                  <div><FieldLabel>Aspect ratio</FieldLabel><Select value={safeData.visualDirection.aspectRatio} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, aspectRatio: event.target.value as CineAspectRatio } }))}>{aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}</Select></div>
                  <div><FieldLabel>Realismo</FieldLabel><Select value={safeData.visualDirection.realismLevel} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, realismLevel: event.target.value as CineNodeData["visualDirection"]["realismLevel"] } }))}><option value="realistic">Realista</option><option value="stylized">Estilizado</option><option value="hybrid">Híbrido</option></Select></div>
                  <div><FieldLabel>Dirección visual general</FieldLabel><TextArea value={safeData.visualDirection.globalStylePrompt ?? ""} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, globalStylePrompt: event.target.value } }))} rows={4} placeholder="Luz, textura, cámara, tono visual..." /></div>
                  <div><FieldLabel>Estilo de cámara</FieldLabel><TextInput value={safeData.visualDirection.cameraStyle ?? ""} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, cameraStyle: event.target.value } }))} placeholder="Cámara en mano suave, ópticas naturales..." /></div>
                  <div><FieldLabel>Estilo de luz</FieldLabel><TextInput value={safeData.visualDirection.lightingStyle ?? ""} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, lightingStyle: event.target.value } }))} placeholder="Luz natural motivada, contraste suave..." /></div>
                  <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70"><span>Usar Brain conectado</span><input type="checkbox" checked={Boolean(safeData.visualDirection.useBrain)} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, useBrain: event.target.checked } }))} /></label>
                </div>
              </SectionCard>
              {safeData.detected ? (
                <SectionCard className="xl:col-span-2">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Análisis</h3><PillButton onClick={() => setActiveTab("storyboard")}>Ver storyboard <ArrowRight size={13} /></PillButton></div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3"><Stat label="Tono" value={safeData.detected.tone || "-"} /><Stat label="Modo sugerido" value={safeData.detected.suggestedMode ? CINE_MODE_LABELS[safeData.detected.suggestedMode] : "-"} /><Stat label="Escenas" value={safeData.scenes.length} /></div>
                  <p className="mt-4 text-sm leading-relaxed text-white/55">{safeData.detected.summary}</p>
                </SectionCard>
              ) : null}
            </div>
          ) : null}

          {activeTab === "cast" ? (
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-[-0.03em]">Reparto</h2><p className="mt-1 text-sm text-white/45">Continuidad visual de personajes.</p></div><PrimaryButton onClick={() => mutations.addCharacter()}><Plus size={14} />Añadir personaje</PrimaryButton></div>
              <div className="grid gap-4 lg:grid-cols-2">
                {safeData.characters.map((character) => (
                  <SectionCard key={character.id}>
                    <div className="mb-4 flex items-center justify-between gap-3"><TextInput value={character.name} onChange={(event) => mutations.patchCharacter(character.id, { name: event.target.value })} className="text-base font-semibold" /><PillButton onClick={() => mutations.patchCharacter(character.id, { isLocked: !character.isLocked })}>{character.isLocked ? <Lock size={13} /> : <Unlock size={13} />}{character.isLocked ? "Bloqueado" : "Bloquear"}</PillButton></div>
                    <div className="grid gap-3"><div><FieldLabel>Rol</FieldLabel><Select value={character.role} onChange={(event) => mutations.patchCharacter(character.id, { role: event.target.value as CineCharacter["role"] })}><option value="protagonist">Protagonista</option><option value="secondary">Secundario</option><option value="extra">Extra</option><option value="object">Objeto</option></Select></div><div><FieldLabel>Descripción</FieldLabel><TextArea rows={3} value={character.description} onChange={(event) => mutations.patchCharacter(character.id, { description: event.target.value })} /></div><div><FieldLabel>Prompt visual</FieldLabel><TextArea rows={4} value={character.visualPrompt} onChange={(event) => mutations.patchCharacter(character.id, { visualPrompt: event.target.value })} /></div><div><FieldLabel>Rasgos bloqueados</FieldLabel><TextInput value={character.lockedTraits.join(", ")} onChange={(event) => mutations.patchCharacter(character.id, { lockedTraits: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="pelo, edad, vestuario, gesto..." /></div></div>
                    <div className="mt-4 flex flex-wrap gap-2"><PillButton disabled><Camera size={13} />Generar personaje</PillButton><PillButton disabled>Editar en Image Studio</PillButton><PillButton onClick={() => mutations.duplicateCharacter(character.id)}><Copy size={13} />Duplicar</PillButton><PillButton onClick={() => mutations.removeCharacter(character.id)} className="text-rose-100"><Trash2 size={13} />Eliminar</PillButton></div>
                  </SectionCard>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "backgrounds" ? (
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-[-0.03em]">Fondos</h2><p className="mt-1 text-sm text-white/45">Localizaciones reutilizables y bloqueables.</p></div><PrimaryButton onClick={() => mutations.addBackground()}><Plus size={14} />Añadir fondo</PrimaryButton></div>
              <div className="grid gap-4 lg:grid-cols-2">
                {safeData.backgrounds.map((background) => (
                  <SectionCard key={background.id}>
                    <div className="mb-4 flex items-center justify-between gap-3"><TextInput value={background.name} onChange={(event) => mutations.patchBackground(background.id, { name: event.target.value })} className="text-base font-semibold" /><PillButton onClick={() => mutations.patchBackground(background.id, { isLocked: !background.isLocked })}>{background.isLocked ? <Lock size={13} /> : <Unlock size={13} />}{background.isLocked ? "Bloqueado" : "Bloquear"}</PillButton></div>
                    <div className="grid gap-3"><div><FieldLabel>Tipo</FieldLabel><Select value={background.type ?? "other"} onChange={(event) => mutations.patchBackground(background.id, { type: event.target.value as CineBackground["type"] })}><option value="interior">Interior</option><option value="exterior">Exterior</option><option value="natural">Natural</option><option value="urban">Urbano</option><option value="studio">Studio</option><option value="abstract">Abstracto</option><option value="other">Otro</option></Select></div><div><FieldLabel>Descripción</FieldLabel><TextArea rows={3} value={background.description} onChange={(event) => mutations.patchBackground(background.id, { description: event.target.value })} /></div><div><FieldLabel>Prompt visual</FieldLabel><TextArea rows={4} value={background.visualPrompt} onChange={(event) => mutations.patchBackground(background.id, { visualPrompt: event.target.value })} /></div><div><FieldLabel>Luz habitual</FieldLabel><TextInput value={background.lighting ?? ""} onChange={(event) => mutations.patchBackground(background.id, { lighting: event.target.value })} /></div><div><FieldLabel>Elementos bloqueados</FieldLabel><TextInput value={(background.lockedElements ?? []).join(", ")} onChange={(event) => mutations.patchBackground(background.id, { lockedElements: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></div></div>
                    <div className="mt-4 flex flex-wrap gap-2"><PillButton disabled><Camera size={13} />Generar fondo</PillButton><PillButton disabled>Editar en Image Studio</PillButton><PillButton onClick={() => mutations.duplicateBackground(background.id)}><Copy size={13} />Duplicar</PillButton><PillButton onClick={() => mutations.removeBackground(background.id)} className="text-rose-100"><Trash2 size={13} />Eliminar</PillButton></div>
                  </SectionCard>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "storyboard" ? (
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-[-0.03em]">Storyboard</h2><p className="mt-1 text-sm text-white/45">Escenas ordenadas, frames y prompts revisables.</p></div><PrimaryButton disabled={!script.trim()} onClick={() => mutations.createStoryboard(script)}><Sparkles size={14} />Generar storyboard completo</PrimaryButton></div>
              <div className="grid gap-5">
                {safeData.scenes.map((scene) => (
                  <SectionCard key={scene.id}>
                    <div className="mb-4 flex flex-wrap items-center gap-3"><span className="rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">Escena {scene.order}</span><TextInput value={scene.title} onChange={(event) => mutations.patchScene(scene.id, { title: event.target.value })} className="min-w-[220px] flex-1 text-base font-semibold" /><PillButton onClick={() => mutations.duplicateScene(scene.id)}><Copy size={13} />Duplicar</PillButton><PillButton onClick={() => mutations.removeScene(scene.id)} className="text-rose-100"><Trash2 size={13} />Eliminar</PillButton></div>
                    <div className="grid gap-4 xl:grid-cols-[1fr_320px]"><div className="grid gap-3"><div><FieldLabel>Texto original</FieldLabel><TextArea rows={3} value={scene.sourceText} onChange={(event) => mutations.patchScene(scene.id, { sourceText: event.target.value })} /></div><div><FieldLabel>Resumen visual</FieldLabel><TextArea rows={3} value={scene.visualSummary} onChange={(event) => mutations.patchScene(scene.id, { visualSummary: event.target.value })} /></div>{(scene.voiceOver || scene.onScreenText?.length || scene.visualNotes || scene.sceneKind) ? <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/18 p-3 text-xs leading-relaxed text-white/58">{scene.sceneKind ? <div><span className="font-semibold uppercase tracking-wide text-white/35">Tipo</span><p className="mt-1 text-white/70">{scene.sceneKind}</p></div> : null}{scene.voiceOver ? <div><span className="font-semibold uppercase tracking-wide text-white/35">Voz en off</span><p className="mt-1 whitespace-pre-wrap text-white/70">{scene.voiceOver}</p></div> : null}{scene.onScreenText?.length ? <div><span className="font-semibold uppercase tracking-wide text-white/35">Texto en pantalla</span><ul className="mt-1 list-disc space-y-1 pl-4 text-white/70">{scene.onScreenText.map((text, idx) => <li key={`${scene.id}_text_${idx}`}>{text}</li>)}</ul><p className="mt-2 rounded-xl border border-amber-200/15 bg-amber-300/10 px-3 py-2 text-[11px] leading-relaxed text-amber-50/70">El texto en pantalla se conservará como overlay. No se recomienda quemarlo dentro del frame generado.</p></div> : null}{scene.visualNotes ? <div><span className="font-semibold uppercase tracking-wide text-white/35">Notas visuales</span><p className="mt-1 whitespace-pre-wrap text-white/70">{scene.visualNotes}</p></div> : null}</div> : null}<div><FieldLabel>Personajes</FieldLabel><div className="mt-2 flex flex-wrap gap-2">{safeData.characters.length ? safeData.characters.map((character) => { const active = scene.characters.includes(character.id); return <button key={character.id} type="button" onClick={() => mutations.patchScene(scene.id, { characters: active ? scene.characters.filter((id) => id !== character.id) : [...scene.characters, character.id] })} className={cx("rounded-full border px-3 py-1.5 text-[11px] font-semibold transition", active ? "border-cyan-200/35 bg-cyan-300/16 text-cyan-50" : "border-white/10 bg-white/[0.04] text-white/48 hover:text-white/80")}>{character.name}</button>; }) : <span className="text-xs text-white/35">Sin personajes detectados todavía.</span>}</div></div><div className="grid gap-3 md:grid-cols-2"><div><FieldLabel>Fondo</FieldLabel><Select value={scene.backgroundId ?? ""} onChange={(event) => mutations.patchScene(scene.id, { backgroundId: event.target.value || undefined })}><option value="">Sin fondo</option>{safeData.backgrounds.map((background) => <option key={background.id} value={background.id}>{background.name}</option>)}</Select></div><div><FieldLabel>Tipo de plano</FieldLabel><Select value={scene.shot.shotType} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, shotType: event.target.value as CineShot["shotType"] } })}>{shotTypes.map((shot) => <option key={shot} value={shot}>{CINE_SHOT_LABELS[shot]}</option>)}</Select></div></div><div className="grid gap-3 md:grid-cols-3"><div><FieldLabel>Cámara</FieldLabel><TextInput value={scene.shot.cameraMovement ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, cameraMovement: event.target.value } })} /></div><div><FieldLabel>Luz</FieldLabel><TextInput value={scene.shot.lighting ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, lighting: event.target.value } })} /></div><div><FieldLabel>Duración</FieldLabel><TextInput type="number" value={scene.shot.durationSeconds ?? scene.durationSeconds ?? 5} onChange={(event) => mutations.patchScene(scene.id, { durationSeconds: Number(event.target.value) || 5, shot: { ...scene.shot, durationSeconds: Number(event.target.value) || 5 } })} /></div></div><div className="grid gap-3 md:grid-cols-2"><div><FieldLabel>Mood</FieldLabel><TextInput value={scene.shot.mood ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, mood: event.target.value } })} /></div><div><FieldLabel>Acción</FieldLabel><TextInput value={scene.shot.action ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, action: event.target.value } })} /></div></div></div>
                      <div className="rounded-[24px] border border-white/10 bg-black/20 p-3"><FieldLabel>Frames</FieldLabel><div className="mt-2 grid grid-cols-2 gap-2"><PillButton onClick={() => mutations.patchScene(scene.id, { framesMode: "single" })} className={scene.framesMode === "single" ? "bg-cyan-300/18 text-cyan-50" : ""}>1 frame</PillButton><PillButton onClick={() => mutations.patchScene(scene.id, { framesMode: "start_end" })} className={scene.framesMode === "start_end" ? "bg-cyan-300/18 text-cyan-50" : ""}>Inicio + final</PillButton></div><div className="mt-3 grid gap-2">{(scene.framesMode === "start_end" ? (["start", "end"] as CineFrame["role"][]) : (["single"] as CineFrame["role"][])).map((role) => { const frame = scene.frames[role]; const label = role === "single" ? "Frame único" : role === "start" ? "Frame inicial" : "Frame final"; return <div key={role} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-white/75">{label}</span><span className="text-[10px] uppercase tracking-wide text-white/35">{frame?.status ?? "vacío"}</span></div><div className="flex flex-wrap gap-2"><PillButton onClick={() => mutations.prepareFrame(scene.id, role)}>Construir prompt</PillButton><PillButton disabled={!frame?.prompt} onClick={() => frame?.prompt && setPromptPreview({ title: `${scene.title} · ${label}`, prompt: frame.prompt, negativePrompt: frame.negativePrompt, details: [["Personajes", scene.characters.map((characterId) => safeData.characters.find((character) => character.id === characterId)?.name).filter(Boolean).join(", ") || "-"], ["Fondo", safeData.backgrounds.find((background) => background.id === scene.backgroundId)?.name || "-"], ["Visual notes", scene.visualNotes || "-"], ["Voice over", scene.voiceOver || "-"], ["Scene kind", scene.sceneKind || "-"], ["On-screen text", scene.onScreenText?.length ? `${scene.onScreenText.join(" / ")} (overlay externo, excluido de la imagen)` : "-"]] })}>Ver prompt</PillButton><PillButton disabled>Editar</PillButton><PillButton disabled={!frame} onClick={() => frame && mutations.patchScene(scene.id, { frames: { ...scene.frames, [role]: { ...frame, status: "approved" } } })}><Check size={13} />Aprobar prompt</PillButton></div></div>; })}</div><PrimaryButton className="mt-3 w-full" onClick={() => mutations.prepareAllSceneFrames(scene.id)}>Construir prompts de escena</PrimaryButton><PillButton className="mt-2 w-full" onClick={() => mutations.prepareVideo(scene.id)}>Preparar para vídeo</PillButton></div>
                    </div>
                  </SectionCard>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "output" ? (
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-[-0.03em]">Salida</h2><p className="mt-1 text-sm text-white/45">Plan de escenas listo para vídeo. Exportación JSON inicial.</p></div><PrimaryButton onClick={() => void navigator.clipboard?.writeText(JSON.stringify(exportPlan, null, 2))}><Layers size={14} />Copiar plan JSON</PrimaryButton></div>
              <div className="grid gap-4">
                {safeData.scenes.map((scene) => (
                  <SectionCard key={scene.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/50">Escena {scene.order}</div><h3 className="mt-1 text-lg font-semibold">{scene.title}</h3></div><PillButton onClick={() => mutations.prepareVideo(scene.id)}>Preparar vídeo</PillButton></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3"><Stat label="Modo" value={scene.framesMode === "start_end" ? "Start/end" : "Image to video"} /><Stat label="Duración" value={`${scene.durationSeconds ?? scene.shot.durationSeconds ?? 5}s`} /><Stat label="Estado" value={scene.video?.status ?? "idle"} /></div>
                    {scene.video?.prompt ? <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/25 p-4 text-xs leading-relaxed text-white/62">{scene.video.prompt}</pre> : null}
                  </SectionCard>
                ))}
              </div>
            </div>
          ) : null}
        </main>
      </div>
      {promptPreview ? (
        <div className="fixed inset-0 z-[100100] flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/12 bg-[#0b1018] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Prompt de frame</div><h3 className="mt-1 text-lg font-semibold">{promptPreview.title}</h3></div><button type="button" onClick={() => setPromptPreview(null)} className="rounded-2xl border border-white/10 bg-white/[0.06] p-2 text-white/65 hover:bg-white/[0.12]"><X size={18} /></button></div>
            <div className="max-h-[60vh] overflow-auto p-5">
              {promptPreview.details?.length ? (
                <div className="mb-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white/60">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Datos usados</div>
                  {promptPreview.details.map(([label, value]) => (
                    <div key={label} className="grid gap-1 sm:grid-cols-[140px_1fr]">
                      <span className="font-semibold text-white/45">{label}</span>
                      <span className="whitespace-pre-wrap text-white/72">{value}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Prompt final de imagen</div>
              <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/24 p-4 text-sm leading-relaxed text-white/72">{promptPreview.prompt}</pre>
              {promptPreview.negativePrompt ? (
                <>
                  <div className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Negative prompt</div>
                  <pre className="whitespace-pre-wrap rounded-2xl border border-rose-200/10 bg-rose-950/10 p-4 text-xs leading-relaxed text-rose-50/68">{promptPreview.negativePrompt}</pre>
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
