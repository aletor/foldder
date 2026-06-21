"use client";

import React, { useMemo, useState } from "react";
import { GripVertical, Layers, Sparkles, Trash2, Users, X } from "lucide-react";
import type { FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { PresenterGroupEnterId, PresenterRevealStep } from "./presenter-group-animations";
import {
  mergeStepsWithPage,
  parsePresenterStepKey,
  PRESENTER_GROUP_ENTER_OPTIONS,
  presenterStepKey,
} from "./presenter-group-animations";
import type { PickPointerModifiers } from "./DesignerPageCanvasView";
import { countObjectsInGroup } from "./presenter-group-bounds";
import { PresenterEnterAnimationIcon } from "./PresenterEnterAnimationIcons";

function truncateLabel(value: string, max = 28): string {
  const t = value.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function objectDisplayName(o: FreehandObject | undefined): string {
  if (!o) return "Elemento";
  if (o.type === "text") {
    const text = typeof (o as { text?: unknown }).text === "string" ? (o as { text: string }).text : "";
    return text.trim() ? truncateLabel(text) : "Texto";
  }
  if (o.type === "image") return "Imagen";
  if (o.type === "path") return "Trazo";
  if (o.type === "rect") return "Rectángulo";
  if (o.type === "ellipse") return "Elipse";
  if (o.type === "booleanGroup") return "Compuesto";
  if (o.type === "clippingContainer") return "Recorte";
  return "Elemento";
}

function rowLabel(s: PresenterRevealStep, objects: FreehandObject[]): string {
  if (s.kind === "group") {
    const n = countObjectsInGroup(objects, s.groupId);
    return `Grupo · ${n} elementos`;
  }
  return objectDisplayName(objects.find((x) => x.id === s.objectId));
}

function reorderSteps(steps: PresenterRevealStep[], fromIdx: number, toIdx: number): PresenterRevealStep[] {
  if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return steps;
  const arr = [...steps];
  const [item] = arr.splice(fromIdx, 1);
  let insert = toIdx;
  if (fromIdx < toIdx) insert = toIdx - 1;
  arr.splice(insert, 0, item);
  return arr;
}

type Props = {
  page: DesignerPageState | null;
  selectedStepKeys: string[];
  onSelectStepKey: (stepKey: string, mods: PickPointerModifiers) => void;
  onReplaceStepSelection: (keys: string[]) => void;
  onChangeSteps: (steps: PresenterRevealStep[]) => void;
  onApplyEnterToMultiSelection?: (selectedKeys: string[], enter: PresenterGroupEnterId) => void;
  /** Vista previa en el lienzo al pasar el ratón por un preset (con selección en el slide). */
  onPreviewPresetHover?: (enter: PresenterGroupEnterId | null) => void;
  onClose: () => void;
};

export function PresenterAnimationsPanel({
  page,
  selectedStepKeys,
  onSelectStepKey,
  onReplaceStepSelection,
  onChangeSteps,
  onApplyEnterToMultiSelection,
  onPreviewPresetHover,
  onClose,
}: Props) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const objects = page?.objects ?? [];
  const steps = useMemo(() => (page ? mergeStepsWithPage(page) : []), [page]);
  const hasSteps = steps.length > 0;

  const selectedSet = useMemo(() => new Set(selectedStepKeys), [selectedStepKeys]);

  /** Pasos que corresponden exactamente a las claves seleccionadas en el lienzo (para marcar el preset activo). */
  const selectedStepsMatchingKeys = useMemo(() => {
    return selectedStepKeys
      .map((k) => steps.find((s) => presenterStepKey(s) === k))
      .filter((s): s is PresenterRevealStep => s != null);
  }, [selectedStepKeys, steps]);

  if (!page) return null;

  const setEnter = (enter: PresenterGroupEnterId) => {
    if (!selectedStepKeys.length) return;
    if (selectedStepKeys.length >= 2 && onApplyEnterToMultiSelection) {
      onApplyEnterToMultiSelection(selectedStepKeys, enter);
      return;
    }
    const next = [...steps];
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
  };

  const syncStepsWithCanvas = () => {
    const pruned = mergeStepsWithPage(page);
    const existing = new Set(pruned.map(presenterStepKey));
    const added: PresenterRevealStep[] = [];
    for (const k of selectedStepKeys) {
      if (existing.has(k)) continue;
      const parsed = parsePresenterStepKey(k);
      if (!parsed) continue;
      if (parsed.kind === "group") {
        added.push({ kind: "group", groupId: parsed.groupId, enter: "fadeIn", exit: "none" });
      } else {
        added.push({ kind: "object", objectId: parsed.objectId, enter: "fadeIn", exit: "none" });
      }
      existing.add(k);
    }
    const next = [...pruned, ...added];
    onChangeSteps(next);
    const focusKey =
      added.length > 0
        ? presenterStepKey(added[added.length - 1])
        : next[0]
          ? presenterStepKey(next[0])
          : null;
    onReplaceStepSelection(focusKey ? [focusKey] : []);
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

  const onDragStartRow = (e: React.DragEvent, sk: string) => {
    setDraggingKey(sk);
    e.dataTransfer.setData("application/x-presenter-step", sk);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEndRow = () => {
    setDraggingKey(null);
    setDropTargetKey(null);
  };

  const onDragOverRow = (e: React.DragEvent, sk: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingKey && sk !== draggingKey) setDropTargetKey(sk);
  };

  const onDragLeaveRow = () => {
    setDropTargetKey(null);
  };

  const onDropRow = (e: React.DragEvent, targetSk: string) => {
    e.preventDefault();
    const fromSk = e.dataTransfer.getData("application/x-presenter-step") || draggingKey;
    setDraggingKey(null);
    setDropTargetKey(null);
    if (!fromSk || fromSk === targetSk) return;
    const fromIdx = steps.findIndex((s) => presenterStepKey(s) === fromSk);
    const toIdx = steps.findIndex((s) => presenterStepKey(s) === targetSk);
    if (fromIdx < 0 || toIdx < 0) return;
    onChangeSteps(reorderSteps(steps, fromIdx, toIdx));
  };

  return (
    <aside
      className="flex w-[min(100%,260px)] shrink-0 flex-col border-l border-white/[0.08] bg-[#0a0c0f] shadow-none md:w-[260px]"
      onMouseLeave={() => onPreviewPresetHover?.(null)}
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] px-2 py-1.5">
        <h2 className="text-[11px] font-bold tracking-tight text-white">Animaciones</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[4px] p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar panel"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5"
        onMouseLeave={() => onPreviewPresetHover?.(null)}
      >
        <div className="grid grid-cols-3 gap-1">
          {PRESENTER_GROUP_ENTER_OPTIONS.map((opt) => {
            const assignedToSelection =
              selectedStepKeys.length > 0 &&
              selectedStepsMatchingKeys.length === selectedStepKeys.length &&
              selectedStepsMatchingKeys.every((s) => s.enter === opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.label}
                disabled={selectedStepKeys.length === 0}
                onClick={() => setEnter(opt.id)}
                onMouseEnter={() => {
                  if (selectedStepKeys.length === 1) onPreviewPresetHover?.(opt.id);
                }}
                className={`group flex flex-col items-center gap-1 rounded-[6px] border py-1.5 transition-all duration-150 disabled:opacity-35 ${
                  assignedToSelection
                    ? "border-[#f5b91b]/55 bg-[#f5b91b]/15 shadow-[inset_0_0_0_1px_rgba(245,185,27,0.25)]"
                    : "border-transparent hover:border-white/20 hover:bg-white/[0.07]"
                }`}
              >
                <PresenterEnterAnimationIcon id={opt.id} size={52} active={assignedToSelection} />
                <span
                  className={`text-[10px] font-medium leading-tight transition-colors ${
                    assignedToSelection ? "text-[#f5b91b]" : "text-zinc-400 group-hover:text-zinc-200"
                  }`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className="mt-2 flex items-center justify-between gap-1 border-t border-white/[0.06] pt-1.5"
          onMouseEnter={() => onPreviewPresetHover?.(null)}
        >
          <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Orden</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={syncStepsWithCanvas}
              className="rounded-[4px] px-1 py-0.5 text-[8px] font-semibold text-[#f5b91b]/90 hover:bg-white/5 hover:text-[#f5b91b]"
              title={
                selectedStepKeys.length > 0
                  ? "Añade la selección del lienzo al orden y elimina pasos inválidos"
                  : "Elimina pasos cuyos objetos ya no existen en el slide"
              }
            >
              {selectedStepKeys.length > 0 ? "Añadir selección" : "Limpiar inválidos"}
            </button>
            {hasSteps && (
              <button
                type="button"
                onClick={clearAllSteps}
                className="rounded-[4px] px-1 py-0.5 text-[8px] font-semibold text-rose-400/90 hover:bg-white/5 hover:text-rose-300"
                title="Vaciar orden"
              >
                Vaciar
              </button>
            )}
          </div>
        </div>

        {!hasSteps && (
          <div className="py-3 text-center">
            <p className="text-[10px] font-medium leading-snug text-zinc-400">
              Haz clic en elementos del slide para añadir pasos de entrada.
            </p>
            <p className="mt-1.5 text-[9px] leading-snug text-zinc-600">
              Selecciona objetos en el lienzo, elige un preset arriba o pulsa{" "}
              <span className="font-semibold text-zinc-500">Añadir selección</span>.
            </p>
          </div>
        )}

        {hasSteps && (
          <ul
            className="mt-1 flex flex-col gap-0.5"
            role="listbox"
            aria-label="Orden en Play"
            aria-multiselectable="true"
          >
            {steps.map((s, i) => {
              const sk = presenterStepKey(s);
              const isGroupStep = s.kind === "group";
              const sel = selectedSet.has(sk);
              const isDrop = dropTargetKey === sk && draggingKey && draggingKey !== sk;
              return (
                <li
                  key={sk}
                  onDragOver={(e) => onDragOverRow(e, sk)}
                  onDragLeave={onDragLeaveRow}
                  onDrop={(e) => onDropRow(e, sk)}
                  className={`flex items-stretch gap-0 border transition-colors ${
                    isDrop ? "border-[#f5b91b]/50 bg-[#f5b91b]/10" : "border-white/[0.07] bg-white/[0.02]"
                  } ${sel ? "border-[#f5b91b]/40 bg-[#f5b91b]/[0.06]" : ""}`}
                >
                  <div
                    draggable
                    role="button"
                    tabIndex={0}
                    className="flex shrink-0 cursor-grab items-center px-0.5 text-zinc-600 active:cursor-grabbing"
                    title="Arrastrar para reordenar"
                    onDragStart={(e) => onDragStartRow(e, sk)}
                    onDragEnd={onDragEndRow}
                  >
                    <GripVertical size={12} strokeWidth={2} aria-hidden />
                  </div>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left"
                    onClick={(e) => onSelectStepKey(sk, { ctrlKey: e.ctrlKey, metaKey: e.metaKey })}
                  >
                    <span className="w-3 shrink-0 text-[9px] font-bold text-zinc-600">{i + 1}</span>
                    {isGroupStep ? (
                      <Users size={12} className="shrink-0 text-[#f5b91b]/90" aria-hidden />
                    ) : (
                      <Layers size={12} className="shrink-0 text-zinc-500" aria-hidden />
                    )}
                    {isGroupStep && (
                      <span className="shrink-0 rounded-[3px] border border-[#f5b91b]/35 bg-[#f5b91b]/15 px-0.5 py-px text-[6px] font-bold uppercase text-[#f5b91b]">
                        Grupo
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[9px] font-medium text-zinc-200" title={sk}>
                      {rowLabel(s, objects)}
                    </span>
                    <Sparkles size={10} className="shrink-0 text-[#f5b91b]/70" aria-hidden />
                    <span className="max-w-[36px] shrink-0 truncate text-[7px] text-zinc-500">{s.enter}</span>
                  </button>
                  <button
                    type="button"
                    title={
                      isGroupStep
                        ? "Quitar animación y desagrupar objetos en el slide"
                        : "Quitar del orden"
                    }
                    className="shrink-0 px-1 text-zinc-600 hover:bg-rose-500/15 hover:text-rose-300"
                    onClick={() => removeStep(sk)}
                  >
                    <Trash2 size={11} className="mx-auto" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
