"use client";

import React, { useState } from "react";
import { Box, Image as ImageIcon, Pencil, Square, Type, X } from "lucide-react";
import type { SiteCreatorSelectionIndex, SiteCreatorSelectionState } from "./site-creator-selection-types";
import { isolationBreadcrumbLabels } from "./site-creator-hit-test";
import type { SiteBlueprintNode, SiteBlueprintV1 } from "./site-creator-types";
import { isSiteButtonNode, isSiteSectionNode } from "./site-creator-types";

function TypeGlyph({ type }: { type: string }) {
  const className = "h-3.5 w-3.5 shrink-0 text-[#a3e635]";
  switch (type) {
    case "text":
    case "textOnPath":
      return <Type className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    case "groupContainer":
    case "booleanGroup":
    case "clippingContainer":
      return <Box className={className} />;
    default:
      return <Square className={className} />;
  }
}

function semanticTypeLabel(node: SiteBlueprintNode): string {
  if (isSiteSectionNode(node)) return node.sectionType === "hero" ? "Hero" : "Sección";
  if (isSiteButtonNode(node)) return "Button";
  return "Grupo";
}

function semanticBreadcrumb(blueprint: SiteBlueprintV1, nodeId: string): string {
  const parts: string[] = [];
  let current: string | null = nodeId;
  while (current) {
    const entry: SiteBlueprintNode | undefined = blueprint.nodes[current];
    if (!entry) break;
    parts.unshift(entry.label);
    current = entry.parentId;
  }
  return parts.join(" / ");
}

export interface SiteCreatorStructureActions {
  onHero?: () => void;
  onSection?: () => void;
  onGroup?: () => void;
  onButton?: () => void;
  disabledReason?: string | null;
  needsSync?: boolean;
  onRequestSync?: () => void;
  parentHint?: string | null;
  errorMessage?: string | null;
}

export interface SiteCreatorSelectionToolbarProps {
  index: SiteCreatorSelectionIndex;
  selection: SiteCreatorSelectionState;
  onClear: () => void;
  onBreadcrumb: (isolationIds: string[]) => void;
  structure?: SiteCreatorStructureActions;
  semanticNode?: SiteBlueprintNode | null;
  blueprint?: SiteBlueprintV1;
  onRenameSemantic?: () => void;
  onSelectSemanticContent?: () => void;
  onRemoveSemantic?: () => void;
}

function ActionButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || !onClick}
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#a3e635] hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/25"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function SiteCreatorSelectionToolbar({
  index,
  selection,
  onClear,
  onBreadcrumb,
  structure,
  semanticNode,
  blueprint,
  onRenameSemantic,
  onSelectSemanticContent,
  onRemoveSemantic,
}: SiteCreatorSelectionToolbarProps) {
  if (semanticNode && blueprint) {
    return (
      <div className="site-creator-selection-toolbar pointer-events-auto flex max-w-[min(480px,calc(100%-24px))] flex-wrap items-center gap-2 rounded-md border border-white/10 bg-[#101820]/95 px-2.5 py-1.5 text-[11px] text-white shadow-lg backdrop-blur">
        <span className="font-semibold text-[#a3e635]">{semanticTypeLabel(semanticNode)}</span>
        <span className="min-w-0 truncate font-semibold">{semanticNode.label}</span>
        <span className="min-w-0 truncate text-[10px] text-white/40">
          {semanticBreadcrumb(blueprint, semanticNode.id)}
        </span>
        <ActionButton label="Renombrar" onClick={onRenameSemantic} />
        <ActionButton label="Seleccionar contenido" onClick={onSelectSemanticContent} />
        <ActionButton label="Quitar estructura" onClick={onRemoveSemantic} />
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/55 hover:bg-white/10 hover:text-white"
          onClick={onClear}
        >
          <X className="h-3 w-3" />
          Limpiar
        </button>
      </div>
    );
  }

  if (selection.selectedIds.length === 0 && selection.isolationIds.length === 0) return null;

  const single = selection.selectedIds.length === 1 ? index.byId[selection.selectedIds[0]!] : null;
  const crumbs = isolationBreadcrumbLabels(index, selection.isolationIds);
  const nestedCrumbs =
    single && single.ancestorIds.length > 0
      ? ["Página", ...single.ancestorIds.map((id) => index.byId[id]?.name ?? id), single.name]
      : null;
  const blocked = Boolean(structure?.disabledReason) || Boolean(structure?.needsSync);
  const showStructure = selection.selectedIds.length > 0 && structure;

  return (
    <div className="site-creator-selection-toolbar pointer-events-auto flex max-w-[min(520px,calc(100%-24px))] flex-wrap items-center gap-1.5 rounded-md border border-white/10 bg-[#101820]/95 px-2.5 py-1.5 text-[11px] text-white shadow-lg backdrop-blur">
      {selection.selectedIds.length === 1 && single ? (
        <>
          <TypeGlyph type={single.type} />
          <span className="min-w-0 truncate font-semibold">{single.name}</span>
          <span className="shrink-0 text-white/45">· {single.type}</span>
        </>
      ) : selection.selectedIds.length > 1 ? (
        <span className="font-semibold">{selection.selectedIds.length} capas seleccionadas</span>
      ) : (
        <span className="text-white/55">Dentro de {crumbs[crumbs.length - 1]?.label}</span>
      )}

      {nestedCrumbs && selection.selectedIds.length === 1 ? (
        <span className="min-w-0 truncate text-[10px] text-white/40">{nestedCrumbs.join(" / ")}</span>
      ) : null}

      {structure?.parentHint ? (
        <span className="text-[10px] text-white/50">{structure.parentHint}</span>
      ) : null}

      {showStructure ? (
        structure.needsSync ? (
          <ActionButton label="Actualizar diseño para continuar" onClick={structure.onRequestSync} />
        ) : (
          <>
            <ActionButton
              label="Hero"
              onClick={structure.onHero}
              disabled={blocked}
              title={structure.disabledReason ?? undefined}
            />
            <ActionButton
              label="Sección"
              onClick={structure.onSection}
              disabled={blocked}
              title={structure.disabledReason ?? undefined}
            />
            <ActionButton
              label="Grupo"
              onClick={structure.onGroup}
              disabled={blocked}
              title={structure.disabledReason ?? undefined}
            />
            <ActionButton
              label="Botón"
              onClick={structure.onButton}
              disabled={blocked}
              title={structure.disabledReason ?? undefined}
            />
          </>
        )
      ) : null}

      {structure?.errorMessage ? (
        <span className="w-full text-[10px] text-amber-200/90">{structure.errorMessage}</span>
      ) : structure?.disabledReason && !structure.needsSync ? (
        <span className="w-full text-[10px] text-white/40">{structure.disabledReason}</span>
      ) : null}

      {selection.selectedIds.length > 0 ? (
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/55 hover:bg-white/10 hover:text-white"
          onClick={onClear}
        >
          <X className="h-3 w-3" />
          Limpiar
        </button>
      ) : (
        <button
          type="button"
          className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-white/45 hover:text-white"
          onClick={() => onBreadcrumb(selection.isolationIds.slice(0, -1))}
        >
          Subir
        </button>
      )}
    </div>
  );
}

export function SiteCreatorIsolationBreadcrumb({
  index,
  isolationIds,
  onNavigate,
}: {
  index: SiteCreatorSelectionIndex;
  isolationIds: string[];
  onNavigate: (isolationIds: string[]) => void;
}) {
  if (isolationIds.length === 0) return null;
  const crumbs = isolationBreadcrumbLabels(index, isolationIds);
  return (
    <div className="site-creator-isolation-breadcrumb pointer-events-auto flex min-w-0 items-center gap-1 px-3 py-1.5 text-[10px] text-white/55">
      {crumbs.map((crumb, i) => (
        <React.Fragment key={crumb.id ?? "landing"}>
          {i > 0 ? <span className="text-white/25">/</span> : null}
          <button
            type="button"
            className={`truncate hover:text-white ${i === crumbs.length - 1 ? "font-semibold text-white/80" : ""}`}
            onClick={() =>
              onNavigate(crumb.id == null ? [] : isolationIds.slice(0, isolationIds.indexOf(crumb.id) + 1))
            }
          >
            {crumb.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

export function SiteCreatorButtonLabelPrompt({
  open,
  textLayerOptions,
  requireAccessibleLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  textLayerOptions: { id: string; name: string }[];
  requireAccessibleLabel: boolean;
  onConfirm: (result: { labelLayerId?: string; accessibleLabel: string }) => void;
  onCancel: () => void;
}) {
  const [labelLayerId, setLabelLayerId] = useState(textLayerOptions[0]?.id ?? "");
  const [accessibleLabel, setAccessibleLabel] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100060] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#101820] p-4 text-white shadow-2xl">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/45">Configurar Button</p>
        {textLayerOptions.length > 1 ? (
          <label className="mt-3 block text-[11px] text-white/70">
            Capa Label
            <select
              className="mt-1 w-full rounded border border-white/15 bg-[#0b0f14] px-2 py-1.5 text-sm"
              value={labelLayerId}
              onChange={(e) => setLabelLayerId(e.target.value)}
            >
              {textLayerOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {requireAccessibleLabel || textLayerOptions.length === 0 ? (
          <label className="mt-3 block text-[11px] text-white/70">
            Nombre accesible
            <input
              className="mt-1 w-full rounded border border-white/15 bg-[#0b0f14] px-2 py-1.5 text-sm"
              value={accessibleLabel}
              onChange={(e) => setAccessibleLabel(e.target.value)}
              placeholder="Ej. Empezar"
              autoFocus
            />
          </label>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/55 hover:bg-white/10"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded bg-[#a3e635]/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#a3e635]"
            onClick={() =>
              onConfirm({
                labelLayerId: textLayerOptions.length ? labelLayerId || textLayerOptions[0]?.id : undefined,
                accessibleLabel: accessibleLabel.trim() || "Botón",
              })
            }
          >
            <Pencil className="h-3 w-3" />
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
