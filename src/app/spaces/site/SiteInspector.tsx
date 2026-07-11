"use client";

import React, { useMemo } from "react";
import type { SiteGraphConnectionStatus } from "@/lib/site/site-bindings";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import {
  blockEditorLabel,
  flattenSectionBlocks,
  isButtonContent,
  isCollectionContent,
  isMediaContent,
  isTextContent,
  patchBlockContent,
  patchBlockLayout,
  patchBlockMotion,
  patchBlockMotionInSection,
  updateBlockInSection,
} from "@/lib/site/site-block-tree";
import { COLLECTION_VIEW_LABELS, defaultViewOptions, switchCollectionView } from "@/lib/site/site-collection-views";
import { SiteScrubNumberInput } from "./SiteScrubNumberInput";
import { LEDGER_PATH_PRESETS } from "@/lib/site/site-theme-ledger";
import { createSiteId } from "@/lib/site/site-defaults";
import { resolveButtonLabel, patchTextLocaleValue, patchButtonLocaleLabel } from "@/lib/site/site-i18n";
import { DEFAULT_SITE_LEAD_FORM, type SiteLeadsOutput } from "@/lib/site/site-leads";
import { foldderCdnHostname } from "@/lib/site/site-domain";
import type { SiteGenerateCopyAction } from "@/lib/site/site-generate-copy";
import type { SiteAdvancedInspectorContext } from "./site-editor-ui-types";
import {
  AlignmentControl,
  MaxWidthControl,
  MotionModeControl,
  MotionPresetControl,
  MotionTriggerControl,
  QuickField,
  TextRoleControl,
} from "./site-block-controls";
import type {
  Block,
  BlockLayout,
  BlockMotion,
  ButtonContent,
  CarouselOpts,
  CollectionContent,
  CollectionView,
  GridOpts,
  MarqueeOpts,
  MediaContent,
  SiteInspectorTab,
  SitePage,
  PublishState,
  TableOpts,
  TextContent,
  ThemeOverride,
} from "@/lib/site/site-types";

const TABS: Array<{ id: SiteInspectorTab; label: string }> = [
  { id: "content", label: "Contenido" },
  { id: "layout", label: "Disposición" },
  { id: "motion", label: "Movimiento" },
];

const BLEED_OPTIONS: Array<{ value: NonNullable<BlockLayout["bleed"]>; label: string }> = [
  { value: "contained", label: "Contenido" },
  { value: "full", label: "Ancho completo" },
];
const SPLIT_OPTIONS: Array<{ value: NonNullable<BlockLayout["split"]>["pattern"]; label: string }> = [
  { value: "1", label: "1 columna" },
  { value: "1-1", label: "1 · 1" },
  { value: "2-1", label: "2 · 1" },
  { value: "1-2", label: "1 · 2" },
  { value: "1-1-1", label: "1 · 1 · 1" },
  { value: "bento-a", label: "Bento A" },
  { value: "bento-b", label: "Bento B" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="site-studio__field">
      <span className="site-studio__field-label">{label}</span>
      {children}
    </label>
  );
}

function TextContentEditor({
  content,
  previewLocale,
  onChange,
}: {
  content: TextContent;
  previewLocale: string;
  onChange: (next: TextContent) => void;
}) {
  const displayValue =
    previewLocale === "es" || !content.localeValues?.[previewLocale]
      ? content.value
      : content.localeValues[previewLocale] ?? content.value;

  return (
    <>
      <QuickField label="Rol tipográfico">
        <TextRoleControl value={content.role} onChange={(role) => onChange({ ...content, role })} compact />
      </QuickField>
      <Field label={`Texto (${previewLocale})`}>
        <textarea
          className="site-studio__field-textarea"
          rows={4}
          value={displayValue}
          onChange={(event) =>
            onChange(patchTextLocaleValue(content, previewLocale, event.target.value))
          }
        />
      </Field>
      {previewLocale !== "es" && content.value.trim() ? (
        <p className="site-studio__inspector-hint">Fallback (es): {content.value.slice(0, 80)}</p>
      ) : null}
      <QuickField label="Alineación">
        <AlignmentControl
          value={content.align ?? "left"}
          onChange={(align) => onChange({ ...content, align })}
        />
      </QuickField>
      <QuickField label="Ancho máximo">
        <MaxWidthControl
          value={content.maxWidth ?? "normal"}
          onChange={(maxWidth) => onChange({ ...content, maxWidth })}
        />
      </QuickField>
    </>
  );
}

function MediaContentEditor({
  content,
  onChange,
}: {
  content: MediaContent;
  onChange: (next: MediaContent) => void;
}) {
  return (
    <>
      <Field label="URL / src">
        <input
          className="site-studio__field-input"
          type="url"
          placeholder="https://…"
          value={content.src}
          onChange={(event) => onChange({ ...content, src: event.target.value })}
        />
      </Field>
      <Field label="Proporción">
        <select
          className="site-studio__field-input"
          value={content.ratio}
          onChange={(event) => onChange({ ...content, ratio: event.target.value as MediaContent["ratio"] })}
        >
          {(["16:9", "4:3", "1:1", "9:16", "3:2", "auto"] as const).map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ajuste">
        <select
          className="site-studio__field-input"
          value={content.fit}
          onChange={(event) => onChange({ ...content, fit: event.target.value as MediaContent["fit"] })}
        >
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
        </select>
      </Field>
      <label className="site-studio__checkbox-row">
        <input
          type="checkbox"
          checked={content.duotone}
          onChange={(event) => onChange({ ...content, duotone: event.target.checked })}
        />
        Duotono (marca)
      </label>
      <Field label="Pie de foto">
        <input
          className="site-studio__field-input"
          value={content.caption ?? ""}
          onChange={(event) => onChange({ ...content, caption: event.target.value })}
        />
      </Field>
    </>
  );
}

function ButtonContentEditor({
  content,
  previewLocale,
  onChange,
}: {
  content: ButtonContent;
  previewLocale: string;
  onChange: (next: ButtonContent) => void;
}) {
  const displayLabel = resolveButtonLabel(content, previewLocale);

  return (
    <>
      <Field label={`Etiqueta (${previewLocale})`}>
        <input
          className="site-studio__field-input"
          value={displayLabel}
          onChange={(event) => onChange(patchButtonLocaleLabel(content, previewLocale, event.target.value))}
        />
      </Field>
      <Field label="Destino">
        <select
          className="site-studio__field-input"
          value={content.target.kind}
          onChange={(event) =>
            onChange({
              ...content,
              target: { ...content.target, kind: event.target.value as ButtonContent["target"]["kind"] },
            })
          }
        >
          <option value="anchor">Ancla</option>
          <option value="url">URL</option>
          <option value="mail">Email</option>
          <option value="payment_link">Pago</option>
        </select>
      </Field>
      <Field label="Valor">
        <input
          className="site-studio__field-input"
          value={content.target.value}
          placeholder={content.target.kind === "mail" ? "hola@marca.com" : "#seccion"}
          onChange={(event) =>
            onChange({ ...content, target: { ...content.target, value: event.target.value } })
          }
        />
      </Field>
      <Field label="Variante">
        <select
          className="site-studio__field-input"
          value={content.variant}
          onChange={(event) =>
            onChange({ ...content, variant: event.target.value as ButtonContent["variant"] })
          }
        >
          <option value="primary">Primario</option>
          <option value="secondary">Secundario</option>
        </select>
      </Field>
    </>
  );
}

function CollectionContentEditor({
  content,
  onChange,
  graphStatus,
  connectedDataset,
  contentSourceLabel,
}: {
  content: CollectionContent;
  onChange: (next: CollectionContent) => void;
  graphStatus?: SiteGraphConnectionStatus;
  connectedDataset?: Dataset | null;
  contentSourceLabel?: string | null;
}) {
  const gridOpts = content.view === "grid" ? (content.viewOptions as GridOpts) : null;
  const carouselOpts = content.view === "carousel" ? (content.viewOptions as CarouselOpts) : null;
  const tableOpts = content.view === "table" ? (content.viewOptions as TableOpts) : null;
  const marqueeOpts = content.view === "marquee" ? (content.viewOptions as MarqueeOpts) : null;
  const graphHint = graphStatus?.content.connected
    ? `${contentSourceLabel ?? "Contenido"} conectado · ${graphStatus.content.itemCount} imgs en preview`
    : graphStatus?.dataset.connected
      ? `Dataset conectado · ${graphStatus.dataset.rowCount} imgs en preview`
      : null;

  const selectedListId = content.binding?.listId ?? connectedDataset?.lists[0]?.id ?? "";
  const selectedList = connectedDataset?.lists.find((list) => list.id === selectedListId);
  const imageFields = selectedList?.schema.filter((field) => field.type === "image") ?? [];
  const selectedImageFieldId =
    content.binding?.imageFieldId ?? imageFields[0]?.id ?? "";

  const patchBinding = (patch: { listId?: string; imageFieldId?: string }) => {
    const nextListId = patch.listId ?? selectedListId;
    const list = connectedDataset?.lists.find((entry) => entry.id === nextListId);
    const nextImageFieldId = patch.imageFieldId ?? selectedImageFieldId;
    const imageField =
      list?.schema.find((field) => field.id === nextImageFieldId) ??
      list?.schema.find((field) => field.type === "image");

    onChange({
      ...content,
      binding: {
        ...content.binding,
        listId: nextListId,
        imageFieldId: imageField?.id,
        map: { ...content.binding?.map, src: imageField?.key ?? "photo" },
      },
    });
  };

  return (
    <>
      {graphHint ? <p className="site-studio__inspector-hint site-studio__inspector-hint--graph">{graphHint}</p> : null}
      {graphStatus?.dataset.connected && connectedDataset && connectedDataset.lists.length > 0 ? (
        <>
          <Field label="Listado Dataset">
            <select
              className="site-studio__field-input"
              value={selectedListId}
              onChange={(event) => patchBinding({ listId: event.target.value })}
            >
              {connectedDataset.lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.cards.length})
                </option>
              ))}
            </select>
          </Field>
          {imageFields.length > 0 ? (
            <Field label="Columna imagen">
              <select
                className="site-studio__field-input"
                value={selectedImageFieldId}
                onChange={(event) => patchBinding({ imageFieldId: event.target.value })}
              >
                {imageFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Límite filas (0 = sin límite)">
            <SiteScrubNumberInput
              value={content.binding?.limit ?? 0}
              min={0}
              step={1}
              onKeyboardCommit={(n) => {
                const limit = Math.max(0, Math.round(n));
                onChange({
                  ...content,
                  binding: {
                    ...content.binding,
                    listId: selectedListId,
                    imageFieldId: selectedImageFieldId,
                    map: content.binding?.map ?? { src: imageFields[0]?.key ?? "photo" },
                    limit: limit > 0 ? limit : undefined,
                  },
                });
              }}
              onScrubLive={(n) => {
                const limit = Math.max(0, Math.round(n));
                onChange({
                  ...content,
                  binding: {
                    ...content.binding,
                    listId: selectedListId,
                    imageFieldId: selectedImageFieldId,
                    map: content.binding?.map ?? { src: imageFields[0]?.key ?? "photo" },
                    limit: limit > 0 ? limit : undefined,
                  },
                });
              }}
              onScrubEnd={() => {}}
            />
          </Field>
          <Field label="Ordenar por (columna key)">
            <input
              className="site-studio__field-input"
              value={content.binding?.sort?.field ?? ""}
              placeholder="nombre"
              onChange={(event) =>
                onChange({
                  ...content,
                  binding: {
                    ...content.binding,
                    listId: selectedListId,
                    imageFieldId: selectedImageFieldId,
                    map: content.binding?.map ?? { src: imageFields[0]?.key ?? "photo" },
                    sort: event.target.value.trim()
                      ? { field: event.target.value.trim(), dir: content.binding?.sort?.dir ?? "asc" }
                      : undefined,
                  },
                })
              }
            />
          </Field>
        </>
      ) : null}
      <Field label="Vista">
        <select
          className="site-studio__field-input"
          value={content.view}
          onChange={(event) => onChange(switchCollectionView(content, event.target.value as CollectionView))}
        >
          {(Object.keys(COLLECTION_VIEW_LABELS) as CollectionView[]).map((view) => (
            <option key={view} value={view}>
              {COLLECTION_VIEW_LABELS[view]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Overflow">
        <select
          className="site-studio__field-input"
          value={content.overflow}
          onChange={(event) =>
            onChange({
              ...content,
              overflow: event.target.value as CollectionContent["overflow"],
            })
          }
        >
          <option value="grow">Mostrar todo</option>
          <option value="paginate_static">Paginar (estático)</option>
          <option value="truncate_more">Truncar + Ver más</option>
        </select>
      </Field>
      {content.view === "grid" ? (
        <>
          <Field label="Columnas">
            <SiteScrubNumberInput
              value={gridOpts?.columns ?? 3}
              min={1}
              max={4}
              step={1}
              onKeyboardCommit={(n) =>
                onChange({
                  ...content,
                  viewOptions: {
                    columns: Math.min(4, Math.max(1, Math.round(n))) as GridOpts["columns"],
                    density: gridOpts?.density ?? "normal",
                  },
                })
              }
              onScrubLive={(n) =>
                onChange({
                  ...content,
                  viewOptions: {
                    columns: Math.min(4, Math.max(1, Math.round(n))) as GridOpts["columns"],
                    density: gridOpts?.density ?? "normal",
                  },
                })
              }
              onScrubEnd={() => {}}
            />
          </Field>
          <Field label="Densidad">
            <select
              className="site-studio__field-input"
              value={gridOpts?.density ?? "normal"}
              onChange={(event) =>
                onChange({
                  ...content,
                  viewOptions: {
                    columns: gridOpts?.columns ?? 3,
                    density: event.target.value as GridOpts["density"],
                  },
                })
              }
            >
              <option value="compact">Compacta</option>
              <option value="normal">Normal</option>
              <option value="airy">Aireada</option>
            </select>
          </Field>
        </>
      ) : null}
      {content.view === "carousel" ? (
        <>
          <Field label="Controles">
            <select
              className="site-studio__field-input"
              value={carouselOpts?.controls ?? "dots"}
              onChange={(event) =>
                onChange({
                  ...content,
                  viewOptions: {
                    ...defaultViewOptions("carousel"),
                    ...carouselOpts,
                    controls: event.target.value as CarouselOpts["controls"],
                  } as CarouselOpts,
                })
              }
            >
              <option value="dots">Puntos</option>
              <option value="arrows">Flechas</option>
              <option value="both">Ambos</option>
              <option value="none">Ninguno</option>
            </select>
          </Field>
          <label className="site-studio__checkbox-row">
            <input
              type="checkbox"
              checked={carouselOpts?.snap !== false}
              onChange={(event) =>
                onChange({
                  ...content,
                  viewOptions: { ...defaultViewOptions("carousel"), ...carouselOpts, snap: event.target.checked } as CarouselOpts,
                })
              }
            />
            Snap al deslizar
          </label>
          <label className="site-studio__checkbox-row">
            <input
              type="checkbox"
              checked={carouselOpts?.peek !== false}
              onChange={(event) =>
                onChange({
                  ...content,
                  viewOptions: { ...defaultViewOptions("carousel"), ...carouselOpts, peek: event.target.checked } as CarouselOpts,
                })
              }
            />
            Vista peek
          </label>
        </>
      ) : null}
      {content.view === "table" ? (
        <>
          <Field label="Campos visibles">
            <input
              className="site-studio__field-input"
              value={(tableOpts?.visibleFields ?? ["src", "caption"]).join(", ")}
              onChange={(event) =>
                onChange({
                  ...content,
                  viewOptions: {
                    ...defaultViewOptions("table"),
                    ...tableOpts,
                    visibleFields: event.target.value.split(",").map((field) => field.trim()).filter(Boolean),
                  } as TableOpts,
                })
              }
            />
          </Field>
          <label className="site-studio__checkbox-row">
            <input
              type="checkbox"
              checked={tableOpts?.zebra !== false}
              onChange={(event) =>
                onChange({
                  ...content,
                  viewOptions: { ...defaultViewOptions("table"), ...tableOpts, zebra: event.target.checked } as TableOpts,
                })
              }
            />
            Filas zebra
          </label>
        </>
      ) : null}
      {content.view === "marquee" ? (
        <>
          <Field label="Velocidad">
            <SiteScrubNumberInput
              value={marqueeOpts?.speed ?? 2}
              min={1}
              max={3}
              step={1}
              onKeyboardCommit={(n) =>
                onChange({
                  ...content,
                  viewOptions: {
                    ...defaultViewOptions("marquee"),
                    ...marqueeOpts,
                    speed: Math.min(3, Math.max(1, Math.round(n))) as MarqueeOpts["speed"],
                  } as MarqueeOpts,
                })
              }
              onScrubLive={(n) =>
                onChange({
                  ...content,
                  viewOptions: {
                    ...defaultViewOptions("marquee"),
                    ...marqueeOpts,
                    speed: Math.min(3, Math.max(1, Math.round(n))) as MarqueeOpts["speed"],
                  } as MarqueeOpts,
                })
              }
              onScrubEnd={() => {}}
            />
          </Field>
          <label className="site-studio__checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(marqueeOpts?.grayscale)}
              onChange={(event) =>
                onChange({
                  ...content,
                  viewOptions: { ...defaultViewOptions("marquee"), ...marqueeOpts, grayscale: event.target.checked } as MarqueeOpts,
                })
              }
            />
            Escala de grises
          </label>
        </>
      ) : null}
      <p className="site-studio__inspector-hint">URLs por ítem (clave src):</p>
      {content.items.map((item, index) => (
        <Field key={`item-${index}`} label={`Ítem ${index + 1}`}>
          <input
            className="site-studio__field-input"
            value={item.src ?? ""}
            placeholder="https://…"
            onChange={(event) => {
              const items = content.items.map((row, rowIndex) =>
                rowIndex === index ? { ...row, src: event.target.value } : row,
              );
              onChange({ ...content, items });
            }}
          />
        </Field>
      ))}
    </>
  );
}

function BlockSourceEditor({
  block,
  onPatchBlock,
}: {
  block: Block;
  onPatchBlock: (block: Block) => void;
}) {
  return (
    <>
      <Field label="Fuente">
        <select
          className="site-studio__field-input"
          value={block.source.kind}
          onChange={(event) =>
            onPatchBlock({
              ...block,
              source: {
                ...block.source,
                kind: event.target.value as Block["source"]["kind"],
              },
            })
          }
        >
          <option value="manual">Manual</option>
          <option value="dataset">Dataset</option>
          <option value="populate">Populate</option>
          <option value="designer">Designer</option>
        </select>
      </Field>
      <Field label="Ref / slot Populate">
        <input
          className="site-studio__field-input"
          value={block.source.ref ?? ""}
          placeholder="slot::entidad::text"
          onChange={(event) =>
            onPatchBlock({
              ...block,
              source: { ...block.source, ref: event.target.value.trim() || undefined },
            })
          }
        />
      </Field>
    </>
  );
}

function BlockContentEditor({
  block,
  previewLocale,
  onChange,
  onPatchBlock,
  graphStatus,
  connectedDataset,
  contentSourceLabel,
  hideSource,
}: {
  block: Block;
  previewLocale: string;
  onChange: (content: Block["content"]) => void;
  onPatchBlock: (block: Block) => void;
  graphStatus?: SiteGraphConnectionStatus;
  connectedDataset?: Dataset | null;
  contentSourceLabel?: string | null;
  hideSource?: boolean;
}) {
  const { content } = block;
  if (block.type === "text" && isTextContent(content)) {
    return (
      <>
        {!hideSource ? <BlockSourceEditor block={block} onPatchBlock={onPatchBlock} /> : null}
        <TextContentEditor content={content} previewLocale={previewLocale} onChange={onChange} />
      </>
    );
  }
  if (block.type === "media" && isMediaContent(content)) {
    return (
      <>
        {graphStatus?.media.connected ? (
          <p className="site-studio__inspector-hint site-studio__inspector-hint--graph">
            Media conectada{graphStatus.media.hasUrl ? `: ${graphStatus.media.label ?? "fuente"}` : " (sin URL aún)"}
          </p>
        ) : null}
        <MediaContentEditor content={content} onChange={onChange} />
      </>
    );
  }
  if (block.type === "button" && isButtonContent(content)) {
    return <ButtonContentEditor content={content} previewLocale={previewLocale} onChange={onChange} />;
  }
  if (block.type === "collection" && isCollectionContent(content)) {
    return (
      <CollectionContentEditor
        content={content}
        onChange={onChange}
        graphStatus={graphStatus}
        connectedDataset={connectedDataset}
        contentSourceLabel={contentSourceLabel}
      />
    );
  }
  return <p className="site-studio__inspector-hint">Tipo de bloque no editable aún.</p>;
}

function SectionLayoutEditor({
  section,
  onChange,
}: {
  section: Block;
  onChange: (layout: BlockLayout) => void;
}) {
  return (
    <>
      <Field label="Ancho de sección">
        <select
          className="site-studio__field-input"
          value={section.layout.bleed ?? "contained"}
          onChange={(event) =>
            onChange({ ...section.layout, bleed: event.target.value as BlockLayout["bleed"] })
          }
        >
          {BLEED_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="División">
        <select
          className="site-studio__field-input"
          value={section.layout.split?.pattern ?? "1"}
          onChange={(event) =>
            onChange({
              ...section.layout,
              split: {
                ...section.layout.split,
                pattern: event.target.value as NonNullable<BlockLayout["split"]>["pattern"],
              },
            })
          }
        >
          {SPLIT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Agrupar hijos (columnas)">
        <SiteScrubNumberInput
          value={section.layout.split?.groupSize ?? 1}
          min={1}
          max={4}
          step={1}
          onKeyboardCommit={(n) =>
            onChange({
              ...section.layout,
              split: {
                pattern: section.layout.split?.pattern ?? "1",
                rootPosition: section.layout.split?.rootPosition,
                groupSize: Math.min(4, Math.max(1, Math.round(n))),
              },
            })
          }
          onScrubLive={(n) =>
            onChange({
              ...section.layout,
              split: {
                pattern: section.layout.split?.pattern ?? "1",
                rootPosition: section.layout.split?.rootPosition,
                groupSize: Math.min(4, Math.max(1, Math.round(n))),
              },
            })
          }
          onScrubEnd={() => {}}
        />
      </Field>
      <Field label="Título raíz">
        <select
          className="site-studio__field-input"
          value={section.layout.split?.rootPosition ?? "first-cell"}
          onChange={(event) =>
            onChange({
              ...section.layout,
              split: {
                pattern: section.layout.split?.pattern ?? "1",
                groupSize: section.layout.split?.groupSize,
                rootPosition: event.target.value as NonNullable<BlockLayout["split"]>["rootPosition"],
              },
            })
          }
        >
          <option value="first-cell">Primera celda</option>
          <option value="above">Encima del split</option>
        </select>
      </Field>
    </>
  );
}

function BlockMotionEditor({
  motion,
  onChange,
}: {
  motion: BlockMotion;
  onChange: (motion: BlockMotion) => void;
}) {
  const isOverride = motion.mode === "override";

  return (
    <>
      <QuickField label="Modo">
        <MotionModeControl
          value={motion.mode}
          onChange={(mode) =>
            onChange({
              ...motion,
              mode,
              preset: mode === "override" ? motion.preset ?? "soft" : undefined,
              trigger: mode === "override" ? motion.trigger ?? "appear" : undefined,
            })
          }
        />
      </QuickField>
      {isOverride ? (
        <>
          <QuickField label="Preset">
            <MotionPresetControl
              value={motion.preset ?? "soft"}
              onChange={(preset) => onChange({ ...motion, preset })}
            />
          </QuickField>
          <QuickField label="Trigger">
            <MotionTriggerControl
              value={motion.trigger ?? "appear"}
              onChange={(trigger) => onChange({ ...motion, trigger })}
            />
          </QuickField>
        </>
      ) : (
        <p className="site-studio__inspector-hint">Intensidad global en panel Tema (Motion 0–2).</p>
      )}
    </>
  );
}

function SectionMotionEditor({
  section,
  onChange,
}: {
  section: Block;
  onChange: (motion: BlockMotion) => void;
}) {
  return <BlockMotionEditor motion={section.motion} onChange={onChange} />;
}

export function SitePageInspector({
  page,
  slug,
  publish,
  locales,
  previewLocale,
  ledger,
  leadsOutput,
  onRefreshLeads,
  refreshingLeads,
  onPatchPage,
  onPatchSlug,
  onPatchPublish,
  onPatchLocales,
  onPreviewLocaleChange,
  onPatchLedger,
  embedded,
}: {
  page: SitePage;
  slug: string;
  publish: PublishState;
  locales: string[];
  previewLocale: string;
  ledger: ThemeOverride[];
  leadsOutput?: SiteLeadsOutput | null;
  onRefreshLeads?: () => void;
  refreshingLeads?: boolean;
  embedded?: boolean;
  onPatchPage: (patch: Partial<SitePage>) => void;
  onPatchSlug: (slug: string) => void;
  onPatchPublish: (patch: Partial<PublishState>) => void;
  onPatchLocales: (locales: string[]) => void;
  onPreviewLocaleChange: (locale: string) => void;
  onPatchLedger: (ledger: ThemeOverride[]) => void;
}) {
  const leadsForm = page.leadsForm ?? DEFAULT_SITE_LEAD_FORM;
  const cdnHostname = publish.cdnHostname ?? (slug.trim() ? foldderCdnHostname(slug) : "");
  const addLedgerEntry = () => {
    const firstSectionId = page.sections[0]?.id ?? "";
    onPatchLedger([
      ...ledger,
      {
        id: createSiteId(),
        blockId: firstSectionId,
        path: LEDGER_PATH_PRESETS[0]!.path,
        value: LEDGER_PATH_PRESETS[0]!.placeholder,
        label: "Override",
      },
    ]);
  };

  const Wrapper = embedded ? "div" : "aside";

  return (
    <Wrapper
      className={`site-studio__inspector${embedded ? " site-studio__inspector--embedded" : ""}`}
      {...(embedded ? {} : { "data-foldder-studio-panel": true })}
      aria-label="Inspector de página"
    >
      <div className="site-studio__inspector-body">
        <div className="site-studio__inspector-panel">
          <p className="site-studio__micro-label">Página</p>
          <Field label="Título SEO">
            <input
              className="site-studio__field-input"
              value={page.seo.title}
              onChange={(event) =>
                onPatchPage({ seo: { ...page.seo, title: event.target.value } })
              }
            />
          </Field>
          <Field label="Descripción SEO">
            <textarea
              className="site-studio__field-textarea"
              rows={3}
              value={page.seo.description}
              onChange={(event) =>
                onPatchPage({ seo: { ...page.seo, description: event.target.value } })
              }
            />
          </Field>
          <Field label="Slug (URL)">
            <input
              className="site-studio__field-input"
              value={slug}
              placeholder="mi-marca"
              onChange={(event) => onPatchSlug(event.target.value)}
            />
          </Field>
          <Field label="Dominio propio (CNAME)">
            <input
              className="site-studio__field-input"
              value={publish.customDomain ?? ""}
              placeholder="www.tumarca.com"
              onChange={(event) => onPatchPublish({ customDomain: event.target.value.trim() || undefined })}
            />
          </Field>
          {cdnHostname ? (
            <p className="site-studio__inspector-hint">CDN: {cdnHostname}</p>
          ) : null}
          {publish.publicUrl ? (
            <p className="site-studio__inspector-hint">Publicado: {publish.publicUrl}</p>
          ) : null}
          {(publish.status === "published" || publish.status === "stale") && onRefreshLeads ? (
            <div className="site-studio__leads-summary">
              <p className="site-studio__inspector-hint">
                Leads capturados: {leadsOutput?.totalCount ?? 0}
                {leadsOutput?.updatedAt ? ` · ${new Date(leadsOutput.updatedAt).toLocaleString()}` : ""}
              </p>
              <button
                type="button"
                className="site-studio__add-btn site-studio__add-btn--inline"
                disabled={refreshingLeads}
                onClick={onRefreshLeads}
              >
                {refreshingLeads ? "Actualizando…" : "Actualizar leads"}
              </button>
            </div>
          ) : null}
          <p className="site-studio__micro-label">Formulario de leads</p>
          <label className="site-studio__checkbox-row">
            <input
              type="checkbox"
              checked={leadsForm.enabled}
              onChange={(event) =>
                onPatchPage({
                  leadsForm: { ...leadsForm, enabled: event.target.checked },
                })
              }
            />
            Mostrar formulario en la página publicada
          </label>
          {leadsForm.enabled ? (
            <>
              <Field label="Título del formulario">
                <input
                  className="site-studio__field-input"
                  value={leadsForm.title ?? ""}
                  onChange={(event) =>
                    onPatchPage({ leadsForm: { ...leadsForm, title: event.target.value } })
                  }
                />
              </Field>
              <Field label="Botón enviar">
                <input
                  className="site-studio__field-input"
                  value={leadsForm.submitLabel ?? ""}
                  onChange={(event) =>
                    onPatchPage({ leadsForm: { ...leadsForm, submitLabel: event.target.value } })
                  }
                />
              </Field>
            </>
          ) : null}
          <label className="site-studio__checkbox-row">
            <input
              type="checkbox"
              checked={page.nav.enabled}
              onChange={(event) =>
                onPatchPage({ nav: { ...page.nav, enabled: event.target.checked } })
              }
            />
            Mostrar navegación
          </label>
          <Field label="Locales (coma)">
            <input
              className="site-studio__field-input"
              value={locales.join(", ")}
              onChange={(event) =>
                onPatchLocales(
                  event.target.value
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                )
              }
            />
          </Field>
          <Field label="Locale preview">
            <select
              className="site-studio__field-input"
              value={previewLocale}
              onChange={(event) => onPreviewLocaleChange(event.target.value)}
            >
              {(locales.length ? locales : ["es"]).map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </select>
          </Field>
          <p className="site-studio__micro-label">Theme ledger</p>
          {ledger.length === 0 ? (
            <p className="site-studio__inspector-hint">Sin overrides de tema por bloque.</p>
          ) : (
            ledger.map((entry) => (
              <div key={entry.id} className="site-studio__ledger-row">
                <Field label="Bloque ID">
                  <input
                    className="site-studio__field-input"
                    value={entry.blockId}
                    onChange={(event) =>
                      onPatchLedger(
                        ledger.map((row) =>
                          row.id === entry.id ? { ...row, blockId: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Propiedad CSS">
                  <select
                    className="site-studio__field-input"
                    value={entry.path}
                    onChange={(event) =>
                      onPatchLedger(
                        ledger.map((row) =>
                          row.id === entry.id ? { ...row, path: event.target.value } : row,
                        ),
                      )
                    }
                  >
                    {LEDGER_PATH_PRESETS.map((preset) => (
                      <option key={preset.path} value={preset.path}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Valor">
                  <input
                    className="site-studio__field-input"
                    value={entry.value}
                    onChange={(event) =>
                      onPatchLedger(
                        ledger.map((row) =>
                          row.id === entry.id ? { ...row, value: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </Field>
                <button
                  type="button"
                  className="site-studio__icon-btn site-studio__icon-btn--danger"
                  onClick={() => onPatchLedger(ledger.filter((row) => row.id !== entry.id))}
                >
                  Eliminar
                </button>
              </div>
            ))
          )}
          <button type="button" className="site-studio__add-btn site-studio__add-btn--inline" onClick={addLedgerEntry}>
            Añadir override
          </button>
        </div>
      </div>
    </Wrapper>
  );
}

export function SiteInspector({
  section,
  selectedBlockId,
  onSelectBlock,
  onPatchSection,
  tab,
  onTabChange,
  previewLocale,
  brandReady,
  generatingCopy,
  onGenerateCopy,
  graphStatus,
  connectedDataset,
  contentSourceLabel,
  embedded,
  focus,
}: {
  section: Block | null;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onPatchSection: (nextSection: Block) => void;
  tab: SiteInspectorTab;
  onTabChange: (tab: SiteInspectorTab) => void;
  previewLocale: string;
  brandReady?: boolean;
  generatingCopy?: boolean;
  onGenerateCopy?: (action: SiteGenerateCopyAction) => void;
  graphStatus?: SiteGraphConnectionStatus;
  connectedDataset?: Dataset | null;
  contentSourceLabel?: string | null;
  embedded?: boolean;
  focus?: SiteAdvancedInspectorContext | null;
}) {
  const blocks = useMemo(() => (section ? flattenSectionBlocks(section) : []), [section]);
  const activeBlock = useMemo(() => {
    if (!section || !selectedBlockId) return section;
    return blocks.find((block) => block.id === selectedBlockId) ?? section;
  }, [blocks, section, selectedBlockId]);

  const focused = focus?.mode === "focused";
  const visibleTabs = focused && focus.tab ? [focus.tab] : TABS.map((entry) => entry.id);
  const effectiveTab = focused && focus.tab ? focus.tab : tab;

  const Wrapper = embedded ? "div" : "aside";

  const patchMotionForActiveBlock = (motion: BlockMotion) => {
    if (!section || !activeBlock) return;
    if (activeBlock.id === section.id) {
      onPatchSection(patchBlockMotion(section, motion));
    } else {
      onPatchSection(patchBlockMotionInSection(section, activeBlock.id, motion));
    }
  };

  const renderContentPanel = () => {
    if (!section || !activeBlock) return null;
    const showSource = !focused || focus?.part === "source" || focus?.part === undefined;
    const showBody = !focused || focus?.part === "body" || focus?.part === undefined;

    if (focus?.part === "source") {
      return (
        <div className="site-studio__inspector-panel">
          <BlockSourceEditor
            block={activeBlock}
            onPatchBlock={(nextBlock) =>
              onPatchSection(updateBlockInSection(section, activeBlock.id, () => nextBlock))
            }
          />
        </div>
      );
    }

    return (
      <div className="site-studio__inspector-panel">
        {blocks.length > 1 && !focused ? (
          <div className="site-studio__block-picker" role="tablist" aria-label="Bloques en la sección">
            {blocks.map((block, index) => (
              <button
                key={block.id}
                type="button"
                role="tab"
                aria-selected={activeBlock.id === block.id}
                className={`site-studio__block-chip${activeBlock.id === block.id ? " is-active" : ""}`}
                onClick={() => onSelectBlock(block.id)}
              >
                {blockEditorLabel(block, index)}
              </button>
            ))}
          </div>
        ) : null}

        {onGenerateCopy && !focused ? (
          <div className="site-studio__ai-copy">
            <p className="site-studio__micro-label">Copy con IA</p>
            <div className="site-studio__ai-copy-actions">
              {(
                [
                  ["hero", "Hero"],
                  ["faq", "FAQ"],
                  ["pricing", "Pricing"],
                  ["cta", "CTA"],
                  ["rewrite", "Reescribir"],
                ] as const
              ).map(([action, label]) => (
                <button
                  key={action}
                  type="button"
                  className="site-studio__ai-copy-btn"
                  disabled={generatingCopy || (action === "rewrite" && activeBlock.type !== "text")}
                  onClick={() => onGenerateCopy(action)}
                >
                  {label}
                </button>
              ))}
            </div>
            {!brandReady ? (
              <p className="site-studio__inspector-hint">Conecta BrandKit para copy más alineado con la marca.</p>
            ) : null}
          </div>
        ) : null}

        {showSource && showBody ? (
          <BlockContentEditor
            block={activeBlock}
            previewLocale={previewLocale}
            graphStatus={graphStatus}
            connectedDataset={connectedDataset}
            contentSourceLabel={contentSourceLabel}
            onChange={(content) => onPatchSection(patchBlockContent(section, activeBlock.id, content))}
            onPatchBlock={(nextBlock) =>
              onPatchSection(updateBlockInSection(section, activeBlock.id, () => nextBlock))
            }
          />
        ) : showBody ? (
          <BlockContentEditor
            block={activeBlock}
            previewLocale={previewLocale}
            graphStatus={graphStatus}
            connectedDataset={connectedDataset}
            contentSourceLabel={contentSourceLabel}
            hideSource
            onChange={(content) => onPatchSection(patchBlockContent(section, activeBlock.id, content))}
            onPatchBlock={(nextBlock) =>
              onPatchSection(updateBlockInSection(section, activeBlock.id, () => nextBlock))
            }
          />
        ) : null}
      </div>
    );
  };

  return (
    <Wrapper
      className={`site-studio__inspector${embedded ? " site-studio__inspector--embedded" : ""}${focused ? " site-studio__inspector--focused" : ""}`}
      {...(embedded ? {} : { "data-foldder-studio-panel": true })}
      aria-label="Inspector"
    >
      {!focused ? (
        <div className="site-studio__inspector-tabs" role="tablist">
          {TABS.filter((entry) => visibleTabs.includes(entry.id)).map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={effectiveTab === entry.id}
              className={`site-studio__inspector-tab${effectiveTab === entry.id ? " is-active" : ""}`}
              onClick={() => onTabChange(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="site-studio__inspector-focus-label">
          {effectiveTab === "content" ? "Contenido" : effectiveTab === "layout" ? "Disposición" : "Movimiento"}
        </p>
      )}

      {!section || !activeBlock ? (
        <p className="site-studio__empty-hint">Selecciona una sección para editar contenido, disposición y movimiento.</p>
      ) : (
        <div className="site-studio__inspector-body">
          {!focused ? (
            <p className="site-studio__micro-label site-studio__inspector-section-label">
              {blockEditorLabel(activeBlock, blocks.findIndex((block) => block.id === activeBlock.id))}
            </p>
          ) : null}
          {effectiveTab === "content" ? renderContentPanel() : null}

          {effectiveTab === "layout" ? (
            <div className="site-studio__inspector-panel">
              {activeBlock.type === "collection" && focused ? (
                <CollectionContentEditor
                  content={activeBlock.content as CollectionContent}
                  onChange={(content) => onPatchSection(patchBlockContent(section, activeBlock.id, content))}
                  graphStatus={graphStatus}
                  connectedDataset={connectedDataset}
                  contentSourceLabel={contentSourceLabel}
                />
              ) : (
                <SectionLayoutEditor
                  section={section}
                  onChange={(layout) => onPatchSection(patchBlockLayout(section, layout))}
                />
              )}
            </div>
          ) : null}

          {effectiveTab === "motion" ? (
            <div className="site-studio__inspector-panel">
              <BlockMotionEditor motion={activeBlock.motion} onChange={patchMotionForActiveBlock} />
            </div>
          ) : null}
        </div>
      )}
    </Wrapper>
  );
}
