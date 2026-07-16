"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { BrandKitStationeryContact } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";

export function BrandKitStationeryContactSheet({
  open,
  contact,
  onClose,
  onSave,
}: {
  open: boolean;
  contact: BrandKitStationeryContact;
  onClose: () => void;
  onSave: (next: BrandKitStationeryContact) => void;
}) {
  const [draft, setDraft] = useState(contact);

  useEffect(() => {
    if (open) setDraft(contact);
  }, [open, contact]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="brandKit-stationery-contact-sheet is-open">
      <button type="button" className="brandKit-stationery-contact-sheet__backdrop" aria-label="Cerrar" onClick={onClose} />
      <aside className="brandKit-stationery-contact-sheet__panel" role="dialog" aria-modal="true" aria-label={brandKitLocaleEs.stationeryEditContact}>
        <header className="brandKit-stationery-contact-sheet__head">
          <h2 className="brandKit-stationery-contact-sheet__title">{brandKitLocaleEs.stationeryEditContact}</h2>
          <button type="button" className="brandKit-stationery-contact-sheet__close" aria-label="Cerrar" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <form
          className="brandKit-stationery-contact-sheet__form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
            onClose();
          }}
        >
          <label className="brandKit-stationery-contact-sheet__field">
            <span>{brandKitLocaleEs.stationeryFieldName}</span>
            <input
              value={draft.personName ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, personName: event.target.value }))}
            />
          </label>
          <label className="brandKit-stationery-contact-sheet__field">
            <span>{brandKitLocaleEs.stationeryFieldRole}</span>
            <input
              value={draft.role ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value }))}
            />
          </label>
          <label className="brandKit-stationery-contact-sheet__field">
            <span>{brandKitLocaleEs.stationeryFieldEmail}</span>
            <input
              type="email"
              value={draft.email ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label className="brandKit-stationery-contact-sheet__field">
            <span>{brandKitLocaleEs.stationeryFieldPhone}</span>
            <input
              value={draft.phone ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </label>
          <label className="brandKit-stationery-contact-sheet__field">
            <span>{brandKitLocaleEs.stationeryFieldAddress}</span>
            <input
              value={draft.address ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, address: event.target.value }))}
            />
          </label>
          <label className="brandKit-stationery-contact-sheet__field">
            <span>{brandKitLocaleEs.stationeryFieldWebsite}</span>
            <input
              value={draft.website ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, website: event.target.value }))}
            />
          </label>
          <div className="brandKit-stationery-contact-sheet__actions">
            <BrandKitFoldderButton variant="ghost" type="button" onClick={onClose}>
              {brandKitLocaleEs.cancel}
            </BrandKitFoldderButton>
            <BrandKitFoldderButton variant="primary" type="submit">
              {brandKitLocaleEs.save}
            </BrandKitFoldderButton>
          </div>
        </form>
      </aside>
    </div>
  );
}
