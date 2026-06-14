"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { NodeExecutionProvider } from "./NodeExecutionBridge";
import { SpacesContent } from "./SpacesContent";
import { InputModeProvider } from "./input-mode-context";

export default function SpacesPage() {
  return (
    <div className="w-screen h-screen bg-slate-50">
      <InputModeProvider>
        <ReactFlowProvider>
          <NodeExecutionProvider>
            <SpacesContent />
          </NodeExecutionProvider>
        </ReactFlowProvider>
      </InputModeProvider>
    </div>
  );
}
