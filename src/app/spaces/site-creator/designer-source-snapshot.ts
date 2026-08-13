import type { Node } from "@xyflow/react";
import type { DesignerNodeData, DesignerPageState } from "../designer/DesignerNode";
import { resolveSlideKey } from "../designer/designer-studio-pure";
import { designerPageCount } from "./site-creator-connection";
import { computeDesignerPageContentHash } from "./designer-source-hash";
import { countSnapshotLayers } from "./designer-source-layers";
import type { DesignerSourceSnapshotV1 } from "./site-creator-types";

/** Copia profunda sin remapear IDs (no usar duplicateDesignerPageState). */
export function deepCloneDesignerPageState(page: DesignerPageState): DesignerPageState {
  if (typeof structuredClone === "function") {
    return structuredClone(page);
  }
  return JSON.parse(JSON.stringify(page)) as DesignerPageState;
}

export function buildDesignerSourceSnapshot(
  designerNodeId: string,
  page: DesignerPageState,
  capturedAt: string = new Date().toISOString(),
): DesignerSourceSnapshotV1 {
  const clonedPage = deepCloneDesignerPageState(page);
  const contentHash = computeDesignerPageContentHash(clonedPage);
  return {
    schemaVersion: 1,
    designerNodeId,
    sourcePageId: clonedPage.id,
    sourceSlideKey: resolveSlideKey(clonedPage),
    capturedAt,
    contentHash,
    layerCount: countSnapshotLayers(clonedPage),
    page: clonedPage,
  };
}

export function captureSnapshotFromDesignerNode(designerNode: Node): DesignerSourceSnapshotV1 | null {
  if (designerNode.type !== "designer") return null;
  if (designerPageCount(designerNode) !== 1) return null;
  const pages = (designerNode.data as DesignerNodeData)?.pages;
  if (!Array.isArray(pages) || pages.length !== 1) return null;
  return buildDesignerSourceSnapshot(designerNode.id, pages[0]!);
}

export function isValidDesignerSourceSnapshotV1(value: unknown): value is DesignerSourceSnapshotV1 {
  if (!value || typeof value !== "object") return false;
  const snap = value as DesignerSourceSnapshotV1;
  return (
    snap.schemaVersion === 1 &&
    typeof snap.designerNodeId === "string" &&
    typeof snap.sourcePageId === "string" &&
    typeof snap.capturedAt === "string" &&
    typeof snap.contentHash === "string" &&
    typeof snap.layerCount === "number" &&
    snap.page !== null &&
    typeof snap.page === "object"
  );
}
