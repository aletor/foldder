"use client";

import React from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { brandKitReviewQuestion } from "@/lib/brandkit/brand-kit-review-queue";
import type { BrandKitReviewQueueItem } from "@/lib/brandkit/brand-kit-review-queue";

export function BrandKitReviewPrompt({
  doc,
  item,
}: {
  doc: BrandKitDocument;
  item: BrandKitReviewQueueItem;
}) {
  return (
    <p className="brandKit-review-prompt" role="status">
      {brandKitReviewQuestion(doc, item)}
    </p>
  );
}
