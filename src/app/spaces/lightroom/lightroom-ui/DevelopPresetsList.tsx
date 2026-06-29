"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, MoreHorizontal, Plus, Upload } from "lucide-react";
import type { DevelopSettings } from "../lightroom-develop-settings";
import {
  addUserGroup,
  BUILTIN_GROUP_ID,
  deleteUserPreset,
  duplicateUserPreset,
  loadPresetStore,
  savePresetStore,
  upsertUserPreset,
  userPresetCount,
  type PresetStoreState,
} from "../lightroom-preset-store";
import {
  applyPresetToSettings,
  createStoredPreset,
  exportPresetFile,
  parsePresetImportFile,
  updateStoredPreset,
  type StoredDevelopPreset,
} from "../lightroom-preset-utils";
import { DevelopPresetSaveModal } from "./DevelopPresetSaveModal";

const COLLAPSED_KEY = "foldder.lr.presetGroups.collapsed.v1";

function loadCollapsedGroups(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedGroups(collapsed: Set<string>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
}

type ContextMenuState = {
  x: number;
  y: number;
  preset: StoredDevelopPreset;
};

export type DevelopPresetsListProps = {
  disabled?: boolean;
  currentSettings?: DevelopSettings;
  onApply: (settings: DevelopSettings) => void;
};

export function DevelopPresetsList({ disabled, currentSettings, onApply }: DevelopPresetsListProps) {
  const [store, setStore] = useState<PresetStoreState>(() => loadPresetStore());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsedGroups());
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<"create" | "update">("create");
  const [editingPreset, setEditingPreset] = useState<StoredDevelopPreset | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const persist = useCallback((next: PresetStoreState) => {
    setStore(next);
    savePresetStore(next);
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      saveCollapsedGroups(next);
      return next;
    });
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, StoredDevelopPreset[]>();
    for (const g of store.groups) map.set(g.id, []);
    for (const p of store.presets) {
      const list = map.get(p.groupId) ?? [];
      list.push(p);
      map.set(p.groupId, list);
    }
    return store.groups
      .map((g) => ({ group: g, presets: map.get(g.id) ?? [] }))
      .filter((entry) => entry.presets.length > 0 || !entry.group.builtIn);
  }, [store]);

  const openCreate = useCallback(() => {
    setSaveMode("create");
    setEditingPreset(null);
    setSaveOpen(true);
  }, []);

  const openUpdate = useCallback((preset: StoredDevelopPreset) => {
    setSaveMode("update");
    setEditingPreset(preset);
    setSaveOpen(true);
    setContextMenu(null);
  }, []);

  const handleSaveModal = useCallback(
    (payload: { name: string; groupId: string; newGroupName?: string; includes: StoredDevelopPreset["includes"] }) => {
      if (!currentSettings) return;
      let nextStore = store;
      let targetGroupId = payload.groupId;
      if (payload.groupId === "__new__" && payload.newGroupName) {
        nextStore = addUserGroup(store, payload.newGroupName);
        const created = nextStore.groups[nextStore.groups.length - 1];
        targetGroupId = created?.id ?? targetGroupId;
      }
      const preset =
        saveMode === "update" && editingPreset
          ? updateStoredPreset(editingPreset, {
              name: payload.name,
              groupId: targetGroupId,
              settings: currentSettings,
              includes: payload.includes,
            })
          : createStoredPreset({
              name: payload.name,
              groupId: targetGroupId,
              settings: currentSettings,
              includes: payload.includes,
            });
      persist(upsertUserPreset(nextStore, preset));
      setSaveOpen(false);
      setEditingPreset(null);
    },
    [currentSettings, editingPreset, persist, saveMode, store],
  );

  const applyPreset = useCallback(
    (preset: StoredDevelopPreset) => {
      if (!currentSettings) {
        onApply(structuredClone(preset.settings));
        return;
      }
      onApply(applyPresetToSettings(currentSettings, preset));
    },
    [currentSettings, onApply],
  );

  const onContextAction = useCallback(
    (action: "update" | "rename" | "duplicate" | "delete" | "export", preset: StoredDevelopPreset) => {
      setContextMenu(null);
      if (preset.groupId === BUILTIN_GROUP_ID && action !== "export") return;
      switch (action) {
        case "update":
          openUpdate(preset);
          break;
        case "rename": {
          const nextName = window.prompt("Renombrar preset", preset.name);
          if (!nextName?.trim()) return;
          persist(upsertUserPreset(store, updateStoredPreset(preset, { name: nextName.trim() })));
          break;
        }
        case "duplicate":
          persist(duplicateUserPreset(store, preset.id));
          break;
        case "delete": {
          if (!window.confirm(`¿Eliminar el preset «${preset.name}»?`)) return;
          persist(deleteUserPreset(store, preset.id));
          break;
        }
        case "export": {
          const blob = new Blob([JSON.stringify(exportPresetFile(preset), null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${preset.name.replace(/[^\w\-]+/g, "_")}.foldpreset.json`;
          a.click();
          URL.revokeObjectURL(url);
          break;
        }
      }
    },
    [openUpdate, persist, store],
  );

  const onImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = parsePresetImportFile(JSON.parse(text));
        if (!parsed) {
          window.alert("Archivo de preset no válido.");
          return;
        }
        persist(upsertUserPreset(store, parsed));
      } catch {
        window.alert("No se pudo importar el preset.");
      }
    },
    [persist, store],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [contextMenu]);

  return (
    <div className="lr-presets nodrag">
      <div className="lr-presets__head">
        <p className="lightroom-studio__eyebrow">Presets</p>
        <div className="lr-presets__actions">
          <button
            type="button"
            className="lightroom-mask-panel__icon-btn nodrag"
            disabled={disabled || !currentSettings}
            title="Crear preset con ajustes actuales"
            onClick={openCreate}
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            className="lightroom-mask-panel__icon-btn nodrag"
            disabled={disabled}
            title="Importar preset (.foldpreset.json)"
            onClick={() => importRef.current?.click()}
          >
            <Upload size={12} />
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,.foldpreset.json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onImportFile(f);
            }}
          />
        </div>
      </div>

      <div className="lr-presets__groups">
        {grouped.map(({ group, presets }) => {
          const isCollapsed = collapsed.has(group.id);
          return (
            <section key={group.id} className="lr-presets__group">
              <button
                type="button"
                className="lr-presets__group-head"
                onClick={() => toggleGroup(group.id)}
              >
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span>{group.name}</span>
                <span className="lr-presets__group-count">{presets.length}</span>
              </button>
              {!isCollapsed ? (
                <ul className="lr-presets__list">
                  {presets.map((preset) => (
                    <li key={preset.id}>
                      <button
                        type="button"
                        className="lr-presets__item"
                        disabled={disabled}
                        onClick={() => applyPreset(preset)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, preset });
                        }}
                        title={preset.name}
                      >
                        <span className="lr-presets__thumb" style={{ background: preset.thumb }} />
                        <span className="lr-presets__name">{preset.name}</span>
                        {preset.groupId !== BUILTIN_GROUP_ID ? (
                          <span
                            className="lr-presets__menu-hit"
                            onClick={(e) => {
                              e.stopPropagation();
                              setContextMenu({ x: e.clientX, y: e.clientY, preset });
                            }}
                          >
                            <MoreHorizontal size={12} />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>

      {contextMenu ? (
        <div
          ref={menuRef}
          className="lr-presets__context nodrag"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          <button type="button" onClick={() => applyPreset(contextMenu.preset)}>
            Aplicar
          </button>
          {contextMenu.preset.groupId !== BUILTIN_GROUP_ID ? (
            <>
              <button type="button" onClick={() => onContextAction("update", contextMenu.preset)}>
                Actualizar con ajustes actuales…
              </button>
              <button type="button" onClick={() => onContextAction("rename", contextMenu.preset)}>
                Renombrar
              </button>
              <button type="button" onClick={() => onContextAction("duplicate", contextMenu.preset)}>
                Duplicar
              </button>
              <button type="button" onClick={() => onContextAction("export", contextMenu.preset)}>
                <Download size={11} /> Exportar
              </button>
              <button type="button" className="is-danger" onClick={() => onContextAction("delete", contextMenu.preset)}>
                Eliminar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => onContextAction("export", contextMenu.preset)}>
              <Download size={11} /> Exportar
            </button>
          )}
        </div>
      ) : null}

      {currentSettings ? (
        <DevelopPresetSaveModal
          open={saveOpen}
          mode={saveMode}
          groups={store.groups}
          existing={editingPreset}
          presetCount={userPresetCount(store)}
          onClose={() => {
            setSaveOpen(false);
            setEditingPreset(null);
          }}
          onSave={handleSaveModal}
        />
      ) : null}
    </div>
  );
}
