"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Lock, Monitor, Smartphone, Tablet, Unlock } from "lucide-react";
import type {
  SiteCreatorPresentationNode,
  SiteCreatorPresentationTree,
} from "./site-creator-presentation-tree";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import { imageFrameHasPhoto, isDesignerImageFrame, sameSelectionUnit } from "./site-creator-display-labels";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { ResponsiveEditableBand, ResponsiveVisibilityBand } from "./site-creator-types";

type OutlineVisibilityState = {
  hidden: boolean;
  inherited?: boolean;
};

type OutlineRole = "section" | "group" | "multicard" | "button" | "unorganized" | "layer";

const VISIBILITY_BANDS: Array<{
  band: ResponsiveEditableBand;
  label: string;
  Icon: typeof Monitor;
}> = [
  { band: "monitor", label: "Monitor", Icon: Monitor },
  { band: "tablet", label: "Tablet", Icon: Tablet },
  { band: "mobile", label: "Móvil", Icon: Smartphone },
];

function outlineRole(node: SiteCreatorPresentationNode): OutlineRole {
  if (node.kind === "unorganized") return "unorganized";
  if (node.kind !== "semantic") return "layer";
  const label = node.label;
  if (label.startsWith("Botón") || label.startsWith("Boton")) return "button";
  if (label.startsWith("Hero") || label.startsWith("Sección") || label.startsWith("Seccion")) {
    return "section";
  }
  if (label.startsWith("MultiCard")) return "multicard";
  return "group";
}

function stripElementCount(label: string): string {
  return label.replace(/\s·\s\d+\s+elementos?$/i, "").trim();
}

function outlineTitle(
  node: SiteCreatorPresentationNode,
  open: boolean,
  closedCount: number | null,
): { title: string; aside: string | null } {
  if (!open && closedCount != null && node.kind !== "unorganized") {
    return { title: node.label, aside: null };
  }
  if (node.kind === "unorganized" && open) {
    return { title: "Contenido sin organizar", aside: null };
  }
  const stripped = stripElementCount(node.label);
  const times = stripped.match(/^(.*)\s·\s(×\d+)$/);
  if (times) return { title: times[1]!, aside: times[2]! };
  return { title: stripped, aside: null };
}

function OutlineDeviceVisibility({
  node,
  activeBand,
  resolveVisibility,
  onToggleVisibility,
}: {
  node: SiteCreatorPresentationNode;
  activeBand: ResponsiveVisibilityBand;
  resolveVisibility: (
    node: SiteCreatorPresentationNode,
    band: ResponsiveVisibilityBand,
  ) => OutlineVisibilityState | null;
  onToggleVisibility?: (
    node: SiteCreatorPresentationNode,
    band: ResponsiveVisibilityBand,
  ) => void;
}) {
  if (!node.unit) return null;
  return (
    <span className="ml-1 hidden shrink-0 items-center gap-1 group-hover/row:inline-flex group-focus-within/row:inline-flex">
      {VISIBILITY_BANDS.map(({ band, label, Icon }) => {
        const state = resolveVisibility(node, band);
        const active = band === activeBand;
        const hidden = state?.hidden === true;
        const inherited = state?.inherited === true;
        const enabled = active && !inherited && Boolean(onToggleVisibility);
        const action = hidden ? "Mostrar" : "Ocultar";
        const title = inherited
          ? `${label}: oculto por una agrupación superior`
          : active
            ? `${action} en ${label}`
            : `${label}: ${hidden ? "oculto" : "visible"}`;
        return (
          <span
            key={band}
            role="button"
            aria-label={title}
            aria-pressed={!hidden}
            aria-disabled={!enabled}
            data-testid={`outline-visibility-${node.id}-${band}`}
            title={title}
            className={`relative inline-flex h-4 w-4 items-center justify-center ${
              hidden ? "text-white/20" : active ? "text-white/55" : "text-white/22"
            } ${enabled ? "cursor-pointer hover:text-white/80" : "cursor-default"}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (!enabled) return;
              onToggleVisibility?.(node, band);
            }}
          >
            <Icon className="h-2.5 w-2.5" strokeWidth={1.25} aria-hidden />
            {hidden ? (
              <span
                className="pointer-events-none absolute h-px w-2.5 rotate-45 bg-current"
                aria-hidden
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

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

function Mark({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span
      className={`relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center text-current ${className ?? ""}`}
      aria-hidden
    >
      {children}
    </span>
  );
}

function OutlineGlyph({
  node,
  selectionIndex,
}: {
  node: SiteCreatorPresentationNode;
  selectionIndex?: SiteCreatorSelectionIndex | null;
}) {
  const role = outlineRole(node);
  if (role === "section") {
    return (
      <Mark>
        <span className="block h-px w-2.5 bg-current opacity-60" />
      </Mark>
    );
  }
  if (role === "unorganized") {
    return (
      <Mark className="flex-col gap-px">
        <span className="block h-px w-2 bg-current opacity-45" />
        <span className="block h-px w-2 bg-current opacity-45" />
        <span className="block h-px w-2 bg-current opacity-45" />
      </Mark>
    );
  }
  if (role === "button") {
    return (
      <Mark>
        <span className="block h-1.5 w-2.5 rounded-[1px] border border-current opacity-55" />
      </Mark>
    );
  }
  if (role === "multicard") {
    return (
      <Mark>
        <span className="block h-2 w-2 border border-current opacity-45" />
        <span className="absolute h-1 w-1 bg-current opacity-35" />
      </Mark>
    );
  }
  if (role === "group") {
    return (
      <Mark>
        <span className="block h-2 w-2 border border-current opacity-40" />
      </Mark>
    );
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
      <Mark>
        <span className="block h-2 w-2 border border-current opacity-40" />
        {hasImage ? <span className="absolute h-px w-1.5 bg-current opacity-50" /> : null}
      </Mark>
    );
  }
  if (isImage) {
    return (
      <Mark>
        <span className="block h-2 w-2 border border-current opacity-40" />
        <span className="absolute h-px w-1.5 bg-current opacity-50" />
      </Mark>
    );
  }
  if (type === "text" || type === "textOnPath") {
    return (
      <Mark>
        <span className="text-[8px] font-light leading-none opacity-50">t</span>
      </Mark>
    );
  }
  if (type === "groupContainer" || type === "booleanGroup") {
    return (
      <Mark>
        <span className="block h-2 w-2 border border-current opacity-40" />
      </Mark>
    );
  }
  if (type === "path") {
    return (
      <Mark>
        <span className="block h-px w-2.5 origin-center rotate-[-28deg] bg-current opacity-50" />
      </Mark>
    );
  }
  if (type === "ellipse") {
    return (
      <Mark>
        <span
          className="block h-2 w-2 rounded-full border border-white/20"
          style={fill ? { background: fill } : undefined}
        />
      </Mark>
    );
  }
  if (fill) {
    return (
      <Mark>
        <span className="block h-2 w-2 border border-white/10" style={{ background: fill }} />
      </Mark>
    );
  }
  return (
    <Mark>
      <span className="block h-2 w-2 border border-current opacity-35" />
    </Mark>
  );
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
  resolveOverride,
  canvasLockForUnit,
  onToggleCanvasLock,
  activeVisibilityBand,
  resolveVisibility,
  onToggleVisibility,
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
  activeVisibilityBand: ResponsiveVisibilityBand;
  resolveVisibility?: (
    node: SiteCreatorPresentationNode,
    band: ResponsiveVisibilityBand,
  ) => OutlineVisibilityState | null;
  onToggleVisibility?: (
    node: SiteCreatorPresentationNode,
    band: ResponsiveVisibilityBand,
  ) => void;
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
  const { title, aside } = outlineTitle(node, open, closedCount);

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
        className={`group/row relative flex w-full items-center gap-2 py-2.5 pr-1 text-left text-[10px] font-light leading-none tracking-[0.02em] ${
          active
            ? "text-white"
            : dropTarget
              ? "text-white/90"
              : hovered
                ? "text-white/80"
                : "text-white/45 hover:text-white/70"
        }`}
        style={{ paddingLeft: 16 + depth * 16 }}
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
          <span className="absolute bottom-2 left-0 top-2 w-px bg-[#A8FF32]/80" aria-hidden />
        ) : depth > 0 ? (
          <span
            className="absolute bottom-0 left-0 top-0 w-px bg-white/[0.06]"
            style={{ left: 16 + (depth - 1) * 16 + 5 }}
            aria-hidden
          />
        ) : null}
        {hasChildren ? (
          <span
            role="presentation"
            className="inline-flex h-3 w-3 shrink-0 items-center justify-center text-white/25"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          >
            {open ? (
              <ChevronDown className="h-2.5 w-2.5" strokeWidth={1.25} />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" strokeWidth={1.25} />
            )}
          </span>
        ) : (
          <span className="inline-block h-3 w-3 shrink-0" />
        )}
        <OutlineGlyph node={node} selectionIndex={selectionIndex} />
        <span
          className={`min-w-0 flex-1 truncate ${overrideInfo?.hidden ? "opacity-40" : ""}`}
        >
          {title}
          {aside ? <span className="ml-1.5 text-white/28">{aside}</span> : null}
        </span>
        {overrideInfo?.hidden ? (
          <span
            data-testid={`outline-hidden-${node.id}`}
            title="Oculto en esta vista. Sigue visible en Original."
            className="ml-0.5 hidden shrink-0 text-[9px] font-light tracking-[0.08em] text-white/28 group-hover/row:inline group-focus-within/row:inline"
          >
            oculto
          </span>
        ) : null}
        {overrideInfo ? (
          <span
            data-testid={`outline-override-dot-${node.id}`}
            title={overrideInfo.title}
            className="ml-0.5 hidden h-px w-1.5 shrink-0 group-hover/row:inline-block group-focus-within/row:inline-block"
            style={{
              background: overrideInfo.dot === "current" ? "#A8FF32" : "rgba(255,255,255,0.22)",
            }}
            aria-hidden
          />
        ) : null}
        {resolveVisibility ? (
          <OutlineDeviceVisibility
            node={node}
            activeBand={activeVisibilityBand}
            resolveVisibility={resolveVisibility}
            onToggleVisibility={onToggleVisibility}
          />
        ) : null}
        {dropTarget ? (
          <span className="ml-1 shrink-0 text-[9px] font-light tracking-[0.04em] text-white/35">
            {`Añadir a ${stripElementCount(node.label).split(" · ")[0]}`}
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
            className={`ml-1 h-3.5 w-3.5 shrink-0 items-center justify-center ${
              lockInfo.locked
                ? "inline-flex text-white/45"
                : "hidden text-white/20 hover:text-white/50 group-hover/row:inline-flex group-focus-within/row:inline-flex"
            } ${lockInfo.inherited ? "cursor-default" : ""}`}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (lockInfo.inherited || !node.unit) return;
              onToggleCanvasLock?.(node.unit);
            }}
          >
            {lockInfo.locked ? (
              <Lock className="h-2.5 w-2.5" strokeWidth={1.25} />
            ) : (
              <Unlock className="h-2.5 w-2.5" strokeWidth={1.25} />
            )}
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
              activeVisibilityBand={activeVisibilityBand}
              resolveVisibility={resolveVisibility}
              onToggleVisibility={onToggleVisibility}
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
  activeVisibilityBand?: ResponsiveVisibilityBand;
  resolveVisibility?: (
    node: SiteCreatorPresentationNode,
    band: ResponsiveVisibilityBand,
  ) => OutlineVisibilityState | null;
  onToggleVisibility?: (
    node: SiteCreatorPresentationNode,
    band: ResponsiveVisibilityBand,
  ) => void;
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
  activeVisibilityBand = "wide",
  resolveVisibility,
  onToggleVisibility,
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
      className={`site-creator-outline site-creator-studio__sidebar flex shrink-0 flex-col border-r border-white/[0.06] bg-[#0c1218] transition-[width,padding] duration-150 ${
        panelOpen ? "w-[268px] px-4 py-5" : "w-11 px-1.5 py-4"
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
        className={`flex h-8 shrink-0 items-center text-white/35 transition-colors hover:text-white/70 ${
          panelOpen ? "w-full gap-3" : "w-8 justify-center"
        }`}
      >
        {panelOpen ? (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-[10px] font-light uppercase tracking-[0.22em]">
              Página
            </span>
            <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-50" aria-hidden />
          </>
        ) : (
          <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-50" aria-hidden />
        )}
      </button>

      {panelOpen ? (
        <>
          <div id={treeId} className="mt-5 min-h-0 flex-1 overflow-auto">
            {tree.roots.length === 0 ? (
              <p className="text-[10px] font-light leading-relaxed tracking-[0.02em] text-white/30">
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
                  activeVisibilityBand={activeVisibilityBand}
                  resolveVisibility={resolveVisibility}
                  onToggleVisibility={onToggleVisibility}
                  selectionIndex={selectionIndex}
                />
              ))
            )}
          </div>

          <div className="mt-6 border-t border-white/[0.06] pt-5">
            <p className="text-[10px] font-light tracking-[0.08em] text-white/28">
              {visualLayerCount} capas
            </p>
            {reviewCount > 0 ? (
              <p className="mt-3 text-[10px] font-light tracking-[0.08em] text-amber-300/70">
                Por revisar · {reviewCount}
              </p>
            ) : null}
            {emptyHint ? (
              <p className="mt-4 text-[10px] font-light leading-relaxed tracking-[0.02em] text-white/28">
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
