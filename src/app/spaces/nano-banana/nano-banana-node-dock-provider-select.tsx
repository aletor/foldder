"use client";

import { NanoBananaNodeDockSelect } from "./nano-banana-node-dock-select";
import type { NanoBananaImageProvider } from "./nano-banana-output-options";

export function NanoBananaNodeDockProviderSelect({
  value,
  onChange,
  disabled,
}: {
  value: NanoBananaImageProvider;
  onChange: (provider: NanoBananaImageProvider) => void;
  disabled?: boolean;
}) {
  return (
    <NanoBananaNodeDockSelect
      value={value}
      disabled={disabled}
      ariaLabel="Proveedor de imagen"
      options={[
        { value: "gemini", label: "Gemini" },
        { value: "openai", label: "ChatGPT" },
      ]}
      onChange={(next) => onChange(next === "openai" ? "openai" : "gemini")}
    />
  );
}
