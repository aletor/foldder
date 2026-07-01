"use client";

import React from "react";
import { ImageIcon } from "lucide-react";
import type { SpaceMediaPreviewItem } from "./space-node-preview";
import { foldderTemplatePreviewGridStyle } from "./studio-node/foldder-template-preview-grid";
import { FoldderPreviewDeckStack } from "./studio-node/foldder-preview-deck-stack";

function SpaceMediaPreviewCell({ item }: { item: SpaceMediaPreviewItem }) {
  if (item.mediaType === "video" && item.url) {
    return (
      <video
        src={item.url}
        className="space-node-media-preview-grid__media"
        muted
        playsInline
        preload="metadata"
        draggable={false}
      />
    );
  }

  if (item.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.url}
        alt=""
        className="space-node-media-preview-grid__media"
        draggable={false}
      />
    );
  }

  return (
    <span className="space-node-media-preview-grid__placeholder">
      <ImageIcon size={16} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

export function SpaceNodeMediaPreviewGrid({ items }: { items: SpaceMediaPreviewItem[] }) {
  if (items.length === 0) return null;

  return (
    <FoldderPreviewDeckStack layerCount={items.length} className="space-node-media-stack">
      <div
        className="space-node-media-preview-grid nodrag"
        style={foldderTemplatePreviewGridStyle(items.length)}
        aria-hidden
      >
        {items.map((item) => (
          <div key={item.id} className="space-node-media-preview-grid__cell">
            <SpaceMediaPreviewCell item={item} />
          </div>
        ))}
      </div>
    </FoldderPreviewDeckStack>
  );
}
