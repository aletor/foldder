"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Unlink2 } from "lucide-react";
import type { Dataset, DesignerDatasetPropertyBinding } from "@/app/spaces/dataset/dataset-types";
import { filterDatasetFieldsForProperty } from "./designer-dataset-property";

type DesignerDatasetPropertyLinkProps = {
  propertyKey: string;
  dataset: Dataset;
  binding?: DesignerDatasetPropertyBinding;
  onBind: (binding: DesignerDatasetPropertyBinding | null) => void;
};

export function DesignerDatasetPropertyLink({
  propertyKey,
  dataset,
  binding,
  onBind,
}: DesignerDatasetPropertyLinkProps) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"list" | "constant">(binding?.source ?? "list");
  const [listId, setListId] = useState(binding?.listId ?? "");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSource(binding?.source ?? "list");
    setListId(binding?.listId ?? "");
  }, [binding?.source, binding?.listId, binding?.fieldId]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const listFields = useMemo(() => {
    if (!listId) return [];
    const list = dataset.lists.find((row) => row.id === listId);
    return filterDatasetFieldsForProperty(list?.schema ?? [], propertyKey);
  }, [dataset.lists, listId, propertyKey]);

  const constantFields = useMemo(
    () => filterDatasetFieldsForProperty(dataset.constants.fields, propertyKey),
    [dataset.constants.fields, propertyKey],
  );

  const active = !!binding;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        title={active ? "Desenlazar del Dataset" : "Enlazar al Dataset"}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (active) {
            onBind(null);
            setOpen(false);
            return;
          }
          setOpen((v) => !v);
        }}
        className={`rounded-[4px] border p-0.5 transition-colors ${
          active
            ? "border-teal-400/50 bg-teal-500/20 text-teal-200"
            : "border-white/[0.1] text-zinc-500 hover:border-teal-400/35 hover:bg-teal-500/10 hover:text-teal-200/90"
        }`}
      >
        {active ? <Link2 size={11} strokeWidth={2.2} /> : <Unlink2 size={11} strokeWidth={2.2} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[168px] overflow-hidden rounded-[6px] border border-white/[0.12] bg-[#15181e] shadow-xl">
          <div className="flex border-b border-white/[0.08]">
            {(["list", "constant"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSource(tab)}
                className={`flex-1 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                  source === tab
                    ? "bg-teal-500/15 text-teal-100"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                {tab === "list" ? "Listado" : "Compartido"}
              </button>
            ))}
          </div>

          {source === "list" ? (
            <div className="space-y-2 p-2">
              <select
                value={listId}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => setListId(e.target.value)}
                className="nodrag w-full rounded-[5px] border border-white/[0.1] bg-[#1a1e26] px-2 py-1 text-[10px] text-zinc-100"
              >
                <option value="">Listado…</option>
                {dataset.lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
              <select
                disabled={!listId || listFields.length === 0}
                value={binding?.source === "list" && binding.listId === listId ? binding.fieldId : ""}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const fieldId = e.target.value;
                  if (!fieldId || !listId) return;
                  const list = dataset.lists.find((row) => row.id === listId);
                  const field = list?.schema.find((row) => row.id === fieldId);
                  if (!list || !field) return;
                  onBind({
                    propertyKey,
                    source: "list",
                    listId: list.id,
                    listKey: list.key,
                    fieldId: field.id,
                    fieldKey: field.key,
                  });
                  setOpen(false);
                }}
                className="nodrag w-full rounded-[5px] border border-white/[0.1] bg-[#1a1e26] px-2 py-1 text-[10px] text-zinc-100 disabled:opacity-45"
              >
                <option value="">Campo…</option>
                {listFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-2">
              <select
                disabled={constantFields.length === 0}
                value={binding?.source === "constant" ? binding.fieldId : ""}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const fieldId = e.target.value;
                  if (!fieldId) return;
                  const field = dataset.constants.fields.find((row) => row.id === fieldId);
                  if (!field) return;
                  onBind({
                    propertyKey,
                    source: "constant",
                    fieldId: field.id,
                    fieldKey: field.key,
                  });
                  setOpen(false);
                }}
                className="nodrag w-full rounded-[5px] border border-white/[0.1] bg-[#1a1e26] px-2 py-1 text-[10px] text-zinc-100 disabled:opacity-45"
              >
                <option value="">Campo compartido…</option>
                {constantFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
