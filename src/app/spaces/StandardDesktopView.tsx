"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Node } from "@xyflow/react";
import {
  FileStack,
  Images,
  PackageOpen,
  Plus,
  Sparkles,
} from "lucide-react";
import type { ProjectFile } from "./project-files";
import { ProjectFolderView, type FoldderDesktopSectionId } from "./ProjectFolderView";
import type { ProjectMediaItem } from "./project-media-inventory";
import { DOCK_STUDIO_APPS, type StudioAppConfig } from "./studioApps";
import { CANVAS_BACKGROUNDS } from "./canvas-backgrounds";
import { CanvasWallpaperTransition } from "./CanvasWallpaperTransition";
import { TopbarPins, type TopbarPinType } from "./TopbarPins";
import {
  NotesStickyCard,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  normalizeNotesNodeData,
} from "./NotesSticky";
import { NodeIconMono } from "./foldder-icons";

type StandardDesktopViewProps = {
  files: ProjectFile[];
  importedMedia: ProjectMediaItem[];
  generatedMedia: ProjectMediaItem[];
  exports: ProjectFile[];
  notes: Node[];
  canvasViewport: { x: number; y: number; zoom: number };
  activeAppId?: string | null;
  minimizedAppId?: string | null;
  onCreateNote: () => void;
  onUpdateNote: (nodeId: string, patch: Record<string, unknown>) => void;
  onDuplicateNote: (nodeId: string) => void;
  onDeleteNote: (nodeId: string) => void;
  onMoveNote: (nodeId: string, dxPx: number, dyPx: number) => void;
  onAutoHeightNote: (nodeId: string, heightPx: number) => void;
  onDockAppClick: (app: StudioAppConfig) => void;
  onCreateFileForApp: (app: StudioAppConfig) => void;
  onOpenFile: (file: ProjectFile) => void;
  onRenameFile: (file: ProjectFile) => void;
  onSaveAsFile: (file: ProjectFile) => void;
  onHideFile: (file: ProjectFile) => void;
  onPresentDesignFile: (file: ProjectFile) => void;
  onOpenFoldderFullscreen: () => void;
  foldderOpenRequest?: number;
  canvasBgId: string;
};

function visibleFiles(files: ProjectFile[]): ProjectFile[] {
  return files.filter((file) => file.metadata?.hidden !== true);
}

function DesktopFolderTile({
  title,
  subtitle,
  count,
  tone,
  icon,
  onOpen,
}: {
  title: string;
  subtitle: string;
  count: number;
  tone: string;
  icon: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onDoubleClick={onOpen}
      className="group relative flex min-h-[132px] w-full flex-col items-start justify-between overflow-hidden rounded-[18px] border border-white/14 bg-black/30 p-3.5 text-left shadow-[0_12px_28px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-[transform,border-color,background-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-white/24 hover:bg-black/42 hover:shadow-[0_18px_36px_-22px_rgba(0,0,0,0.95)]"
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-80"
        aria-hidden
      />

      <div className="flex w-full items-start justify-between gap-2.5">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-gradient-to-br ${tone} shadow-lg transition duration-300 group-hover:scale-105`}
        >
          {icon}
        </span>
        <span className="inline-flex h-7 min-w-[1.8rem] items-center justify-center rounded-full border border-white/14 bg-white/[0.06] px-2 text-[10px] font-light tabular-nums text-white/68">
          {count}
        </span>
      </div>

      <div className="mt-2.5 min-w-0">
        <span className="block truncate text-[14px] font-light leading-none tracking-[0.18em] text-white">
          {title}
        </span>
        <span className="mt-2 block line-clamp-2 max-w-[28ch] text-[11px] font-light leading-snug text-white/50">
          {subtitle}
        </span>
      </div>

      <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[9px] font-light uppercase tracking-[0.14em] text-white/44 transition-colors duration-300 group-hover:text-white/70">
        Abrir
        <span className="text-[10px]" aria-hidden>
          →
        </span>
      </span>
    </button>
  );
}

export function StandardDesktopView({
  files,
  importedMedia,
  generatedMedia,
  exports,
  notes,
  canvasViewport,
  activeAppId,
  minimizedAppId,
  onCreateNote,
  onUpdateNote,
  onDuplicateNote,
  onDeleteNote,
  onMoveNote,
  onAutoHeightNote,
  onDockAppClick,
  onCreateFileForApp,
  onOpenFile,
  onRenameFile,
  onSaveAsFile,
  onHideFile,
  onPresentDesignFile,
  onOpenFoldderFullscreen,
  foldderOpenRequest = 0,
  canvasBgId,
}: StandardDesktopViewProps) {
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderSection, setFolderSection] = useState<FoldderDesktopSectionId>("all");
  const [launcherApp, setLauncherApp] = useState<StudioAppConfig | null>(null);
  const rows = useMemo(() => visibleFiles(files), [files]);
  const launcherFiles = launcherApp
    ? rows.filter((file) =>
        launcherApp.requiresSourceFile
          ? launcherApp.sourceFileKinds?.includes(file.kind)
          : file.kind === launcherApp.fileKind,
      )
    : [];
  const standardDockPinTypes: TopbarPinType[] = [
    "brain",
    "designer",
    "nanoBanana",
    "photoRoom",
    "geminiVideo",
    "files",
  ];
  const mapAppIdToPinType = (appId: string | null | undefined): TopbarPinType | null => {
    if (!appId) return null;
    if (appId === "brain") return "brain";
    if (appId === "files") return "files";
    if (appId === "designer") return "designer";
    if (appId === "photoRoom") return "photoRoom";
    if (appId === "nanoBanana") return "nanoBanana";
    if (appId === "geminiVideo") return "geminiVideo";
    return null;
  };
  const activePinType = mapAppIdToPinType(activeAppId);
  const minimizedPinType = mapAppIdToPinType(minimizedAppId);
  const noteCards = useMemo(
    () =>
      notes.map((node) => {
        const style = (node.style as { width?: number; height?: number } | undefined) ?? {};
        const width = typeof style.width === "number" ? style.width : NOTE_WIDTH;
        const height = typeof style.height === "number" ? style.height : NOTE_HEIGHT;
        return {
          node,
          data: normalizeNotesNodeData(node.data),
          left: node.position.x * canvasViewport.zoom + canvasViewport.x,
          top: node.position.y * canvasViewport.zoom + canvasViewport.y,
          width: width * canvasViewport.zoom,
          height: height * canvasViewport.zoom,
        };
      }),
    [canvasViewport.x, canvasViewport.y, canvasViewport.zoom, notes],
  );

  useEffect(() => {
    if (foldderOpenRequest <= 0 || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      setFolderSection("all");
      setFolderOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [foldderOpenRequest]);

  const openFoldderSection = (section: FoldderDesktopSectionId) => {
    setFolderSection(section);
    setFolderOpen(true);
  };

  return (
    <section
      className="absolute inset-0 z-[80] overflow-hidden bg-[#050505] text-white"
      aria-label="Vista estándar Foldder"
    >
      <CanvasWallpaperTransition activeId={canvasBgId} options={CANVAS_BACKGROUNDS} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(99,212,253,0.24),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(253,176,75,0.2),transparent_38%),linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.72))]" />

      <div className="pointer-events-none absolute inset-0 z-[1]">
        {noteCards.map(({ node, data, left, top, width, height }) => (
          <div
            key={node.id}
            className="pointer-events-auto absolute"
            style={{
              left,
              top,
              width,
              height,
            }}
          >
            <NotesStickyCard
              nodeId={node.id}
              mode="desktop"
              title={data.title}
              contentHtml={data.contentHtml}
              selected={!!node.selected}
              onChange={(patch) => onUpdateNote(node.id, patch)}
              onDuplicate={() => onDuplicateNote(node.id)}
              onDelete={() => onDeleteNote(node.id)}
              onDesktopMoveBy={(dxPx, dyPx) => onMoveNote(node.id, dxPx, dyPx)}
              onAutoHeightChange={(heightPx) => onAutoHeightNote(node.id, heightPx)}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onCreateNote}
        title="Nueva nota"
        className="absolute right-9 top-28 z-[4] inline-flex h-11 items-center gap-2 rounded-full border border-[#f7d35d]/65 bg-[#f7dc72]/85 px-3.5 text-[#5a4704] shadow-[0_12px_24px_rgba(86,62,0,0.18)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#fde680]"
      >
        <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-lg border border-black/10 bg-white/35">
          <NodeIconMono iconKey="notes" size={14} className="text-[#6d5807]" />
          <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#5f4d05] text-[10px] font-semibold text-[#fff8dc]">
            <Plus size={10} />
          </span>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Nueva nota</span>
      </button>

      <main className="relative z-[2] flex h-full w-full items-center justify-center px-8 pb-32 pt-28">
        <div className="absolute left-10 top-28 w-[min(980px,calc(100vw-5rem))]">
          <div className="mb-6">
            <p className="text-[10px] font-light uppercase tracking-[0.26em] text-white/42">
              Project Desktop
            </p>
            <h1 className="mt-1 text-3xl font-light tracking-[0.08em] text-white">Foldder</h1>
            <p className="mt-2 max-w-lg text-[12px] font-light leading-relaxed text-white/48">
              En Vista Pro, Foldder es un nodo. En Vista estándar, Foldder es el escritorio del proyecto.
            </p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-black/14 p-3.5 backdrop-blur-[2px] md:p-4">
            <div className="mx-auto grid max-w-[860px] grid-cols-2 gap-3 lg:grid-cols-4">
            <DesktopFolderTile
              title="Imported Media"
              subtitle="Uploads, URLs, logos y referencias"
              count={importedMedia.length}
              tone="from-sky-400/35 to-white/8"
              icon={<Images className="h-5 w-5 text-sky-100" strokeWidth={1.6} />}
              onOpen={() => openFoldderSection("imported")}
            />
            <DesktopFolderTile
              title="Generated Media"
              subtitle="Resultados IA, renders y variaciones"
              count={generatedMedia.length}
              tone="from-fuchsia-400/35 to-white/8"
              icon={<Sparkles className="h-5 w-5 text-fuchsia-100" strokeWidth={1.6} />}
              onOpen={() => openFoldderSection("generated")}
            />
            <DesktopFolderTile
              title="Media Files"
              subtitle="Trabajos editables de apps Studio"
              count={rows.length}
              tone="from-amber-400/40 to-white/8"
              icon={<FileStack className="h-5 w-5 text-amber-100" strokeWidth={1.6} />}
              onOpen={() => openFoldderSection("mediaFiles")}
            />
            <DesktopFolderTile
              title="Exports"
              subtitle="Entregables finales"
              count={exports.length}
              tone="from-emerald-400/35 to-white/8"
              icon={<PackageOpen className="h-5 w-5 text-emerald-100" strokeWidth={1.6} />}
              onOpen={() => openFoldderSection("exports")}
            />
            </div>
          </div>
        </div>

        {folderOpen && (
          <ProjectFolderView
            files={rows}
            importedMedia={importedMedia}
            generatedMedia={generatedMedia}
            exports={exports}
            onClose={() => setFolderOpen(false)}
            onOpenFile={onOpenFile}
            onRenameFile={onRenameFile}
            onSaveAsFile={onSaveAsFile}
            onHideFile={onHideFile}
            onPresentDesignFile={onPresentDesignFile}
            onOpenFoldderFullscreen={onOpenFoldderFullscreen}
            initialSection={folderSection}
          />
        )}
      </main>

      {launcherApp && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-5 backdrop-blur-sm">
          <div className="w-[min(92vw,520px)] rounded-[24px] border border-white/16 bg-black/72 p-5 text-white shadow-2xl backdrop-blur-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-light uppercase tracking-[0.22em] text-white/45">App</p>
                <h3 className="text-xl font-light">{launcherApp.label}</h3>
              </div>
              <button
                type="button"
                onClick={() => setLauncherApp(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-wide text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cerrar
              </button>
            </div>
            {launcherApp.canCreateFile && (
              <button
                type="button"
                onClick={() => {
                  setLauncherApp(null);
                  onCreateFileForApp(launcherApp);
                }}
                className="mb-3 w-full rounded-2xl border border-white/12 bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-white/90"
              >
                Nuevo {launcherApp.extension ?? ""}
              </button>
            )}
            <div className="max-h-[320px] space-y-2 overflow-y-auto">
              {launcherFiles.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm font-light text-white/55">
                  {launcherApp.requiresSourceFile
                    ? "No hay archivos .design compatibles todavía."
                    : "No hay archivos recientes de este tipo."}
                </p>
              ) : (
                launcherFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => {
                      setLauncherApp(null);
                      if (launcherApp.requiresSourceFile) onPresentDesignFile(file);
                      else onOpenFile(file);
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition hover:bg-white/[0.1]"
                  >
                    <span className="truncate text-sm font-light text-white/85">{file.name}</span>
                    <span className="ml-3 shrink-0 text-[9px] uppercase tracking-wide text-white/35">
                      {launcherApp.requiresSourceFile ? "Presentar" : "Abrir"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-6 left-0 right-0 z-[3] flex items-center justify-center">
        <TopbarPins
          pinTypes={standardDockPinTypes}
          activePinType={activePinType}
          minimizedPinType={minimizedPinType}
          onPinClick={(pinType) => {
            const appId =
              pinType === "files"
                ? "files"
                : pinType === "brain"
                  ? "brain"
                  : pinType;
            const app = DOCK_STUDIO_APPS.find((candidate) => candidate.appId === appId);
            if (!app) return;
            if (app.appId === "brain" || app.appId === "files" || minimizedAppId === app.appId) {
              onDockAppClick(app);
              return;
            }
            setLauncherApp(app);
          }}
        />
      </div>
    </section>
  );
}
