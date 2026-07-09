"use client";

import React from "react";
import type { Candidate } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";

export function GenomaVisualRankMeta({
  score,
  rankSignals,
  rankLabel,
  rank,
}: {
  score?: number;
  rankSignals?: string[];
  rankLabel?: string;
  rank?: number;
}) {
  if (!score && !rankSignals?.length && !rankLabel) return null;

  const scoreLabel =
    typeof score === "number"
      ? score <= 1
        ? genomaLocaleEs.rankScore(Math.round(score * 100))
        : genomaLocaleEs.rankScoreRaw(score)
      : null;

  return (
    <div className="genoma-v2-rank-meta">
      <div className="genoma-v2-rank-meta__head">
        {typeof rank === "number" ? <span className="genoma-v2-rank-meta__index">#{rank}</span> : null}
        {scoreLabel !== null ? <span className="genoma-v2-rank-meta__score">{scoreLabel}</span> : null}
        {rankLabel ? <span className="genoma-v2-rank-meta__badge">{rankLabel}</span> : null}
      </div>
      {rankSignals?.length ? (
        <div className="genoma-v2-rank-meta__signals">
          {rankSignals.map((signal) => (
            <span key={signal} className="genoma-v2-chip genoma-v2-chip--muted">
              {signal}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function GenomaLogoRankMeta({ candidate, rank }: { candidate: Candidate<unknown>; rank: number }) {
  return (
    <GenomaVisualRankMeta
      score={candidate.score}
      rankSignals={candidate.rankSignals}
      rankLabel={candidate.rankLabel}
      rank={rank}
    />
  );
}
