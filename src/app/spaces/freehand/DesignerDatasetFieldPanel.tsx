"use client";

import { ChevronLeft, ChevronRight, Link2, List } from "lucide-react";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { DesignerDatasetFieldBinding } from "@/app/spaces/dataset/dataset-types";
import type { DesignerDatasetFieldKind } from "@/app/spaces/designer/designer-dataset-binding";

const fieldInputClass =
  "nodrag w-full rounded-[5px] border border-white/[0.1] bg-[#1a1e26] px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-teal-400/45";

export type DesignerDatasetFieldPanelProps = {
  fieldKind: DesignerDatasetFieldKind;
  dataset: Dataset | null;
  datasetLoading: boolean;
  binding: DesignerDatasetFieldBinding | null;
  listId: string;
  fieldId: string;
  schemaFields: Array<{ id: string; label: string }>;
  defaultSlotLabel: string;
  activePageRowIndex: number;
  brandKitFields: Array<{ id: string; label: string }>;
  activeBrandKitConstantId: string;
  onListIdChange: (listId: string) => void;
  onFieldIdChange: (fieldId: string) => void;
  onRemoveBinding: () => void;
  onMarkDynamic: () => void;
  onSlotLabelChange: (label: string) => void;
  onApplyTextBinding: (listId: string, fieldId: string) => void;
  onApplyImageBinding: (listId: string, fieldId: string) => void;
  onApplyBrandKitBinding: (constantId: string) => void;
  onSetActivePageRowIndex?: (rowIndex: number) => void;
  /** Sin borde superior (p. ej. primera sección del tab). */
  plainTop?: boolean;
};

export function DesignerDatasetFieldPanel({
  fieldKind,
  dataset,
  datasetLoading,
  binding,
  listId,
  fieldId,
  schemaFields,
  defaultSlotLabel,
  activePageRowIndex,
  brandKitFields,
  activeBrandKitConstantId,
  onListIdChange,
  onFieldIdChange,
  onRemoveBinding,
  onMarkDynamic,
  onSlotLabelChange,
  onApplyTextBinding,
  onApplyImageBinding,
  onApplyBrandKitBinding,
  onSetActivePageRowIndex,
  plainTop = false,
}: DesignerDatasetFieldPanelProps) {
  const kindLabel = fieldKind === "image" ? "imagen" : "texto";

  return (
    <section
      className={`space-y-3 ${plainTop ? "" : "border-t border-white/[0.08] pt-3"}`}
    >
      {brandKitFields.length > 0 ? (
        <div className="space-y-1.5 rounded-[6px] border border-white/[0.08] bg-white/[0.02] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">BrandKit</span>
            <Link2 size={11} className="text-teal-300/80" />
          </div>
          <select
            value={activeBrandKitConstantId}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) {
                onRemoveBinding();
                return;
              }
              onApplyBrandKitBinding(id);
            }}
            className={fieldInputClass}
          >
            <option value="">Sin vincular…</option>
            {brandKitFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] leading-snug text-zinc-500">
            Vincula {fieldKind === "image" ? "esta imagen" : "este texto"} a un campo del BrandKit.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Dataset</span>
          <List size={11} className="text-teal-300/80" />
        </div>

        {datasetLoading ? (
          <p className="text-[11px] leading-snug text-zinc-500">Cargando Dataset…</p>
        ) : !dataset ? (
          binding ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-[5px] border border-teal-400/25 bg-teal-500/10 px-2 py-1.5">
                <span className="text-[10px] font-semibold text-teal-200">Campo dinámico · {kindLabel}</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={onRemoveBinding}
                  className="nodrag rounded-[4px] border border-white/[0.12] px-1.5 py-0.5 text-[10px] text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  Quitar
                </button>
              </div>
              <label className="block space-y-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                  Identificador
                </span>
                <input
                  type="text"
                  value={binding.slotLabel ?? ""}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => onSlotLabelChange(e.target.value)}
                  placeholder="p. ej. jugador_1"
                  className={fieldInputClass}
                />
              </label>
              <p className="text-[10px] leading-snug text-zinc-500">
                Mismo identificador en texto e imagen → un solo jugador en Populate. Asignarás los
                valores en Loop o Populate Studio.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] leading-snug text-zinc-500">
                Conéctale un Dataset o márcalo como dinámico para Loop.
              </p>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onMarkDynamic}
                className="nodrag w-full rounded-[5px] border border-teal-400/30 bg-teal-500/10 px-2 py-1.5 text-[11px] font-semibold text-teal-100 transition hover:bg-teal-500/20"
              >
                Marcar como campo dinámico
              </button>
            </div>
          )
        ) : dataset.lists.length === 0 ? (
          <p className="text-[11px] leading-snug text-zinc-500">El Dataset conectado no tiene listados.</p>
        ) : (
          <div className="space-y-2">
            {binding ? (
              <div className="flex items-center justify-between gap-2 rounded-[5px] border border-teal-400/25 bg-teal-500/10 px-2 py-1.5">
                <span className="text-[10px] font-semibold text-teal-200">Campo dinámico enlazado</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={onRemoveBinding}
                  className="nodrag rounded-[4px] border border-white/[0.12] px-1.5 py-0.5 text-[10px] text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  Desvincular
                </button>
              </div>
            ) : null}

            <label className="block space-y-1">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Listado</span>
              <select
                value={listId}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const nextListId = e.target.value;
                  if (!nextListId) {
                    onRemoveBinding();
                    return;
                  }
                  onListIdChange(nextListId);
                }}
                className={fieldInputClass}
              >
                <option value="">Elegir listado…</option>
                {dataset.lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Campo ({kindLabel})</span>
              <select
                value={fieldId}
                disabled={!listId}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const nextFieldId = e.target.value;
                  if (!nextFieldId) {
                    onRemoveBinding();
                    return;
                  }
                  onFieldIdChange(nextFieldId);
                  if (!listId) return;
                  if (fieldKind === "image") onApplyImageBinding(listId, nextFieldId);
                  else onApplyTextBinding(listId, nextFieldId);
                }}
                className={`${fieldInputClass} disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <option value="">Elegir campo…</option>
                {schemaFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>

            {listId && schemaFields.length === 0 ? (
              <p className="text-[10px] leading-snug text-zinc-500">
                Este listado no tiene campos de tipo {kindLabel}.
              </p>
            ) : null}

            {listId ? (() => {
              const rowCount = dataset.lists.find((l) => l.id === listId)?.cards.length ?? 0;
              const rowIdx = activePageRowIndex;
              const outOfRange = rowCount > 0 && rowIdx > rowCount - 1;
              const canSet = !!onSetActivePageRowIndex && rowCount > 0;
              return (
                <div className="space-y-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                    Fila de esta página
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Fila anterior"
                      disabled={!canSet || rowIdx <= 0}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onSetActivePageRowIndex?.(Math.max(0, rowIdx - 1))}
                      className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-white/[0.1] bg-[#1a1e26] text-zinc-300 transition hover:border-teal-400/45 hover:text-teal-100 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <div className="flex-1 rounded-[4px] border border-white/[0.1] bg-[#1a1e26] px-2 py-1 text-center text-[11px] tabular-nums text-zinc-100">
                      {rowCount > 0 ? (
                        <>Fila {Math.min(rowIdx, rowCount - 1) + 1} de {rowCount}</>
                      ) : (
                        "Listado sin filas"
                      )}
                    </div>
                    <button
                      type="button"
                      title="Fila siguiente"
                      disabled={!canSet || rowIdx >= rowCount - 1}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onSetActivePageRowIndex?.(Math.min(rowCount - 1, rowIdx + 1))}
                      className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-white/[0.1] bg-[#1a1e26] text-zinc-300 transition hover:border-teal-400/45 hover:text-teal-100 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                  {outOfRange ? (
                    <p className="text-[10px] leading-snug text-amber-400/90">
                      Esta página apunta a la fila {rowIdx + 1}, que ya no existe.{" "}
                      {canSet ? (
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => onSetActivePageRowIndex?.(rowCount - 1)}
                          className="nodrag font-semibold text-teal-300 underline-offset-2 hover:underline"
                        >
                          Usar la fila {rowCount}
                        </button>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-[10px] leading-snug text-zinc-500">
                      Los campos enlazados de esta página usan esta fila.
                    </p>
                  )}
                </div>
              );
            })() : null}
          </div>
        )}
      </div>
    </section>
  );
}
