"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

export function BrandKitLegacyMigrationBanner({
  legacyCount,
  onMigrate,
  migrating,
}: {
  legacyCount: number;
  onMigrate: () => void;
  migrating?: boolean;
}) {
  return (
    <div
      className="mb-3 rounded-[12px] border border-amber-300/25 bg-amber-400/10 px-3 py-2.5"
      data-testid="brandkit-legacy-migration-banner"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-amber-100">Puente legacy (4 constantes)</p>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-100/80">
            Este Dataset aún usa {legacyCount} constante{legacyCount === 1 ? "" : "s"} del puente antiguo (logo +
            colores). Migra al bloque Marca · BrandKit completo para acceder a contexto, tono, mensajes e imágenes.
            Las constantes legacy quedarán en solo lectura hasta migrar.
          </p>
          <button
            type="button"
            disabled={migrating}
            onClick={onMigrate}
            data-testid="brandkit-legacy-migration-action"
            className="mt-2 rounded-[8px] border border-amber-200/30 bg-amber-300/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-50 disabled:opacity-60"
          >
            {migrating ? "Migrando…" : "Migrar a BrandKit completo"}
          </button>
        </div>
      </div>
    </div>
  );
}
