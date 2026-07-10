"use client";

import React, { useState } from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { Star, ChevronDown } from "lucide-react";

type GenomaSidebarSourcesProps = {
  doc: GenomaDocument;
  onSetAuthoritativeSource?: (sourceRef: string, authoritative: boolean) => void;
};

function sourceShortLabel(ref: string): string {
  if (ref.length <= 36) return ref;
  return `${ref.slice(0, 18)}…${ref.slice(-14)}`;
}

export function GenomaSidebarSources({ doc, onSetAuthoritativeSource }: GenomaSidebarSourcesProps) {
  const [open, setOpen] = useState(false);
  const sourcesCount = doc.sources.length;
  if (!sourcesCount) return null;

  const primary = doc.sources[0];
  const label = primary ? sourceShortLabel(primary.ref) : "";

  return (
    <section className="genoma-sidebar-sources" aria-label="Fuentes">
      <button
        type="button"
        className="genoma-sidebar-sources__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>
          {sourcesCount} {sourcesCount === 1 ? "fuente" : "fuentes"}
          {!open && label ? ` · ${label}` : ""}
        </span>
        <ChevronDown size={14} className={`genoma-sidebar-sources__chevron${open ? " is-open" : ""}`} aria-hidden />
      </button>

      {open ? (
        <ul className="genoma-split-sources__list">
          {doc.sources.map((source, index) => (
            <li key={`${source.ref}-${source.ts}-${index}`} title={source.ref}>
              <span className="genoma-split-sources__ref">{source.ref}</span>
              <span className="genoma-split-sources__kind">{source.kind === "url" ? "web" : "archivo"}</span>
              {onSetAuthoritativeSource ? (
                <button
                  type="button"
                  className={`genoma-split-sources__star${source.authoritative ? " is-active" : ""}`}
                  aria-label={
                    source.authoritative
                      ? genomaLocaleEs.unmarkAuthoritative
                      : genomaLocaleEs.markAuthoritative
                  }
                  title={
                    source.authoritative
                      ? genomaLocaleEs.unmarkAuthoritative
                      : `${genomaLocaleEs.markAuthoritative} — ${genomaLocaleEs.authoritativeTooltip}`
                  }
                  onClick={() => onSetAuthoritativeSource(source.ref, !source.authoritative)}
                >
                  <Star size={12} fill={source.authoritative ? "currentColor" : "none"} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
