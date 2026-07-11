"use client";

import React, { useCallback, useRef } from "react";
import {
  AlignCenter,
  Copy,
  Image,
  LayoutGrid,
  Link2,
  Maximize2,
  MoreHorizontal,
  Move,
  Palette,
  Ratio,
  Rows3,
  SplitSquareHorizontal,
  Type,
} from "lucide-react";
import { findBlockInSection, patchBlockContent, patchBlockMotionInSection } from "@/lib/site/site-block-tree";
import { COLLECTION_VIEW_LABELS, switchCollectionView } from "@/lib/site/site-collection-views";
import { resolveButtonLabel, patchButtonLocaleLabel } from "@/lib/site/site-i18n";
import type {
  Block,
  ButtonContent,
  CollectionContent,
  CollectionView,
  GridOpts,
  MediaContent,
  TextContent,
} from "@/lib/site/site-types";
import {
  AlignmentControl,
  MaxWidthControl,
  MediaFitControl,
  MediaRatioControl,
  MotionModeControl,
  MotionPresetControl,
  MotionTriggerControl,
  QuickField,
  TextRoleControl,
} from "./site-block-controls";
import { buildMoreMenuActions, moreActionToInspectorContext, SiteMoreMenu } from "./SiteMoreMenu";
import { SiteQuickPopover } from "./SiteQuickPopover";
import type { SiteAdvancedInspectorContext, SiteQuickControl } from "./site-editor-ui-types";

function patchActiveBlockContent(section: Block, blockId: string, content: Block["content"]): Block {
  return patchBlockContent(section, blockId, content);
}

export function SiteContextToolbar({
  section,
  selectedBlockId,
  sectionLabel,
  previewLocale,
  activeQuickControl,
  onQuickControlChange,
  onOpenAdvancedInspector,
  onDuplicateBlock,
  onDuplicateSection,
  onRemoveSection,
  onPatchSection,
  onToggleBleed,
  onOpenStructure,
  onSaveSectionToLibrary,
}: {
  section: Block | null;
  selectedBlockId: string | null;
  sectionLabel?: string;
  previewLocale: string;
  activeQuickControl: SiteQuickControl;
  onQuickControlChange: (control: SiteQuickControl) => void;
  onOpenAdvancedInspector: (context: SiteAdvancedInspectorContext) => void;
  onDuplicateBlock?: () => void;
  onDuplicateSection?: () => void;
  onRemoveSection?: () => void;
  onPatchSection?: (section: Block) => void;
  onToggleBleed?: () => void;
  onOpenStructure?: () => void;
  onSaveSectionToLibrary?: () => void;
}) {
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const setBtnRef = useCallback(
    (id: string) => (el: HTMLButtonElement | null) => {
      btnRefs.current[id] = el;
    },
    [],
  );

  const toggleQuick = useCallback(
    (control: SiteQuickControl) => {
      onQuickControlChange(activeQuickControl === control ? null : control);
    },
    [activeQuickControl, onQuickControlChange],
  );

  if (!section) return null;

  const blockId = selectedBlockId ?? section.id;
  const activeBlock = findBlockInSection(section, blockId) ?? section;
  const isSectionRoot = activeBlock.id === section.id;

  const anchorFor = (id: string) => btnRefs.current[id] ?? null;

  const patchContent = (content: Block["content"]) => {
    if (!onPatchSection) return;
    onPatchSection(patchActiveBlockContent(section, activeBlock.id, content));
  };

  const patchMotion = (motion: Partial<Block["motion"]>) => {
    if (!onPatchSection) return;
    onPatchSection(patchBlockMotionInSection(section, activeBlock.id, motion));
  };

  const handleDuplicate = () => {
    if (isSectionRoot) onDuplicateSection?.();
    else onDuplicateBlock?.();
  };

  const handleMoreSelect = (action: Parameters<typeof moreActionToInspectorContext>[0] | "open-inspector" | "duplicate" | "remove" | "open-structure" | "save-library") => {
    if (action === "duplicate") {
      handleDuplicate();
      return;
    }
    if (action === "remove") {
      onRemoveSection?.();
      return;
    }
    if (action === "open-structure") {
      onOpenStructure?.();
      return;
    }
    if (action === "save-library") {
      onSaveSectionToLibrary?.();
      return;
    }
    onOpenAdvancedInspector(
      action === "open-inspector" ? { mode: "full" } : moreActionToInspectorContext(action),
    );
  };

  const moreItems = buildMoreMenuActions({
    block: activeBlock,
    isSectionRoot,
    hasLibrary: Boolean(onSaveSectionToLibrary),
  });

  const labelText = sectionLabel ?? (isSectionRoot ? "Sección" : activeBlock.type);

  const renderMotionPopover = () => {
    const motion = activeBlock.motion;
    const isOverride = motion.mode === "override";
    return (
      <SiteQuickPopover
        open={activeQuickControl === "motion"}
        anchorEl={anchorFor("motion")}
        onClose={() => onQuickControlChange(null)}
        width={280}
        label="Movimiento"
      >
        <QuickField label="Modo">
          <MotionModeControl
            value={motion.mode}
            onChange={(mode) =>
              patchMotion({
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
                onChange={(preset) => patchMotion({ preset })}
              />
            </QuickField>
            <QuickField label="Trigger">
              <MotionTriggerControl
                value={motion.trigger ?? "appear"}
                onChange={(trigger) => patchMotion({ trigger })}
              />
            </QuickField>
          </>
        ) : null}
        <button
          type="button"
          className="site-quick-popover__link"
          onClick={() => {
            onQuickControlChange(null);
            onOpenAdvancedInspector({ mode: "focused", tab: "motion", part: "motion" });
          }}
        >
          Ajustes avanzados
        </button>
      </SiteQuickPopover>
    );
  };

  if (activeBlock.type === "text") {
    const content = activeBlock.content as TextContent;
    return (
      <>
        <ToolbarShell label={labelText}>
          <Btn ref={setBtnRef("type")} icon={<Type size={14} />} label="Tipo" active={activeQuickControl === "type"} onClick={() => toggleQuick("type")} />
          <Btn ref={setBtnRef("alignment")} icon={<AlignCenter size={14} />} label="Alineación" active={activeQuickControl === "alignment"} onClick={() => toggleQuick("alignment")} />
          <Btn ref={setBtnRef("width")} icon={<Maximize2 size={14} />} label="Ancho" active={activeQuickControl === "width"} onClick={() => toggleQuick("width")} />
          <Btn ref={setBtnRef("motion")} icon={<Move size={14} />} label="Motion" active={activeQuickControl === "motion"} onClick={() => toggleQuick("motion")} />
          <Btn icon={<Copy size={14} />} label="Duplicar" onClick={handleDuplicate} />
          <Btn ref={setBtnRef("more")} icon={<MoreHorizontal size={14} />} label="Más" active={activeQuickControl === "more"} onClick={() => toggleQuick("more")} primary />
        </ToolbarShell>

        <SiteQuickPopover open={activeQuickControl === "type"} anchorEl={anchorFor("type")} onClose={() => onQuickControlChange(null)} width={280} label="Tipo">
          <TextRoleControl value={content.role} onChange={(role) => patchContent({ ...content, role })} compact />
        </SiteQuickPopover>

        <SiteQuickPopover open={activeQuickControl === "alignment"} anchorEl={anchorFor("alignment")} onClose={() => onQuickControlChange(null)} width={220} label="Alineación">
          <AlignmentControl value={content.align ?? "left"} onChange={(align) => patchContent({ ...content, align })} />
        </SiteQuickPopover>

        <SiteQuickPopover open={activeQuickControl === "width"} anchorEl={anchorFor("width")} onClose={() => onQuickControlChange(null)} width={280} label="Ancho">
          <MaxWidthControl value={content.maxWidth ?? "normal"} onChange={(maxWidth) => patchContent({ ...content, maxWidth })} />
        </SiteQuickPopover>

        {renderMotionPopover()}

        <SiteMoreMenu
          open={activeQuickControl === "more"}
          anchorEl={anchorFor("more")}
          items={moreItems}
          onSelect={handleMoreSelect}
          onClose={() => onQuickControlChange(null)}
        />
      </>
    );
  }

  if (activeBlock.type === "media") {
    const content = activeBlock.content as MediaContent;
    return (
      <>
        <ToolbarShell label={labelText}>
          <Btn ref={setBtnRef("replace")} icon={<Image size={14} />} label="Reemplazar" active={activeQuickControl === "replace"} onClick={() => toggleQuick("replace")} />
          <Btn ref={setBtnRef("ratio")} icon={<Ratio size={14} />} label="Ratio" active={activeQuickControl === "ratio"} onClick={() => toggleQuick("ratio")} />
          <Btn ref={setBtnRef("fit")} icon={<Maximize2 size={14} />} label="Fit" active={activeQuickControl === "fit"} onClick={() => toggleQuick("fit")} />
          <Btn ref={setBtnRef("duotone")} icon={<Palette size={14} />} label="Duotono" active={activeQuickControl === "duotone"} onClick={() => toggleQuick("duotone")} />
          <Btn ref={setBtnRef("motion")} icon={<Move size={14} />} label="Motion" active={activeQuickControl === "motion"} onClick={() => toggleQuick("motion")} />
          <Btn icon={<Copy size={14} />} label="Duplicar" onClick={handleDuplicate} />
          <Btn ref={setBtnRef("more")} icon={<MoreHorizontal size={14} />} label="Más" active={activeQuickControl === "more"} onClick={() => toggleQuick("more")} primary />
        </ToolbarShell>

        <SiteQuickPopover open={activeQuickControl === "replace"} anchorEl={anchorFor("replace")} onClose={() => onQuickControlChange(null)} width={300} label="Reemplazar">
          <QuickField label="URL / src">
            <input
              className="site-quick-popover__input"
              type="url"
              value={content.src}
              placeholder="https://…"
              onChange={(event) => patchContent({ ...content, src: event.target.value })}
            />
          </QuickField>
        </SiteQuickPopover>

        <SiteQuickPopover open={activeQuickControl === "ratio"} anchorEl={anchorFor("ratio")} onClose={() => onQuickControlChange(null)} width={280} label="Ratio">
          <MediaRatioControl value={content.ratio} onChange={(ratio) => patchContent({ ...content, ratio })} />
        </SiteQuickPopover>

        <SiteQuickPopover open={activeQuickControl === "fit"} anchorEl={anchorFor("fit")} onClose={() => onQuickControlChange(null)} width={220} label="Fit">
          <MediaFitControl value={content.fit} onChange={(fit) => patchContent({ ...content, fit })} />
        </SiteQuickPopover>

        <SiteQuickPopover open={activeQuickControl === "duotone"} anchorEl={anchorFor("duotone")} onClose={() => onQuickControlChange(null)} width={220} label="Duotono">
          <label className="site-quick-popover__check">
            <input type="checkbox" checked={content.duotone} onChange={(event) => patchContent({ ...content, duotone: event.target.checked })} />
            Duotono (marca)
          </label>
        </SiteQuickPopover>

        {renderMotionPopover()}

        <SiteMoreMenu open={activeQuickControl === "more"} anchorEl={anchorFor("more")} items={moreItems} onSelect={handleMoreSelect} onClose={() => onQuickControlChange(null)} />
      </>
    );
  }

  if (activeBlock.type === "button") {
    const content = activeBlock.content as ButtonContent;
    const displayLabel = resolveButtonLabel(content, previewLocale);
    return (
      <>
        <ToolbarShell label={labelText}>
          <Btn ref={setBtnRef("label")} icon={<Type size={14} />} label="Etiqueta" active={activeQuickControl === "label"} onClick={() => toggleQuick("label")} />
          <Btn ref={setBtnRef("variant")} icon={<Palette size={14} />} label="Variante" active={activeQuickControl === "variant"} onClick={() => toggleQuick("variant")} />
          <Btn ref={setBtnRef("target")} icon={<Link2 size={14} />} label="Destino" active={activeQuickControl === "target"} onClick={() => toggleQuick("target")} />
          <Btn ref={setBtnRef("motion")} icon={<Move size={14} />} label="Motion" active={activeQuickControl === "motion"} onClick={() => toggleQuick("motion")} />
          <Btn icon={<Copy size={14} />} label="Duplicar" onClick={handleDuplicate} />
          <Btn ref={setBtnRef("more")} icon={<MoreHorizontal size={14} />} label="Más" active={activeQuickControl === "more"} onClick={() => toggleQuick("more")} primary />
        </ToolbarShell>

        <SiteQuickPopover open={activeQuickControl === "label"} anchorEl={anchorFor("label")} onClose={() => onQuickControlChange(null)} width={280} label="Etiqueta">
          <QuickField label={`Etiqueta (${previewLocale})`}>
            <input
              className="site-quick-popover__input"
              value={displayLabel}
              onChange={(event) => patchContent(patchButtonLocaleLabel(content, previewLocale, event.target.value))}
            />
          </QuickField>
        </SiteQuickPopover>

        <SiteQuickPopover open={activeQuickControl === "variant"} anchorEl={anchorFor("variant")} onClose={() => onQuickControlChange(null)} width={220} label="Variante">
          <div className="site-quick-control__seg-row">
            {(["primary", "secondary"] as const).map((variant) => (
              <button
                key={variant}
                type="button"
                className={`site-quick-control__seg-btn${content.variant === variant ? " is-active" : ""}`}
                onClick={() => patchContent({ ...content, variant })}
              >
                {variant === "primary" ? "Primario" : "Secundario"}
              </button>
            ))}
          </div>
        </SiteQuickPopover>

        <SiteQuickPopover open={activeQuickControl === "target"} anchorEl={anchorFor("target")} onClose={() => onQuickControlChange(null)} width={300} label="Destino">
          <QuickField label="Tipo">
            <select
              className="site-quick-popover__select"
              value={content.target.kind}
              onChange={(event) =>
                patchContent({
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
          </QuickField>
          <QuickField label="Valor">
            <input
              className="site-quick-popover__input"
              value={content.target.value}
              onChange={(event) =>
                patchContent({ ...content, target: { ...content.target, value: event.target.value } })
              }
            />
          </QuickField>
        </SiteQuickPopover>

        {renderMotionPopover()}
        <SiteMoreMenu open={activeQuickControl === "more"} anchorEl={anchorFor("more")} items={moreItems} onSelect={handleMoreSelect} onClose={() => onQuickControlChange(null)} />
      </>
    );
  }

  if (activeBlock.type === "collection") {
    const content = activeBlock.content as CollectionContent;
    const gridOpts = content.view === "grid" ? (content.viewOptions as GridOpts) : null;
    return (
      <>
        <ToolbarShell label={labelText}>
          <Btn ref={setBtnRef("view")} icon={<LayoutGrid size={14} />} label="Vista" active={activeQuickControl === "view"} onClick={() => toggleQuick("view")} />
          {content.view === "grid" ? (
            <Btn ref={setBtnRef("density")} icon={<Rows3 size={14} />} label="Densidad" active={activeQuickControl === "density"} onClick={() => toggleQuick("density")} />
          ) : null}
          <Btn ref={setBtnRef("source")} icon={<Link2 size={14} />} label="Fuente" active={activeQuickControl === "source"} onClick={() => onOpenAdvancedInspector({ mode: "focused", tab: "content", part: "source" })} />
          <Btn ref={setBtnRef("motion")} icon={<Move size={14} />} label="Motion" active={activeQuickControl === "motion"} onClick={() => toggleQuick("motion")} />
          <Btn icon={<Copy size={14} />} label="Duplicar" onClick={handleDuplicate} />
          <Btn ref={setBtnRef("more")} icon={<MoreHorizontal size={14} />} label="Más" active={activeQuickControl === "more"} onClick={() => toggleQuick("more")} primary />
        </ToolbarShell>

        <SiteQuickPopover open={activeQuickControl === "view"} anchorEl={anchorFor("view")} onClose={() => onQuickControlChange(null)} width={280} label="Vista">
          <div className="site-quick-control__seg-grid site-quick-control__seg-grid--compact">
            {(Object.keys(COLLECTION_VIEW_LABELS) as CollectionView[]).map((view) => (
              <button
                key={view}
                type="button"
                className={`site-quick-control__seg-btn${content.view === view ? " is-active" : ""}`}
                onClick={() => patchContent(switchCollectionView(content, view))}
              >
                {COLLECTION_VIEW_LABELS[view]}
              </button>
            ))}
          </div>
        </SiteQuickPopover>

        {gridOpts ? (
          <SiteQuickPopover open={activeQuickControl === "density"} anchorEl={anchorFor("density")} onClose={() => onQuickControlChange(null)} width={260} label="Densidad">
            <QuickField label="Columnas">
              <div className="site-quick-control__seg-row">
                {([1, 2, 3, 4] as const).map((columns) => (
                  <button
                    key={columns}
                    type="button"
                    className={`site-quick-control__seg-btn${gridOpts.columns === columns ? " is-active" : ""}`}
                    onClick={() =>
                      patchContent({
                        ...content,
                        viewOptions: { ...gridOpts, columns },
                      })
                    }
                  >
                    {columns}
                  </button>
                ))}
              </div>
            </QuickField>
            <QuickField label="Densidad">
              <div className="site-quick-control__seg-row">
                {(["compact", "normal", "airy"] as const).map((density) => (
                  <button
                    key={density}
                    type="button"
                    className={`site-quick-control__seg-btn${gridOpts.density === density ? " is-active" : ""}`}
                    onClick={() =>
                      patchContent({
                        ...content,
                        viewOptions: { ...gridOpts, density },
                      })
                    }
                  >
                    {density === "compact" ? "Compacto" : density === "normal" ? "Normal" : "Aireado"}
                  </button>
                ))}
              </div>
            </QuickField>
          </SiteQuickPopover>
        ) : null}

        {renderMotionPopover()}
        <SiteMoreMenu open={activeQuickControl === "more"} anchorEl={anchorFor("more")} items={moreItems} onSelect={handleMoreSelect} onClose={() => onQuickControlChange(null)} />
      </>
    );
  }

  if (isSectionRoot) {
    const splitPattern = section.layout.split?.pattern ?? "1";
    return (
      <>
        <ToolbarShell label={labelText}>
          <Btn ref={setBtnRef("split")} icon={<SplitSquareHorizontal size={14} />} label="Split" active={activeQuickControl === "split"} onClick={() => toggleQuick("split")} />
          {onToggleBleed ? <Btn icon={<Maximize2 size={14} />} label="Bleed" onClick={onToggleBleed} /> : null}
          {onOpenStructure ? <Btn icon={<Rows3 size={14} />} label="Orden" onClick={onOpenStructure} /> : null}
          <Btn ref={setBtnRef("motion")} icon={<Move size={14} />} label="Motion" active={activeQuickControl === "motion"} onClick={() => toggleQuick("motion")} />
          {onDuplicateSection ? <Btn icon={<Copy size={14} />} label="Duplicar" onClick={onDuplicateSection} /> : null}
          <Btn ref={setBtnRef("more")} icon={<MoreHorizontal size={14} />} label="Más" active={activeQuickControl === "more"} onClick={() => toggleQuick("more")} primary />
        </ToolbarShell>

        <SiteQuickPopover open={activeQuickControl === "split"} anchorEl={anchorFor("split")} onClose={() => onQuickControlChange(null)} width={280} label="Split">
          <div className="site-quick-control__seg-grid site-quick-control__seg-grid--compact">
            {(["1", "1-1", "2-1", "1-2", "1-1-1", "bento-a", "bento-b"] as const).map((pattern) => (
              <button
                key={pattern}
                type="button"
                className={`site-quick-control__seg-btn${splitPattern === pattern ? " is-active" : ""}`}
                onClick={() => {
                  if (!onPatchSection) return;
                  onPatchSection({
                    ...section,
                    layout: {
                      ...section.layout,
                      split: { ...section.layout.split, pattern },
                    },
                  });
                }}
              >
                {pattern}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="site-quick-popover__link"
            onClick={() => {
              onQuickControlChange(null);
              onOpenAdvancedInspector({ mode: "focused", tab: "layout", part: "layout" });
            }}
          >
            Ajustes avanzados
          </button>
        </SiteQuickPopover>

        {renderMotionPopover()}
        <SiteMoreMenu open={activeQuickControl === "more"} anchorEl={anchorFor("more")} items={moreItems} onSelect={handleMoreSelect} onClose={() => onQuickControlChange(null)} />
      </>
    );
  }

  return (
    <>
      <ToolbarShell label={labelText}>
        <Btn ref={setBtnRef("motion")} icon={<Move size={14} />} label="Motion" active={activeQuickControl === "motion"} onClick={() => toggleQuick("motion")} />
        <Btn icon={<Copy size={14} />} label="Duplicar" onClick={handleDuplicate} />
        <Btn ref={setBtnRef("more")} icon={<MoreHorizontal size={14} />} label="Más" active={activeQuickControl === "more"} onClick={() => toggleQuick("more")} primary />
      </ToolbarShell>
      {renderMotionPopover()}
      <SiteMoreMenu open={activeQuickControl === "more"} anchorEl={anchorFor("more")} items={moreItems} onSelect={handleMoreSelect} onClose={() => onQuickControlChange(null)} />
    </>
  );
}

const ToolbarShell = React.forwardRef<HTMLDivElement, { label: string; children: React.ReactNode }>(
  function ToolbarShell({ label, children }, ref) {
    return (
      <div ref={ref} className="site-editor-context-toolbar" role="toolbar" aria-label={`Acciones: ${label}`}>
        <span className="site-editor-context-toolbar__label">{label}</span>
        <div className="site-editor-context-toolbar__actions">{children}</div>
      </div>
    );
  },
);

const Btn = React.forwardRef<
  HTMLButtonElement,
  {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    active?: boolean;
    primary?: boolean;
    danger?: boolean;
  }
>(function Btn({ icon, label, onClick, active, primary, danger }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`site-editor-context-toolbar__btn${active ? " is-active" : ""}${primary ? " is-primary" : ""}${danger ? " is-danger" : ""}`}
      onClick={onClick}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
});
