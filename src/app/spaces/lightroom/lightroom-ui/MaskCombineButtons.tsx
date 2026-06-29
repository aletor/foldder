"use client";

import React from "react";
import type { MaskCombineOp } from "../lightroom-mask-types";

export type MaskCombineButtonsProps = {
  value: MaskCombineOp;
  disabled?: boolean;
  onChange: (op: MaskCombineOp) => void;
};

const OPS: Array<{ id: MaskCombineOp; label: string }> = [
  { id: "add", label: "Añadir" },
  { id: "subtract", label: "Restar" },
  { id: "intersect", label: "∩" },
];

export function MaskCombineButtons({ value, disabled, onChange }: MaskCombineButtonsProps) {
  return (
    <div className="lr-combine-btns nodrag" role="group" aria-label="Combinar máscara">
      {OPS.map((op) => (
        <button
          key={op.id}
          type="button"
          className={`lr-combine-btns__btn${value === op.id ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => onChange(op.id)}
        >
          {op.label}
        </button>
      ))}
    </div>
  );
}
