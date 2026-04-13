"use client";

import React, { useMemo } from "react";
import {
  Handle,
  useNodeId,
  useEdges,
  type HandleProps,
} from "@xyflow/react";
import { NodeIcon, type FoldderIconKey } from "./foldder-icons";

export type FoldderHandleDataType =
  | "prompt"
  | "image"
  | "video"
  | "sound"
  | "mask"
  | "pdf"
  | "txt"
  | "url"
  | "emerald"
  | "rose"
  | "generic";

const TYPE_CLASS: Record<FoldderHandleDataType, string> = {
  prompt: "handle-prompt",
  image: "handle-image",
  video: "handle-video",
  sound: "handle-sound",
  mask: "handle-mask",
  pdf: "handle-pdf",
  txt: "handle-txt",
  url: "handle-url",
  emerald: "handle-emerald",
  rose: "handle-rose",
  generic: "handle-generic",
};

/** Misma gramática de iconos que sidebar y barra de accesos (`NodeIcon` + `NODE_TYPE_TO_FOLDDER_ICON`). */
const DATA_TYPE_TO_ICON: Record<FoldderHandleDataType, FoldderIconKey> = {
  prompt: "prompt",
  image: "asset",
  video: "video",
  sound: "asset",
  mask: "mask",
  pdf: "text",
  txt: "text",
  url: "web",
  emerald: "spaceIn",
  rose: "output",
  generic: "grok",
};

/** Salida media según tipo de archivo en Media Input */
export function foldderMediaInputDataType(nodeType: string | undefined): FoldderHandleDataType {
  switch (nodeType) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "sound";
    case "pdf":
      return "pdf";
    case "txt":
      return "txt";
    case "url":
      return "url";
    default:
      return "video";
  }
}

export function foldderDataTypeFromHandleClass(className: string): FoldderHandleDataType {
  if (className.includes("handle-prompt")) return "prompt";
  if (className.includes("handle-image")) return "image";
  if (className.includes("handle-video")) return "video";
  if (className.includes("handle-sound")) return "sound";
  if (className.includes("handle-mask")) return "mask";
  if (className.includes("handle-pdf")) return "pdf";
  if (className.includes("handle-txt")) return "txt";
  if (className.includes("handle-url")) return "url";
  if (className.includes("handle-emerald")) return "emerald";
  if (className.includes("handle-rose")) return "rose";
  return "generic";
}

function HandleGlyph({ dataType }: { dataType: FoldderHandleDataType }) {
  const iconKey = DATA_TYPE_TO_ICON[dataType];
  return (
    <span className="foldder-data-handle__icon-wrap pointer-events-none">
      <NodeIcon type="promptInput" iconKey={iconKey} size={11} selected={false} />
    </span>
  );
}

export type FoldderDataHandleProps = Omit<HandleProps, "children"> & {
  dataType: FoldderHandleDataType;
};

/**
 * Conector con icono por tipo de dato; anillo de color solo cuando hay arista conectada.
 */
export function FoldderDataHandle({
  dataType,
  className,
  id,
  type: handleType,
  ...rest
}: FoldderDataHandleProps) {
  const nodeId = useNodeId();
  const edges = useEdges();

  const connected = useMemo(() => {
    if (!nodeId) return false;
    const hid = id ?? null;
    if (handleType === "target") {
      return edges.some((e) => {
        if (e.target !== nodeId) return false;
        const eh = e.targetHandle ?? null;
        return eh === hid || (hid === null && (eh === null || eh === undefined));
      });
    }
    return edges.some((e) => {
      if (e.source !== nodeId) return false;
      const eh = e.sourceHandle ?? null;
      return eh === hid || (hid === null && (eh === null || eh === undefined));
    });
  }, [edges, nodeId, id, handleType]);

  const typeClass = TYPE_CLASS[dataType];
  const mergedClass = [
    "foldder-data-handle",
    "nodrag",
    typeClass,
    connected ? "foldder-data-handle--connected" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Handle id={id} type={handleType} className={mergedClass} {...rest}>
      <HandleGlyph dataType={dataType} />
    </Handle>
  );
}
