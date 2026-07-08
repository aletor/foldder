"use client";

import React, { useCallback, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { Dataset, FieldDef, FieldValue } from "@/app/spaces/dataset/dataset-types";
import {
  emptyValueForType,
  setConstant,
} from "@/app/spaces/dataset/dataset-logic";
import { DatasetImageCell } from "@/app/spaces/dataset/dataset-image-cell";
import {
  BRANDKIT_DATASET_FIELD_IDS,
  BRANDKIT_DATASET_MAX_GALLERY,
  BRANDKIT_DATASET_MAX_MESSAGES,
  BRANDKIT_GALLERY_CATEGORIES,
  brandKitDatasetConstantId,
  brandKitGalleryListSchema,
  brandKitMessagesListSchema,
  type BrandKitDatasetLink,
} from "./brandkit-dataset-schema";
import { applyBrandKitDatasetEdit, refreshBrandKitDatasetFromAssets } from "./brandkit-dataset-sync";
import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { interpretationStatusLabelEs } from "@/lib/brandkit/brand-board-labels";
import type { BrandKitDatasetRowMeta } from "@/lib/brandkit/dataset-projection";
import type { InterpretationStatus } from "@/lib/brandkit/types";

type BrandTabId =
  | "context"
  | "tone"
  | "messages"
  | "colors"
  | "logos"
  | "images";

const TABS: Array<{ id: BrandTabId; label: string }> = [
  { id: "context", label: "Contexto de marca" },
  { id: "tone", label: "Tono y rasgos" },
  { id: "messages", label: "Mensajes y claims" },
  { id: "colors", label: "Colores" },
  { id: "logos", label: "Logos" },
  { id: "images", label: "Imágenes" },
];

function readFieldText(value: FieldValue): string {
  return value.type === "text" ? value.value : "";
}

function readFieldColor(value: FieldValue): string {
  return value.type === "color" ? value.value : "";
}

function readFieldSelect(value: FieldValue | undefined, fallback: string): string {
  return value?.type === "select" ? value.value : fallback;
}

function constantField(
  dataset: Dataset,
  brainNodeId: string,
  fieldId: keyof typeof BRANDKIT_DATASET_FIELD_IDS,
) {
  const id = brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS[fieldId]);
  const field = dataset.constants.fields.find((f) => f.id === id);
  const value = dataset.constants.values[id] ?? emptyValueForType(field?.type ?? "text", field?.options);
  return { id, field: field ?? { id, key: id, label: id, type: "text" as const, required: false }, value };
}

function TextAreaEditor({
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[96px] w-full resize-y border border-white/10 bg-black/25 px-3 py-2 text-[12px] leading-relaxed text-white/90 outline-none focus:border-[var(--foldder-studio-accent,#14b8a6)]/45"
    />
  );
}

function statusTone(status: InterpretationStatus): string {
  if (status === "validated") return "text-emerald-300/90";
  if (status === "proposed") return "text-amber-300/90";
  if (status === "conflict") return "text-rose-300/90";
  if (status === "rejected") return "text-white/35";
  return "text-white/40";
}

function RowMetaBadge({ meta }: { meta?: BrandKitDatasetRowMeta }) {
  if (!meta) return null;
  return (
    <span className={`text-[9px] font-black uppercase tracking-[0.08em] ${statusTone(meta.status)}`}>
      {interpretationStatusLabelEs(meta.status)}
    </span>
  );
}

function ColorEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-10 cursor-pointer border border-white/10 bg-transparent"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#RRGGBB"
        className="w-full border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-white/90 outline-none focus:border-[var(--foldder-studio-accent,#14b8a6)]/45"
      />
    </div>
  );
}

function ImageFieldRow({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: FieldDef;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  return (
    <div className="border border-white/10 bg-black/20 px-4 py-3">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.08em] text-white/55">{label}</p>
      <DatasetImageCell value={value} onChange={onChange} compact />
    </div>
  );
}

export function BrandKitDatasetPanel({
  dataset,
  link,
  assetsMetadata,
  onApply,
  onOpenBrandKit,
}: {
  dataset: Dataset;
  link: BrandKitDatasetLink;
  assetsMetadata: unknown;
  onApply: (next: { dataset: Dataset; assets: ProjectAssetsMetadata }) => void;
  onOpenBrandKit?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<BrandTabId>("context");
  const brainNodeId = link.brainNodeId;

  const commit = useCallback(
    (nextDataset: Dataset) => {
      const result = applyBrandKitDatasetEdit(nextDataset, link, assetsMetadata);
      onApply({ dataset: result.dataset, assets: result.assets });
    },
    [assetsMetadata, link, onApply],
  );

  const messagesList = useMemo(
    () => dataset.lists.find((l) => l.id === link.messagesListId),
    [dataset.lists, link.messagesListId],
  );
  const galleryList = useMemo(
    () => dataset.lists.find((l) => l.id === link.galleryListId),
    [dataset.lists, link.galleryListId],
  );
  const messageField = brandKitMessagesListSchema()[0]!;
  const gallerySchema = brandKitGalleryListSchema();
  const galleryCategoryField = gallerySchema[0]!;
  const galleryImageField = gallerySchema[1]!;

  const rowMetaSidecar = useMemo(() => {
    const assets = normalizeProjectAssets(assetsMetadata);
    return assets.brainMeta?.brandKitDatasetRowMeta;
  }, [assetsMetadata]);

  const handleRefreshFromBrandKit = useCallback(() => {
    const refreshed = refreshBrandKitDatasetFromAssets(dataset, link, assetsMetadata);
    onApply({ dataset: refreshed.dataset, assets: refreshed.assets });
  }, [assetsMetadata, dataset, link, onApply]);

  const setConstantValue = useCallback(
    (fieldId: keyof typeof BRANDKIT_DATASET_FIELD_IDS, value: FieldValue) => {
      const constantId = brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS[fieldId]);
      commit(setConstant(dataset, constantId, value));
    },
    [brainNodeId, commit, dataset],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-white/80">
            Marca · BrandKit
          </p>
          <p className="text-[11px] text-white/45">Constants editables · listas solo lectura (editar en BrandKit)</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshFromBrandKit}
            className="inline-flex items-center gap-1.5 border border-white/15 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-white/70 hover:bg-white/[0.06] hover:text-white"
          >
            <RefreshCw size={12} />
            Actualizar desde BrandKit
          </button>
          {onOpenBrandKit ? (
            <button
              type="button"
              onClick={onOpenBrandKit}
              className="inline-flex items-center gap-1.5 border border-white/15 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-white/70 hover:bg-white/[0.06] hover:text-white"
            >
              <ExternalLink size={12} />
              Editar en BrandKit
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex shrink-0 divide-x divide-white/10 overflow-x-auto border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] ${
              activeTab === tab.id ? "bg-white text-slate-950" : "text-white/45 hover:bg-white/[0.06] hover:text-white/75"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        {activeTab === "context" ? (
          <TextAreaEditor
            value={readFieldText(constantField(dataset, brainNodeId, "context").value)}
            onChange={(value) => setConstantValue("context", { type: "text", value })}
            rows={6}
            placeholder="Resumen de la marca para usar en piezas…"
          />
        ) : null}

        {activeTab === "tone" ? (
          <TextAreaEditor
            value={readFieldText(constantField(dataset, brainNodeId, "tone").value)}
            onChange={(value) => setConstantValue("tone", { type: "text", value })}
            rows={8}
            placeholder="Un rasgo por línea: cercano, directo, premium…"
          />
        ) : null}

        {activeTab === "messages" ? (
          <div className="space-y-2">
            <p className="text-[10px] text-white/45">
              Solo lectura · edita mensajes en BrandKit · {(messagesList?.cards.length ?? 0)}/
              {BRANDKIT_DATASET_MAX_MESSAGES}
            </p>
            {(messagesList?.cards ?? []).map((card) => (
              <div key={card.id} className="border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <RowMetaBadge meta={rowMetaSidecar?.lists.messages[card.id]} />
                </div>
                <p className="text-[12px] leading-relaxed text-white/90">
                  {readFieldText(card.values[messageField.id] ?? emptyValueForType("text"))}
                </p>
              </div>
            ))}
            {!messagesList?.cards.length ? (
              <p className="text-[11px] text-white/40">Sin mensajes proyectados. Usa «Actualizar desde BrandKit».</p>
            ) : null}
          </div>
        ) : null}

        {activeTab === "colors" ? (
          <div className="grid gap-3 md:grid-cols-3">
            {(["colorPrimary", "colorSecondary", "colorAccent"] as const).map((key) => {
              const { field, value } = constantField(dataset, brainNodeId, key);
              const current = readFieldColor(value);
              const label =
                key === "colorPrimary"
                  ? "Primario"
                  : key === "colorSecondary"
                    ? "Secundario"
                    : "Acento";
              return (
                <div key={key}>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.08em] text-white/55">
                    {label}
                  </p>
                  <ColorEditor
                    value={current}
                    onChange={(next) => setConstantValue(key, { type: "color", value: next })}
                  />
                  <span className="sr-only">{field.label}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {activeTab === "logos" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {(["logoPositive", "logoNegative"] as const).map((key) => {
              const { field, value } = constantField(dataset, brainNodeId, key);
              return (
                <ImageFieldRow
                  key={key}
                  label={key === "logoPositive" ? "Logo positivo" : "Logo negativo"}
                  field={field}
                  value={value}
                  onChange={(next) => setConstantValue(key, next)}
                />
              );
            })}
          </div>
        ) : null}

        {activeTab === "images" ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(
                [
                  ["imageEnvironment", "Entorno"],
                  ["imageTextures", "Texturas"],
                  ["imagePeople", "Personas"],
                  ["imageObjects", "Objetos"],
                  ["imageProtagonist", "Protagonista"],
                ] as const
              ).map(([fieldKey, label]) => {
                const { field, value } = constantField(dataset, brainNodeId, fieldKey);
                return (
                  <ImageFieldRow
                    key={fieldKey}
                    label={label}
                    field={field}
                    value={value}
                    onChange={(next) => setConstantValue(fieldKey, next)}
                  />
                );
              })}
            </div>

            <div className="border-t border-white/10 pt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.08em] text-white/55">
                Fotos de ejemplo
              </p>
              <p className="mb-3 text-[10px] text-white/45">
                Solo lectura · {(galleryList?.cards.length ?? 0)}/{BRANDKIT_DATASET_MAX_GALLERY}
              </p>
              <div className="space-y-2">
                {(galleryList?.cards ?? []).map((card) => (
                  <div key={card.id} className="grid gap-2 border border-white/10 bg-black/20 p-3 md:grid-cols-[140px_1fr]">
                    <div>
                      <RowMetaBadge meta={rowMetaSidecar?.lists.gallery[card.id]} />
                      <p className="mt-2 text-[10px] uppercase text-white/55">
                        {readFieldSelect(card.values[galleryCategoryField.id], BRANDKIT_GALLERY_CATEGORIES[0])}
                      </p>
                    </div>
                    <DatasetImageCell
                      value={card.values[galleryImageField.id] ?? emptyValueForType("image")}
                      onChange={() => undefined}
                      compact
                    />
                  </div>
                ))}
                {!galleryList?.cards.length ? (
                  <p className="text-[11px] text-white/40">Sin imágenes proyectadas.</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
