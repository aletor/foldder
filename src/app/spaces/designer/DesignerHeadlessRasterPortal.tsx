"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DesignerPageState } from "./DesignerNode";

export type DesignerHeadlessRasterRequest = {
  requestId: number;
  instanceKey: string;
  pages: DesignerPageState[];
  targetPageIds: string[];
};

/**
 * Monta un Designer Studio headless (offscreen) que rasteriza a PNG full-res las páginas pedidas y
 * las reporta por `onPage`/`onDone`. Reutiliza el mismo `headlessImageExport` del export multimedia.
 */
export function DesignerHeadlessRasterPortal({
  request,
  onPage,
  onDone,
  onError,
}: {
  request: DesignerHeadlessRasterRequest;
  onPage: (pageId: string, dataUrl: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}) {
  const [Studio, setStudio] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  useEffect(() => {
    void import("./DesignerStudio").then((m) =>
      setStudio(() => m.default as unknown as React.ComponentType<Record<string, unknown>>),
    );
  }, []);
  if (!Studio) return null;
  return createPortal(
    // `key` por petición: DesignerStudio lee `initialPages` solo al montar, así que cada fila debe
    // remontar un studio nuevo con sus páginas congeladas (si no, reusa las de la primera fila).
    <Studio
      key={request.instanceKey}
      initialPages={request.pages}
      activePageIndex={0}
      designerCanvasInstanceKey={request.instanceKey}
      onClose={() => {}}
      onExport={() => {}}
      onUpdatePages={() => {}}
      headlessImageExport={{
        requestId: request.requestId,
        targetPageIds: request.targetPageIds,
        onPage,
        onDone,
        onError,
      }}
    />,
    document.body,
  );
}
