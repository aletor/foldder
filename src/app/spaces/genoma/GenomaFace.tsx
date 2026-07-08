"use client";

/**
 * La cara de Genoma (§5): 30% panel de entrada · 70% libro de estilo, full-bleed.
 *
 * Estética: sin marcos, sin ventanas, sin badges gritones. Bloques de color al
 * sangrado, tipografía grande, copy en español y en minúscula de frase. Cada
 * rasgo tiene tres estados visuales — ghost · proposed · crowned — y detrás de un
 * único «···» está la profundidad (evidencia y fuentes). Un solo % en la cara.
 *
 * Estático por diseño: recibe una `GenomaBookView` ya proyectada y notifica
 * intenciones (coronar, añadir fuente, descargar) hacia arriba. El streaming y la
 * persistencia llegan en el punto 4.
 */

import { useRef, useState, useEffect } from "react";
import type { GenomaStyleGuideExportMode } from "@/lib/genoma/projection/style-guide-export-types";
import { GENOMA_STYLE_GUIDE_EXPORT_MODE_LABELS } from "@/lib/genoma/projection/style-guide-export-types";
import type { Genome } from "@/lib/genoma/model/trait";
import { isVoiceProcessNoise } from "@/lib/genoma/ingest/consolidated-registry";
import {
  SPECIMEN_SAMPLE_TEXT,
  typographyWeightCss,
} from "@/lib/genoma/specimen/typography-specimen";
import type { GenomaIngestFeedbackState } from "@/lib/genoma/ingest/feedback-state";
import type { TraitId } from "@/lib/genoma/model/trait-ids";
import type { ImageAxes, ImageDnaValue, VisualDnaFields } from "@/lib/genoma/model/trait-values";
import type {
  ClaimValue,
  ColorValue,
  LogoValue,
  TaglineValue,
  ToneValue,
  TypographyValue,
} from "@/lib/genoma/model/trait-values";
import type {
  FaceState,
  GenomaBookView,
  MultiTraitSlot,
  TraitSlot,
} from "@/lib/genoma/projection/book-view";
import { cx, formatCmyk, formatRgb, G, hexToRgb, readableTextOn, rgbToCmyk } from "./face-utils";
import { resolveLogoDisplayUrl, resolveLogoUiFromTrait } from "@/lib/genoma/projection/logo-display-url";
import { GenomaLogoImage } from "./GenomaLogoImage";
import { GenomaIngestFeedback } from "./GenomaIngestFeedback";
import { GenomaPageVisionBadge, GenomaSourcesPanel } from "./GenomaPageVisionBadge";
import { GenomaDepthPanel } from "./GenomaDepthPanel";
import { GenomaFaceProvider, useGenomaFaceContext } from "./genoma-face-context";
import { LogoIntakePanel, type LogoIntakePanelHandle } from "./LogoIntakePanel";
import { specimenFontStack, useSpecimenFont } from "./use-specimen-font";
import type { RefObject } from "react";

export interface GenomaFaceProps {
  view: GenomaBookView;
  projectId: string;
  genome?: Genome;
  onGenomeChange?: (genome: Genome) => void;
  onCrown?: (traitId: TraitId, candidateId: string) => void;
  onAddSource?: (url: string) => void;
  onDrop?: (files: FileList) => void;
  onDownload?: (
    exportMode?: GenomaStyleGuideExportMode,
    hooks?: { onPhase?: (phase: "vectorizing" | "downloading") => void },
  ) => void | Promise<void>;
  onVectorizeLogo?: (candidateId: string) => void | Promise<void>;
  onClose?: () => void;
  onConfirmVisual?: (traitId: TraitId, candidateId: string, axes: ImageDnaValue["axes"]) => void | Promise<void>;
  onUploadSpecimenFont?: (traitId: TraitId, candidateId: string, file: File) => void;
  ingestFeedback?: GenomaIngestFeedbackState;
  onIngestRetry?: () => void;
  activePrompt?: import("@/lib/genoma/ingest/material-prompt").MaterialPromptPayload | null;
  onResolvePrompt?: (optionId: string) => void;
  logoIntakeRef?: RefObject<LogoIntakePanelHandle | null>;
  onIntakeLogoUnlock?: () => void | Promise<void>;
  vectorizeEnabled?: boolean;
}

// ── Afordancias de estado ───────────────────────────────────────────────────

function ProposedDot() {
  return <span aria-hidden className={cx("pointer-events-none", G.proposedMark)} />;
}

function stateRing(state: FaceState): string {
  if (state === "proposed") return "ring-1 ring-inset ring-[var(--secondary)]/35";
  return "";
}

function traitHasDepthFromGenome(genome: Genome | undefined, traitId: TraitId): boolean {
  const trait = genome?.traits[traitId];
  if (!trait) return false;
  const active = trait.candidates.filter((c) => c.status !== "archived");
  return active.length > 1 || active.some((c) => c.signals.length > 0);
}

function TraitDepthButton({ traitId, show }: { traitId: TraitId; show?: boolean }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const ctx = useGenomaFaceContext();
  const hasDepth = show ?? traitHasDepthFromGenome(ctx?.genome, traitId);
  if (!hasDepth) return null;
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="ver evidencia y fuentes"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="genoma-depth-trigger"
      >
        ···
      </button>
      {open && ctx?.genome ? (
        <GenomaDepthPanel
          genome={ctx.genome}
          view={ctx.view}
          traitId={traitId}
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function DepthButton({ slot }: { slot: TraitSlot<unknown> }) {
  if (!slot.hasDepth) return null;
  return (
    <div className="genoma-depth-trigger-wrap">
      <TraitDepthButton traitId={slot.traitId} show />
    </div>
  );
}

/** Envoltura de un rasgo single: gestiona tap-para-coronar y la profundidad. */
function Slot({
  slot,
  onCrown,
  className,
  suppressDepth,
  children,
}: {
  slot: TraitSlot<unknown>;
  onCrown?: (traitId: TraitId, candidateId: string) => void;
  className?: string;
  suppressDepth?: boolean;
  children: React.ReactNode;
}) {
  const clickable = slot.state === "proposed" && slot.candidateId && onCrown;
  return (
    <div
      data-testid={`slot-${slot.traitId}`}
      data-state={slot.state}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? "tocar para coronar" : undefined}
      onClick={clickable ? () => onCrown!(slot.traitId, slot.candidateId!) : undefined}
      className={cx(
        "relative transition",
        clickable && "cursor-pointer",
        stateRing(slot.state),
        className,
      )}
    >
      {slot.state === "proposed" && <ProposedDot />}
      {children}
      {!suppressDepth ? <DepthButton slot={slot} /> : null}
    </div>
  );
}

function GhostLabel({ text }: { text: string }) {
  return (
    <span className="select-none text-xs lowercase tracking-wide text-[var(--text-muted)]/35">{text}</span>
  );
}

// ── Secciones del libro ──────────────────────────────────────────────────────

function LogoSection({
  primary,
  secondary,
  onCrown,
}: {
  primary: TraitSlot<LogoValue>;
  secondary: MultiTraitSlot<LogoValue>;
  onCrown?: GenomaFaceProps["onCrown"];
}) {
  const ctx = useGenomaFaceContext();
  const [pickerOpen, setPickerOpen] = useState(false);
  const logoCandidates =
    ctx?.genome?.traits["logo.primary"]?.candidates.filter((c) => c.status !== "archived") ?? [];
  const uiLogo = resolveLogoUiFromTrait(logoCandidates, primary.candidateId);
  const logoValue = uiLogo?.logo ?? primary.value;
  const logoDerived = uiLogo?.derived ?? primary.derived;
  const hasLogo = Boolean(logoValue && resolveLogoDisplayUrl(logoValue, logoDerived));

  useEffect(() => {
    if (primary.state === "proposed" && primary.candidateCount > 1 && onCrown) {
      setPickerOpen(true);
    }
  }, [primary.state, primary.candidateCount, onCrown]);

  return (
    <section className={cx("relative flex min-h-[70vh] flex-col items-center justify-center gap-16 bg-[#1A1B1E] text-white", G.section)}>
      <Slot slot={primary} onCrown={onCrown} suppressDepth className="flex w-full max-w-4xl flex-col items-center justify-center">
        {hasLogo ? (
          <div className="flex w-full flex-col items-center gap-12">
            <div className="grid w-full grid-cols-1 gap-px bg-white/10 md:grid-cols-2">
              <div className="flex min-h-[180px] items-center justify-center bg-white p-12">
                <GenomaLogoImage
                  logo={logoValue}
                  derived={logoDerived}
                  polarity="positive"
                  alt="logo principal"
                  className="max-h-[32vh] w-auto max-w-full object-contain"
                />
              </div>
              <div className="flex min-h-[180px] items-center justify-center bg-[#0d0d0f] p-12">
                <GenomaLogoImage
                  logo={logoValue}
                  derived={logoDerived}
                  polarity="negative"
                  alt=""
                  aria-hidden
                  className="max-h-[32vh] w-auto max-w-full object-contain"
                />
              </div>
            </div>
            {primary.candidateCount > 1 && onCrown ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPickerOpen(true);
                }}
                className={cx(G.btn, "border-white/20 text-white/80 hover:border-white hover:text-white")}
              >
                ver alternativas
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-[200px] w-full max-w-md items-center justify-center border border-white/10">
            <GhostLabel text="sin logo todavía" />
          </div>
        )}
      </Slot>

      {pickerOpen && onCrown ? (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-8"
          role="dialog"
          aria-modal="true"
          aria-label="elegir logo principal"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-white/15 bg-[#1A1B1E] p-10 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <p className={G.label}>logo principal</p>
            <p className="mt-4 text-lg">¿cuál es tu logo principal?</p>
            <p className="mt-2 text-sm text-white/50">toca uno para coronarlo</p>
            <div className="mt-10 grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-3">
              {logoCandidates.map((candidate) => {
                const logo = candidate.value as LogoValue;
                const crowned = primary.candidateId === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => {
                      onCrown("logo.primary", candidate.id);
                      setPickerOpen(false);
                    }}
                    className={cx(
                      "flex flex-col items-center gap-4 bg-[#1A1B1E] p-6 transition hover:bg-white/[0.03]",
                      crowned && "ring-1 ring-inset ring-[var(--secondary)]",
                    )}
                  >
                    <div className="flex h-28 w-full items-center justify-center bg-white p-4">
                      <GenomaLogoImage
                        logo={logo}
                        derived={candidate.derived}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="text-xs lowercase text-white/60">
                      {candidate.signals.find((s) => s.kind === "recurrence")?.detail ?? "candidato"}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className={cx("mt-10", G.btn, "border-white/20 text-white/70 hover:border-white hover:text-white")}
            >
              cerrar
            </button>
          </div>
        </div>
      ) : null}

      {secondary.items.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-10 opacity-90">
          {secondary.items.map((item) => (
            <div
              key={item.candidateId}
              data-state={item.crowned ? "crowned" : "proposed"}
              role={!item.crowned && onCrown ? "button" : undefined}
              onClick={!item.crowned && onCrown ? () => onCrown("logo.secondary", item.candidateId) : undefined}
              className={cx(
                "relative p-2",
                !item.crowned && onCrown && "cursor-pointer ring-1 ring-inset ring-[var(--secondary)]/35",
              )}
            >
              {!item.crowned && <ProposedDot />}
              <GenomaLogoImage
                logo={item.value}
                derived={item.derived}
                alt={item.value.label ?? "logo"}
                className="h-12 w-auto object-contain"
              />
            </div>
          ))}
        </div>
      )}

      <div className="genoma-depth-trigger-wrap genoma-depth-trigger-wrap--dark">
        <TraitDepthButton traitId="logo.primary" show={primary.candidateCount > 0} />
      </div>
    </section>
  );
}

function SpecimenBlock({
  slot,
  label,
  onCrown,
  onUploadSpecimenFont,
}: {
  slot: TraitSlot<TypographyValue>;
  label: string;
  onCrown?: GenomaFaceProps["onCrown"];
  onUploadSpecimenFont?: GenomaFaceProps["onUploadSpecimenFont"];
}) {
  const v = slot.value;
  useSpecimenFont(v);
  const uploadId = `specimen-upload-${slot.traitId}`;

  return (
    <Slot slot={slot} onCrown={onCrown} className="py-4">
      <p className={cx("mb-8", G.label)}>{label}</p>
      {v ? (
        <div style={{ fontFamily: specimenFontStack(v) }}>
          <p className="text-6xl leading-none md:text-7xl">{v.family}</p>
          <div className="mt-6 space-y-4">
            {(v.weights.length ? v.weights : ["Regular"]).map((weight) => (
              <div key={weight} className="border-t border-[var(--border)]/40 pt-4 first:border-t-0 first:pt-0">
                <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">{weight}</p>
                <p
                  className="mt-2 text-2xl leading-snug text-[var(--text-main)] md:text-3xl"
                  style={typographyWeightCss(weight)}
                >
                  {SPECIMEN_SAMPLE_TEXT}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[var(--text-muted)]">Aa Bb Cc · 0123 · ñ¿?</p>
          {v.specimenAvailable && v.specimenLicense ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]/80">
              {v.family} · {v.specimenLicense}
            </p>
          ) : null}
          {!v.specimenAvailable && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-xs text-[var(--text-muted)]/70">muestra con fuente de respaldo ({v.fallback})</p>
              {slot.candidateId && onUploadSpecimenFont ? (
                <>
                  <input
                    id={uploadId}
                    type="file"
                    accept=".woff2,font/woff2"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadSpecimenFont(slot.traitId, slot.candidateId!, file);
                      e.target.value = "";
                    }}
                  />
                  <label
                    htmlFor={uploadId}
                    className={cx(G.btn, "cursor-pointer px-3 py-1 text-xs")}
                  >
                    subir la fuente
                  </label>
                </>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <p className="text-2xl">
          <GhostLabel text={`sin ${label.toLowerCase()} todavía`} />
        </p>
      )}
    </Slot>
  );
}

function TypographySection({
  primary,
  secondary,
  onCrown,
  onUploadSpecimenFont,
}: {
  primary: TraitSlot<TypographyValue>;
  secondary: TraitSlot<TypographyValue>;
  onCrown?: GenomaFaceProps["onCrown"];
  onUploadSpecimenFont?: GenomaFaceProps["onUploadSpecimenFont"];
}) {
  return (
    <section className={cx("grid gap-16 bg-[var(--surface)] md:grid-cols-2 md:divide-x md:divide-[var(--border)]", G.section)}>
      <SpecimenBlock slot={primary} label="Tipografía principal" onCrown={onCrown} onUploadSpecimenFont={onUploadSpecimenFont} />
      <SpecimenBlock slot={secondary} label="Tipografía secundaria" onCrown={onCrown} onUploadSpecimenFont={onUploadSpecimenFont} />
    </section>
  );
}

function ColorBlock({ slot, onCrown }: { slot: TraitSlot<ColorValue>; onCrown?: GenomaFaceProps["onCrown"] }) {
  const v = slot.value;
  const role = slot.traitId.replace("color.", "");
  if (!v) {
    return (
      <div className="flex min-h-[42vh] flex-1 items-end bg-[var(--surface-hover)] p-10">
        <GhostLabel text={`sin color ${role}`} />
      </div>
    );
  }
  const rgb = hexToRgb(v.hex);
  const fg = readableTextOn(v.hex);
  const clickable = slot.state === "proposed" && slot.candidateId && onCrown;
  return (
    <div
      data-testid={`slot-${slot.traitId}`}
      data-state={slot.state}
      role={clickable ? "button" : undefined}
      title={clickable ? "tocar para coronar" : undefined}
      onClick={clickable ? () => onCrown!(slot.traitId, slot.candidateId!) : undefined}
      className={cx("group relative flex min-h-[42vh] flex-1 flex-col justify-between p-10", clickable && "cursor-pointer", stateRing(slot.state))}
      style={{ backgroundColor: v.hex, color: fg }}
    >
      {slot.state === "proposed" && <ProposedDot />}
      <span className="text-sm lowercase opacity-80">{v.name ?? role}</span>
      <div className="opacity-0 transition group-hover:opacity-100">
        <p className="font-mono text-sm">{v.hex.toUpperCase()}</p>
        {rgb && <p className="font-mono text-xs opacity-80">rgb {formatRgb(rgb)}</p>}
        {rgb && <p className="font-mono text-xs opacity-80">cmyk {formatCmyk(rgbToCmyk(rgb))}</p>}
      </div>
      <div className="genoma-depth-trigger-wrap">
        <TraitDepthButton traitId={slot.traitId} show={slot.hasDepth} />
      </div>
    </div>
  );
}

function PaletteSection({
  palette,
  onCrown,
}: {
  palette: GenomaBookView["palette"];
  onCrown?: GenomaFaceProps["onCrown"];
}) {
  return (
    <section className="flex flex-col md:flex-row">
      {palette.map(({ role, slot }) => (
        <ColorBlock key={role} slot={slot} onCrown={onCrown} />
      ))}
    </section>
  );
}

function VoiceSection({
  tagline,
  tone,
  claimsAbsolute,
  claimsForbidden,
  onCrown,
}: GenomaBookView["voice"] & { onCrown?: GenomaFaceProps["onCrown"] }) {
  return (
    <section className={cx("bg-[var(--background)]", G.section)}>
      <Slot slot={tagline} onCrown={onCrown}>
        {tagline.value ? (
          <p className="max-w-4xl text-5xl font-bold leading-[1.1] md:text-7xl">{tagline.value.text}</p>
        ) : (
          <p className="text-4xl">
            <GhostLabel text="sin claim todavía" />
          </p>
        )}
      </Slot>

      {tone.items.length > 0 && (
        <div className="relative mt-16 border-t border-[var(--border)] pt-12">
          <p className={cx("mb-8", G.label)}>tono</p>
          <ul>
            {tone.items
              .filter((item) => !isVoiceProcessNoise(item.value.text))
              .map((item) => (
            <li
              key={item.candidateId}
              data-state={item.crowned ? "crowned" : "proposed"}
              role={!item.crowned && onCrown ? "button" : undefined}
              onClick={!item.crowned && onCrown ? () => onCrown("message.tone", item.candidateId) : undefined}
              className={cx(
                G.listRow,
                "relative text-xl md:text-2xl",
                !item.crowned && onCrown && "cursor-pointer ring-1 ring-inset ring-[var(--secondary)]/35",
              )}
            >
              {!item.crowned && onCrown && <ProposedDot />}
              {item.value.text}
            </li>
          ))}
          </ul>
          <div className="genoma-depth-trigger-wrap">
            <TraitDepthButton traitId="message.tone" />
          </div>
        </div>
      )}

      <div className="mt-20 grid gap-16 md:grid-cols-2">
        <ClaimList title="Podemos afirmar" slot={claimsAbsolute} onCrown={onCrown} tone="ok" />
        <ClaimList title="No decir" slot={claimsForbidden} onCrown={onCrown} tone="forbidden" />
      </div>
    </section>
  );
}

function ClaimList({
  title,
  slot,
  onCrown,
  tone,
}: {
  title: string;
  slot: MultiTraitSlot<ClaimValue>;
  onCrown?: GenomaFaceProps["onCrown"];
  tone: "ok" | "forbidden";
}) {
  if (slot.items.length === 0) {
    return (
      <div>
        <p className={cx("mb-6", G.label)}>{title}</p>
        <GhostLabel text="sin claims todavía" />
      </div>
    );
  }
  return (
    <div className="relative">
      <p className={cx("mb-6", G.label)}>{title}</p>
      <ul>
        {slot.items.map((item) => (
          <li
            key={item.candidateId}
            data-state={item.crowned ? "crowned" : "proposed"}
            role={!item.crowned && onCrown ? "button" : undefined}
            onClick={!item.crowned && onCrown ? () => onCrown(slot.traitId, item.candidateId) : undefined}
            className={cx(
              G.listRow,
              "relative text-lg md:text-xl",
              tone === "forbidden" && "text-[var(--text-muted)] line-through decoration-[var(--accent)]/70",
              !item.crowned && onCrown && "cursor-pointer ring-1 ring-inset ring-[var(--secondary)]/35",
            )}
          >
            {!item.crowned && onCrown && <ProposedDot />}
            {item.value.text}
            {tone === "forbidden" && item.value.why && (
              <span className="ml-2 align-middle text-sm no-underline">— {item.value.why}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="genoma-depth-trigger-wrap">
        <TraitDepthButton traitId={slot.traitId} />
      </div>
    </div>
  );
}

const VISUAL_AXIS_FIELDS: Array<{ key: keyof ImageAxes; label: string }> = [
  { key: "sujeto", label: "Sujeto" },
  { key: "edad", label: "Edad" },
  { key: "entorno", label: "Entorno" },
  { key: "accion", label: "Acción" },
  { key: "encuadre", label: "Encuadre" },
  { key: "paleta", label: "Paleta" },
  { key: "tratamiento", label: "Tratamiento" },
];

const VISUAL_DNA_FIELDS: Array<{ key: keyof VisualDnaFields; label: string }> = [
  { key: "sujeto", label: "Sujeto" },
  { key: "ropa", label: "Ropa" },
  { key: "lugar", label: "Lugar" },
  { key: "animo", label: "Ánimo" },
  { key: "estiloArtistico", label: "Estilo artístico" },
  { key: "encuadre", label: "Encuadre" },
  { key: "luzTratamiento", label: "Luz / tratamiento" },
  { key: "paletaAprox", label: "Paleta aprox." },
  { key: "texturas", label: "Texturas" },
  { key: "vozVisual", label: "Voz visual" },
];

function emptyVisualDna(): VisualDnaFields {
  return {
    sujeto: "",
    ropa: "",
    lugar: "",
    animo: "",
    estiloArtistico: "",
    encuadre: "",
    luzTratamiento: "",
    paletaAprox: "",
    texturas: "",
    vozVisual: "",
  };
}

function visualDnaFromValue(dna: ImageDnaValue): VisualDnaFields {
  if (dna.visualDna) return { ...dna.visualDna };
  return {
    ...emptyVisualDna(),
    sujeto: dna.axes.sujeto ?? "",
    lugar: dna.axes.entorno ?? "",
    encuadre: dna.axes.encuadre ?? "",
    paletaAprox: dna.axes.paleta ?? "",
    luzTratamiento: dna.axes.tratamiento ?? "",
    animo: dna.axes.accion ?? "",
  };
}

function visualDnaToAxes(fields: VisualDnaFields): ImageAxes {
  return {
    sujeto: fields.sujeto || undefined,
    entorno: fields.lugar || undefined,
    encuadre: fields.encuadre || undefined,
    paleta: fields.paletaAprox || undefined,
    tratamiento: fields.luzTratamiento || undefined,
    accion: fields.animo || undefined,
  };
}

function VisualTerritoryCard({
  category,
  traitId,
  candidateId,
  item,
  onCrown,
  onConfirmVisual,
}: {
  category: string;
  traitId: TraitId;
  candidateId: string;
  item: MultiTraitSlot<ImageDnaValue>["items"][number];
  onCrown?: GenomaFaceProps["onCrown"];
  onConfirmVisual?: GenomaFaceProps["onConfirmVisual"];
}) {
  const dna = item.value as ImageDnaValue;
  const useDnaFields = Boolean(dna.visualDna);
  const [editing, setEditing] = useState(false);
  const [draftAxes, setDraftAxes] = useState<ImageAxes>(dna.axes);
  const [draftVisualDna, setDraftVisualDna] = useState<VisualDnaFields>(() => visualDnaFromValue(dna));
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setDraftAxes(dna.axes);
    setDraftVisualDna(visualDnaFromValue(dna));
    setEditing(false);
    setConfirming(false);
  }, [candidateId]);

  const generated = item.derived?.generatedImageUrl;
  const clickable = !item.crowned && !!generated && !!onCrown;

  const handleConfirm = async () => {
    if (!onConfirmVisual || confirming) return;
    setConfirming(true);
    try {
      const axes = useDnaFields ? visualDnaToAxes(draftVisualDna) : draftAxes;
      await onConfirmVisual(traitId, candidateId, axes);
      setEditing(false);
    } finally {
      setConfirming(false);
    }
  };

  if (generated) {
    return (
      <div
        data-state={item.crowned ? "crowned" : "proposed"}
        role={clickable ? "button" : undefined}
        onClick={clickable ? () => onCrown!(traitId, candidateId) : undefined}
        className={cx(
          "relative overflow-hidden bg-[var(--surface-hover)]",
          clickable && "cursor-pointer ring-1 ring-inset ring-[var(--secondary)]/35",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={generated} alt={category} className="aspect-[4/3] w-full object-cover" />
        {clickable && <ProposedDot />}
      </div>
    );
  }

  return (
    <div
      data-state={item.crowned ? "crowned" : "proposed"}
      className="relative flex flex-col overflow-hidden bg-[var(--surface-hover)] ring-1 ring-inset ring-[var(--secondary)]/25"
    >
      {dna.referenceImageUrl ? (
        <div className="relative border-b border-[var(--border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dna.referenceImageUrl}
            alt=""
            className="aspect-[4/3] w-full object-cover opacity-40"
          />
          <span className={cx("absolute left-0 top-0 bg-black/60 px-3 py-1", G.label, "text-white/70")}>
            referencia
          </span>
        </div>
      ) : null}
      <div className="space-y-3 p-6">
        {useDnaFields
          ? VISUAL_DNA_FIELDS.map(({ key, label }) => {
              const val = draftVisualDna[key] ?? "";
              if (!editing && !val) return null;
              return (
                <label key={key} className="block text-sm text-[var(--text-muted)]">
                  <span className="text-xs uppercase tracking-wide opacity-60">{label}</span>
                  {editing ? (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => setDraftVisualDna((prev) => ({ ...prev, [key]: e.target.value }))}
                      className={cx(G.input, "mt-1 text-[var(--text)]")}
                    />
                  ) : (
                    <p className="mt-0.5 text-[var(--text)]">{val}</p>
                  )}
                </label>
              );
            })
          : VISUAL_AXIS_FIELDS.map(({ key, label }) => {
              const val = draftAxes[key] ?? "";
              if (!editing && !val) return null;
              return (
                <label key={key} className="block text-sm text-[var(--text-muted)]">
                  <span className="text-xs uppercase tracking-wide opacity-60">{label}</span>
                  {editing ? (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => setDraftAxes((prev) => ({ ...prev, [key]: e.target.value }))}
                      className={cx(G.input, "mt-1 text-[var(--text)]")}
                    />
                  ) : (
                    <p className="mt-0.5 text-[var(--text)]">{val}</p>
                  )}
                </label>
              );
            })}
      </div>
      {onConfirmVisual ? (
        <div className="flex gap-4 border-t border-[var(--border)] p-4">
          {editing ? (
            <button
              type="button"
              className={G.btnGhost}
              onClick={() => {
                setDraftAxes(dna.axes);
                setDraftVisualDna(visualDnaFromValue(dna));
                setEditing(false);
              }}
            >
              cancelar
            </button>
          ) : (
            <button
              type="button"
              className={G.btnGhost}
              onClick={() => setEditing(true)}
            >
              editar
            </button>
          )}
          <button
            type="button"
            disabled={confirming}
            className={cx(G.btnFill, "px-4 py-1 text-xs disabled:opacity-50")}
            onClick={() => void handleConfirm()}
          >
            {confirming ? "generando…" : "confirmar"}
          </button>
        </div>
      ) : null}
      {!item.crowned && <ProposedDot />}
    </div>
  );
}

function VisualUniverseSection({
  visualUniverse,
  onCrown,
  onConfirmVisual,
}: {
  visualUniverse: GenomaBookView["visualUniverse"];
  onCrown?: GenomaFaceProps["onCrown"];
  onConfirmVisual?: GenomaFaceProps["onConfirmVisual"];
}) {
  const populated = visualUniverse.filter((v) => v.slot.items.length > 0);
  if (populated.length === 0) {
    return (
      <section className={cx("bg-[var(--surface)]", G.section)}>
        <p className={cx("mb-10", G.label)}>universo visual</p>
        <GhostLabel text="sin imágenes todavía" />
      </section>
    );
  }
  return (
    <section className={cx("bg-[var(--surface)]", G.section)}>
      <p className={cx("mb-16", G.label)}>universo visual</p>
      <div className="space-y-20">
        {populated.map(({ category, slot }) => (
          <div key={category} className="relative">
            <p className="mb-8 text-2xl lowercase md:text-3xl">{category}</p>
            <div className="grid grid-cols-2 gap-px bg-[var(--border)] md:grid-cols-3 lg:grid-cols-4">
              {slot.items.map((item) => (
                <VisualTerritoryCard
                  key={item.candidateId}
                  category={category}
                  traitId={slot.traitId as TraitId}
                  candidateId={item.candidateId}
                  item={item}
                  onCrown={onCrown}
                  onConfirmVisual={onConfirmVisual}
                />
              ))}
            </div>
            <div className="genoma-depth-trigger-wrap">
              <TraitDepthButton traitId={slot.traitId as TraitId} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Panel izquierdo (30%) ─────────────────────────────────────────────────────

function LeftPanel({
  projectId,
  view,
  onAddSource,
  onDrop,
  onDownload,
  ingestFeedback,
  onIngestRetry,
  activePrompt,
  onResolvePrompt,
}: {
  projectId: string;
  view: GenomaBookView;
  onAddSource?: GenomaFaceProps["onAddSource"];
  onDrop?: GenomaFaceProps["onDrop"];
  onDownload?: GenomaFaceProps["onDownload"];
  ingestFeedback?: GenomaIngestFeedbackState;
  onIngestRetry?: GenomaFaceProps["onIngestRetry"];
  activePrompt?: GenomaFaceProps["activePrompt"];
  onResolvePrompt?: GenomaFaceProps["onResolvePrompt"];
}) {
  const [url, setUrl] = useState("");
  const [exportMode, setExportMode] = useState<GenomaStyleGuideExportMode>("operativo");
  const [dragging, setDragging] = useState(false);
  const [downloadPhase, setDownloadPhase] = useState<"idle" | "vectorizing" | "downloading">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (files?.length) onDrop?.(files);
  };

  return (
    <aside className="flex h-full w-[30%] min-w-[280px] max-w-[420px] flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)]">
      <div className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain", G.panel, "flex flex-col gap-8 pb-6")}>
        <div>
          <p className={G.label}>genoma</p>
          <p
            className="mt-2 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]/80"
            title={`nodo ${projectId}`}
          >
            nodo · {projectId}
          </p>
          <div className="mt-4 flex items-baseline gap-2">
            <span data-testid="completeness" className="text-5xl font-bold leading-none tracking-tight">
              {view.completenessPercent}%
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">del libro resuelto</p>
        </div>

        <section aria-label="entrada de material" className="space-y-4">
          <p className={G.label}>material · único punto de entrada</p>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={cx(
              "flex min-h-[120px] cursor-pointer flex-col items-center justify-center border p-6 text-center transition",
              dragging ? "border-[var(--secondary)] bg-[var(--secondary)]/[0.04]" : "border-[var(--border)]",
            )}
          >
            <p className="text-base lowercase">suelta aquí</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">pdf, imágenes o documentos de marca</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,image/*"
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = url.trim();
              if (trimmed) {
                onAddSource?.(trimmed);
                setUrl("");
              }
            }}
            className="flex items-end gap-3"
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="pega una url"
              className={G.input}
            />
            <button type="submit" className={G.btnFill}>
              añadir
            </button>
          </form>
        </section>

        {ingestFeedback ? (
          <GenomaIngestFeedback
            feedback={ingestFeedback}
            onRetry={onIngestRetry}
            activePrompt={activePrompt}
            onResolvePrompt={onResolvePrompt}
          />
        ) : null}

        <GenomaSourcesPanel sources={view.sources} />

        {ingestFeedback?.activity?.statusLine?.includes("análisis visual") ? (
          <p className="text-xs lowercase tracking-wide text-[var(--secondary)]">
            {ingestFeedback.activity.statusLine}
          </p>
        ) : null}
      </div>

      <div className={cx("shrink-0 space-y-4 border-t border-[var(--border)] bg-[var(--surface)]", G.panel, "pt-6")}>
        <fieldset className="space-y-2">
          <legend className={G.label}>exportar libro</legend>
          <div className="space-y-1">
            {(Object.keys(GENOMA_STYLE_GUIDE_EXPORT_MODE_LABELS) as GenomaStyleGuideExportMode[]).map((mode) => (
              <label key={mode} className="flex cursor-pointer items-center gap-3 py-1 text-sm lowercase">
                <input
                  type="radio"
                  name="genoma-export-mode"
                  checked={exportMode === mode}
                  onChange={() => setExportMode(mode)}
                  className="accent-[var(--primary)]"
                />
                {GENOMA_STYLE_GUIDE_EXPORT_MODE_LABELS[mode].toLowerCase()}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-[var(--text-muted)]">
            {view.sourcesCount === 0
              ? "sin fuentes aún"
              : `${view.sourcesCount} ${view.sourcesCount === 1 ? "fuente" : "fuentes"}`}
          </span>
          <button
            type="button"
            disabled={downloadPhase !== "idle"}
            onClick={() => {
              if (!onDownload || downloadPhase !== "idle") return;
              setDownloadPhase("downloading");
              void Promise.resolve(
                onDownload(exportMode, {
                  onPhase: (phase) => setDownloadPhase(phase),
                }),
              )
                .catch(() => undefined)
                .finally(() => setDownloadPhase("idle"));
            }}
            className={G.btn}
          >
            {downloadPhase === "vectorizing"
              ? "vectorizando…"
              : downloadPhase === "downloading"
                ? "descargando…"
                : "descargar pdf"}
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Cara completa ─────────────────────────────────────────────────────────────

export function GenomaFace({
  view,
  projectId,
  genome,
  onGenomeChange,
  onCrown,
  onAddSource,
  onDrop,
  onDownload,
  onVectorizeLogo,
  onConfirmVisual,
  onUploadSpecimenFont,
  ingestFeedback,
  onIngestRetry,
  activePrompt,
  onResolvePrompt,
  logoIntakeRef,
  onIntakeLogoUnlock,
  vectorizeEnabled = true,
}: GenomaFaceProps) {
  const slotProps = {
    genome,
    view,
    onGenomeChange,
    onCrown,
    onVectorizeLogo,
    onIntakeLogoUnlock,
    vectorizeEnabled,
  };
  return (
    <GenomaFaceProvider value={slotProps}>
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-[var(--surface)] text-[var(--text-main)]">
      <LeftPanel
        projectId={projectId}
        view={view}
        onAddSource={onAddSource}
        onDrop={onDrop}
        onDownload={onDownload}
        ingestFeedback={ingestFeedback}
        onIngestRetry={onIngestRetry}
        activePrompt={activePrompt}
        onResolvePrompt={onResolvePrompt}
      />
      <main className="h-full flex-1 overflow-y-auto">
        <LogoIntakePanel ref={logoIntakeRef} projectId={projectId} genome={genome} onGenomeChange={onGenomeChange} />
        <TypographySection
          primary={view.typography.primary}
          secondary={view.typography.secondary}
          onCrown={onCrown}
          onUploadSpecimenFont={onUploadSpecimenFont}
        />
        <PaletteSection palette={view.palette} onCrown={onCrown} />
        <VoiceSection {...view.voice} onCrown={onCrown} />
        <VisualUniverseSection visualUniverse={view.visualUniverse} onCrown={onCrown} onConfirmVisual={onConfirmVisual} />
      </main>
    </div>
    </GenomaFaceProvider>
  );
}

export default GenomaFace;
