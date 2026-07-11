"use client";

import React from "react";
import type { Candidate } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

export function BrandKitVisualRankMeta({
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
        ? brandKitLocaleEs.rankScore(Math.round(score * 100))
        : brandKitLocaleEs.rankScoreRaw(score)
      : null;

  return (
    <div className="brandKit-v2-rank-meta">
      <div className="brandKit-v2-rank-meta__head">
        {typeof rank === "number" ? <span className="brandKit-v2-rank-meta__index">#{rank}</span> : null}
        {scoreLabel !== null ? <span className="brandKit-v2-rank-meta__score">{scoreLabel}</span> : null}
        {rankLabel ? <span className="brandKit-v2-rank-meta__badge">{rankLabel}</span> : null}
      </div>
      {rankSignals?.length ? (
        <div className="brandKit-v2-rank-meta__signals">
          {rankSignals.map((signal) => (
            <span key={signal} className="brandKit-v2-chip brandKit-v2-chip--muted">
              {signal}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BrandKitLogoRankMeta({ candidate, rank }: { candidate: Candidate<unknown>; rank: number }) {
  return (
    <BrandKitVisualRankMeta
      score={candidate.score}
      rankSignals={candidate.rankSignals}
      rankLabel={candidate.rankLabel}
      rank={rank}
    />
  );
}
