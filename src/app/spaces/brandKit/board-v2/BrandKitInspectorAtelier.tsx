"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import type { SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import {
  buildAtelierAttributeCards,
  buildAtelierEvidenceItems,
  buildAtelierSynthesis,
  filterEvidenceForAttribute,
  type AtelierAttributeCard,
  type AtelierAttributeId,
  type AtelierEvidenceItem,
} from "@/lib/brandkit/studio/brand-kit-atelier-model";
import {
  buildSlotTextEditConfig,
  canEditSlotText,
} from "@/lib/brandkit/studio/brand-kit-slot-text-edit";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";

function confidenceLabel(level?: AtelierEvidenceItem["confidence"]): string {
  if (level === "high") return brandKitLocaleEs.atelierEvidenceConfidenceHigh;
  if (level === "low") return brandKitLocaleEs.atelierEvidenceConfidenceLow;
  return brandKitLocaleEs.atelierEvidenceConfidenceMedium;
}

function EvidenceDrawer({
  open,
  title,
  items,
  highlightedIds,
  onClose,
}: {
  open: boolean;
  title: string;
  items: AtelierEvidenceItem[];
  highlightedIds: string[];
  onClose: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!open) return null;

  return (
    <aside className="brandKit-atelier-evidence-drawer" aria-label={title}>
      <header className="brandKit-atelier-evidence-drawer__head">
        <div>
          <p className="brandKit-atelier-evidence-drawer__title">{title}</p>
          <p className="brandKit-atelier-evidence-drawer__meta">
            {confidenceLabel(items[0]?.confidence)}
            {" · "}
            {brandKitLocaleEs.atelierEvidenceSourcesAgree(items.length)}
          </p>
        </div>
        <button
          type="button"
          className="brandKit-atelier-evidence-drawer__close"
          aria-label={brandKitLocaleEs.readerClose}
          onClick={onClose}
        >
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </header>

      <ol className="brandKit-atelier-evidence-drawer__list">
        {items.map((item, index) => {
          const expanded = expandedId === item.id;
          const shortQuote =
            item.quote.length > 160 && !expanded ? `${item.quote.slice(0, 157).trim()}…` : item.quote;
          return (
            <li
              key={item.id}
              className={`brandKit-atelier-evidence-drawer__item${highlightedIds.includes(item.id) ? " is-lit" : ""}`}
            >
              <p className="brandKit-atelier-evidence-drawer__source">
                {String(index + 1).padStart(2, "0")} · {item.sourceLabel}
              </p>
              <blockquote className="brandKit-atelier-evidence-drawer__quote">“{shortQuote}”</blockquote>
              {item.quote.length > 160 ? (
                <button
                  type="button"
                  className="brandKit-atelier-evidence-drawer__expand"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  {expanded ? brandKitLocaleEs.atelierHideFullQuote : brandKitLocaleEs.atelierShowFullQuote}
                </button>
              ) : null}
              {item.contributes ? (
                <p className="brandKit-atelier-evidence-drawer__contrib">
                  <span>{brandKitLocaleEs.atelierContributes}</span>
                  {item.contributes}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function AttributeCard({
  card,
  selected,
  editing,
  canEdit,
  draft,
  litEvidence,
  onSelect,
  onHover,
  onLeave,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancel,
  onOpenEvidence,
  onReformulateHint,
}: {
  card: AtelierAttributeCard;
  selected: boolean;
  editing: boolean;
  canEdit: boolean;
  draft: string;
  litEvidence: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
  onStartEdit: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenEvidence: () => void;
  onReformulateHint: () => void;
}) {
  return (
    <article
      className={`brandKit-atelier-card${selected ? " is-selected" : ""}${litEvidence ? " is-evidence-lit" : ""}`}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <header className="brandKit-atelier-card__head">
        <p className="brandKit-atelier-card__label">{card.label}</p>
        <span className={`brandKit-atelier-card__status${card.confirmed ? " is-confirmed" : ""}`}>
          {card.confirmed ? brandKitLocaleEs.confirmedStatusFemale : brandKitLocaleEs.pendingChip}
        </span>
      </header>

      {editing ? (
        <div className="brandKit-atelier-card__edit">
          <textarea
            className="brandKit-atelier-card__input"
            rows={card.multiline ? 5 : 2}
            value={draft}
            autoFocus
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <div className="brandKit-atelier-card__edit-actions">
            <BrandKitFoldderButton
              compact
              icon={Check}
              onClick={(event) => {
                event.stopPropagation();
                onSave();
              }}
            >
              {brandKitLocaleEs.inspectorSaveField}
            </BrandKitFoldderButton>
            <BrandKitFoldderButton
              variant="ghost"
              compact
              icon={X}
              onClick={(event) => {
                event.stopPropagation();
                onCancel();
              }}
            >
              {brandKitLocaleEs.inspectorCancelField}
            </BrandKitFoldderButton>
          </div>
        </div>
      ) : (
        <>
          <p className="brandKit-atelier-card__essence">{card.essence || "—"}</p>
          {card.explanation ? <p className="brandKit-atelier-card__explanation">{card.explanation}</p> : null}
          {card.keywords.length ? (
            <p className="brandKit-atelier-card__keys-line">
              <span>{brandKitLocaleEs.atelierKeysLabel}</span>
              {card.keywords.join(" · ")}
            </p>
          ) : null}
          <div className="brandKit-atelier-card__foot">
            <p className="brandKit-atelier-card__evidence-meta">
              {brandKitLocaleEs.atelierBasedOnEvidence(card.evidenceIds.length)}
            </p>
            <button
              type="button"
              className="brandKit-atelier-card__sources"
              onClick={(event) => {
                event.stopPropagation();
                onOpenEvidence();
              }}
            >
              {brandKitLocaleEs.atelierViewSources} →
            </button>
          </div>
        </>
      )}

      {selected && !editing ? (
        <div className="brandKit-atelier-card__toolbar" onClick={(event) => event.stopPropagation()}>
          {canEdit ? (
            <BrandKitFoldderButton variant="muted" compact icon={Pencil} onClick={onStartEdit}>
              {brandKitLocaleEs.atelierEdit}
            </BrandKitFoldderButton>
          ) : null}
          {canEdit ? (
            <BrandKitFoldderButton variant="ghost" compact onClick={onReformulateHint}>
              {brandKitLocaleEs.atelierReformulate}
            </BrandKitFoldderButton>
          ) : null}
          <BrandKitFoldderButton variant="ghost" compact onClick={onOpenEvidence}>
            {brandKitLocaleEs.atelierViewEvidence}
          </BrandKitFoldderButton>
        </div>
      ) : null}
    </article>
  );
}

export function BrandKitInspectorAtelier({
  slotId,
  slot,
  onAction,
  mode = "attributes",
  evidenceOnly = false,
  onOpenEvidenceTab,
}: {
  slotId: SlotId;
  slot: SlotState<unknown>;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  mode?: "synthesis" | "attributes";
  evidenceOnly?: boolean;
  summary?: React.ReactNode;
  sideContent?: React.ReactNode;
  onOpenEvidenceTab?: () => void;
}) {
  const config = useMemo(() => buildSlotTextEditConfig(slotId, slot), [slot, slotId]);
  const canEdit = canEditSlotText(slot, slotId);
  const evidenceItems = useMemo(() => buildAtelierEvidenceItems(slotId, slot), [slot, slotId]);
  const cards = useMemo(
    () => buildAtelierAttributeCards(slotId, slot, evidenceItems),
    [evidenceItems, slot, slotId],
  );
  const synthesis = useMemo(() => buildAtelierSynthesis(slotId, slot), [slot, slotId]);

  const [selectedId, setSelectedId] = useState<AtelierAttributeId | null>(null);
  const [hoveredId, setHoveredId] = useState<AtelierAttributeId | null>(null);
  const [editingId, setEditingId] = useState<AtelierAttributeId | null>(null);
  const [draft, setDraft] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAttributeId, setDrawerAttributeId] = useState<AtelierAttributeId | null>(null);
  const [reformulateOpen, setReformulateOpen] = useState(false);

  const activeAttributeId = hoveredId ?? selectedId;
  const litEvidenceIds = useMemo(() => {
    if (!activeAttributeId) return [];
    return evidenceItems
      .filter((item) => item.attributeIds.includes(activeAttributeId))
      .map((item) => item.id);
  }, [activeAttributeId, evidenceItems]);

  const drawerItems = useMemo(
    () => filterEvidenceForAttribute(evidenceItems, drawerAttributeId),
    [drawerAttributeId, evidenceItems],
  );

  const drawerTitle = useMemo(() => {
    const card = cards.find((entry) => entry.id === drawerAttributeId);
    return brandKitLocaleEs.atelierEvidenceOf(card?.label ?? brandKitLocaleEs.atelierEvidenceTab);
  }, [cards, drawerAttributeId]);

  const selectedCard = cards.find((card) => card.id === selectedId) ?? null;

  useEffect(() => {
    if (!editingId || !config) return;
    const card = cards.find((entry) => entry.id === editingId);
    if (!card) return;
    if (String(card.id).startsWith("belief:")) {
      setDraft(card.essence);
      return;
    }
    const field = config.fields.find((entry) => entry.id === card.fieldId);
    if (field) setDraft(field.value);
  }, [cards, config, editingId]);

  const saveCard = (card: AtelierAttributeCard, value: string) => {
    if (!config) return;
    if (typeof card.id === "string" && card.id.startsWith("belief:")) {
      const essence = slot.value as import("@/lib/brandkit/brand-kit-types").EssenceValue;
      const index = Number(String(card.id).split(":")[1]);
      const beliefs = [...(essence.beliefs ?? [])];
      const current = beliefs[index];
      if (current) {
        beliefs[index] = {
          ...current,
          explanation: value.trim() || undefined,
        };
        onAction(slotId, { action: "set", value: { ...essence, beliefs } });
      }
      setEditingId(null);
      return;
    }
    const values = Object.fromEntries(config.fields.map((entry) => [entry.id, entry.value]));
    values[card.fieldId] = value;
    onAction(slotId, { action: "set", value: config.applyValues(values) });
    setEditingId(null);
  };

  const openEvidenceFor = (attributeId: AtelierAttributeId) => {
    setDrawerAttributeId(attributeId);
    setDrawerOpen(true);
  };

  if (evidenceOnly) {
    if (!evidenceItems.length) {
      return <p className="brandKit-detail-panel__empty">{brandKitLocaleEs.detailEmpty}</p>;
    }
    return (
      <div className="brandKit-atelier-study brandKit-atelier-study--evidence-page">
        <EvidenceDrawer
          open
          title={brandKitLocaleEs.atelierEvidenceTab}
          items={evidenceItems}
          highlightedIds={[]}
          onClose={() => onOpenEvidenceTab?.()}
        />
      </div>
    );
  }

  if (mode === "synthesis") {
    if (!synthesis) {
      return <p className="brandKit-detail-panel__empty">{brandKitLocaleEs.detailEmpty}</p>;
    }
    const descriptorRow = synthesis.rows.find(
      (row) => row.label.toLowerCase().includes("descriptor") || row.label === brandKitLocaleEs.personality,
    );
    const listRows = synthesis.rows.filter((row) => row !== descriptorRow);
    const chipValues =
      synthesis.personality.length > 0
        ? synthesis.personality
        : descriptorRow?.value
          ? descriptorRow.value.split(/\s*[·,]\s*/).map((part) => part.trim()).filter(Boolean)
          : [];

    return (
      <div className="brandKit-atelier-study brandKit-atelier-study--synthesis">
        <section className="brandKit-atelier-synthesis">
          <div className="brandKit-atelier-synthesis__intro">
            <p className="brandKit-atelier-synthesis__kicker">{synthesis.kicker}</p>
            {synthesis.headline ? (
              <h2 className="brandKit-atelier-synthesis__headline">{synthesis.headline}</h2>
            ) : null}
            {synthesis.lead ? <p className="brandKit-atelier-synthesis__lead">{synthesis.lead}</p> : null}
            {chipValues.length ? (
              <p className="brandKit-atelier-synthesis__tags">
                <span className="brandKit-atelier-synthesis__tags-label">
                  {descriptorRow?.label ?? brandKitLocaleEs.personality}
                </span>
                {chipValues.join(" · ")}
              </p>
            ) : null}
          </div>
          {listRows.length ? (
            <dl className="brandKit-atelier-synthesis__grid">
              {listRows.map((row) => (
                <div key={row.label} className="brandKit-atelier-synthesis__row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      </div>
    );
  }

  if (!config || !cards.length) {
    return <p className="brandKit-detail-panel__empty">{brandKitLocaleEs.detailEmpty}</p>;
  }

  return (
    <div className={`brandKit-atelier-study${drawerOpen ? " has-drawer" : ""}`}>
      <div className="brandKit-atelier-study__main">
        <div className="brandKit-atelier-cards">
          {cards.map((card) => (
            <AttributeCard
              key={card.id}
              card={card}
              selected={selectedId === card.id}
              editing={editingId === card.id}
              canEdit={canEdit && !editingId}
              draft={draft}
              litEvidence={Boolean(activeAttributeId === card.id && card.evidenceIds.length)}
              onSelect={() => setSelectedId(card.id)}
              onHover={() => setHoveredId(card.id)}
              onLeave={() => setHoveredId(null)}
              onStartEdit={() => {
                setSelectedId(card.id);
                setEditingId(card.id);
              }}
              onDraftChange={setDraft}
              onSave={() => saveCard(card, draft)}
              onCancel={() => setEditingId(null)}
              onOpenEvidence={() => openEvidenceFor(card.id)}
              onReformulateHint={() => {
                setSelectedId(card.id);
                setReformulateOpen(true);
              }}
            />
          ))}
        </div>

        {reformulateOpen && selectedCard && canEdit ? (
          <div className="brandKit-atelier-reformulate" role="dialog" aria-label={brandKitLocaleEs.atelierReformulate}>
            <p className="brandKit-atelier-reformulate__title">
              {brandKitLocaleEs.atelierReformulate} · {selectedCard.label}
            </p>
            <div className="brandKit-atelier-reformulate__actions">
              {[
                brandKitLocaleEs.atelierReformulateShorter,
                brandKitLocaleEs.atelierReformulateDistinct,
                brandKitLocaleEs.atelierReformulateFaithful,
              ].map((label) => (
                <BrandKitFoldderButton
                  key={label}
                  variant="muted"
                  compact
                  onClick={() => {
                    setReformulateOpen(false);
                    setEditingId(selectedCard.id);
                  }}
                >
                  {label}
                </BrandKitFoldderButton>
              ))}
            </div>
            <p className="brandKit-atelier-reformulate__hint">
              Ajusta el texto a mano en la tarjeta. La reformulación automática no se lanza sola.
            </p>
            <button
              type="button"
              className="brandKit-atelier-reformulate__close"
              onClick={() => setReformulateOpen(false)}
            >
              {brandKitLocaleEs.inspectorCancelField}
            </button>
          </div>
        ) : null}
      </div>

      <EvidenceDrawer
        open={drawerOpen}
        title={drawerTitle}
        items={drawerItems}
        highlightedIds={litEvidenceIds}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
