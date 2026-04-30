"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  FileStack,
  FolderOpen,
  Images,
  LayoutGrid,
  LogOut,
  MonitorCog,
  PackageOpen,
  Play,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import type { ProjectFile, WorkspaceViewMode } from "./project-files";
import { ProjectFolderView, type FoldderDesktopSectionId } from "./ProjectFolderView";
import type { ProjectMediaItem } from "./project-media-inventory";
import { DOCK_STUDIO_APPS, type StudioAppConfig } from "./studioApps";
import { CANVAS_BACKGROUNDS, type CanvasBackgroundOption } from "./canvas-backgrounds";
import { CanvasWallpaperTransition } from "./CanvasWallpaperTransition";
import { TopbarPins, type TopbarPinType } from "./TopbarPins";

type StandardDesktopViewProps = {
  projectName: string;
  files: ProjectFile[];
  importedMedia: ProjectMediaItem[];
  generatedMedia: ProjectMediaItem[];
  exports: ProjectFile[];
  workspaceViewMode: WorkspaceViewMode;
  activeAppId?: string | null;
  minimizedAppId?: string | null;
  onViewModeChange: (mode: WorkspaceViewMode) => void;
  onDockAppClick: (app: StudioAppConfig) => void;
  onCreateFileForApp: (app: StudioAppConfig) => void;
  onOpenFile: (file: ProjectFile) => void;
  onRenameFile: (file: ProjectFile) => void;
  onSaveAsFile: (file: ProjectFile) => void;
  onHideFile: (file: ProjectFile) => void;
  onPresentDesignFile: (file: ProjectFile) => void;
  onOpenProjectsList: () => void;
  onOpenFoldderFullscreen: () => void;
  onNewProject: () => void;
  onSignOut: () => void;
  foldderOpenRequest?: number;
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
  canvasBgId: string;
  onCanvasBgChange: (id: string) => void;
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
  projectName,
  files,
  importedMedia,
  generatedMedia,
  exports,
  workspaceViewMode,
  activeAppId,
  minimizedAppId,
  onViewModeChange,
  onDockAppClick,
  onCreateFileForApp,
  onOpenFile,
  onRenameFile,
  onSaveAsFile,
  onHideFile,
  onPresentDesignFile,
  onOpenProjectsList,
  onOpenFoldderFullscreen,
  onNewProject,
  onSignOut,
  foldderOpenRequest = 0,
  userName,
  userEmail,
  userImage,
  canvasBgId,
  onCanvasBgChange,
}: StandardDesktopViewProps) {
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderSection, setFolderSection] = useState<FoldderDesktopSectionId>("all");
  const [launcherApp, setLauncherApp] = useState<StudioAppConfig | null>(null);
  const [backgroundMenuOpen, setBackgroundMenuOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [commandValue, setCommandValue] = useState("");
  const rows = useMemo(() => visibleFiles(files), [files]);
  const launcherFiles = launcherApp
    ? rows.filter((file) =>
        launcherApp.requiresSourceFile
          ? launcherApp.sourceFileKinds?.includes(file.kind)
          : file.kind === launcherApp.fileKind,
      )
    : [];
  const projectTitle = projectName?.trim() || "Foldder";
  const userInitial = (userName || userEmail || "U").trim().charAt(0).toUpperCase();
  const activeBackground =
    CANVAS_BACKGROUNDS.find((background) => background.id === canvasBgId) ?? CANVAS_BACKGROUNDS[0];
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

  const openAppFromCommand = (app: StudioAppConfig) => {
    setBackgroundMenuOpen(false);
    if (app.appId === "brain" || app.appId === "files" || minimizedAppId === app.appId) {
      onDockAppClick(app);
      return;
    }
    setLauncherApp(app);
  };

  const runCommand = () => {
    const query = commandValue.trim().toLowerCase();
    if (!query) {
      return;
    }

    const matchingFile = rows.find((file) =>
      `${file.name} ${file.extension ?? ""} ${file.kind}`.toLowerCase().includes(query),
    );
    if (matchingFile) {
      onOpenFile(matchingFile);
      return;
    }

    const matchingApp = DOCK_STUDIO_APPS.find((app) =>
      `${app.label} ${app.appId} ${app.extension ?? ""}`.toLowerCase().includes(query),
    );
    if (matchingApp) {
      openAppFromCommand(matchingApp);
      return;
    }

    setCommandValue("");
  };

  return (
    <section
      className="absolute inset-0 z-[80] overflow-hidden bg-[#050505] text-white"
      aria-label="Vista estándar Foldder"
    >
      <CanvasWallpaperTransition activeId={canvasBgId} options={CANVAS_BACKGROUNDS} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(99,212,253,0.24),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(253,176,75,0.2),transparent_38%),linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.72))]" />

      <header className="pointer-events-auto absolute left-5 right-5 top-4 z-[2] grid grid-cols-[minmax(280px,1fr)_auto_minmax(280px,1fr)] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-11 min-w-0 items-center gap-3 rounded-2xl border border-white/14 bg-black/38 px-3 shadow-2xl shadow-black/25 backdrop-blur-2xl">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white text-black shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/foldder-symbol.svg" alt="Foldder" className="h-5 w-5 object-contain" />
            </span>
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <Search size={14} className="shrink-0 text-white/45" strokeWidth={1.7} />
              <input
                type="text"
                value={commandValue}
                onChange={(event) => setCommandValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") runCommand();
                }}
                placeholder="Buscar app, archivo o acción"
                className="h-8 w-[min(28vw,320px)] min-w-[160px] bg-transparent text-[12px] font-light text-white outline-none placeholder:text-white/38"
              />
            </div>
            <button
              type="button"
              onClick={runCommand}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-[#63d4fd]/35 bg-[#63d4fd]/14 px-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#d9f6ff] transition hover:border-[#63d4fd]/75 hover:bg-[#63d4fd]/24"
            >
              <Play size={11} fill="currentColor" strokeWidth={2.4} />
              RUN
            </button>
          </div>
        </div>

        <div className="flex min-w-0 justify-center">
          <div className="max-w-[min(42vw,520px)] truncate rounded-full border border-white/14 bg-black/38 px-5 py-2 text-center text-[13px] font-light tracking-[0.08em] text-white shadow-2xl shadow-black/20 backdrop-blur-2xl">
            {projectTitle}
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <div className="flex h-11 shrink-0 rounded-2xl border border-white/14 bg-black/38 p-1 shadow-2xl shadow-black/25 backdrop-blur-2xl">
            {(["standard", "pro"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[9px] font-black uppercase tracking-[0.13em] transition ${
                  workspaceViewMode === mode
                    ? "bg-white text-black shadow-sm"
                    : "text-white/58 hover:bg-white/10 hover:text-white"
                }`}
              >
                {mode === "pro" && <MonitorCog size={13} />}
                {mode === "standard" ? "Estándar" : "Pro"}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setBackgroundMenuOpen((open) => !open);
                setAvatarMenuOpen(false);
              }}
              title="Cambiar background"
              aria-expanded={backgroundMenuOpen}
              className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] text-slate-700 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-slate-900"
            >
              <LayoutGrid size={16} className="text-slate-700 group-hover:text-slate-900" />
            </button>
            {backgroundMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-[140] w-[310px] overflow-hidden rounded-[24px] border border-white/14 bg-black/78 p-3 text-white shadow-2xl backdrop-blur-2xl">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div>
                    <p className="text-[9px] font-light uppercase tracking-[0.24em] text-white/38">Background</p>
                    <h3 className="text-sm font-light text-white">{activeBackground?.label ?? "Fondos"}</h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[9px] font-light uppercase tracking-wide text-white/45">
                    Wallpaper
                  </span>
                </div>
                <div className="grid max-h-[320px] grid-cols-3 gap-2 overflow-y-auto pr-1">
                  {CANVAS_BACKGROUNDS.map((background: CanvasBackgroundOption) => (
                    <button
                      key={background.id}
                      type="button"
                      onClick={() => {
                        onCanvasBgChange(background.id);
                        setBackgroundMenuOpen(false);
                      }}
                      className={`overflow-hidden rounded-2xl border bg-white/[0.055] text-left transition hover:-translate-y-0.5 hover:border-white/28 hover:bg-white/[0.105] ${
                        canvasBgId === background.id ? "border-white/65 ring-2 ring-white/20" : "border-white/8"
                      }`}
                    >
                      <span
                        className="block aspect-[4/3] w-full bg-cover bg-center"
                        style={{ backgroundImage: `url("${background.url}")` }}
                      />
                      <span className="block truncate px-2 py-1.5 text-[8px] font-light text-white/72">
                        {background.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenProjectsList}
            title="Abrir proyectos"
            className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] text-slate-700 shadow-sm backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-slate-900"
          >
            <FolderOpen size={16} className="text-slate-700 group-hover:text-slate-900" />
          </button>

          <button
            type="button"
            onClick={onNewProject}
            className="hidden h-11 items-center gap-2 rounded-2xl border border-[#fdb04b]/35 bg-[#fdb04b]/18 px-4 text-[9px] font-black uppercase tracking-[0.16em] text-[#ffe1b4] shadow-2xl shadow-black/25 backdrop-blur-2xl transition hover:border-[#fdb04b]/70 hover:bg-[#fdb04b]/28 md:flex"
          >
            <Plus size={14} strokeWidth={2.2} />
            Nuevo Proyecto
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setAvatarMenuOpen((open) => !open);
                setBackgroundMenuOpen(false);
              }}
              title={userEmail || "Usuario"}
              aria-expanded={avatarMenuOpen}
              className="flex h-11 items-center gap-2 rounded-2xl border border-white/14 bg-black/38 p-1.5 pr-2 text-white/70 shadow-2xl shadow-black/25 backdrop-blur-2xl transition hover:bg-white/10 hover:text-white"
            >
              <span className="h-8 w-8 overflow-hidden rounded-full border border-white/18 bg-white/10">
                {userImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userImage} alt={userName || "Perfil"} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-white">
                    {userInitial}
                  </span>
                )}
              </span>
              <ChevronDown
                size={12}
                strokeWidth={1.8}
                className={avatarMenuOpen ? "rotate-180 transition" : "transition"}
              />
            </button>
            {avatarMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-[140] w-64 overflow-hidden rounded-[22px] border border-white/14 bg-black/80 p-2 text-white shadow-2xl backdrop-blur-2xl">
                <div className="px-3 py-3">
                  <p className="truncate text-sm font-light text-white/88">{userName || "Usuario"}</p>
                  {userEmail && <p className="mt-0.5 truncate text-[11px] font-light text-white/42">{userEmail}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.055] px-3 py-2.5 text-left text-[11px] font-light uppercase tracking-[0.12em] text-white/72 transition hover:bg-white/[0.11] hover:text-white"
                >
                  <LogOut size={14} strokeWidth={1.7} />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-[1] flex h-full w-full items-center justify-center px-8 pb-32 pt-28">
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
