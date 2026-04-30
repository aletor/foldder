"use client";

import React from "react";
import { BookOpen, Copy, EyeOff, FileQuestion, FolderOpen, Maximize2, Pencil, Play, SaveAll, X } from "lucide-react";
import { NodeIcon } from "./foldder-icons";
import type { ProjectMediaItem } from "./project-media-inventory";
import type { ProjectFile } from "./project-files";
import { GUI_FORMAT_FOLDERS, GUI_FORMAT_LABELS, type GuionistaFormat, type GuionistaTextAsset } from "./guionista-types";

export type FoldderDesktopSectionId = "all" | "imported" | "generated" | "mediaFiles" | "exports";

type ProjectFolderViewProps = {
  files: ProjectFile[];
  onClose: () => void;
  onOpenFile: (file: ProjectFile) => void;
  onRenameFile: (file: ProjectFile) => void;
  onSaveAsFile: (file: ProjectFile) => void;
  onHideFile: (file: ProjectFile) => void;
  onPresentDesignFile: (file: ProjectFile) => void;
  onOpenFoldderFullscreen: () => void;
  initialSection?: FoldderDesktopSectionId;
  importedMedia?: ProjectMediaItem[];
  generatedMedia?: ProjectMediaItem[];
  generatedTexts?: GuionistaTextAsset[];
  exports?: ProjectFile[];
  onOpenGuionistaTextAsset?: (assetId: string) => void;
};

function visibleFiles(files: ProjectFile[]): ProjectFile[] {
  return files.filter((file) => file.metadata?.hidden !== true);
}

function fileIconType(file: ProjectFile): string {
  return file.nodeType || (file.kind === "designer" ? "designer" : file.kind === "photoroom" ? "photoRoom" : "projectAssets");
}

function extensionLabel(file: ProjectFile): string {
  return (file.extension || file.name.match(/\.[^.]+$/)?.[0] || file.kind).replace(/^\./, "").toUpperCase();
}

function MediaPreviewTile({ item }: { item: ProjectMediaItem }) {
  const label = item.kind === "video" ? "VIDEO" : item.kind === "audio" ? "AUDIO" : item.kind === "image" ? "IMAGE" : "FILE";
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-[154px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1]"
    >
      <div className="relative aspect-video w-full bg-black/55">
        {item.kind === "video" ? (
          <video src={item.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/45">
            <FileQuestion className="h-8 w-8" strokeWidth={1.5} />
          </div>
        )}
        <span className="absolute bottom-1 right-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-white">
          {label}
        </span>
      </div>
      <div className="min-w-0 px-3 py-2 text-left">
        <p className="truncate text-[10px] font-light text-white/85" title={item.sourceLabel}>
          {item.sourceLabel}
        </p>
        <p className="truncate text-[8px] font-light text-white/35" title={item.url}>
          {item.url.replace(/^https?:\/\//, "").slice(0, 48)}
        </p>
      </div>
    </a>
  );
}

function GuionistaTextAssetTile({
  asset,
  onOpen,
}: {
  asset: GuionistaTextAsset;
  onOpen?: (assetId: string) => void;
}) {
  const activeIndex = Math.max(0, asset.versions.findIndex((version) => version.id === asset.activeVersionId));
  const platform = asset.platform === "Short" ? "SHORT" : asset.platform?.toUpperCase();
  return (
    <article
      onDoubleClick={() => onOpen?.(asset.id)}
      className="group flex min-h-[130px] flex-col rounded-3xl border border-amber-200/12 bg-amber-100/[0.055] p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-200/28 hover:bg-amber-100/[0.085]"
      title="Doble clic para abrir en Guionista"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-200/16 bg-black/35 text-amber-100">
          <BookOpen className="h-5 w-5" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-[12px] font-light leading-tight text-white/88">{asset.title}</h4>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-amber-100/14 bg-amber-100/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-amber-100/70">
              {GUI_FORMAT_LABELS[asset.type]}
            </span>
            {platform && (
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-white/58">
                {platform}
              </span>
            )}
            <span className="text-[8px] font-light uppercase tracking-[0.14em] text-amber-100/38">V{activeIndex + 1} · {asset.status}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-[11px] font-light leading-relaxed text-white/45">{asset.preview}</p>
      <button
        type="button"
        onClick={() => onOpen?.(asset.id)}
        className="mt-auto self-start rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[9px] font-light uppercase tracking-[0.14em] text-white/62 hover:bg-white/12 hover:text-white"
      >
        Abrir en Guionista
      </button>
    </article>
  );
}

function groupGuionistaAssetsByFolder(assets: GuionistaTextAsset[]): Array<{ type: GuionistaFormat; folder: string; items: GuionistaTextAsset[] }> {
  const order = Object.keys(GUI_FORMAT_FOLDERS) as GuionistaFormat[];
  return order
    .map((type) => ({
      type,
      folder: GUI_FORMAT_FOLDERS[type],
      items: assets.filter((asset) => asset.type === type),
    }))
    .filter((group) => group.items.length > 0);
}

function FoldderSection({
  title,
  subtitle,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-light uppercase tracking-[0.26em] text-white/80">{title}</h3>
          <p className="mt-1 text-[11px] font-light text-white/42">{subtitle}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[9px] font-light uppercase tracking-wide text-white/55">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function ProjectFileCard({
  file,
  allowSaveAs = true,
  allowPresent = true,
  onOpenFile,
  onRenameFile,
  onSaveAsFile,
  onHideFile,
  onPresentDesignFile,
}: {
  file: ProjectFile;
  allowSaveAs?: boolean;
  allowPresent?: boolean;
  onOpenFile: (file: ProjectFile) => void;
  onRenameFile: (file: ProjectFile) => void;
  onSaveAsFile: (file: ProjectFile) => void;
  onHideFile: (file: ProjectFile) => void;
  onPresentDesignFile: (file: ProjectFile) => void;
}) {
  return (
    <article
      className="group flex min-h-[172px] flex-col items-center justify-between gap-2 rounded-3xl border border-white/10 bg-white/[0.06] p-3 text-center transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1]"
    >
      <button
        type="button"
        onDoubleClick={() => onOpenFile(file)}
        onClick={(event) => event.currentTarget.blur()}
        className="flex w-full flex-1 flex-col items-center justify-center gap-2"
        title="Doble clic para abrir"
      >
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/55 shadow-xl">
          {file.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.thumbnailUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
          ) : (
            <NodeIcon type={fileIconType(file)} size={28} colorOverride="#ffffff" />
          )}
          <span className="absolute -bottom-1 -right-2 rounded-md border border-white/10 bg-white px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-black">
            {extensionLabel(file)}
          </span>
        </span>
        <span className="line-clamp-2 max-w-full text-[11px] font-light leading-tight text-white/90">
          {file.name}
        </span>
      </button>
      <div className="grid w-full grid-cols-2 gap-1">
        <button type="button" onClick={() => onOpenFile(file)} className="rounded-lg bg-white/8 px-2 py-1.5 text-[8px] uppercase tracking-wide text-white/70 hover:bg-white/14">
          Abrir
        </button>
        <button type="button" onClick={() => onRenameFile(file)} className="rounded-lg bg-white/8 px-2 py-1.5 text-[8px] uppercase tracking-wide text-white/70 hover:bg-white/14">
          <Pencil className="mx-auto h-3 w-3" />
        </button>
        {file.kind === "designer" && allowPresent ? (
          <button type="button" onClick={() => onPresentDesignFile(file)} className="rounded-lg bg-white/8 px-2 py-1.5 text-[8px] uppercase tracking-wide text-white/70 hover:bg-white/14">
            <Play className="mx-auto h-3 w-3" />
          </button>
        ) : allowSaveAs ? (
          <button type="button" onClick={() => onSaveAsFile(file)} className="rounded-lg bg-white/8 px-2 py-1.5 text-[8px] uppercase tracking-wide text-white/70 hover:bg-white/14">
            <SaveAll className="mx-auto h-3 w-3" />
          </button>
        ) : (
          <span className="rounded-lg bg-white/[0.03] px-2 py-1.5 text-[8px] uppercase tracking-wide text-white/25">
            -
          </span>
        )}
        <button type="button" onClick={() => onHideFile(file)} className="rounded-lg bg-white/8 px-2 py-1.5 text-[8px] uppercase tracking-wide text-white/70 hover:bg-white/14">
          <EyeOff className="mx-auto h-3 w-3" />
        </button>
      </div>
      {file.kind === "designer" && allowSaveAs && (
        <button type="button" onClick={() => onSaveAsFile(file)} className="flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1.5 text-[8px] uppercase tracking-wide text-white/60 hover:bg-white/14 hover:text-white">
          <Copy className="h-3 w-3" />
          Guardar como
        </button>
      )}
    </article>
  );
}

export function ProjectFolderView({
  files,
  onClose,
  onOpenFile,
  onRenameFile,
  onSaveAsFile,
  onHideFile,
  onPresentDesignFile,
  onOpenFoldderFullscreen,
  initialSection = "all",
  importedMedia = [],
  generatedMedia = [],
  generatedTexts = [],
  exports = [],
  onOpenGuionistaTextAsset,
}: ProjectFolderViewProps) {
  const rows = visibleFiles(files).filter((file) => file.kind !== "export");
  const showImported = initialSection === "all" || initialSection === "imported";
  const showGenerated = initialSection === "all" || initialSection === "generated";
  const showMediaFiles = initialSection === "all" || initialSection === "mediaFiles";
  const showExports = initialSection === "all" || initialSection === "exports";
  const breadcrumb =
    initialSection === "imported"
      ? "Project Desktop / Imported Media"
      : initialSection === "generated"
        ? "Project Desktop / Generated Media"
        : initialSection === "mediaFiles"
          ? "Project Desktop / Media Files"
          : initialSection === "exports"
            ? "Project Desktop / Exports"
            : "Project Desktop";

  return (
    <div className="flex h-[min(70vh,660px)] w-[min(88vw,1080px)] flex-col overflow-hidden rounded-[28px] border border-white/18 bg-black/42 shadow-[0_28px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/8">
            <FolderOpen className="h-5 w-5 text-[#b081f1]" strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-[10px] font-light uppercase tracking-[0.24em] text-white/45">{breadcrumb}</p>
            <h2 className="text-base font-light tracking-wide">Foldder</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenFoldderFullscreen}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Pantalla completa
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar carpeta Foldder"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {showImported && (
          <FoldderSection
            title="Imported Media"
            subtitle="Archivos que entran desde fuera: uploads, URLs, Pinterest, logos, PDFs y referencias."
            count={importedMedia.length}
          >
            {importedMedia.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-[12px] font-light text-white/42">
                Aún no hay importaciones visibles en Foldder.
              </p>
            ) : (
              <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                {importedMedia.map((item) => <MediaPreviewTile key={item.id} item={item} />)}
              </div>
            )}
          </FoldderSection>
        )}

        {showGenerated && (
          <FoldderSection
            title="Generated Media"
            subtitle="Resultados generados por Brain, IA, renders, VFX y nodos automáticos."
            count={generatedMedia.length + generatedTexts.length}
          >
            {generatedMedia.length === 0 && generatedTexts.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-[12px] font-light text-white/42">
                Aún no hay media generado visible en Foldder.
              </p>
            ) : (
              <div className="space-y-4">
                {generatedTexts.length > 0 && (
                  <div>
                    <p className="mb-2 text-[9px] font-light uppercase tracking-[0.18em] text-white/38">
                      Texts / Guionista
                    </p>
                    <div className="space-y-4">
                      {groupGuionistaAssetsByFolder(generatedTexts).map((group) => (
                        <div key={group.type}>
                          <p className="mb-2 text-[10px] font-light text-white/48">{group.folder}</p>
                          <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                            {group.items.map((asset) => (
                              <GuionistaTextAssetTile key={asset.id} asset={asset} onOpen={onOpenGuionistaTextAsset} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {generatedMedia.length > 0 && (
                  <div>
                    <p className="mb-2 text-[9px] font-light uppercase tracking-[0.18em] text-white/38">
                      Media
                    </p>
                    <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                      {generatedMedia.map((item) => <MediaPreviewTile key={item.id} item={item} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </FoldderSection>
        )}

        {showMediaFiles && (
          <FoldderSection
            title="Media Files"
            subtitle="Trabajos editables creados en apps: .design, .photoroom, .painter, .presenter, etc."
            count={rows.length}
          >
            {rows.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.03] text-center">
                <p className="text-sm font-light text-white/70">Todavía no hay archivos Studio visibles.</p>
                <p className="mt-1 text-xs text-white/40">Crea uno desde el dock inferior o cambia a Vista Pro.</p>
              </div>
            ) : (
              <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                {rows.map((file) => (
                  <ProjectFileCard
                    key={file.id}
                    file={file}
                    allowSaveAs
                    allowPresent
                    onOpenFile={onOpenFile}
                    onRenameFile={onRenameFile}
                    onSaveAsFile={onSaveAsFile}
                    onHideFile={onHideFile}
                    onPresentDesignFile={onPresentDesignFile}
                  />
                ))}
              </div>
            )}
          </FoldderSection>
        )}

        {showExports && (
          <FoldderSection
            title="Exports"
            subtitle="Archivos finales exportados desde Foldder: PNG, JPG, PDF, vídeo o entregables listos para usar."
            count={exports.length}
          >
            {exports.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-[12px] font-light text-white/42">
                Aún no hay exports persistidos en Foldder.
              </p>
            ) : (
              <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                {exports.map((file) => (
                  <ProjectFileCard
                    key={file.id}
                    file={file}
                    allowSaveAs={false}
                    allowPresent={false}
                    onOpenFile={onOpenFile}
                    onRenameFile={onRenameFile}
                    onSaveAsFile={onSaveAsFile}
                    onHideFile={onHideFile}
                    onPresentDesignFile={onPresentDesignFile}
                  />
                ))}
              </div>
            )}
          </FoldderSection>
        )}
      </div>
    </div>
  );
}
