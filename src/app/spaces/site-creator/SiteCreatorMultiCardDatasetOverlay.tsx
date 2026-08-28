"use client";

import React from "react";
import type { Dataset, FieldDef } from "../dataset/dataset-types";
import type { PageRect } from "./site-creator-coordinate-space";
import { isSiteMultiCardNode } from "./site-creator-types";
import type { SiteBlueprintV1, SiteMultiCardSlotBindingV1 } from "./site-creator-types";
import {
  datasetFieldBindKind,
  datasetListHiddenRowCount,
  isMultiCardDatasetBound,
  unusedDatasetFields,
  usableDatasetLists,
} from "./site-creator-multicard-dataset";
import { multiCardScrollDelta, type MultiCardContainerLayout } from "./site-creator-multicard-layout";
import { SC_VISUAL } from "./site-creator-visual-tokens";

export type ArmedDatasetChip = {
  nodeId: string;
  source: "list" | "constant";
  fieldId: string;
  fieldKey: string;
  label: string;
  kind: "text" | "image";
};

export function SiteCreatorMultiCardDatasetOverlay({
  containers,
  blueprint,
  dataset,
  armed,
  compatibleBounds = [],
  flashUnclaimed = false,
  onClaimList,
  onArmChip,
  onUnbindLayer,
}: {
  containers: MultiCardContainerLayout[];
  blueprint: SiteBlueprintV1;
  dataset: Dataset | null;
  armed: ArmedDatasetChip | null;
  compatibleBounds?: PageRect[];
  flashUnclaimed?: boolean;
  onClaimList: (nodeId: string, listId: string) => void;
  onArmChip: (chip: ArmedDatasetChip | null) => void;
  onUnbindLayer: (nodeId: string, moldLayerId: string) => void;
}) {
  if (!dataset || containers.length === 0) return null;
  const lists = usableDatasetLists(dataset);
  if (lists.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[9]" data-testid="site-creator-dataset-layer">
      {containers.map((container) => {
        const node = blueprint.nodes[container.nodeId];
        if (!node || !isSiteMultiCardNode(node)) return null;
        const bound = isMultiCardDatasetBound(node);
        const origin = container.clipRect;
        const { dx, dy } = multiCardScrollDelta(container.axis, container.step, container.scrollIndex);
        const hiddenRows =
          bound && node.dataset
            ? datasetListHiddenRowCount(dataset, node.dataset.listId, node.count)
            : 0;
        return (
          <div
            key={container.nodeId}
            className="absolute overflow-visible"
            data-testid={`site-creator-dataset-card-${container.nodeId}`}
            data-unclaimed={bound ? undefined : "1"}
            style={{
              left: origin.x,
              top: origin.y,
              width: origin.width,
              height: origin.height,
              boxShadow: !bound && flashUnclaimed ? `0 0 0 2px ${SC_VISUAL.selection}` : undefined,
            }}
          >
            {bound
              ? compatibleBounds.map((bounds, i) => (
                  <div
                    key={`hint-${i}`}
                    className="pointer-events-none absolute"
                    data-testid="site-creator-dataset-compatible"
                    style={{
                      left: bounds.x - origin.x,
                      top: bounds.y - origin.y,
                      width: bounds.width,
                      height: bounds.height,
                      border: `1px dashed ${SC_VISUAL.selection}`,
                      opacity: 0.72,
                    }}
                  />
                ))
              : null}
            {bound
              ? node.cards.map((card, index) => {
                  if (Object.keys(card.overrides).length === 0) return null;
                  const rect = container.cardRects[index];
                  if (!rect) return null;
                  return (
                    <div
                      key={`exc-${card.id}`}
                      className="pointer-events-none absolute"
                      data-testid={`site-creator-dataset-exception-${card.id}`}
                      title="Excepción en esta card"
                      style={{
                        left: rect.x + dx - origin.x + 6,
                        top: rect.y + dy - origin.y + 6,
                        background: SC_VISUAL.selection,
                        color: "#101820",
                        fontSize: 8,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        padding: "1px 5px",
                        borderRadius: 999,
                      }}
                    >
                      excepción
                    </div>
                  );
                })
              : null}
            {!bound ? (
              <div className="pointer-events-auto absolute left-2 top-2 z-[10] flex flex-col gap-1">
                {lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    data-testid={`site-creator-dataset-sheet-${list.id}`}
                    className="rounded border px-2 py-1 text-left text-[10px] font-medium tracking-wide"
                    style={{
                      background: SC_VISUAL.chipBg,
                      borderColor: flashUnclaimed ? SC_VISUAL.selection : SC_VISUAL.chipBorder,
                      color: SC_VISUAL.chipFg,
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onClaimList(container.nodeId, list.id);
                    }}
                  >
                    {list.name}
                    <span className="ml-2 opacity-50">{list.cards.length}</span>
                    <span className="mt-0.5 block text-[8px] font-normal tracking-normal opacity-50">
                      Toca para usar
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <BoundChips
                dataset={dataset}
                listId={node.dataset!.listId}
                bindings={node.slotBindings ?? {}}
                nodeId={node.id}
                armed={armed}
                hiddenRows={hiddenRows}
                onArmChip={onArmChip}
                onUnbindLayer={onUnbindLayer}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BoundChips({
  dataset,
  listId,
  bindings,
  nodeId,
  armed,
  hiddenRows,
  onArmChip,
  onUnbindLayer,
}: {
  dataset: Dataset;
  listId: string;
  bindings: Record<string, SiteMultiCardSlotBindingV1>;
  nodeId: string;
  armed: ArmedDatasetChip | null;
  hiddenRows: number;
  onArmChip: (chip: ArmedDatasetChip | null) => void;
  onUnbindLayer: (nodeId: string, moldLayerId: string) => void;
}) {
  const unused = unusedDatasetFields({ dataset, listId, bindings });
  const boundEntries = Object.entries(bindings);
  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-[10] flex max-w-[70%] flex-wrap gap-1">
      {unused.list.map((field) => (
        <FieldChip
          key={`list-${field.id}`}
          field={field}
          source="list"
          active={armed?.fieldId === field.id && armed.source === "list" && armed.nodeId === nodeId}
          onClick={() => toggleArmedChip(nodeId, field, "list", armed, onArmChip)}
        />
      ))}
      {unused.constants.map((field) => (
        <FieldChip
          key={`const-${field.id}`}
          field={field}
          source="constant"
          muted
          active={armed?.fieldId === field.id && armed.source === "constant" && armed.nodeId === nodeId}
          onClick={() => toggleArmedChip(nodeId, field, "constant", armed, onArmChip)}
        />
      ))}
      {boundEntries.map(([layerId, binding]) => {
        const field =
          binding.source === "constant"
            ? dataset.constants.fields.find((item) => item.id === binding.fieldId)
            : dataset.lists.find((list) => list.id === listId)?.schema.find((item) => item.id === binding.fieldId);
        if (!field) return null;
        return (
          <button
            key={`bound-${layerId}`}
            type="button"
            data-testid={`site-creator-dataset-bound-${layerId}`}
            title="Quitar enlace"
            className="rounded-full border px-2 py-0.5 text-[9px]"
            style={{
              background: "transparent",
              borderColor: SC_VISUAL.selection,
              color: SC_VISUAL.selection,
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onUnbindLayer(nodeId, layerId);
            }}
          >
            {field.label}
          </button>
        );
      })}
      {hiddenRows > 0 ? (
        <span
          data-testid="site-creator-dataset-overflow"
          className="rounded-full border px-2 py-0.5 text-[9px]"
          style={{
            background: SC_VISUAL.chipBg,
            borderColor: SC_VISUAL.chipBorder,
            color: SC_VISUAL.chipMuted,
          }}
          title={`${hiddenRows} filas más en la lista`}
        >
          +{hiddenRows} en la lista
        </span>
      ) : null}
    </div>
  );
}

function chipFromField(
  nodeId: string,
  field: FieldDef,
  source: "list" | "constant",
): ArmedDatasetChip | null {
  const kind = datasetFieldBindKind(field.type);
  if (!kind) return null;
  return { nodeId, source, fieldId: field.id, fieldKey: field.key, label: field.label, kind };
}

function toggleArmedChip(
  nodeId: string,
  field: FieldDef,
  source: "list" | "constant",
  armed: ArmedDatasetChip | null,
  onArmChip: (chip: ArmedDatasetChip | null) => void,
) {
  const chip = chipFromField(nodeId, field, source);
  if (!chip) return;
  const same =
    armed?.fieldId === chip.fieldId && armed.source === source && armed.nodeId === nodeId;
  onArmChip(same ? null : chip);
}

function FieldChip({
  field,
  source,
  muted,
  active,
  onClick,
}: {
  field: FieldDef;
  source: "list" | "constant";
  muted?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`site-creator-dataset-chip-${source}-${field.id}`}
      className="rounded-full border px-2 py-0.5 text-[9px] tracking-wide"
      style={{
        background: active ? SC_VISUAL.selection : SC_VISUAL.chipBg,
        borderColor: active ? SC_VISUAL.selection : SC_VISUAL.chipBorder,
        color: active ? "#101820" : muted ? SC_VISUAL.chipMuted : SC_VISUAL.chipFg,
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {field.label}
    </button>
  );
}
