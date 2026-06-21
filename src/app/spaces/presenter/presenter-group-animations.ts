/**
 * Pasos de aparición en Presenter: por **grupo** o por **objeto** (texto, imagen, etc.).
 * Cada paso tiene una animación de entrada.
 */

import type { FreehandObject } from "../FreehandStudio";

/** Debe coincidir con la duración en `globals.css` (`.presenter-g-fade`, `.presenter-g-slide-*`, etc.). */
export const PRESENTER_GROUP_ENTER_ANIM_MS = 2000;

export type PresenterGroupEnterId =
  | "none"
  | "instant"
  | "fadeIn"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "grow"
  | "shrink";

export type PresenterGroupExitId =
  | "none"
  | "instant"
  | "fadeOut"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "grow"
  | "shrink";

export type PresenterRevealStep =
  | {
      kind: "group";
      groupId: string;
      enter: PresenterGroupEnterId;
      exit?: PresenterGroupExitId;
    }
  | {
      kind: "object";
      objectId: string;
      enter: PresenterGroupEnterId;
      exit?: PresenterGroupExitId;
    };

/** Alias histórico (persistido en `presenterGroupSteps`). */
export type PresenterGroupStep = PresenterRevealStep;

export const PRESENTER_GROUP_ENTER_OPTIONS: { id: PresenterGroupEnterId; label: string }[] = [
  { id: "none", label: "Ninguna" },
  { id: "instant", label: "Instantánea" },
  { id: "fadeIn", label: "Fundido" },
  { id: "slideUp", label: "Subir" },
  { id: "slideDown", label: "Bajar" },
  { id: "slideRight", label: "Desde der." },
  { id: "slideLeft", label: "Desde izq." },
  { id: "grow", label: "Crecer" },
  { id: "shrink", label: "Encoger" },
];

/** Clave estable para un paso (panel, selección, animación al revelar). */
export function presenterStepKey(s: PresenterRevealStep): string {
  return s.kind === "group" ? `group:${s.groupId}` : `object:${s.objectId}`;
}

/** Clave de revelado para un objeto del lienzo (coincide con un paso). */
export function revealTargetKey(o: FreehandObject): string {
  if (o.clipMaskId) return `object:${o.clipMaskId}`;
  if (o.isClipMask) return `object:${o.id}`;
  if (o.groupId) return `group:${o.groupId}`;
  return `object:${o.id}`;
}

/** Interpreta una clave `group:…` / `object:…` (p. ej. selección en el slide). */
export function parsePresenterStepKey(key: string): { kind: "group"; groupId: string } | { kind: "object"; objectId: string } | null {
  if (key.startsWith("group:")) return { kind: "group", groupId: key.slice(6) };
  if (key.startsWith("object:")) return { kind: "object", objectId: key.slice(7) };
  return null;
}

function stepStillValidOnPage(step: PresenterRevealStep, objects: FreehandObject[]): boolean {
  if (step.kind === "group") {
    return objects.some((o) => o.groupId === step.groupId);
  }
  return objects.some((o) => o.id === step.objectId);
}

/**
 * Lista de pasos **solo los definidos por el usuario** en `presenterGroupSteps`.
 * No genera pasos por cada objeto del lienzo: lo que no esté aquí se considera siempre visible en Play.
 * Elimina pasos cuyo grupo u objeto ya no exista en la página.
 */
export function mergeStepsWithPage(page: {
  objects: FreehandObject[];
  presenterGroupSteps?: PresenterRevealStep[];
}): PresenterRevealStep[] {
  const prevRaw = page.presenterGroupSteps ?? [];
  const prev = prevRaw.map(normalizeStoredStep).filter((x): x is PresenterRevealStep => x !== null);
  const objects = page.objects ?? [];
  return prev.filter((s) => stepStillValidOnPage(s, objects));
}

/** @deprecated Ya no se rellenan pasos automáticamente para todo el lienzo. */
export function collectCanonicalSteps(objects: FreehandObject[]): PresenterRevealStep[] {
  const seenGroups = new Set<string>();
  const out: PresenterRevealStep[] = [];
  for (const o of objects) {
    if (o.visible === false) continue;
    if (o.clipMaskId) continue;
    if (o.isClipMask) {
      out.push({ kind: "object", objectId: o.id, enter: "fadeIn", exit: "none" });
      continue;
    }
    if (o.groupId) {
      if (!seenGroups.has(o.groupId)) {
        seenGroups.add(o.groupId);
        out.push({ kind: "group", groupId: o.groupId, enter: "fadeIn", exit: "none" });
      }
    } else {
      out.push({ kind: "object", objectId: o.id, enter: "fadeIn", exit: "none" });
    }
  }
  return out;
}

function normalizeStoredStep(raw: unknown): PresenterRevealStep | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const enter = (p.enter as PresenterGroupEnterId) ?? "fadeIn";
  const exit = p.exit as PresenterGroupExitId | undefined;
  if (p.kind === "group" && typeof p.groupId === "string") {
    return { kind: "group", groupId: p.groupId, enter, exit };
  }
  if (p.kind === "object" && typeof p.objectId === "string") {
    return { kind: "object", objectId: p.objectId, enter, exit };
  }
  /** JSON antiguo: solo `groupId`. */
  if (typeof p.groupId === "string" && !p.kind) {
    return { kind: "group", groupId: p.groupId, enter, exit };
  }
  return null;
}

export function buildDefaultStepsFromGroups(groupIds: string[]): PresenterRevealStep[] {
  return groupIds.map((groupId) => ({
    kind: "group" as const,
    groupId,
    enter: "fadeIn" as const,
    exit: "none" as const,
  }));
}

/** ¿El objeto debe pintarse en este paso de reveal? */
export function isObjectRevealed(o: FreehandObject, revealCount: number, steps: PresenterRevealStep[]): boolean {
  if (!steps.length) return true;
  const k = revealTargetKey(o);
  const idx = steps.findIndex((s) => presenterStepKey(s) === k);
  if (idx === -1) return true;
  return idx < revealCount;
}

/** @deprecated usar isObjectRevealed */
export function isGroupRevealed(
  groupId: string | undefined,
  revealCount: number,
  steps: PresenterRevealStep[],
): boolean {
  if (!groupId) return true;
  if (!steps.length) return true;
  const idx = steps.findIndex((s) => s.kind === "group" && s.groupId === groupId);
  if (idx === -1) return true;
  return idx < revealCount;
}

export function getEnterForObject(o: FreehandObject, steps: PresenterRevealStep[]): PresenterGroupEnterId {
  const k = revealTargetKey(o);
  const s = steps.find((x) => presenterStepKey(x) === k);
  return s?.enter ?? "instant";
}

/** @deprecated usar getEnterForObject */
export function getEnterForGroup(groupId: string | undefined, steps: PresenterRevealStep[]): PresenterGroupEnterId {
  if (!groupId) return "instant";
  const s = steps.find((x) => x.kind === "group" && x.groupId === groupId);
  return s?.enter ?? "fadeIn";
}
