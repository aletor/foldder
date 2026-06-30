"use client";

import React, { useMemo } from "react";
import type { PopulateDesignerTemplateConfig } from "./populate-designer-template";
import {
  FoldderTemplatePreviewGrid,
  type FoldderTemplatePreviewSource,
} from "../studio-node/foldder-template-preview-grid";

export function PopulateNodeBackgroundGrid({
  templates,
}: {
  templates: PopulateDesignerTemplateConfig[];
}) {
  const sources = useMemo<FoldderTemplatePreviewSource[]>(
    () =>
      templates.map((template) => ({
        id: template.templateNodeId,
        pages: template.pages,
        thumbUrl: template.previewThumbUrl,
      })),
    [templates],
  );

  return <FoldderTemplatePreviewGrid sources={sources} />;
}
