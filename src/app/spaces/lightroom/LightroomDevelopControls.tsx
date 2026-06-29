"use client";

import React, { useCallback, useState } from "react";
import type { DevelopSettings, HslColorChannel, LightroomSlider } from "./lightroom-develop-settings";
import {
  EMPTY_DEVELOP_SETTINGS,
  patchDevelopSettings,
} from "./lightroom-develop-settings";
import { EditorDeCurva2D, type CurveChannel } from "./lightroom-ui/EditorDeCurva2D";
import { HslColorPanel } from "./lightroom-ui/HslColorPanel";
import { CreativeLutPanel } from "./lightroom-ui/CreativeLutPanel";
import { ProfileDropdown } from "./lightroom-ui/ProfileDropdown";
import { SliderBidireccional } from "./lightroom-ui/SliderBidireccional";
import { SliderConGradiente } from "./lightroom-ui/SliderConGradiente";
import { WbControls } from "./lightroom-ui/WbControls";
import { SATURATION_GRADIENT, TEMP_GRADIENT, TINT_GRADIENT, tempSliderToKelvin } from "./lightroom-ui/hsl-gradients";
import { WB_PRESETS, type WbPresetId } from "./lightroom-ui/develop-presets";

export type LightroomDevelopControlsProps = {
  settings: DevelopSettings;
  disabled?: boolean;
  onChange: (next: DevelopSettings) => void;
  cameraModel?: string;
  profileMatchHint?: string | null;
  histogram?: { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array } | null;
  wbEyedropperActive?: boolean;
  compareBefore?: boolean;
  onToggleWbEyedropper?: () => void;
  showDetailLoupeHint?: boolean;
  tatActive?: boolean;
  tatMode?: "saturation" | "hue" | "luminance";
  onToggleTat?: (mode: "saturation" | "hue" | "luminance") => void;
};

type PanelId = "basic" | "tone" | "hsl" | "detail" | "look";

const PANEL_LABELS: Record<PanelId, string> = {
  basic: "Básicos",
  tone: "Curva de tono",
  hsl: "HSL / Color",
  detail: "Detalle",
  look: "Look / LUT",
};

export function LightroomDevelopControls({
  settings,
  disabled,
  onChange,
  cameraModel,
  profileMatchHint,
  histogram,
  wbEyedropperActive,
  compareBefore,
  onToggleWbEyedropper,
  showDetailLoupeHint,
  tatActive,
  tatMode = "saturation",
  onToggleTat,
}: LightroomDevelopControlsProps) {
  const [open, setOpen] = useState<Record<PanelId, boolean>>({
    basic: true,
    tone: false,
    hsl: false,
    detail: false,
    look: false,
  });
  const [curveChannel, setCurveChannel] = useState<CurveChannel>("master");
  const [wbPreset, setWbPreset] = useState<WbPresetId>("auto");

  const setBasic = useCallback(
    (key: keyof DevelopSettings["basic"], value: LightroomSlider) => {
      onChange(patchDevelopSettings(settings, { basic: { [key]: value } }));
    },
    [onChange, settings],
  );

  const setToneParam = useCallback(
    (key: "paramShadows" | "paramDarks" | "paramLights" | "paramHighlights", value: LightroomSlider) => {
      onChange(patchDevelopSettings(settings, { toneCurve: { [key]: value } }));
    },
    [onChange, settings],
  );

  const setCurvePoints = useCallback(
    (channel: CurveChannel, points: DevelopSettings["toneCurve"]["masterPoints"]) => {
      if (channel === "master") {
        onChange(patchDevelopSettings(settings, { toneCurve: { masterPoints: points } }));
        return;
      }
      onChange(
        patchDevelopSettings(settings, {
          toneCurve: { rgbPoints: { [channel]: points } },
        }),
      );
    },
    [onChange, settings],
  );

  const setHsl = useCallback(
    (channel: HslColorChannel, key: "hue" | "saturation" | "luminance", value: LightroomSlider) => {
      onChange(patchDevelopSettings(settings, { hsl: { [channel]: { [key]: value } } }));
    },
    [onChange, settings],
  );

  const setDetail = useCallback(
    (key: keyof DevelopSettings["detail"], value: LightroomSlider) => {
      onChange(patchDevelopSettings(settings, { detail: { [key]: value } }));
    },
    [onChange, settings],
  );

  const applyWbPreset = (id: WbPresetId) => {
    setWbPreset(id);
    const preset = WB_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    onChange(patchDevelopSettings(settings, { basic: { temp: preset.temp, tint: preset.tint } }));
  };

  const curvePoints =
    curveChannel === "master"
      ? settings.toneCurve.masterPoints
      : settings.toneCurve.rgbPoints[curveChannel];

  const toggle = (id: PanelId) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div className="lightroom-develop-controls">
      <Panel id="basic" open={open.basic} onToggle={() => toggle("basic")} label={PANEL_LABELS.basic}>
        <ProfileDropdown
          settings={settings}
          cameraModel={cameraModel}
          profileMatchHint={profileMatchHint}
          disabled={disabled}
          onChange={(cameraProfileId) => onChange(patchDevelopSettings(settings, { cameraProfileId }))}
        />
        <WbControls
          activePreset={wbPreset}
          eyedropperActive={wbEyedropperActive}
          compareBefore={compareBefore}
          disabled={disabled}
          onPreset={applyWbPreset}
          onToggleEyedropper={() => onToggleWbEyedropper?.()}
        />
        <SliderConGradiente
          label="Temperatura"
          value={settings.basic.temp}
          trackGradient={TEMP_GRADIENT}
          disabled={disabled}
          formatValue={(v) => `${tempSliderToKelvin(v)}K`}
          onChange={(v) => setBasic("temp", v)}
        />
        <SliderConGradiente
          label="Matiz"
          value={settings.basic.tint}
          trackGradient={TINT_GRADIENT}
          disabled={disabled}
          onChange={(v) => setBasic("tint", v)}
        />
        <SliderBidireccional label="Exposición" value={settings.basic.exposure} disabled={disabled} onChange={(v) => setBasic("exposure", v)} />
        <SliderBidireccional label="Contraste" value={settings.basic.contrast} disabled={disabled} onChange={(v) => setBasic("contrast", v)} />
        <SliderBidireccional label="Altas luces" value={settings.basic.highlights} disabled={disabled} onChange={(v) => setBasic("highlights", v)} />
        <SliderBidireccional label="Sombras" value={settings.basic.shadows} disabled={disabled} onChange={(v) => setBasic("shadows", v)} />
        <SliderBidireccional label="Blancos" value={settings.basic.whites} disabled={disabled} onChange={(v) => setBasic("whites", v)} />
        <SliderBidireccional label="Negros" value={settings.basic.blacks} disabled={disabled} onChange={(v) => setBasic("blacks", v)} />
        <SliderBidireccional label="Textura" value={settings.basic.texture} disabled={disabled} onChange={(v) => setBasic("texture", v)} />
        <SliderBidireccional label="Claridad" value={settings.basic.clarity} disabled={disabled} onChange={(v) => setBasic("clarity", v)} />
        <SliderBidireccional label="Dehaze" value={settings.basic.dehaze} disabled={disabled} onChange={(v) => setBasic("dehaze", v)} />
        <SliderBidireccional label="Vibración" value={settings.basic.vibrance} disabled={disabled} onChange={(v) => setBasic("vibrance", v)} />
        <SliderConGradiente
          label="Saturación"
          value={settings.basic.saturation}
          trackGradient={SATURATION_GRADIENT}
          disabled={disabled}
          onChange={(v) => setBasic("saturation", v)}
        />
      </Panel>

      <Panel id="tone" open={open.tone} onToggle={() => toggle("tone")} label={PANEL_LABELS.tone}>
        <EditorDeCurva2D
          channel={curveChannel}
          onChannelChange={setCurveChannel}
          points={curvePoints}
          onPointsChange={(pts) => setCurvePoints(curveChannel, pts)}
          toneCurve={settings.toneCurve}
          histogram={histogram ?? undefined}
          disabled={disabled}
        />
        <p className="lightroom-studio__eyebrow">Paramétrica (ajuste fino)</p>
        <SliderBidireccional label="Sombras" value={settings.toneCurve.paramShadows} disabled={disabled} onChange={(v) => setToneParam("paramShadows", v)} />
        <SliderBidireccional label="Oscuros" value={settings.toneCurve.paramDarks} disabled={disabled} onChange={(v) => setToneParam("paramDarks", v)} />
        <SliderBidireccional label="Claros" value={settings.toneCurve.paramLights} disabled={disabled} onChange={(v) => setToneParam("paramLights", v)} />
        <SliderBidireccional label="Altas" value={settings.toneCurve.paramHighlights} disabled={disabled} onChange={(v) => setToneParam("paramHighlights", v)} />
      </Panel>

      <Panel id="hsl" open={open.hsl} onToggle={() => toggle("hsl")} label={PANEL_LABELS.hsl}>
        {onToggleTat ? (
          <div className="lr-tat-btns nodrag">
            {(["saturation", "hue", "luminance"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`lr-tat-btns__btn${tatActive && tatMode === mode ? " is-active" : ""}`}
                disabled={disabled}
                onClick={() => onToggleTat(mode)}
              >
                TAT {mode === "saturation" ? "Sat." : mode === "hue" ? "Matiz" : "Lum."}
              </button>
            ))}
          </div>
        ) : null}
        <HslColorPanel hsl={settings.hsl} disabled={disabled} onChange={setHsl} />
      </Panel>

      <Panel id="detail" open={open.detail} onToggle={() => toggle("detail")} label={PANEL_LABELS.detail}>
        {showDetailLoupeHint ? (
          <p className="lightroom-studio__hint">Usa la lupa sobre la imagen para juzgar enfoque y ruido.</p>
        ) : null}
        <SliderBidireccional label="Enfoque" value={settings.detail.sharpenAmount} disabled={disabled} onChange={(v) => setDetail("sharpenAmount", v)} />
        <SliderBidireccional label="Radio" value={settings.detail.sharpenRadius} disabled={disabled} onChange={(v) => setDetail("sharpenRadius", v)} />
        <SliderBidireccional label="Detalle" value={settings.detail.sharpenDetail} disabled={disabled} onChange={(v) => setDetail("sharpenDetail", v)} />
        <SliderBidireccional label="Máscara" value={settings.detail.sharpenMasking} disabled={disabled} onChange={(v) => setDetail("sharpenMasking", v)} />
        <SliderBidireccional label="Ruido lum." value={settings.detail.noiseLuminance} disabled={disabled} onChange={(v) => setDetail("noiseLuminance", v)} />
        <SliderBidireccional label="Ruido color" value={settings.detail.noiseColor} disabled={disabled} onChange={(v) => setDetail("noiseColor", v)} />
      </Panel>

      <Panel id="look" open={open.look} onToggle={() => toggle("look")} label={PANEL_LABELS.look}>
        <CreativeLutPanel
          settings={settings}
          disabled={disabled}
          onChange={(patch) => onChange(patchDevelopSettings(settings, { creativeLut: patch }))}
        />
      </Panel>

      <button
        type="button"
        className="lightroom-studio__btn lightroom-studio__btn--ghost nodrag"
        disabled={disabled}
        onClick={() => onChange(structuredClone(EMPTY_DEVELOP_SETTINGS))}
      >
        Restablecer ajustes
      </button>
    </div>
  );
}

function Panel({
  label,
  open,
  onToggle,
  children,
}: {
  id: PanelId;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="lightroom-develop-controls__panel">
      <button type="button" className="lightroom-develop-controls__panel-head nodrag" onClick={onToggle} aria-expanded={open}>
        <span>{label}</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="lightroom-develop-controls__panel-body">{children}</div> : null}
    </section>
  );
}
