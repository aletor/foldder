"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { STUDIO_BODY_PORTAL_Z, studioOverlayPointerGuards } from "../../freehand/studio-modal-shell";
import { USER_DEFAULT_GROUP_ID } from "../lightroom-preset-store";
import type { DevelopPresetGroup } from "../lightroom-preset-utils";
import {
  ALL_PRESET_INCLUDES,
  defaultPresetName,
  isPresetIncludesEmpty,
  normalizeIncludeFlags,
  PRESET_INCLUDE_LABELS,
  type PresetIncludeFlags,
  type StoredDevelopPreset,
} from "../lightroom-preset-utils";

export type DevelopPresetSaveModalProps = {
  open: boolean;
  mode: "create" | "update";
  groups: DevelopPresetGroup[];
  existing?: StoredDevelopPreset | null;
  presetCount: number;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    groupId: string;
    newGroupName?: string;
    includes: PresetIncludeFlags;
  }) => void;
};

export function DevelopPresetSaveModal({
  open,
  mode,
  groups,
  existing,
  presetCount,
  onClose,
  onSave,
}: DevelopPresetSaveModalProps) {
  const userGroups = useMemo(() => groups.filter((g) => !g.builtIn), [groups]);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState(USER_DEFAULT_GROUP_ID);
  const [newGroupName, setNewGroupName] = useState("");
  const [includes, setIncludes] = useState<PresetIncludeFlags>({ ...ALL_PRESET_INCLUDES });
  const [createNewGroup, setCreateNewGroup] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? defaultPresetName(presetCount));
    setGroupId(existing?.groupId ?? USER_DEFAULT_GROUP_ID);
    setIncludes(normalizeIncludeFlags(existing?.includes ?? ALL_PRESET_INCLUDES));
    setNewGroupName("");
    setCreateNewGroup(false);
  }, [open, existing, presetCount]);

  const toggleInclude = useCallback((key: keyof PresetIncludeFlags) => {
    setIncludes((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const canSave = name.trim().length > 0 && !isPresetIncludesEmpty(includes) && (!createNewGroup || newGroupName.trim().length > 0);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      groupId: createNewGroup ? "__new__" : groupId,
      newGroupName: createNewGroup ? newGroupName.trim() : undefined,
      includes: { ...includes },
    });
  }, [canSave, createNewGroup, groupId, includes, name, newGroupName, onSave]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="lr-preset-modal-backdrop"
      style={{ zIndex: STUDIO_BODY_PORTAL_Z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lr-preset-modal-title"
      data-foldder-studio-panel
      {...studioOverlayPointerGuards}
    >
      <button type="button" className="lr-preset-modal-backdrop__dim" aria-label="Cerrar" onClick={onClose} />
      <div className="lr-preset-modal nodrag" onClick={(e) => e.stopPropagation()}>
        <header className="lr-preset-modal__head">
          <div>
            <p id="lr-preset-modal-title" className="lr-preset-modal__title">
              {mode === "update" ? "Actualizar preset" : "Crear preset"}
            </p>
            <p className="lr-preset-modal__sub">
              Elige qué ajustes incluir, como en Lightroom Classic.
            </p>
          </div>
          <button type="button" className="lr-preset-modal__close" onClick={onClose} aria-label="Cerrar">
            <X size={14} />
          </button>
        </header>

        <div className="lr-preset-modal__body">
          <label className="lr-preset-modal__field">
            <span>Nombre</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Nombre del preset"
            />
          </label>

          <div className="lr-preset-modal__field">
            <span>Grupo</span>
            <label className="lr-preset-modal__check">
              <input
                type="checkbox"
                checked={createNewGroup}
                onChange={(e) => setCreateNewGroup(e.target.checked)}
              />
              Crear grupo nuevo
            </label>
            {createNewGroup ? (
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Nombre del grupo"
              />
            ) : (
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                {userGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <fieldset className="lr-preset-modal__includes">
            <legend>Ajustes a incluir</legend>
            {(Object.keys(PRESET_INCLUDE_LABELS) as Array<keyof PresetIncludeFlags>).map((key) => (
              <label key={key} className="lr-preset-modal__check">
                <input type="checkbox" checked={includes[key]} onChange={() => toggleInclude(key)} />
                {PRESET_INCLUDE_LABELS[key]}
              </label>
            ))}
          </fieldset>
        </div>

        <footer className="lr-preset-modal__foot">
          <button type="button" className="lightroom-studio__btn lightroom-studio__btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="lightroom-studio__btn lightroom-studio__btn--accent"
            disabled={!canSave}
            onClick={handleSave}
          >
            {mode === "update" ? "Actualizar" : "Crear"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
