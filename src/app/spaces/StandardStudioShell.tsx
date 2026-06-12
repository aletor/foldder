"use client";

import React from "react";
import { Minus, SaveAll } from "lucide-react";
import {
  FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT,
  FOLDDER_STANDARD_STUDIO_MINIMIZE_REQUEST_EVENT,
  FOLDDER_STANDARD_STUDIO_SAVE_AS_REQUEST_EVENT,
} from "./desktop-studio-events";
import {
  FoldderStudioHeader,
  foldderStudioHeaderActionClassName,
} from "./FoldderStudioHeader";

export type StandardStudioShellConfig = {
  appLabel: string;
  fileName?: string;
  canSaveAs?: boolean;
  nodeId?: string;
  nodeType?: string;
  fileId?: string;
  appId?: string;
};

function dispatchStandardStudioAction(name: string, shell: StandardStudioShellConfig): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(name, {
      detail: {
        nodeId: shell.nodeId,
        nodeType: shell.nodeType,
        fileId: shell.fileId,
        appId: shell.appId,
      },
    }),
  );
}

export function StandardStudioShellHeader({ shell }: { shell: StandardStudioShellConfig }) {
  return (
    <FoldderStudioHeader
      nodeType={shell.nodeType || shell.appId || "projectAssets"}
      nodeLabel={shell.appLabel}
      subtitle={shell.fileName}
      onClose={() => dispatchStandardStudioAction(FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, shell)}
      actions={
        <>
          {shell.canSaveAs ? (
            <button
              type="button"
              onClick={() => dispatchStandardStudioAction(FOLDDER_STANDARD_STUDIO_SAVE_AS_REQUEST_EVENT, shell)}
              className={foldderStudioHeaderActionClassName()}
            >
              <SaveAll size={14} strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">Guardar</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => dispatchStandardStudioAction(FOLDDER_STANDARD_STUDIO_MINIMIZE_REQUEST_EVENT, shell)}
            className={foldderStudioHeaderActionClassName()}
          >
            <Minus size={14} strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">Min</span>
          </button>
        </>
      }
    />
  );
}
