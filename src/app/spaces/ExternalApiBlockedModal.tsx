"use client";

import { useSyncExternalStore } from "react";
import { ShieldAlert } from "lucide-react";
import {
  subscribeExternalApiVerifyBlocked,
  getExternalApiVerifyBlocked,
  clearExternalApiVerifyBlock,
} from "@/lib/external-api-guard";

export function ExternalApiBlockedModal() {
  const blocked = useSyncExternalStore(
    subscribeExternalApiVerifyBlocked,
    getExternalApiVerifyBlocked,
    () => false
  );

  if (!blocked) return null;

  return (
    <div
      className="fixed inset-0 z-[10010] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="external-api-blocked-title"
      aria-describedby="external-api-blocked-desc"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" aria-hidden />
      <div className="relative z-10 w-full max-w-md rounded-none border border-amber-500/35 bg-slate-950/95 p-6 shadow-2xl shadow-black/40">
        <div className="mb-4 flex items-center gap-3 text-amber-400">
          <ShieldAlert className="h-8 w-8 shrink-0" strokeWidth={1.75} aria-hidden />
          <h2
            id="external-api-blocked-title"
            className="text-base font-black uppercase tracking-wide text-white"
          >
            Uso de APIs limitado
          </h2>
        </div>
        <p id="external-api-blocked-desc" className="mb-6 text-sm leading-relaxed text-slate-300">
          Se ha pausado el acceso a las APIs externas: demasiadas peticiones iguales en poco tiempo, o debes
          confirmar que eres tú quien continúa. El asistente automático no puede desbloquear esto.
        </p>
        <p className="mb-6 text-xs text-slate-500">
          Máximo 8 llamadas concurrentes; la misma petición idéntica no puede repetirse antes de 4 segundos.
          Varias APIs o nodos distintos pueden ejecutarse en paralelo.
        </p>
        <button
          type="button"
          className="w-full rounded-none border border-amber-500/50 bg-amber-500/15 px-4 py-3 text-sm font-black uppercase tracking-widest text-amber-100 transition-colors hover:bg-amber-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
          onClick={(e) => clearExternalApiVerifyBlock(e)}
        >
          Verificar
        </button>
      </div>
    </div>
  );
}
