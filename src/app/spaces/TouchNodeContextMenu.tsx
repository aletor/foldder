"use client";

import { Copy, FolderPlus, Link2, Loader2, Share2, Sparkles, Trash2 } from "lucide-react";
import { GraphContextMenuShell } from "./GraphContextMenuShell";

type TouchNodeContextMenuProps = {
  x: number;
  y: number;
  nodeId: string;
  nodeType?: string;
  canGroup: boolean;
  onClose: () => void;
  onDelete: () => void;
  onDuplicateNote?: () => void;
  onGroup?: () => void;
  onStartConnect?: () => void;
  /** Selecciona el flujo completo (componente conexo) que contiene este nodo. */
  onSelectFlow?: () => void;
  /** Guarda el flujo completo en la librería de Inspiración ("Mis flujos"). */
  onSaveFlow?: () => void;
  saveFlowState?: "idle" | "busy" | "done" | "error";
};

export function TouchNodeContextMenu({
  x,
  y,
  nodeId,
  nodeType,
  canGroup,
  onClose,
  onDelete,
  onDuplicateNote,
  onGroup,
  onStartConnect,
  onSelectFlow,
  onSaveFlow,
  saveFlowState = "idle",
}: TouchNodeContextMenuProps) {
  return (
    <GraphContextMenuShell x={x} y={y} remeasureKey={nodeId} onMouseLeave={onClose}>
      {onSelectFlow ? (
        <button
          type="button"
          className="context-menu-item w-full border-0 bg-transparent font-[inherit]"
          onClick={() => {
            onSelectFlow();
            onClose();
          }}
        >
          <span className="flex items-center gap-2">
            <Share2 size={14} aria-hidden />
            Seleccionar flujo completo
          </span>
        </button>
      ) : null}
      {onSaveFlow ? (
        <button
          type="button"
          className="context-menu-item w-full border-0 bg-transparent font-[inherit]"
          disabled={saveFlowState === "busy"}
          onClick={() => {
            onSaveFlow();
            // No cerramos inmediatamente: el guardado pide nombre y muestra estado.
          }}
        >
          <span className="flex items-center gap-2">
            {saveFlowState === "busy" ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Sparkles size={14} aria-hidden />
            )}
            {saveFlowState === "busy"
              ? "Guardando flujo…"
              : saveFlowState === "done"
                ? "Flujo guardado"
                : "Guardar flujo en Inspiración"}
          </span>
        </button>
      ) : null}
      {(onSelectFlow || onSaveFlow) && (onStartConnect || onDuplicateNote || canGroup) ? (
        <div className="context-menu-separator" />
      ) : null}
      {onStartConnect ? (
        <button
          type="button"
          className="context-menu-item w-full border-0 bg-transparent font-[inherit]"
          onClick={() => {
            onStartConnect();
            onClose();
          }}
        >
          <span className="flex items-center gap-2">
            <Link2 size={14} aria-hidden />
            Conectar desde aquí
          </span>
        </button>
      ) : null}
      {nodeType === "notes" && onDuplicateNote ? (
        <button
          type="button"
          className="context-menu-item w-full border-0 bg-transparent font-[inherit]"
          onClick={() => {
            onDuplicateNote();
            onClose();
          }}
        >
          <span className="flex items-center gap-2">
            <Copy size={14} aria-hidden />
            Duplicar nota
          </span>
        </button>
      ) : null}
      {canGroup && onGroup ? (
        <button
          type="button"
          className="context-menu-item w-full border-0 bg-transparent font-[inherit]"
          onClick={() => {
            onGroup();
            onClose();
          }}
        >
          <span className="flex items-center gap-2">
            <FolderPlus size={14} aria-hidden />
            Agrupar selección
          </span>
        </button>
      ) : null}
      <div className="context-menu-separator" />
      <button
        type="button"
        className="context-menu-item danger w-full border-0 bg-transparent font-[inherit]"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        <span className="flex items-center gap-2">
          <Trash2 size={14} aria-hidden />
          Eliminar
        </span>
      </button>
    </GraphContextMenuShell>
  );
}
