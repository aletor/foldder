"use client";

import React, { memo, useCallback } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { useStudioNodeController } from "../studio-node/studio-node-architecture";
import { touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { getNodeCardBackgroundColor } from "../node-card-palette";
import { WriterStudio } from "./WriterStudio";
import { useWriterBrandSnippet } from "./writer-brain-client";
import {
  WRITER_PROFILE_LABELS,
  WRITER_PAGE_PRESET_LABELS,
  isWriterDocumentId,
  normalizeWriterNodeData,
  type WriterPersistedPatch,
} from "./writer-document";

const WRITER_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "22%", type: "target", id: "prompt", dataType: "prompt", label: "Prompt" },
  { side: "left", top: "40%", type: "target", id: "text", dataType: "txt", label: "Text" },
  { side: "left", top: "58%", type: "target", id: "brain", dataType: "brain", label: "Marca" },
  { side: "left", top: "76%", type: "target", id: "image", dataType: "image", label: "Imagen" },
  { side: "right", top: "38%", type: "source", id: "text", dataType: "txt", label: "Text out" },
  { side: "right", top: "68%", type: "source", id: "prompt", dataType: "prompt", label: "Prompt out" },
];

export const WriterNode = memo(function WriterNode({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow();
  const documentData = normalizeWriterNodeData(data);
  const brandSnippet = useWriterBrandSnippet(id);
  const accent = getNodeCardBackgroundColor("writer");
  const { isStudioOpen, openStudio, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "writer",
  });

  const patchData = useCallback(
    (patch: WriterPersistedPatch) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const previous = (node.data ?? {}) as Record<string, unknown>;
          const next = touchStudioNodeData(previous, patch);
          if (patch.content == null) delete next.content;
          if (patch.memory == null) delete next.memory;
          if (!isWriterDocumentId(patch.documentId)) {
            if (isWriterDocumentId(previous.documentId)) next.documentId = previous.documentId;
            else delete next.documentId;
          }
          if (!patch.documentKey && typeof previous.documentKey === "string" && previous.documentKey) {
            next.documentKey = previous.documentKey;
          }
          return { ...node, data: next };
        }),
      );
    },
    [id, setNodes],
  );

  const preview = documentData.value.replace(/\s+/g, " ").trim();
  const previewText = preview.length > 160 ? `${preview.slice(0, 157)}…` : preview;
  const hasText = documentData.wordCount > 0;

  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="writer"
      selected={selected}
      label={documentData.label}
      defaultLabel="Writer"
      title={documentData.title.trim() || "Writer"}
      introActive={!!(data as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      minWidth={220}
      className="writer-node foldder-frameless-label-dark"
      handles={WRITER_NODE_HANDLES}
      variant="frameless"
      material="media"
      studioTouched={hasText}
      style={
        {
          minWidth: 220,
          minHeight: 280,
          "--foldder-node-card-bg": accent,
          "--foldder-frameless-glass-bg": accent,
          "--foldder-frameless-accent": accent,
        } as React.CSSProperties
      }
    >
      <NodeResizer minWidth={220} minHeight={180} maxWidth={720} maxHeight={900} isVisible={selected} />
      <div className="node-content foldder-frameless-main" style={{ display: "flex", flexDirection: "column", minHeight: 240 }}>
        <div style={{ flex: 1, padding: "18px 16px 8px", color: "#f7f4ee" }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7 }}>
            {WRITER_PROFILE_LABELS[documentData.profile]}
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.35 }}>
            {documentData.title.trim() || "Sin título"}
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.45, opacity: hasText ? 0.88 : 0.55 }}>
            {hasText ? previewText : "Abre Writer para escribir."}
          </p>
        </div>
        <div className="shrink-0">
          <FoldderNodeContentDock>
            <FoldderNodeContentDockMain>
              <FoldderNodeContentMeta>
                <FoldderNodeContentMetaRow label="Tipo" value={WRITER_PROFILE_LABELS[documentData.profile]} />
                <FoldderNodeContentMetaRow label="Página" value={WRITER_PAGE_PRESET_LABELS[documentData.pagePreset]} />
                {documentData.chapterCount > 0 ? (
                  <FoldderNodeContentMetaRow label="Capítulos" value={String(documentData.chapterCount)} />
                ) : null}
                {documentData.canonCount + documentData.ideaCount > 0 ? (
                  <FoldderNodeContentMetaRow label="Memoria" value={String(documentData.canonCount + documentData.ideaCount)} />
                ) : null}
                <FoldderNodeContentMetaRow
                  label="Palabras"
                  value={String(documentData.wordCount)}
                />
              </FoldderNodeContentMeta>
            </FoldderNodeContentDockMain>
            <FoldderNodeContentDockActions>
              <FoldderStudioModeCenterButton
                variant="dock"
                label={hasText ? "Abrir" : "Empezar"}
                title="Abrir Writer"
                onClick={() => openStudio()}
              />
            </FoldderNodeContentDockActions>
          </FoldderNodeContentDock>
        </div>
      </div>
      {isStudioOpen ? (
        <WriterStudio
          data={data}
          brandSnippet={brandSnippet}
          onChange={patchData}
          onClose={() => closeStudio()}
        />
      ) : null}
    </StudioCanvasNodeShell>
  );
});
