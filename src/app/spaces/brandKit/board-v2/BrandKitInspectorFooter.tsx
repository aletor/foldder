"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import type { SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { resolveInspectorFooterVariant } from "@/lib/brandkit/studio/brand-kit-inspector";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";
import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";

/**
 * Footer mínimo del modal: solo acciones de estudio (p. ej. ir a evidencia).
 * Confirmar / desbloquear viven en el card del board.
 */
export function BrandKitInspectorFooter({
  slot,
}: {
  slotId: SlotId;
  slot: SlotState<unknown>;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  canEditText?: boolean;
  onEditText?: () => void;
}) {
  const board = useBrandKitMosaicBoard();
  const variant = resolveInspectorFooterVariant(slot);

  if (variant !== "review") return null;

  return (
    <div className="brandKit-inspector-footer brandKit-inspector-footer--review">
      <div className="brandKit-inspector-footer__actions">
        <BrandKitFoldderButton compact icon={AlertTriangle} onClick={() => board?.setInspectorTab("evidence")}>
          {brandKitLocaleEs.resolveConflict}
        </BrandKitFoldderButton>
      </div>
    </div>
  );
}
