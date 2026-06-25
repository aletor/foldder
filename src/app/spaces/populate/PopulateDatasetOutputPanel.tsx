"use client";

import React, { useMemo } from "react";
import { Database, Layers, RefreshCw } from "lucide-react";
import type { FieldDef } from "@/app/spaces/dataset/dataset-types";
import {
  findImageFieldForOutput,
  suggestPopulateOutputColumnLabel,
} from "./populate-dataset-output";
import type { PopulateDatasetOutputSettings } from "./populate-types";

export interface PopulateDatasetOutputPanelProps {
  settings: PopulateDatasetOutputSettings;
  schema: FieldDef[];
  templateLabel: string | null;
  lastWriteSummary?: string | null;
  onChange: (next: PopulateDatasetOutputSettings) => void;
  /**
   * `image` (por defecto): una sola columna de imagen para el resultado de Image Creation.
   * `designer`: M columnas (una por slide); `columnLabel` actúa como prefijo de grupo y no hay
   * estrategia de conflicto por columna (cada slide tiene su propia columna estable).
   */
  variant?: "image" | "designer";
}

export function defaultPopulateDatasetOutputSettings(templateLabel: string | null): PopulateDatasetOutputSettings {
  return {
    enabled: false,
    columnLabel: suggestPopulateOutputColumnLabel(templateLabel ?? "Resultado"),
    conflictStrategy: "versioned",
    fillMode: "empty_only",
  };
}

export function PopulateDatasetOutputPanel({
  settings,
  schema,
  templateLabel,
  lastWriteSummary,
  onChange,
  variant = "image",
}: PopulateDatasetOutputPanelProps) {
  const isDesigner = variant === "designer";
  const matchingField = useMemo(
    () => (isDesigner ? null : findImageFieldForOutput(schema, settings.columnLabel)),
    [isDesigner, schema, settings.columnLabel],
  );

  const patch = (partial: Partial<PopulateDatasetOutputSettings>) => {
    const next = { ...settings, ...partial };
    if (partial.columnLabel != null) {
      const match = findImageFieldForOutput(schema, partial.columnLabel);
      next.existingFieldId =
        next.conflictStrategy === "update" && match ? match.id : match?.id;
    }
    if (partial.conflictStrategy === "update" && matchingField) {
      next.existingFieldId = matchingField.id;
    }
    if (partial.conflictStrategy === "versioned") {
      next.existingFieldId = matchingField?.id;
    }
    onChange(next);
  };

  return (
    <div className="populate-studio-dataset-output">
      <label className="populate-studio-dataset-output__toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        <Database size={14} strokeWidth={1.75} aria-hidden />
        <span>
          {isDesigner
            ? "Volcar slides al Dataset (1 columna por slide)"
            : "Añadir resultado al Dataset como columna"}
        </span>
      </label>

      {settings.enabled ? (
        <div className="populate-studio-dataset-output__body">
          {isDesigner ? (
            <p className="populate-studio-dataset-output__hint">
              Cada instancia generada se rasteriza y sus slides vuelven al Dataset como columnas
              estables (una por slide), agrupadas bajo el prefijo de abajo. Reparto fila a fila.
            </p>
          ) : null}
          <label className="populate-studio-dataset-output__field">
            <span>{isDesigner ? "Prefijo de las columnas" : "Nombre de la columna"}</span>
            <input
              type="text"
              value={settings.columnLabel}
              placeholder={suggestPopulateOutputColumnLabel(templateLabel ?? "Resultado")}
              onChange={(e) => patch({ columnLabel: e.target.value })}
            />
          </label>

          {matchingField ? (
            <fieldset className="populate-studio-dataset-output__group">
              <legend>
                <RefreshCw size={12} aria-hidden /> La columna «{matchingField.label}» ya existe
              </legend>
              <label className="populate-studio-dataset-output__radio">
                <input
                  type="radio"
                  name="populate-dataset-conflict"
                  checked={settings.conflictStrategy === "versioned"}
                  onChange={() => patch({ conflictStrategy: "versioned" })}
                />
                Crear columna nueva versionada (p. ej. {matchingField.label} v2)
              </label>
              <label className="populate-studio-dataset-output__radio">
                <input
                  type="radio"
                  name="populate-dataset-conflict"
                  checked={settings.conflictStrategy === "update"}
                  onChange={() => patch({ conflictStrategy: "update", existingFieldId: matchingField.id })}
                />
                Actualizar la columna existente
              </label>
            </fieldset>
          ) : null}

          <fieldset className="populate-studio-dataset-output__group">
            <legend>
              <Layers size={12} aria-hidden /> Celdas a escribir
            </legend>
            <label className="populate-studio-dataset-output__radio">
              <input
                type="radio"
                name="populate-dataset-fill"
                checked={settings.fillMode === "empty_only"}
                onChange={() => patch({ fillMode: "empty_only" })}
              />
              Solo celdas vacías (idempotente)
            </label>
            <label className="populate-studio-dataset-output__radio">
              <input
                type="radio"
                name="populate-dataset-fill"
                checked={settings.fillMode === "overwrite_all"}
                onChange={() => patch({ fillMode: "overwrite_all" })}
              />
              Rellenar todas las filas generadas
            </label>
          </fieldset>

          {lastWriteSummary ? (
            <p className="populate-studio-dataset-output__summary">{lastWriteSummary}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
