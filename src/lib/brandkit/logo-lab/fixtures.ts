import {
  CATALOGO26_FILENAME,
  CATALOGO26_PDF,
  ESADE_PITCH_FILENAME,
  ESADE_PITCH_PDF,
  LEAN_FINANCE_PITCH_FILENAME,
  LEAN_FINANCE_PITCH_PDF,
  SAMPLE_BRAND_DECK_FILENAME,
  SAMPLE_BRAND_DECK_PDF,
} from "@/lib/brandkit/fixtures/brandkit-paths";

export type LogoLabFixtureId = "catalogo26" | "oaro-deck" | "esade-pitch" | "lean-finance";

export type LogoLabFixture = {
  id: LogoLabFixtureId;
  label: string;
  pdfPath: string;
  fileName: string;
  auditPrefix: string;
};

/** Cuatro PDFs de regresión — audits en fixtures/page-vision-pass/runs/. */
export const LOGO_LAB_FIXTURES: LogoLabFixture[] = [
  {
    id: "catalogo26",
    label: "Atresmedia · catalogo26",
    pdfPath: CATALOGO26_PDF,
    fileName: CATALOGO26_FILENAME,
    auditPrefix: "f9e683edde0a",
  },
  {
    id: "oaro-deck",
    label: "OARO · sample-brand-deck",
    pdfPath: SAMPLE_BRAND_DECK_PDF,
    fileName: SAMPLE_BRAND_DECK_FILENAME,
    auditPrefix: "1403be85f444",
  },
  {
    id: "esade-pitch",
    label: "ESADE · pitch deck",
    pdfPath: ESADE_PITCH_PDF,
    fileName: ESADE_PITCH_FILENAME,
    auditPrefix: "c96df8c15bf3",
  },
  {
    id: "lean-finance",
    label: "Lean Finance · pitch deck",
    pdfPath: LEAN_FINANCE_PITCH_PDF,
    fileName: LEAN_FINANCE_PITCH_FILENAME,
    auditPrefix: "a6fff239c22b",
  },
];

export function getLogoLabFixture(id: string): LogoLabFixture | null {
  return LOGO_LAB_FIXTURES.find((f) => f.id === id) ?? null;
}

/** IDs compartidos con golden/manifest.json (Brief 0). */
export const LOGO_LAB_GOLDEN_FIXTURE_IDS = [
  "catalogo26",
  "oaro-deck",
  "esade-pitch",
  "lean-finance",
] as const satisfies readonly LogoLabFixtureId[];
