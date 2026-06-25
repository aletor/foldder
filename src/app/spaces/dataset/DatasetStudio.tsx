"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, MoreHorizontal, Plus, X } from "lucide-react";
import type { Dataset, DatasetList, FieldDef, FieldValue, Gap } from "./dataset-types";
import {
  addCard,
  addConstantField,
  addField,
  addList,
  cellHasGap,
  duplicateCard,
  emptyValueForType,
  normalizeDataset,
  removeCard,
  removeConstantField,
  removeField,
  removeList,
  renameList,
  setConstant,
  setScope,
  updateCard,
  updateConstantField,
  updateField,
  validate,
  validateList,
} from "./dataset-logic";
import { FieldEditor } from "./dataset-field-editor";
import { DatasetImageCell, DatasetImageUploadProvider, DatasetVideoCell } from "./dataset-image-cell";
import type { DatasetListItem } from "./dataset-api";
import { listGlobalDatasets } from "./dataset-api";
import {
  FoldderStudioHeader,
  foldderStudioHeaderActionClassName,
} from "../FoldderStudioHeader";
import {
  DATASET_STUDIO_ACCENT,
  DatasetColumnsToggle,
  DatasetSheetTabBar,
  DatasetStudioMetricsBar,
  DatasetStudioNoticeBar,
} from "./DatasetStudioChrome";
import {
  datasetScopeConfirmTitle,
  datasetScopeMenuActionLabel,
  datasetScopeMetricLabel,
  datasetScopeSuccessNotice,
} from "./dataset-scope-copy";
import { exportDatasetFolddataFile, FOLDDER_FOLDDATA_EXTENSION } from "./dataset-folddata";

export const SHARED_SHEET_ID = "__shared__";

type DatasetStudioProps = {
  dataset: Dataset;
  consumerCount?: number;
  remoteVersion?: number | null;
  saveError?: string | null;
  isGlobalRef?: boolean;
  /** Id de proyecto para subir a S3 las imágenes añadidas (evita data URLs en el documento). */
  projectScopeId?: string | null;
  onChange: (next: Dataset) => void;
  onScopeChange?: (
    next: Dataset,
    direction: "promote" | "demote",
  ) => Promise<{ ok: boolean; dataset: Dataset; reason?: string }>;
  onSelectGlobalDataset?: (item: DatasetListItem) => void;
  onCreateNewLocal?: () => void;
  onRequestImportFolddata?: () => void;
  onClose: () => void;
};

type ScopeConfirmDirection = "promote" | "demote";

export function DatasetStudio({
  dataset: rawDataset,
  consumerCount = 0,
  remoteVersion = null,
  saveError = null,
  onChange,
  onScopeChange,
  onSelectGlobalDataset,
  onCreateNewLocal,
  onRequestImportFolddata,
  onClose,
  projectScopeId = null,
}: DatasetStudioProps) {
  const dataset = useMemo(() => normalizeDataset(rawDataset), [rawDataset]);
  const [activeSheetId, setActiveSheetId] = useState(dataset.lists[0]?.id ?? SHARED_SHEET_ID);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [addingTab, setAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [scopeConfirm, setScopeConfirm] = useState<ScopeConfirmDirection | null>(null);
  const [scopeBusy, setScopeBusy] = useState(false);
  const [scopeNotice, setScopeNotice] = useState<string | null>(null);
  const [scopeNoticeKind, setScopeNoticeKind] = useState<"success" | "error">("error");
  const [changeSourceOpen, setChangeSourceOpen] = useState(false);
  const [globalRows, setGlobalRows] = useState<DatasetListItem[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);

  const isShared = activeSheetId === SHARED_SHEET_ID;
  const activeList = dataset.lists.find((l) => l.id === activeSheetId);

  useEffect(() => {
    if (isShared) return;
    if (dataset.lists.some((l) => l.id === activeSheetId)) return;
    setActiveSheetId(dataset.lists[0]?.id ?? SHARED_SHEET_ID);
  }, [activeSheetId, dataset.lists, isShared]);

  const validation = useMemo(() => validate(dataset), [dataset]);
  const listValidation = useMemo(
    () => (activeList ? validateList(dataset, activeList.id) : { complete: true, gaps: [] as Gap[] }),
    [activeList, dataset],
  );
  const gaps = isShared ? validation.gaps.filter((g) => g.listId == null) : listValidation.gaps;

  const apply = useCallback((next: Dataset) => onChange(next), [onChange]);
  const versionStale = remoteVersion != null && remoteVersion > dataset.version;

  const showScopeNotice = useCallback((message: string, kind: "success" | "error") => {
    setScopeNoticeKind(kind);
    setScopeNotice(message);
    window.setTimeout(() => setScopeNotice(null), 4000);
  }, []);

  const closeHeaderMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuAnchor(null);
  }, []);

  const toggleHeaderMenu = useCallback(() => {
    setMenuOpen((open) => {
      const next = !open;
      if (next && menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect();
        setMenuAnchor({
          top: rect.bottom,
          right: Math.max(8, window.innerWidth - rect.right),
        });
      } else {
        setMenuAnchor(null);
      }
      return next;
    });
  }, []);

  const openChangeSource = useCallback(() => {
    closeHeaderMenu();
    setChangeSourceOpen(true);
    setGlobalLoading(true);
    void listGlobalDatasets()
      .then(setGlobalRows)
      .catch(() => setGlobalRows([]))
      .finally(() => setGlobalLoading(false));
  }, [closeHeaderMenu]);

  const runExportFolddata = useCallback(async () => {
    closeHeaderMenu();
    setExportBusy(true);
    try {
      await exportDatasetFolddataFile({ dataset });
      showScopeNotice(
        `Snapshot exportado (${FOLDDER_FOLDDATA_EXTENSION}). Es independiente del Dataset vivo en tu cuenta.`,
        "success",
      );
    } catch (error) {
      showScopeNotice(
        error instanceof Error ? error.message : "No se pudo exportar el Dataset",
        "error",
      );
    } finally {
      setExportBusy(false);
    }
  }, [closeHeaderMenu, dataset, showScopeNotice]);

  const runScopeChange = useCallback(
    async (direction: ScopeConfirmDirection) => {
      if (onScopeChange) {
        setScopeBusy(true);
        try {
          const result = await onScopeChange(dataset, direction);
          if (!result.ok) {
            showScopeNotice(result.reason ?? "No se pudo cambiar.", "error");
            return;
          }
          showScopeNotice(
            datasetScopeSuccessNotice(direction),
            "success",
          );
        } finally {
          setScopeBusy(false);
          setScopeConfirm(null);
          closeHeaderMenu();
        }
        return;
      }
      const target = direction === "promote" ? "global" : "local";
      const result = setScope(dataset, target, { consumerCount, projectId: dataset.projectId });
      if (!result.ok) {
        showScopeNotice(result.reason ?? "No se pudo cambiar.", "error");
        setScopeConfirm(null);
        return;
      }
      showScopeNotice(datasetScopeSuccessNotice(direction), "success");
      apply(result.dataset);
      setScopeConfirm(null);
      closeHeaderMenu();
    },
    [apply, closeHeaderMenu, consumerCount, dataset, onScopeChange, showScopeNotice],
  );

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHeaderMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeHeaderMenu, menuOpen]);

  const confirmNewTab = useCallback(() => {
    const name = newTabName.trim();
    setAddingTab(false);
    setNewTabName("");
    if (!name) return;
    const next = addList(dataset, name);
    apply(next);
    setActiveSheetId(next.lists[next.lists.length - 1]?.id ?? "");
  }, [apply, dataset, newTabName]);

  const totalRows = dataset.lists.reduce((s, l) => s + l.cards.length, 0);
  const scopeLabel = datasetScopeMetricLabel(dataset.scope);

  return (
    <DatasetImageUploadProvider projectId={projectScopeId}>
    <div
      className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14] text-white"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-studio-flush
      data-foldder-dataset-studio
      role="dialog"
      aria-modal="true"
      aria-label="Dataset studio"
      style={{ ["--foldder-studio-accent" as string]: DATASET_STUDIO_ACCENT }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <FoldderStudioHeader
        nodeType="dataset"
        nodeLabel={dataset.name.trim() || "Dataset"}
        subtitle="Fuente de datos para piezas"
        onClose={onClose}
        titleSlot={
          <input
            value={dataset.name}
            onChange={(e) => apply({ ...dataset, name: e.target.value, updatedAt: new Date().toISOString() })}
            className="w-full min-w-0 max-w-[min(320px,40vw)] bg-transparent text-[11px] font-black uppercase tracking-[0.1em] text-white outline-none placeholder:text-white/35"
            placeholder="Dataset"
          />
        }
        actions={
          <>
            <DatasetColumnsToggle active={columnsOpen} onClick={() => setColumnsOpen((v) => !v)} />
            <button
              type="button"
              onClick={() => setStatusOpen((v) => !v)}
              className={foldderStudioHeaderActionClassName(
                validation.complete ? "text-emerald-200 hover:text-white" : "text-amber-200 hover:text-white",
              )}
            >
              {validation.complete ? "Listo" : `${validation.gaps.length} vacíos`}
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={toggleHeaderMenu}
              className={foldderStudioHeaderActionClassName(menuOpen ? "bg-black/45 text-white" : "")}
              aria-label="Más opciones"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <MoreHorizontal size={14} strokeWidth={2.25} />
            </button>
          </>
        }
      />

      {menuOpen && menuAnchor && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[100095]" onClick={closeHeaderMenu} aria-hidden />
              <div
                role="menu"
                data-foldder-studio-flush
                data-foldder-dataset-studio
                style={{
                  top: menuAnchor.top,
                  right: menuAnchor.right,
                  ["--foldder-studio-accent" as string]: DATASET_STUDIO_ACCENT,
                }}
                className="fixed z-[100096] w-52 border border-white/10 bg-[#0b0f14] py-px shadow-xl"
              >
                <button
                  type="button"
                  disabled={scopeBusy || exportBusy}
                  onClick={() => {
                    closeHeaderMenu();
                    setScopeConfirm(dataset.scope === "global" ? "demote" : "promote");
                  }}
                  className="flex w-full px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.08em] text-white/75 hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {datasetScopeMenuActionLabel(dataset.scope)}
                </button>
                <button
                  type="button"
                  disabled={exportBusy}
                  onClick={() => void runExportFolddata()}
                  className="flex w-full border-t border-white/10 px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.08em] text-white/75 hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {exportBusy ? "Exportando…" : `Exportar ${FOLDDER_FOLDDATA_EXTENSION}`}
                </button>
                {onRequestImportFolddata ? (
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => {
                      closeHeaderMenu();
                      onRequestImportFolddata();
                    }}
                    className="flex w-full border-t border-white/10 px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.08em] text-white/75 hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    {`Importar ${FOLDDER_FOLDDATA_EXTENSION}`}
                  </button>
                ) : null}
                {onSelectGlobalDataset ? (
                  <button
                    type="button"
                    onClick={openChangeSource}
                    className="flex w-full border-t border-white/10 px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.08em] text-white/75 hover:bg-white/[0.06]"
                  >
                    Cambiar origen
                  </button>
                ) : null}
                {onCreateNewLocal ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeHeaderMenu();
                      onCreateNewLocal();
                    }}
                    className="flex w-full border-t border-white/10 px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.08em] text-white/45 hover:bg-white/[0.06]"
                  >
                    Nuevo vacío
                  </button>
                ) : null}
              </div>
            </>,
            document.body,
          )
        : null}

      <DatasetSheetTabBar
        lists={dataset.lists}
        activeSheetId={activeSheetId}
        sharedSheetId={SHARED_SHEET_ID}
        isShared={isShared}
        addingTab={addingTab}
        newTabName={newTabName}
        onSelectList={(id) => {
          setActiveSheetId(id);
          setColumnsOpen(false);
        }}
        onSelectShared={() => {
          setActiveSheetId(SHARED_SHEET_ID);
          setColumnsOpen(true);
        }}
        onStartAddTab={() => setAddingTab(true)}
        onNewTabNameChange={setNewTabName}
        onConfirmNewTab={confirmNewTab}
        onCancelNewTab={() => {
          setAddingTab(false);
          setNewTabName("");
        }}
        sharedFieldCount={dataset.constants.fields.length}
      />

      <DatasetStudioMetricsBar
        rowCount={totalRows}
        tabCount={dataset.lists.length}
        sharedCount={dataset.constants.fields.length}
        complete={validation.complete}
        gapCount={validation.gaps.length}
        scopeLabel={scopeLabel}
        consumerCount={consumerCount}
      />

      {scopeNotice ? (
        <DatasetStudioNoticeBar tone={scopeNoticeKind === "success" ? "accent" : "warn"}>
          {scopeNotice}
        </DatasetStudioNoticeBar>
      ) : null}
      {saveError ? <DatasetStudioNoticeBar tone="error">{saveError}</DatasetStudioNoticeBar> : null}
      {versionStale ? (
        <DatasetStudioNoticeBar tone="warn">
          Actualizado en otro proyecto — tus cambios crearán una versión nueva
        </DatasetStudioNoticeBar>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <main className="custom-scrollbar min-w-0 flex-1 overflow-auto px-4 py-4 md:px-6 md:py-5">
          {isShared ? (
            <SharedSheet dataset={dataset} gaps={gaps} apply={apply} />
          ) : activeList ? (
            activeList.schema.length === 0 ? (
              <EmptySchemaView
                listName={activeList.name}
                onAddColumn={() => setColumnsOpen(true)}
              />
            ) : (
              <DataTable
                dataset={dataset}
                list={activeList}
                gaps={listValidation.gaps}
                apply={apply}
              />
            )
          ) : null}
        </main>

        {columnsOpen ? (
          <ColumnsPanel
            dataset={dataset}
            listId={isShared ? null : activeList?.id ?? null}
            isShared={isShared}
            apply={apply}
            onClose={() => setColumnsOpen(false)}
            onRemoveList={
              !isShared && activeList && dataset.lists.length > 1
                ? () => {
                    const next = removeList(dataset, activeList.id);
                    apply(next);
                    setActiveSheetId(next.lists[0]?.id ?? SHARED_SHEET_ID);
                  }
                : undefined
            }
            onRenameList={
              !isShared && activeList
                ? (name) => apply(renameList(dataset, activeList.id, name))
                : undefined
            }
          />
        ) : null}
      </div>

      {statusOpen ? (
        <StatusDrawer gaps={validation.gaps} complete={validation.complete} onClose={() => setStatusOpen(false)} />
      ) : null}

      {scopeConfirm ? (
        <ScopeConfirmDialog
          direction={scopeConfirm}
          consumerCount={consumerCount}
          busy={scopeBusy}
          onCancel={() => setScopeConfirm(null)}
          onConfirm={() => void runScopeChange(scopeConfirm)}
        />
      ) : null}

      {changeSourceOpen && onSelectGlobalDataset ? (
        <ChangeSourceModal
          rows={globalRows}
          loading={globalLoading}
          currentId={dataset.id}
          onSelect={(item) => {
            onSelectGlobalDataset(item);
            setChangeSourceOpen(false);
          }}
          onClose={() => setChangeSourceOpen(false)}
        />
      ) : null}
    </div>
    </DatasetImageUploadProvider>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptySchemaView({ listName, onAddColumn }: { listName: string; onAddColumn: () => void }) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="max-w-sm text-[13px] text-white/55">
        Define las columnas de <strong className="text-white/85">{listName}</strong>. Cada fila será una pieza en el
        destino.
      </p>
      <button
        type="button"
        onClick={onAddColumn}
        className="bg-[var(--foldder-studio-accent,#14b8a6)] px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-slate-950 hover:brightness-110"
      >
        Añadir primera columna
      </button>
    </div>
  );
}

// ── Data table ──────────────────────────────────────────────────────────────

function DataTable({
  dataset,
  list,
  gaps,
  apply,
}: {
  dataset: Dataset;
  list: DatasetList;
  gaps: Gap[];
  apply: (next: Dataset) => void;
}) {
  return (
    <div>
      <div className="overflow-x-auto border border-white/10">
        <table className="w-full min-w-[480px] border-collapse text-[12px]">
          <thead>
            <tr className="bg-black/30">
              <th className="sticky left-0 z-10 w-11 border-b border-r border-white/10 px-2 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.08em] text-white/45">
                #
              </th>
              {list.schema.map((field) => (
                <th
                  key={field.id}
                  className="min-w-[140px] border-b border-white/10 px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.08em] text-white/55"
                >
                  {field.label}
                  {field.required ? <span className="ml-0.5 text-rose-400/80">*</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.cards.map((card, idx) => (
              <tr key={card.id} className="group border-b border-white/[0.06] hover:bg-white/[0.03]">
                <td className="sticky left-0 z-10 border-r border-white/10 bg-[#0b0f14] px-2 py-1 text-center tabular-nums text-white/40 group-hover:bg-[#0d1218]">
                  <span className="group-hover:hidden">{idx + 1}</span>
                  <span className="hidden items-center justify-center gap-1 group-hover:flex">
                    <button
                      type="button"
                      onClick={() => apply(duplicateCard(dataset, list.id, card.id))}
                      className="text-white/40 hover:text-[var(--foldder-studio-accent,#14b8a6)]"
                      title="Duplicar fila"
                    >
                      ⎘
                    </button>
                    <button
                      type="button"
                      onClick={() => apply(removeCard(dataset, list.id, card.id))}
                      className="text-white/40 hover:text-rose-400"
                      title="Eliminar fila"
                    >
                      ✕
                    </button>
                  </span>
                </td>
                {list.schema.map((field) => {
                  const gap = cellHasGap(gaps, list.id, card.id, field.id);
                  return (
                    <td
                      key={field.id}
                      className={`px-1 py-1 ${gap ? "bg-amber-400/[0.04] ring-1 ring-inset ring-amber-400/25" : ""}`}
                    >
                      <CellEditor
                        field={field}
                        value={card.values[field.id] ?? emptyValueForType(field.type, field.options)}
                        onChange={(value) => apply(updateCard(dataset, list.id, card.id, { [field.id]: value }))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => apply(addCard(dataset, list.id))}
        className="mt-3 flex w-full items-center justify-center gap-2 border border-dashed border-white/15 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-white/45 transition hover:border-[var(--foldder-studio-accent,#14b8a6)]/50 hover:text-[var(--foldder-studio-accent,#14b8a6)]"
      >
        + Añadir fila
      </button>
    </div>
  );
}

// ── Shared sheet ────────────────────────────────────────────────────────────

function SharedSheet({
  dataset,
  gaps,
  apply,
}: {
  dataset: Dataset;
  gaps: Gap[];
  apply: (next: Dataset) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start gap-2 border border-[var(--foldder-studio-accent,#14b8a6)]/20 bg-[var(--foldder-studio-accent,#14b8a6)]/[0.06] px-4 py-3">
        <Link2 size={14} className="mt-0.5 shrink-0 text-[var(--foldder-studio-accent,#14b8a6)]" strokeWidth={2.25} />
        <p className="text-[12px] leading-relaxed text-white/55">
          Valores que se repiten en <strong className="text-white/85">todas las piezas</strong> — logo, color de marca,
          patrocinador…
        </p>
      </div>

      {dataset.constants.fields.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-white/45">
          Aún no hay campos compartidos. Abre <strong className="text-white/65">Columnas</strong> para añadir uno.
        </p>
      ) : (
        <div className="divide-y divide-white/10 border border-white/10">
          {dataset.constants.fields.map((field) => {
            const gap = cellHasGap(gaps, null, null, field.id);
            return (
              <div
                key={field.id}
                className={`flex items-center gap-4 px-4 py-3 ${
                  gap ? "bg-amber-400/[0.04] ring-1 ring-inset ring-amber-400/25" : "bg-black/20"
                }`}
              >
                <span className="min-w-[120px] shrink-0 text-[10px] font-black uppercase tracking-[0.08em] text-white/55">
                  {field.label}
                  {field.required ? <span className="text-rose-400/80">*</span> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <CellEditor
                    field={field}
                    value={dataset.constants.values[field.id] ?? emptyValueForType(field.type, field.options)}
                    onChange={(value) => apply(setConstant(dataset, field.id, value))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Columns panel ───────────────────────────────────────────────────────────

function ColumnsPanel({
  dataset,
  listId,
  isShared,
  apply,
  onClose,
  onRemoveList,
  onRenameList,
}: {
  dataset: Dataset;
  listId: string | null;
  isShared: boolean;
  apply: (next: Dataset) => void;
  onClose: () => void;
  onRemoveList?: () => void;
  onRenameList?: (name: string) => void;
}) {
  const [editingField, setEditingField] = useState<FieldDef | null>(null);
  const [addingField, setAddingField] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const list = listId ? dataset.lists.find((l) => l.id === listId) : null;
  const fields = isShared ? dataset.constants.fields : list?.schema ?? [];

  useEffect(() => {
    if (list) setRenameDraft(list.name);
  }, [list]);

  const handleSaveField = (partial: Pick<FieldDef, "label" | "type"> & Partial<FieldDef>) => {
    if (isShared) {
      if (editingField) {
        apply(updateConstantField(dataset, editingField.id, partial));
      } else {
        apply(addConstantField(dataset, partial));
      }
    } else if (listId) {
      if (editingField) {
        apply(updateField(dataset, listId, editingField.id, partial));
      } else {
        apply(addField(dataset, listId, partial));
      }
    }
    setEditingField(null);
    setAddingField(false);
  };

  const handleDeleteField = (fieldId: string) => {
    if (isShared) apply(removeConstantField(dataset, fieldId));
    else if (listId) apply(removeField(dataset, listId, fieldId));
    setEditingField(null);
  };

  return (
    <>
      <aside className="flex w-[280px] shrink-0 flex-col border-l border-white/10 bg-black/30">
        <div className="flex h-10 items-stretch justify-between border-b border-white/10">
          <h2 className="flex flex-1 items-center px-4 text-[9px] font-black uppercase tracking-[0.08em] text-white/72">
            Columnas
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex w-10 shrink-0 items-center justify-center border-l border-white/10 text-white/45 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={14} strokeWidth={2.25} />
          </button>
        </div>

        {!isShared && list && onRenameList ? (
          <div className="border-b border-white/10 px-4 py-3">
            <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.08em] text-white/40">Pestaña</label>
            <input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => renameDraft.trim() && onRenameList(renameDraft)}
              className="w-full border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] text-white outline-none focus:border-[var(--foldder-studio-accent,#14b8a6)]/50"
            />
            {onRemoveList ? (
              <button
                type="button"
                onClick={onRemoveList}
                className="mt-2 text-[9px] font-black uppercase tracking-[0.08em] text-white/35 hover:text-rose-300"
              >
                Eliminar pestaña
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <ul className="divide-y divide-white/[0.06]">
            {fields.map((field) => (
              <li key={field.id}>
                <button
                  type="button"
                  onClick={() => setEditingField(field)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-white/[0.04]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-white/[0.06] text-[10px] text-white/45">
                    {field.type === "image" ? "🖼" : field.type === "text" ? "Aa" : field.type.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/78">{field.label}</span>
                  {field.required ? <span className="text-[9px] font-black uppercase text-rose-400/70">req</span> : null}
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setAddingField(true)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-white/15 py-3 text-[10px] font-black uppercase tracking-[0.08em] text-white/45 transition hover:border-[var(--foldder-studio-accent,#14b8a6)]/40 hover:text-[var(--foldder-studio-accent,#14b8a6)]"
          >
            <Plus size={13} strokeWidth={2.5} />
            Nueva columna
          </button>
        </div>
      </aside>

      {editingField ? (
        <FieldEditor
          field={editingField}
          onCancel={() => setEditingField(null)}
          onSave={handleSaveField}
          onDelete={() => handleDeleteField(editingField.id)}
        />
      ) : null}
      {addingField ? (
        <FieldEditor onCancel={() => setAddingField(false)} onSave={handleSaveField} />
      ) : null}
    </>
  );
}

// ── Cell editor ─────────────────────────────────────────────────────────────

function CellEditor({
  field,
  value,
  onChange,
  imageCompact,
}: {
  field: FieldDef;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  imageCompact?: boolean;
}) {
  const baseInput =
    "w-full border border-transparent bg-transparent px-2 py-2 text-[12px] text-white/85 outline-none hover:border-white/10 focus:border-[var(--foldder-studio-accent,#14b8a6)]/45";

  switch (field.type) {
    case "number":
      return (
        <input
          type="number"
          value={value.type === "number" ? value.value : 0}
          onChange={(e) => onChange({ type: "number", value: Number(e.target.value) })}
          className={baseInput}
        />
      );
    case "boolean":
      return (
        <label className="flex items-center justify-center py-2">
          <input
            type="checkbox"
            checked={value.type === "boolean" ? value.value : false}
            onChange={(e) => onChange({ type: "boolean", value: e.target.checked })}
            className="h-4 w-4 border-white/20 accent-[var(--foldder-studio-accent,#14b8a6)]"
          />
        </label>
      );
    case "color":
      return (
        <div className="flex items-center gap-2 px-1 py-1">
          <input
            type="color"
            value={value.type === "color" ? value.value || "#000000" : "#000000"}
            onChange={(e) => onChange({ type: "color", value: e.target.value })}
            className="h-8 w-8 cursor-pointer border border-white/10 bg-transparent"
          />
          <input
            value={value.type === "color" ? value.value : ""}
            onChange={(e) => onChange({ type: "color", value: e.target.value })}
            className={baseInput}
            placeholder="#000000"
          />
        </div>
      );
    case "select":
      return (
        <select
          value={value.type === "select" ? value.value : ""}
          onChange={(e) => onChange({ type: "select", value: e.target.value })}
          className={baseInput}
        >
          <option value="" className="bg-[#14181d]">
            —
          </option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt} className="bg-[#14181d]">
              {opt}
            </option>
          ))}
        </select>
      );
    case "url":
      return (
        <input
          type="url"
          value={value.type === "url" ? value.value : ""}
          onChange={(e) => onChange({ type: "url", value: e.target.value })}
          className={baseInput}
          placeholder="https://"
        />
      );
    case "image":
      return <DatasetImageCell value={value} onChange={onChange} compact={imageCompact} />;
    case "video":
      return <DatasetVideoCell value={value} onChange={onChange} />;
    case "text":
    default:
      return (
        <input
          value={value.type === "text" ? value.value : ""}
          onChange={(e) => onChange({ type: "text", value: e.target.value })}
          className={baseInput}
          placeholder="…"
        />
      );
  }
}

// ── Status drawer ───────────────────────────────────────────────────────────

function StatusDrawer({ gaps, complete, onClose }: { gaps: Gap[]; complete: boolean; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />
      <div
        data-foldder-studio-flush
        className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 border border-b-0 border-white/10 bg-[#0b0f14] shadow-[0_-16px_48px_rgba(0,0,0,0.45)]"
      >
        <div className="flex h-10 items-stretch justify-between border-b border-white/10">
          <h3 className="flex flex-1 items-center px-4 text-[9px] font-black uppercase tracking-[0.08em] text-white/72">
            {complete ? "Todo listo" : "Campos vacíos"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex w-10 shrink-0 items-center justify-center border-l border-white/10 text-white/45 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={14} strokeWidth={2.25} />
          </button>
        </div>
        <div className="p-4">
          {complete ? (
            <p className="text-[12px] text-white/55">Todos los campos obligatorios están completos.</p>
          ) : (
            <ul className="max-h-[240px] divide-y divide-white/[0.06] overflow-y-auto border border-white/10">
              {gaps.map((g, i) => (
                <li key={i} className="bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-100/90">
                  {g.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// ── Dialogs ─────────────────────────────────────────────────────────────────

function ScopeConfirmDialog({
  direction,
  consumerCount,
  busy,
  onCancel,
  onConfirm,
}: {
  direction: ScopeConfirmDirection;
  consumerCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isPromote = direction === "promote";
  const demoteBlocked = !isPromote && consumerCount > 1;

  return (
    <div className="fixed inset-0 z-[100091] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        data-foldder-studio-flush
        data-foldder-dataset-studio
        style={{ ["--foldder-studio-accent" as string]: DATASET_STUDIO_ACCENT }}
        className="w-full max-w-md border border-white/10 bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-white/85">
            {datasetScopeConfirmTitle(direction)}
          </h3>
        </div>
        <p className="px-4 py-3 text-[12px] leading-relaxed text-white/55">
          {isPromote ? (
            <>
              Este Dataset pasará a ser <strong className="text-white/85">persistente</strong> en tu cuenta y estará
              disponible en todos tus proyectos. Los cambios se propagan donde esté conectado.
            </>
          ) : demoteBlocked ? (
            <>
              No se puede convertir a local: <strong className="text-white/85">{consumerCount} proyectos</strong> lo
              usan. Desconéctalo antes.
            </>
          ) : (
            <>
              Pasará a ser <strong className="text-white/85">local</strong> de este proyecto y dejará el catálogo
              persistente de tu cuenta.
            </>
          )}
        </p>
        <div className="flex items-stretch border-t border-white/10">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-10 flex-1 items-center justify-center border-r border-white/10 text-[10px] font-black uppercase tracking-[0.08em] text-white/55 hover:bg-white/[0.04]"
          >
            Cancelar
          </button>
          {!demoteBlocked ? (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="flex h-10 flex-1 items-center justify-center bg-[var(--foldder-studio-accent,#14b8a6)] text-[10px] font-black uppercase tracking-[0.08em] text-slate-950 hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Aplicando…" : "Confirmar"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChangeSourceModal({
  rows,
  loading,
  currentId,
  onSelect,
  onClose,
}: {
  rows: DatasetListItem[];
  loading: boolean;
  currentId: string;
  onSelect: (item: DatasetListItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100091] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        data-foldder-studio-flush
        data-foldder-dataset-studio
        style={{ ["--foldder-studio-accent" as string]: DATASET_STUDIO_ACCENT }}
        className="flex max-h-[70vh] w-full max-w-md flex-col border border-white/10 bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-white/10 px-4 py-3">
          <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-white/85">Cambiar origen</h3>
          <p className="mt-1 text-[11px] text-white/45">Elige otro Dataset guardado en tu cuenta.</p>
        </header>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
          {loading ? <p className="px-4 py-3 text-[11px] text-white/45">Cargando…</p> : null}
          {!loading && rows.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-white/45">No hay Datasets guardados.</p>
          ) : null}
          <ul className="divide-y divide-white/[0.06]">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row)}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.04] ${
                    row.id === currentId ? "bg-[var(--foldder-studio-accent,#14b8a6)]/10" : ""
                  }`}
                >
                  <span>
                    <span className="block text-[12px] font-medium text-white/85">{row.name}</span>
                    <span className="text-[10px] text-white/40">
                      {row.listCount ?? 0} pestañas · {row.cardCount} filas
                    </span>
                  </span>
                  {row.id === currentId ? (
                    <span className="text-[var(--foldder-studio-accent,#14b8a6)]">✓</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <footer className="shrink-0 border-t border-white/10">
          <button type="button" onClick={onClose} className="flex h-10 w-full items-center justify-center text-[10px] font-black uppercase tracking-[0.08em] text-white/45 hover:bg-white/[0.04] hover:text-white/75">
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  );
}
