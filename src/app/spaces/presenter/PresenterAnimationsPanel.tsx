"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Layers, Sparkles, Trash2, Users, X } from "lucide-react";
import type { FreehandObject } from "../FreehandStudio";
import type { PresenterGroupEnterId, PresenterRevealStep } from "./presenter-group-animations";
import {
  mergeStepsWithPage,
  parsePresenterStepKey,
  PRESENTER_GROUP_ENTER_OPTIONS,
  presenterStepKey,
} from "./presenter-group-animations";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { PickPointerModifiers } from "./DesignerPageCanvasView";
import { countObjectsInGroup } from "./presenter-group-bounds";

type Tab = "enter" | "exit";

function rowLabel(s: PresenterRevealStep, objects: FreehandObject[]): string {
  if (s.kind === "group") {
    const n = countObjectsInGroup(objects, s.groupId);
    const t = s.groupId.trim();
    const idPart = t.length <= 10 ? t : `…${t.slice(-8)}`;
    return `${n} objetos · ${idPart}`;
  }
  const o = objects.find((x) => x.id === s.objectId);
  const typ = o?.type ?? "obj";
  const typeLabel =
    typ === "text"
      ? "Texto"
      : typ === "image"
        ? "Imagen"
        : typ === "path"
          ? "Trazo"
          : typ === "rect"
            ? "Rect"
            : typ === "ellipse"
              ? "Elipse"
              : typ === "booleanGroup"
                ? "Compuesto"
                : typ === "clippingContainer"
                  ? "Recorte"
                  : typ;
  const id = s.objectId;
  return id.length <= 14 ? `${typeLabel} · ${id}` : `${typeLabel} · …${id.slice(-8)}`;
}

function EnterThumb({ id, active }: { id: PresenterGroupEnterId; active: boolean }) {
  const ring = active
    ? "border-violet-500 bg-violet-500/15 ring-1 ring-violet-400/40"
    : "border-white/10 bg-white/[0.04] hover:border-white/20";
  return (
    <div className={`flex h-10 w-full items-center justify-center rounded-lg border ${ring}`}>
      <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-400">{id.slice(0, 3)}</span>
    </div>
  );
}

type Props = {
  page: DesignerPageState | null;
  selectedStepKeys: string[];
  onSelectStepKey: (stepKey: string, mods: PickPointerModifiers) => void;
  onReplaceStepSelection: (keys: string[]) => void;
  onChangeSteps: (steps: PresenterRevealStep[]) => void;
  /**
   * Con 2+ elementos seleccionados en el slide/order: un solo paso en Order, mismo `groupId` en el lienzo,
   * animación compartida. Si no se pasa, el modo multi añadiría un paso por elemento (no deseado).
   */
  onApplyEnterToMultiSelection?: (selectedKeys: string[], enter: PresenterGroupEnterId) => void;
  /** Tras asignar un preset de entrada: vista previa una vez en el lienzo (editor). */
  onPreviewEnter?: (
    nextSteps: PresenterRevealStep[],
    selectedKeys: string[],
    enter: PresenterGroupEnterId,
  ) => void;
  onClose: () => void;
};

export function PresenterAnimationsPanel({
  page,
  selectedStepKeys,
  onSelectStepKey,
  onReplaceStepSelection,
  onChangeSteps,
  onApplyEnterToMultiSelection,
  onPreviewEnter,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("enter");

  if (!page) return null;

  const objects = page.objects ?? [];
  const steps = mergeStepsWithPage(page);
  const hasSteps = steps.length > 0;

  const selectedSet = useMemo(() => new Set(selectedStepKeys), [selectedStepKeys]);

  const singleSelIdx = useMemo(() => {
    if (selectedStepKeys.length !== 1 || !steps.length) return -1;
    const k = selectedStepKeys[0];
    return steps.findIndex((s) => presenterStepKey(s) === k);
  }, [steps, selectedStepKeys]);

  const setEnter = (enter: PresenterGroupEnterId) => {
    if (!selectedStepKeys.length) return;
    if (selectedStepKeys.length >= 2 && onApplyEnterToMultiSelection) {
      onApplyEnterToMultiSelection(selectedStepKeys, enter);
      return;
    }
    let next = [...steps];
    for (const k of selectedStepKeys) {
      const idx = next.findIndex((s) => presenterStepKey(s) === k);
      if (idx >= 0) {
        next[idx] = { ...next[idx], enter };
      } else {
        const p = parsePresenterStepKey(k);
        if (!p) continue;
        if (p.kind === "group") {
          next.push({ kind: "group", groupId: p.groupId, enter, exit: "none" });
        } else {
          next.push({ kind: "object", objectId: p.objectId, enter, exit: "none" });
        }
      }
    }
    onChangeSteps(next);
    onPreviewEnter?.(next, selectedStepKeys, enter);
  };

  const move = (dir: -1 | 1) => {
    if (singleSelIdx < 0) return;
    const j = singleSelIdx + dir;
    if (j < 0 || j >= steps.length) return;
    const cp = [...steps];
    const [row] = cp.splice(singleSelIdx, 1);
    cp.splice(j, 0, row);
    onChangeSteps(cp);
  };

  /** Quita pasos cuyo objeto/grupo ya no está en el lienzo (no añade pasos nuevos). */
  const validateStepsAgainstCanvas = () => {
    const next = mergeStepsWithPage(page);
    onChangeSteps(next);
    onReplaceStepSelection(next[0] ? [presenterStepKey(next[0])] : []);
  };

  const clearAllSteps = () => {
    onChangeSteps([]);
    onReplaceStepSelection([]);
  };

  const removeStep = (sk: string) => {
    const next = steps.filter((s) => presenterStepKey(s) !== sk);
    onChangeSteps(next);
    onReplaceStepSelection(selectedStepKeys.filter((k) => k !== sk));
  };

  return (
    <aside className="flex w-[min(100%,280px)] shrink-0 flex-col rounded-xl border border-white/[0.1] bg-[#12151a] shadow-inner md:w-72">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2">
        <h2 className="text-[12px] font-bold text-white">Animations</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex border-b border-white/[0.08] px-2 pt-2">
        <button
          type="button"
          onClick={() => setTab("enter")}
          className={`flex-1 rounded-t-lg py-1.5 text-[10px] font-bold uppercase tracking-wide ${
            tab === "enter" ? "bg-violet-600/25 text-violet-200" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Enter
        </button>
        <button
          type="button"
          onClick={() => setTab("exit")}
          className={`flex-1 rounded-t-lg py-1.5 text-[10px] font-bold uppercase tracking-wide ${
            tab === "exit" ? "bg-violet-600/25 text-violet-200" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Exit
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {tab === "exit" && (
          <p className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-2 py-4 text-center text-[10px] text-zinc-500">
            Salidas: próximamente.
          </p>
        )}

        {tab === "enter" && (
          <>
            <p className="mb-2 text-[10px] leading-snug text-zinc-400">
              Por defecto <span className="font-semibold text-zinc-200">todo el slide es visible</span> en Play. Solo
              entran en la cola los elementos o grupos a los que{" "}
              <span className="font-semibold text-violet-200">asignes una animación</span> aquí: aparecen en{" "}
              <span className="font-semibold">Order</span> y se revelan en ese orden; el resto sigue visible desde el
              inicio.
            </p>
            <p className="mb-2 text-[10px] text-zinc-500">
              Grupo = <span className="text-amber-200/90">ámbar</span> · elemento suelto ={" "}
              <span className="text-violet-200/90">violeta</span>.
            </p>
            <p className="mb-2 rounded-md border border-violet-500/20 bg-violet-500/[0.08] px-2 py-1.5 text-[10px] leading-snug text-violet-100/95">
              <span className="font-semibold">Marco</span> en el fondo del slide para varios a la vez;{" "}
              <span className="font-mono font-bold">Ctrl</span>/<span className="font-mono font-bold">⌘</span>+clic o
              +marco para sumar. Con un preset, una fila <span className="font-semibold">Grupo</span> en Order. Vista
              previa al asignar.
            </p>

            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {PRESENTER_GROUP_ENTER_OPTIONS.map((opt) => {
                const selectedSteps = steps.filter((s) => selectedSet.has(presenterStepKey(s)));
                const active =
                  selectedSteps.length > 0 && selectedSteps.every((s) => s.enter === opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.label}
                    disabled={selectedStepKeys.length === 0}
                    onClick={() => setEnter(opt.id)}
                    className="flex flex-col items-center gap-0.5 disabled:opacity-35"
                  >
                    <EnterThumb id={opt.id} active={active} />
                    <span className="text-[7px] font-medium text-zinc-500">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Order</span>
              <div className="flex flex-wrap justify-end gap-1">
                <button
                  type="button"
                  onClick={validateStepsAgainstCanvas}
                  className="text-[9px] font-semibold text-violet-400 hover:text-violet-300"
                  title="Quita pasos cuyo objeto o grupo ya no existe en la página"
                >
                  Validar
                </button>
                {hasSteps && (
                  <button
                    type="button"
                    onClick={clearAllSteps}
                    className="text-[9px] font-semibold text-rose-400/90 hover:text-rose-300"
                    title="Borrar todos los pasos animados (el slide completo se verá en Play)"
                  >
                    Vaciar
                  </button>
                )}
              </div>
            </div>

            {!hasSteps && (
              <p className="rounded-lg border border-dashed border-zinc-600/40 bg-white/[0.03] px-2 py-3 text-center text-[10px] leading-snug text-zinc-500">
                Ningún paso animado aún. Al asignar un preset a la selección, aparecerá aquí.
              </p>
            )}

            {hasSteps && (
              <>
                <ul
                  className="flex flex-col gap-1"
                  role="listbox"
                  aria-label="Pasos animados (orden en Play)"
                  aria-multiselectable="true"
                >
                  {steps.map((s, i) => {
                    const sk = presenterStepKey(s);
                    const isGroupStep = s.kind === "group";
                    const sel = selectedSet.has(sk);
                    const rowClass = sel
                      ? isGroupStep
                        ? "border-amber-400/75 bg-amber-500/20 ring-2 ring-amber-400/45"
                        : "border-violet-400/70 bg-violet-500/20 ring-2 ring-violet-500/35"
                      : isGroupStep
                        ? "border-amber-500/35 bg-amber-500/[0.09] hover:border-amber-400/45 hover:bg-amber-500/[0.12]"
                        : "border-white/[0.08] bg-white/[0.03] hover:border-violet-500/30 hover:bg-white/[0.06]";
                    return (
                      <li key={sk}>
                        <div
                          className={`flex items-stretch gap-1 rounded-lg border transition-colors ${rowClass}`}
                          role="option"
                          aria-selected={sel}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                            onClick={(e) => onSelectStepKey(sk, { ctrlKey: e.ctrlKey, metaKey: e.metaKey })}
                          >
                            <span
                              className={`w-4 text-[10px] font-bold ${isGroupStep ? "text-amber-200/90" : "text-zinc-500"}`}
                            >
                              {i + 1}
                            </span>
                            {isGroupStep ? (
                              <Users size={14} className="shrink-0 text-amber-300/90" aria-hidden />
                            ) : (
                              <Layers size={14} className="shrink-0 text-zinc-400" aria-hidden />
                            )}
                            {isGroupStep && (
                              <span className="shrink-0 rounded border border-amber-400/45 bg-amber-500/25 px-1 py-0.5 text-[7px] font-black uppercase tracking-wide text-amber-100">
                                Grupo
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-zinc-100" title={sk}>
                              {rowLabel(s, objects)}
                            </span>
                            <Sparkles size={12} className="shrink-0 text-violet-400/80" aria-hidden />
                            <span className="max-w-[40px] shrink-0 truncate text-[8px] text-zinc-400">{s.enter}</span>
                          </button>
                          <button
                            type="button"
                            title={
                              isGroupStep
                                ? "Quitar animación y desagrupar objetos en el slide"
                                : "Quitar del orden"
                            }
                            className="shrink-0 px-1.5 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                            onClick={() => removeStep(sk)}
                          >
                            <Trash2 size={12} className="mx-auto" aria-hidden />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    title="Subir (un solo paso seleccionado)"
                    onClick={() => move(-1)}
                    disabled={singleSelIdx <= 0}
                    className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    title="Bajar (un solo paso seleccionado)"
                    onClick={() => move(1)}
                    disabled={singleSelIdx < 0 || singleSelIdx >= steps.length - 1}
                    className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
