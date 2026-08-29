"use client";

export function NanoBananaNodeDockSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}) {
  return (
    <select
      className="nano-banana-node-dock-select nano-banana-node-dock-provider-select nodrag nopan"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onChange(e.target.value);
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
