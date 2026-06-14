"use client";

import { Copy, FolderPlus, Link2, Trash2 } from "lucide-react";
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
  onStartConnect: () => void;
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
}: TouchNodeContextMenuProps) {
  return (
    <GraphContextMenuShell x={x} y={y} remeasureKey={nodeId} onMouseLeave={onClose}>
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
