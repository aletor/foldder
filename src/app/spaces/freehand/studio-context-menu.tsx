"use client";

import React, { useEffect } from "react";
import { useClampedFixedPosition } from "@/lib/use-clamped-fixed-position";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  separator?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

export function CtxMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const remeasureKey = items.map((i) => `${i.label}\0${!!i.disabled}\0${!!i.separator}`).join("|");
  const { ref, style } = useClampedFixedPosition(x, y, true, remeasureKey);

  useEffect(() => {
    const h = () => {
      onClose();
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu !z-[100001] min-w-[220px] max-h-[min(70vh,calc(100vh-24px))] overflow-y-auto overflow-x-hidden"
      style={{ ...style, position: "fixed", zIndex: 100001 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-0.5 shrink-0 border-b border-white/5 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-white/30">
        Acciones
      </div>
      {items.map((item, i) => {
        const isDanger = item.label === "Delete" || item.label.startsWith("Eliminar");
        return (
          <React.Fragment key={`${item.label}-${i}`}>
            {item.separator ? <div className="context-menu-separator" /> : null}
            <button
              type="button"
              disabled={item.disabled}
              className={`context-menu-item w-full justify-between border-0 bg-transparent font-[inherit] ${
                isDanger ? "danger" : ""
              }`}
              onClick={() => {
                item.action();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut ? (
                <span className="shrink-0 font-mono text-[9px] font-normal normal-case tracking-normal text-white/35 tabular-nums">
                  {item.shortcut}
                </span>
              ) : null}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
