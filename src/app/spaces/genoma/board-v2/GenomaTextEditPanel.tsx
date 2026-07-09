"use client";

import React, { useState } from "react";
import { GenomaFoldderButton } from "./GenomaFoldderButton";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { Check, X } from "lucide-react";

export type GenomaTextEditField = {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
};

export function GenomaTextEditPanel({
  fields,
  onSave,
  onCancel,
}: {
  fields: GenomaTextEditField[];
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((field) => [field.id, field.value])),
  );

  return (
    <div className="genoma-text-edit">
      {fields.map((field) => (
        <label key={field.id} className="genoma-text-edit__field">
          <span className="genoma-text-edit__label">{field.label}</span>
          {field.multiline ? (
            <textarea
              className="genoma-text-edit__input"
              rows={4}
              value={draft[field.id] ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, [field.id]: event.target.value }))}
            />
          ) : (
            <input
              className="genoma-text-edit__input"
              value={draft[field.id] ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, [field.id]: event.target.value }))}
            />
          )}
        </label>
      ))}
      <div className="genoma-text-edit__actions">
        <GenomaFoldderButton icon={Check} onClick={() => onSave(draft)}>
          {genomaLocaleEs.save}
        </GenomaFoldderButton>
        <GenomaFoldderButton variant="muted" icon={X} onClick={onCancel}>
          {genomaLocaleEs.cancel}
        </GenomaFoldderButton>
      </div>
    </div>
  );
}
