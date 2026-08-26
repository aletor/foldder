"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Component,
  Crop,
  Folder,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Lock,
  PenTool,
  Square,
  Type,
  Unlock,
} from "lucide-react";
import type {
  SiteCreatorPresentationNode,
  SiteCreatorPresentationTree,
} from "./site-creator-presentation-tree";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import { imageFrameHasPhoto, isDesignerImageFrame, sameSelectionUnit } from "./site-creator-display-labels";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";

function solidFillCss(fill: unknown): string | null {
  if (typeof fill === "string") {
    if (!fill || fill === "none" || fill === "transparent") return null;
    return fill;
  }
  if (!fill || typeof fill !== "object") return null;
  const rec = fill as { type?: string; color?: string; stops?: Array<{ color?: string }> };
  if (rec.type === "solid" && rec.color && rec.color !== "none" && rec.color !== "transparent") {
    return rec.color;
  }
  const stop = rec.stops?.[0]?.color;
  return stop && stop !== "none" ? stop : null;
}

function OutlineGlyph({
  node,
  selectionIndex,
}: {
  node: SiteCreatorPresentationNode;
  selectionIndex?: SiteCreatorSelectionIndex | null;
}) {
  const iconClass = "h-3 w-3 shrink-0 text-white/40";
  if (node.kind === "unorganized") return <Layers className={iconClass} />;
  if (node.kind === "semantic") {
    if (node.label.startsWith("Botón") || node.label.startsWith("Boton")) {
      return <Component className={iconClass} />;
    }
    if (node.label.startsWith("Hero") || node.label.startsWith("Sección") || node.label.startsWith("Seccion")) {
      return <LayoutTemplate className={iconClass} />;
    }
    return <Folder className={iconClass} />;
  }

  const entry = selectionIndex?.byId[node.layerId];
  const obj = entry?.object;
  const type = obj?.type ?? entry?.type;
  const fill = obj ? solidFillCss(obj.fill) : null;
  const frame = Boolean(obj && isDesignerImageFrame(obj));
  const isImage = type === "image";

  if (type === "clippingContainer" || frame) {
    const hasImage = frame
      ? imageFrameHasPhoto(obj!)
      : ((obj as { content?: Array<{ type?: string; isImageFrame?: boolean }> } | undefined)?.content ?? []).some(
          (c) => c.type === "image" || Boolean(c.isImageFrame),
        );
    return (
      <span className="relative inline-flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden>
        <Crop className="h-3 w-3 text-white/40" strokeWidth={1.5} />
        {hasImage ? (
          <ImageIcon className="absolute -bottom-0.5 -right-0.5 h-2 w-2 text-white/55" strokeWidth={2} />
        ) : null}
      </span>
    );
  }
  if (isImage) return <ImageIcon className={iconClass} />;
  if (type === "text" || type === "textOnPath") return <Type className={iconClass} />;
  if (type === "groupContainer" || type === "booleanGroup") {
    return <Folder className={iconClass} />;
  }
  if (type === "path") return <PenTool className={iconClass} />;
  if (type === "ellipse") {
    if (fill) {
      return (
        <span
          aria-hidden
          className="inline-block h-3 w-3 shrink-0 rounded-full border border-white/15"
          style={{ background: fill }}
        />
      );
    }
    return <Circle className={iconClass} />;
  }
  if (fill) {
    return (
      <span
        aria-hidden
        className="inline-block h-3 w-3 shrink-0 rounded-[2px] border border-white/15"
        style={{ background: fill }}
      />
    );
  }
  return <Square className={iconClass} />;
}

function rowSelected(
  node: SiteCreatorPresentationNode,
  selected: SiteCreatorSelectionUnit[],
): boolean {
  if (!node.unit) return false;
  return selected.some((u) => sameSelectionUnit(u, node.unit!));
}

function rowLabel(node: SiteCreatorPresentationNode, open: boolean, closedCount: number | null): string {
  if (closedCount != null && node.kind !== "unorganized") {
    return node.label.includes("·") ? node.label : `${node.label} · ${closedCount}`;
  }
  if (node.kind === "unorganized" && open) return "Contenido sin organizar";
  return node.label;
}

function OutlineTreeRow({
  node,
  depth,
  selectedUnits,
  hoveredKey,
  expanded,
  onToggle,
  onSelect,
  onHover,
  onDragStart,
  onDropOn,
  onDragOverTarget,
  dragOverId,
  resolveOverride,
  canvasLockForUnit,
  onToggleCanvasLock,
  selectionIndex,
}: {
  node: SiteCreatorPresentationNode;
  depth: number;
  selectedUnits: SiteCreatorSelectionUnit[];
  hoveredKey: string | null;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onSelect: (unit: SiteCreatorSelectionUnit | null, additive: boolean, node: SiteCreatorPresentationNode) => void;
  onHover: (key: string | null, unit: SiteCreatorSelectionUnit | null) => void;
  onDragStart?: (node: SiteCreatorPresentationNode) => void;
  onDropOn?: (target: SiteCreatorPresentationNode) => void;
  onDragOverTarget?: (id: string | null) => void;
  dragOverId: string | null;
  resolveOverride?: (
    node: SiteCreatorPresentationNode,
  ) => { dot: "current" | "other"; title: string; hidden?: boolean } | null;
  canvasLockForUnit?: (unit: SiteCreatorSelectionUnit) => { locked: boolean; inherited: boolean };
  onToggleCanvasLock?: (unit: SiteCreatorSelectionUnit) => void;
  selectionIndex?: SiteCreatorSelectionIndex | null;
}) {
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const hasChildren = node.children.length > 0;
  const open =
    expanded[node.id] !== undefined
      ? expanded[node.id] === true
      : node.kind === "unorganized";
  const active = rowSelected(node, selectedUnits);
  const hovered = hoveredKey === node.id;
  const dropTarget = dragOverId === node.id && node.kind === "semantic";
  const closedCount = !open && hasChildren ? node.childCount : null;
  const overrideInfo = resolveOverride?.(node) ?? null;
  const lockInfo = node.unit ? canvasLockForUnit?.(node.unit) ?? { locked: false, inherited: false } : null;

  useEffect(() => {
    if (!active) return;
    rowRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <div>
      <button
        ref={rowRef}
        type="button"
        draggable={node.kind === "layer" || (node.kind === "semantic" && node.label.startsWith("Botón"))}
        data-testid={`outline-row-${node.id}`}
        className={`group/row relative flex w-full items-center gap-1.5 rounded-sm py-[5px] pr-1 text-left text-[11px] font-normal tracking-tight ${
          active
            ? "bg-white/[0.07] text-white"
            : dropTarget
              ? "bg-white/[0.05] text-white"
              : hovered
                ? "bg-white/[0.04] text-white/90"
                : "text-white/65 hover:bg-white/[0.03] hover:text-white/85"
        }`}
        style={{ paddingLeft: 8 + depth * 10 }}
        onClick={(e) => {
          if (node.unit) onSelect(node.unit, e.ctrlKey || e.metaKey, node);
        }}
        onDoubleClick={() => {
          if (hasChildren) onToggle(node.id);
        }}
        onMouseEnter={() => onHover(node.id, node.unit)}
        onMouseLeave={() => onHover(null, null)}
        onDragStart={(e) => {
          if (!onDragStart) return;
          e.dataTransfer.setData("text/site-creator-node", node.id);
          onDragStart(node);
        }}
        onDragOver={(e) => {
          if (node.kind !== "semantic" || !node.isContainer) return;
          if (node.label.startsWith("Botón") || node.label.startsWith("Boton")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOverTarget?.(node.id);
        }}
        onDragLeave={() => {
          onDragOverTarget?.(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (node.kind === "semantic") onDropOn?.(node);
        }}
      >
        {active ? (
          <span className="absolute bottom-1 left-0 top-1 w-px bg-[#A8FF32]/70" aria-hidden />
        ) : null}
        {hasChildren ? (
          <span
            role="presentation"
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-white/30"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          >
            {open ? <ChevronDown className="h-3 w-3" strokeWidth={1.5} /> : <ChevronRight className="h-3 w-3" strokeWidth={1.5} />}
          </span>
        ) : (
          <span className="inline-block h-3.5 w-3.5 shrink-0" />
        )}
        <OutlineGlyph node={node} selectionIndex={selectionIndex} />
        <span
          className={`min-w-0 truncate font-normal ${overrideInfo?.hidden ? "opacity-40" : ""}`}
        >
          {rowLabel(node, open, closedCount)}
        </span>
        {overrideInfo?.hidden ? (
          <span
            data-testid={`outline-hidden-${node.id}`}
            title="Oculto en esta vista. Sigue visible en Original."
            className="ml-0.5 shrink-0 text-[9px] font-normal tracking-wide text-white/30"
          >
            oculto
          </span>
        ) : null}
        {overrideInfo ? (
          <span
            data-testid={`outline-override-dot-${node.id}`}
            title={overrideInfo.title}
            className="ml-0.5 inline-block h-1 w-1 shrink-0 rounded-full"
            style={{
              background: overrideInfo.dot === "current" ? "#A8FF32" : "rgba(255,255,255,0.22)",
            }}
            aria-hidden
          />
        ) : null}
        {dropTarget || lockInfo ? (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {dropTarget ? (
              <span className="text-[9px] font-normal text-white/45">
                {`Añadir a ${node.label.split(" · ")[0]}`}
              </span>
            ) : null}
            {lockInfo && node.unit ? (
              <span
                role="button"
                aria-label={
                  lockInfo.inherited
                    ? "Bloqueado por un grupo o sección superior"
                    : lockInfo.locked
                      ? "Desbloquear en el lienzo"
                      : "Bloquear en el lienzo"
                }
                aria-pressed={lockInfo.locked}
                data-testid={`outline-lock-${node.id}`}
                title={
                  lockInfo.inherited
                    ? "Bloqueado por un grupo o sección superior"
                    : lockInfo.locked
                      ? "Desbloquear en el lienzo"
                      : "Bloquear en el lienzo"
                }
                className={`inline-flex h-3.5 w-3.5 items-center justify-center ${
                  lockInfo.locked ? "text-white/55" : "text-white/25 hover:text-white/60"
                } ${lockInfo.inherited ? "cursor-default" : ""} ${
                  lockInfo.locked
                    ? ""
                    : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                }`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (lockInfo.inherited || !node.unit) return;
                  onToggleCanvasLock?.(node.unit);
                }}
              >
                {lockInfo.locked ? <Lock className="h-3 w-3" strokeWidth={1.5} /> : <Unlock className="h-3 w-3" strokeWidth={1.5} />}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      {hasChildren && open
        ? node.children.map((child) => (
            <OutlineTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedUnits={selectedUnits}
              hoveredKey={hoveredKey}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onHover={onHover}
              onDragStart={onDragStart}
              onDropOn={onDropOn}
              onDragOverTarget={onDragOverTarget}
              dragOverId={dragOverId}
              resolveOverride={resolveOverride}
              canvasLockForUnit={canvasLockForUnit}
              onToggleCanvasLock={onToggleCanvasLock}
              selectionIndex={selectionIndex}
            />
          ))
        : null}
    </div>
  );
}

export interface SiteCreatorOutlinePanelProps {
  tree: SiteCreatorPresentationTree;
  selectedUnits: SiteCreatorSelectionUnit[];
  hoveredKey?: string | null;
  expandedIds: Record<string, boolean>;
  onExpandedIdsChange: (next: Record<string, boolean>) => void;
  onSelectUnit: (unit: SiteCreatorSelectionUnit | null, additive: boolean, pathNodeIds: string[]) => void;
  onHoverUnit: (unit: SiteCreatorSelectionUnit | null, key: string | null) => void;
  onReparentToSemantic?: (targetNodeId: string, source: SiteCreatorPresentationNode) => void;
  emptyHint?: string | null;
  visualLayerCount: number;
  reviewCount: number;
  resolveOverride?: (
    node: SiteCreatorPresentationNode,
  ) => { dot: "current" | "other"; title: string; hidden?: boolean } | null;
  canvasLockForUnit?: (unit: SiteCreatorSelectionUnit) => { locked: boolean; inherited: boolean };
  onToggleCanvasLock?: (unit: SiteCreatorSelectionUnit) => void;
  selectionIndex?: SiteCreatorSelectionIndex | null;
  /** Cerrado por defecto en Studio; útil abierto en vistas embebidas. */
  defaultOpen?: boolean;
}

function ancestorSemanticIds(
  tree: SiteCreatorPresentationTree,
  target: SiteCreatorPresentationNode,
): string[] {
  const path: string[] = [];
  const walk = (
    nodes: SiteCreatorPresentationNode[],
    stack: string[],
  ): boolean => {
    for (const n of nodes) {
      const nextStack =
        n.kind === "semantic" ? [...stack, n.nodeId] : stack;
      if (n.id === target.id) {
        path.push(...(n.kind === "semantic" ? stack : nextStack));
        return true;
      }
      if (walk(n.children, nextStack)) return true;
    }
    return false;
  };
  walk(tree.roots, []);
  return path;
}

export function SiteCreatorOutlinePanel({
  tree,
  selectedUnits,
  hoveredKey = null,
  expandedIds,
  onExpandedIdsChange,
  onSelectUnit,
  onHoverUnit,
  onReparentToSemantic,
  emptyHint,
  visualLayerCount,
  reviewCount,
  resolveOverride,
  canvasLockForUnit,
  onToggleCanvasLock,
  selectionIndex,
  defaultOpen = false,
}: SiteCreatorOutlinePanelProps) {
  const [dragSource, setDragSource] = useState<SiteCreatorPresentationNode | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(defaultOpen);
  const treeId = useId();

  const toggle = (id: string) => {
    onExpandedIdsChange({
      ...expandedIds,
      [id]: !(expandedIds[id] === true || (expandedIds[id] === undefined && id === "unorganized")),
    });
  };

  return (
    <aside
      className={`site-creator-studio__sidebar flex shrink-0 flex-col border-r border-white/10 bg-[#101820] transition-[width,padding] duration-150 ${
        panelOpen ? "w-[240px] px-2 py-3" : "w-11 px-1.5 py-2"
      }`}
      data-testid="site-creator-outline-panel"
      data-state={panelOpen ? "open" : "closed"}
    >
      <button
        type="button"
        aria-expanded={panelOpen}
        aria-controls={treeId}
        aria-label={panelOpen ? "Ocultar panel Página" : "Mostrar panel Página"}
        title={panelOpen ? "Ocultar Página" : "Mostrar Página"}
        onClick={() => setPanelOpen((open) => !open)}
        className={`flex h-8 shrink-0 items-center rounded-md text-white/45 transition-colors hover:bg-white/6 hover:text-white/80 ${
          panelOpen ? "w-full gap-2 px-2" : "w-8 justify-center"
        }`}
      >
        <LayoutTemplate className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} aria-hidden />
        {panelOpen ? (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-[10px] font-semibold uppercase tracking-[0.16em]">
              Página
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
          </>
        ) : (
          <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-55" aria-hidden />
        )}
      </button>

      {panelOpen ? (
        <>
          <div id={treeId} className="mt-2 min-h-0 flex-1 overflow-auto">
            {tree.roots.length === 0 ? (
              <p className="px-1.5 text-[11px] font-normal leading-relaxed text-white/35">
                Selecciona elementos en el diseño. Usa Ctrl/Cmd para añadir varios.
              </p>
            ) : (
              tree.roots.map((node) => (
                <OutlineTreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedUnits={selectedUnits}
                  hoveredKey={hoveredKey}
                  expanded={expandedIds}
                  onToggle={toggle}
                  onSelect={(unit, additive, n) => {
                    const path = ancestorSemanticIds(tree, n);
                    onSelectUnit(unit, additive, path);
                  }}
                  onHover={(key, unit) => onHoverUnit(unit, key)}
                  onDragStart={(n) => setDragSource(n)}
                  onDropOn={(target) => {
                    if (dragSource && target.kind === "semantic") {
                      onReparentToSemantic?.(target.nodeId, dragSource);
                    }
                    setDragSource(null);
                    setDragOverId(null);
                  }}
                  onDragOverTarget={setDragOverId}
                  dragOverId={dragOverId}
                  resolveOverride={resolveOverride}
                  canvasLockForUnit={canvasLockForUnit}
                  onToggleCanvasLock={onToggleCanvasLock}
                  selectionIndex={selectionIndex}
                />
              ))
            )}
          </div>

          <div className="mt-3 border-t border-white/10 px-1.5 pt-3">
            <p className="text-[11px] font-normal text-white/40">{visualLayerCount} capas</p>
            {reviewCount > 0 ? (
              <p className="mt-2 text-[10px] font-normal tracking-wide text-amber-300/80">
                Por revisar · {reviewCount}
              </p>
            ) : null}
            {emptyHint ? (
              <p className="mt-3 text-[11px] font-normal leading-relaxed text-white/35">
                {emptyHint}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </aside>
  );
}

/** Expande la ruta de una unidad en el mapa expanded. */
export function expandPathForUnit(
  tree: SiteCreatorPresentationTree,
  unit: SiteCreatorSelectionUnit,
  prev: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...prev };
  const walk = (nodes: SiteCreatorPresentationNode[], stack: string[]): boolean => {
    for (const n of nodes) {
      const match =
        (n.kind === "semantic" && unit.kind === "blueprintNode" && n.nodeId === unit.nodeId) ||
        (n.kind === "layer" && unit.kind === "layer" && n.layerId === unit.layerId);
      if (match) {
        for (const id of stack) next[id] = true;
        next[n.id] = true;
        return true;
      }
      if (walk(n.children, [...stack, n.id])) return true;
    }
    return false;
  };
  walk(tree.roots, []);
  return next;
}
