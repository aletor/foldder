"use client";

import React from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { genomaReviewQuestion } from "@/lib/genoma/genoma-review-queue";
import type { GenomaReviewQueueItem } from "@/lib/genoma/genoma-review-queue";

export function GenomaReviewPrompt({
  doc,
  item,
}: {
  doc: GenomaDocument;
  item: GenomaReviewQueueItem;
}) {
  return (
    <p className="genoma-review-prompt" role="status">
      {genomaReviewQuestion(doc, item)}
    </p>
  );
}
