"use client";

const FLOW_PRESET_COLORS = [
  "#71449f",
  "#f16389",
  "#1b71df",
  "#de323f",
  "#f5b91b",
] as const;

export function FlowsPresetButtons() {
  return (
    <div data-home-v2-flows-presets role="list" aria-label="Flujos de ejemplo">
      {FLOW_PRESET_COLORS.map((color, index) => (
        <button
          key={index}
          type="button"
          role="listitem"
          data-home-v2-flows-preset
          style={{ ["--flows-preset-color" as string]: color }}
        >
          <span data-home-v2-flows-preset-title>Carteles para Redes</span>
          <span data-home-v2-flows-preset-subtitle>con ADN de marca</span>
        </button>
      ))}
    </div>
  );
}
