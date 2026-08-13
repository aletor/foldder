"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Component, LayoutTemplate, Square, Layers } from "lucide-react";
import type {
  SiteCreatorPresentationNode,
  SiteCreatorPresentationTree,
} from "./site-creator-presentation-tree";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import { sameSelectionUnit } from "./site-creator-display-labels";

function Glyph({ node }: { node: SiteCreatorPresentationNode }) {
  const className = "h-3.5 w-3.5 shrink-0 opacity-70";
  if (node.kind === "unorganized") return <Layers className={className} />;
  if (node.kind === "semantic") {
    // Heurística por label
    if (node.label.startsWith("Botón") || node.label.startsWith("Boton")) {
      return <Component className={className} />;
    }
    if (node.label.startsWith("Hero") || node.label.startsWith("Sección") || node.label.startsWith("Seccion")) {
      return <LayoutTemplate className={className} />;
    }
    return <Square className={className} />;
  }
  return <Square className={className} />;
}

function rowSelected(
  node: SiteCreatorPresentationNode,
  selected: SiteCreatorSelectionUnit[],
): boolean {
  if (!node.unit) return false;
  return selected.some((u) => sameSelectionUnit(u, node.unit!));
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
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded[node.id] === true || (expanded[node.id] !== false && node.kind === "unorganized" && Object.keys(expanded).length === 0);
  // Default: unorganized open if never set; containers closed unless expanded
  const open =
    expanded[node.id] !== undefined
      ? expanded[node.id] === true
      : node.kind === "unorganized";
  const active = rowSelected(node, selectedUnits);
  const hovered = hoveredKey === node.id;
  const dropTarget = dragOverId === node.id && node.kind === "semantic";
  const closedCount = !open && hasChildren ? node.childCount : null;

  return (
    <div>
      <button
        type="button"
        draggable={node.kind === "layer" || (node.kind === "semantic" && node.label.startsWith("Botón"))}
        data-testid={`outline-row-${node.id}`}
        className={`flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[12px] ${
          active
            ? "bg-[#A8FF32]/15 text-[#A8FF32]"
            : dropTarget
              ? "bg-[#A8FF32]/10 text-white"
              : hovered
                ? "bg-white/8 text-white/90"
                : "text-white/80 hover:bg-white/5"
        }`}
        style={{ paddingLeft: 6 + depth * 12 }}
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
        {hasChildren ? (
          <span
            role="presentation"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/40"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" />
        )}
        <Glyph node={node} />
        <span className="min-w-0 truncate font-semibold">
          {closedCount != null && node.kind !== "unorganized"
            ? node.label.includes("·")
              ? node.label
              : `${node.label} · ${closedCount}`
            : node.kind === "unorganized" && open
              ? "Contenido sin organizar"
              : node.label}
        </span>
        {dropTarget ? (
          <span className="ml-auto shrink-0 text-[9px] text-[#A8FF32]/80">
            {`Añadir a ${node.label.split(" · ")[0]}`}
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
}: SiteCreatorOutlinePanelProps) {
  const [dragSource, setDragSource] = useState<SiteCreatorPresentationNode | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const toggle = (id: string) => {
    onExpandedIdsChange({
      ...expandedIds,
      [id]: !(expandedIds[id] === true || (expandedIds[id] === undefined && id === "unorganized")),
    });
  };

  return (
    <aside className="site-creator-studio__sidebar flex w-[240px] shrink-0 flex-col border-r border-white/10 bg-[#101820] px-3 py-4">
      <p className="mb-3 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
        Página
      </p>
      <div className="min-h-0 flex-1 overflow-auto">
        {tree.roots.length === 0 ? (
          <p className="px-1 text-[11px] text-white/35">
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
            />
          ))
        )}
      </div>

      <div className="mt-4 border-t border-white/10 px-1 pt-4">
        <p className="text-sm font-semibold text-white/90">Contenido visual</p>
        <p className="mt-1 text-xs text-white/55">{visualLayerCount} capas</p>
        {reviewCount > 0 ? (
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.14em] text-amber-300/90">
            Por revisar · {reviewCount}
          </p>
        ) : null}
        {emptyHint ? <p className="mt-4 text-xs leading-relaxed text-white/45">{emptyHint}</p> : null}
      </div>
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
