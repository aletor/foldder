"use client";

import React, { useState } from "react";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";

type SemanticExpandableProps = {
  summary: React.ReactNode;
  chips?: React.ReactNode;
  children: React.ReactNode;
  maxRestLines?: number;
};

export function SemanticExpandable({ summary, chips, children, maxRestLines = 4 }: SemanticExpandableProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`genoma-v2-semantic${expanded ? " is-expanded" : ""}`}>
      <div className={`genoma-v2-semantic__rest${expanded ? "" : " genoma-v2-semantic__rest--clamp"}`} style={{ WebkitLineClamp: expanded ? undefined : maxRestLines }}>
        <div className="genoma-v2-semantic__summary">{summary}</div>
        {chips ? <div className="genoma-v2-chip-row genoma-v2-semantic__chips">{chips}</div> : null}
      </div>
      {expanded ? <div className="genoma-v2-semantic__detail">{children}</div> : null}
      <button type="button" className="genoma-v2-btn genoma-v2-btn--ghost genoma-v2-semantic__toggle" onClick={() => setExpanded((value) => !value)}>
        {expanded ? genomaLocaleEs.collapseDetail : genomaLocaleEs.expandDetail}
      </button>
    </div>
  );
}

export function EvidenceList({ quotes }: { quotes: string[] }) {
  if (!quotes.length) return null;
  return (
    <div className="genoma-v2-evidence">
      <span className="genoma-v2-evidence__label">{genomaLocaleEs.evidence}</span>
      <ul>
        {quotes.map((quote) => (
          <li key={quote}>"{quote}"</li>
        ))}
      </ul>
    </div>
  );
}
