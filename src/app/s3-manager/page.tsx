"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FolderOpen,
  HardDrive,
  RefreshCcw,
  Trash2,
  Unlink,
} from "lucide-react";

type S3FileItem = {
  key: string;
  name: string;
  folder: string;
  type: string;
  size: number;
  lastModified: string | null;
  spaceId: string | null;
  projectIds: string[];
  projectNames: string[];
  orphan: boolean;
};

type ProjectItem = {
  id: string;
  name: string;
  updatedAt: string;
  fileCount: number;
  totalBytes: number;
};

type InventoryResponse = {
  files: S3FileItem[];
  projects: ProjectItem[];
  summary: {
    totalFiles: number;
    totalBytes: number;
    orphanFiles: number;
    orphanBytes: number;
  };
  generatedAt: string;
};

type DeletePlan = {
  keys: string[];
  totalBytes: number;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function FileTable({
  files,
  selected,
  setSelected,
  onDeleteOne,
}: {
  files: S3FileItem[];
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  onDeleteOne: (file: S3FileItem) => void;
}) {
  const allSelected = files.length > 0 && files.every((f) => selected.has(f.key));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) {
      for (const file of files) next.delete(file.key);
    } else {
      for (const file of files) next.add(file.key);
    }
    setSelected(next);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/[0.03] text-[11px] tracking-[0.08em] text-white/55 uppercase">
          <tr>
            <th className="w-10 px-3 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Seleccionar todos"
              />
            </th>
            <th className="px-3 py-3">Nombre</th>
            <th className="px-3 py-3">Carpeta</th>
            <th className="px-3 py-3">Tipo</th>
            <th className="px-3 py-3">Tamaño</th>
            <th className="px-3 py-3">Fecha</th>
            <th className="px-3 py-3">Proyecto</th>
            <th className="w-24 px-3 py-3 text-right">Acción</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr
              key={file.key}
              className="border-t border-white/6 text-white/82 hover:bg-white/[0.02]"
            >
              <td className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(file.key)}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(file.key)) next.delete(file.key);
                    else next.add(file.key);
                    setSelected(next);
                  }}
                  aria-label={`Seleccionar ${file.name}`}
                />
              </td>
              <td className="max-w-[260px] px-3 py-3 text-xs sm:text-sm">
                <p className="truncate font-medium text-white">{file.name}</p>
                <p className="truncate text-[11px] text-white/42">{file.key}</p>
              </td>
              <td className="max-w-[220px] px-3 py-3 text-xs text-white/70">
                <span className="block truncate">{file.folder}</span>
              </td>
              <td className="px-3 py-3 text-xs">{file.type}</td>
              <td className="px-3 py-3 text-xs">{formatBytes(file.size)}</td>
              <td className="px-3 py-3 text-xs">{formatDate(file.lastModified)}</td>
              <td className="px-3 py-3 text-xs">
                {file.orphan ? (
                  <span className="rounded-md border border-amber-400/35 bg-amber-400/10 px-2 py-0.5 text-amber-200">
                    Orphan
                  </span>
                ) : (
                  <span className="text-white/72">
                    {file.projectNames.join(", ")}
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onDeleteOne(file)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1 text-xs text-red-200 transition hover:bg-red-400/18"
                >
                  <Trash2 size={12} />
                  Borrar
                </button>
              </td>
            </tr>
          ))}
          {files.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-sm text-white/45">
                No hay archivos en esta vista.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function S3ManagerPage() {
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [mode, setMode] = useState<"projects" | "orphans">("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletePlan, setDeletePlan] = useState<DeletePlan | null>(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/spaces/s3-manager", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as InventoryResponse;
      setInventory(data);
      setSelectedProjectId((prev) => {
        if (!prev && data.projects.length > 0) return data.projects[0].id;
        if (prev && !data.projects.find((p) => p.id === prev)) {
          return data.projects[0]?.id ?? null;
        }
        return prev;
      });
      setSelectedKeys(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando inventario");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const filesByCurrentProject = useMemo(() => {
    if (!inventory || !selectedProjectId) return [];
    return inventory.files.filter((f) => f.projectIds.includes(selectedProjectId));
  }, [inventory, selectedProjectId]);

  const orphanFiles = useMemo(() => {
    if (!inventory) return [];
    return inventory.files.filter((f) => f.orphan);
  }, [inventory]);

  const visibleFiles = mode === "projects" ? filesByCurrentProject : orphanFiles;

  const selectedVisibleFiles = visibleFiles.filter((f) => selectedKeys.has(f.key));
  const selectedVisibleBytes = selectedVisibleFiles.reduce((acc, f) => acc + f.size, 0);

  const openDeleteSelected = () => {
    if (selectedVisibleFiles.length === 0) return;
    setDeletePlan({
      keys: selectedVisibleFiles.map((f) => f.key),
      totalBytes: selectedVisibleBytes,
    });
  };

  const openDeleteOne = (file: S3FileItem) => {
    setDeletePlan({
      keys: [file.key],
      totalBytes: file.size,
    });
  };

  const confirmDelete = async () => {
    if (!deletePlan) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/s3-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: deletePlan.keys }),
      });
      const payload = (await res.json()) as { deleted?: number; error?: string };
      if (!res.ok || payload.error) {
        throw new Error(payload.error || "No se pudo eliminar");
      }
      setNotice(
        `Eliminados ${payload.deleted ?? deletePlan.keys.length} archivo(s). Espacio liberado aprox: ${formatBytes(
          deletePlan.totalBytes,
        )}.`,
      );
      setDeletePlan(null);
      setSelectedKeys(new Set());
      await loadInventory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fallo al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const currentProject = inventory?.projects.find((p) => p.id === selectedProjectId) || null;

  return (
    <div className="min-h-screen bg-[#05070d] px-4 py-6 text-white sm:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-[0.14em] text-white/55 uppercase">
                Storage Control
              </p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                Gestor de archivos S3
              </h1>
              <p className="mt-2 text-sm text-white/68">
                Gestor manual protegido. El borrado de objetos queda reservado
                a administración o al borrado completo de un proyecto.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadInventory()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-2 text-sm transition hover:bg-white/[0.08]"
            >
              <RefreshCcw size={14} />
              Recargar inventario
            </button>
          </div>
        </header>

        {inventory ? (
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs text-white/55">Total archivos</p>
              <p className="mt-1 text-2xl font-semibold">{inventory.summary.totalFiles}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs text-white/55">Peso total S3</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatBytes(inventory.summary.totalBytes)}
              </p>
            </div>
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
              <p className="text-xs text-amber-100/70">Archivos sin asignar</p>
              <p className="mt-1 text-2xl font-semibold text-amber-100">
                {inventory.summary.orphanFiles} · {formatBytes(inventory.summary.orphanBytes)}
              </p>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("projects")}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  mode === "projects"
                    ? "border border-[#8f66ff]/45 bg-[#8f66ff]/15 text-white"
                    : "border border-white/15 bg-white/[0.03] text-white/75 hover:bg-white/[0.06]"
                }`}
              >
                <FolderOpen size={14} />
                Vista por proyectos
              </button>
              <button
                type="button"
                onClick={() => setMode("orphans")}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  mode === "orphans"
                    ? "border border-amber-300/35 bg-amber-300/10 text-amber-100"
                    : "border border-white/15 bg-white/[0.03] text-white/75 hover:bg-white/[0.06]"
                }`}
              >
                <Unlink size={14} />
                Archivos sin asignar
              </button>
            </div>

            <button
              type="button"
              onClick={openDeleteSelected}
              disabled={selectedVisibleFiles.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-red-400/35 bg-red-400/10 px-3 py-2 text-sm text-red-200 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Trash2 size={14} />
              Eliminar seleccionados ({selectedVisibleFiles.length})
            </button>
          </div>

          {mode === "projects" ? (
            <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
              <aside className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 text-xs tracking-[0.1em] text-white/48 uppercase">
                  Proyectos
                </p>
                <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                  {inventory?.projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setSelectedKeys(new Set());
                      }}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        selectedProjectId === project.id
                          ? "border-[#8f66ff]/45 bg-[#8f66ff]/14"
                          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                    >
                      <p className="truncate text-sm font-medium text-white">{project.name}</p>
                      <p className="mt-1 text-xs text-white/58">
                        {project.fileCount} archivos · {formatBytes(project.totalBytes)}
                      </p>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-xs text-white/55">
                    Proyecto activo
                    {currentProject
                      ? `: ${currentProject.name} · ${filesByCurrentProject.length} archivos`
                      : ": —"}
                  </p>
                </div>
                <FileTable
                  files={filesByCurrentProject}
                  selected={selectedKeys}
                  setSelected={setSelectedKeys}
                  onDeleteOne={openDeleteOne}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-sm text-amber-100/90">
                <span className="font-medium">Archivos sin asignar / Orphan files:</span>{" "}
                estos objetos no están vinculados a ningún proyecto detectado.
              </div>
              <FileTable
                files={orphanFiles}
                selected={selectedKeys}
                setSelected={setSelectedKeys}
                onDeleteOne={openDeleteOne}
              />
            </div>
          )}
        </section>

        {loading ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/65">
            Cargando inventario S3...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            {notice}
          </div>
        ) : null}
      </div>

      {deletePlan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0c1018] p-5">
            <div className="flex items-center gap-2 text-red-200">
              <AlertTriangle size={16} />
              <p className="text-sm font-semibold">Confirmar eliminación</p>
            </div>
            <p className="mt-3 text-sm text-white/80">
              Vas a eliminar <strong>{deletePlan.keys.length}</strong> archivo(s).
              Espacio estimado a liberar:{" "}
              <strong>{formatBytes(deletePlan.totalBytes)}</strong>.
            </p>
            <p className="mt-2 text-xs text-white/45">
              Esta acción elimina objetos en S3 de forma permanente.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletePlan(null)}
                className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/75 transition hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg border border-red-400/35 bg-red-400/14 px-3 py-2 text-sm text-red-200 transition hover:bg-red-400/22 disabled:opacity-50"
              >
                <HardDrive size={14} />
                {deleting ? "Eliminando..." : "Eliminar ahora"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
