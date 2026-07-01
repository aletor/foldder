"use client";

type NanoBananaImageProvider = "gemini" | "openai";

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
    <select
      className="nano-banana-node-dock-provider-select nodrag nopan"
      value={value}
      disabled={disabled}
      aria-label="Proveedor de imagen"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onChange(e.target.value === "openai" ? "openai" : "gemini");
      }}
    >
      <option value="gemini">Gemini</option>
      <option value="openai">ChatGPT</option>
    </select>
  );
}
