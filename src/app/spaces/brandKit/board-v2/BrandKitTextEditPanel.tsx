"use client";

import React, { useState } from "react";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitSlotTextEditField } from "@/lib/brandkit/studio/brand-kit-slot-text-edit";
import { Check, X } from "lucide-react";

export type BrandKitTextEditField = BrandKitSlotTextEditField;

export function BrandKitTextEditPanel({
  fields,
  onSave,
  onCancel,
}: {
  fields: BrandKitTextEditField[];
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((field) => [field.id, field.value])),
  );

  return (
    <div className="brandKit-text-edit">
      {fields.map((field) => (
        <label key={field.id} className="brandKit-text-edit__field">
          <span className="brandKit-text-edit__label">{field.label}</span>
          {field.multiline ? (
            <textarea
              className="brandKit-text-edit__input"
              rows={4}
              value={draft[field.id] ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, [field.id]: event.target.value }))}
            />
          ) : (
            <input
              className="brandKit-text-edit__input"
              value={draft[field.id] ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, [field.id]: event.target.value }))}
            />
          )}
        </label>
      ))}
      <div className="brandKit-text-edit__actions">
        <BrandKitFoldderButton icon={Check} onClick={() => onSave(draft)}>
          {brandKitLocaleEs.save}
        </BrandKitFoldderButton>
        <BrandKitFoldderButton variant="muted" icon={X} onClick={onCancel}>
          {brandKitLocaleEs.cancel}
        </BrandKitFoldderButton>
      </div>
    </div>
  );
}
