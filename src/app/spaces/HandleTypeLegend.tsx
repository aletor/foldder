"use client";

import { HANDLE_TYPE_LEGEND } from "./handle-type-colors";

/** Leyenda pequeña de colores por tipo de conexión (abajo izquierda del lienzo). */
export function HandleTypeLegend() {
  return (
    <div
      className="pointer-events-none fixed bottom-3 left-3 z-[89] max-w-[10.5rem] rounded-md border border-white/15 bg-black/40 px-2 py-1.5 shadow-md backdrop-blur-sm"
      role="note"
      aria-label="Leyenda de colores por tipo de conexión"
    >
      <p className="mb-1 font-mono text-[6px] font-semibold uppercase tracking-wider text-zinc-500">
        Tipos de conexión
      </p>
      <ul className="grid grid-cols-1 gap-y-0.5">
        {HANDLE_TYPE_LEGEND.map(({ id, label, color }) => (
          <li key={id} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/25"
              style={{ backgroundColor: color }}
            />
            <span className="font-mono text-[7px] leading-tight text-zinc-300">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
