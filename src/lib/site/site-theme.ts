import type { BrandThemeResult } from "@/lib/brandkit/brand-theme-color";
import { resolveSitePolarity, type SiteAdnContext } from "./site-adn";
import type {
  MotionDna,
  ThemeDialRadius,
  ThemeDialRhythm,
  ThemeFinishPreset,
  ThemeState,
} from "./site-types";

export type CompiledSiteTheme = {
  variables: Record<string, string>;
  polarity: "light" | "dark";
};

const NEUTRAL_LIGHT = {
  "--c-bg": "#f5f4f1",
  "--c-bg-raised": "#ffffff",
  "--c-fg": "#1a1a1a",
  "--c-fg-soft": "#666666",
  "--c-accent": "#6ec4a8",
  "--c-accent-fg": "#0d1f18",
  "--c-rule": "rgba(26, 26, 26, 0.12)",
};

const NEUTRAL_DARK = {
  "--c-bg": "#101012",
  "--c-bg-raised": "#1a1b1e",
  "--c-fg": "#f2f2f2",
  "--c-fg-soft": "rgba(242, 242, 242, 0.62)",
  "--c-accent": "#6ec4a8",
  "--c-accent-fg": "#0d1f18",
  "--c-rule": "rgba(255, 255, 255, 0.12)",
};

const RHYTHM_UNIT: Record<ThemeDialRhythm, string> = {
  compact: "0.75rem",
  normal: "1rem",
  airy: "1.35rem",
};

const RADIUS_VALUE: Record<ThemeDialRadius, string> = {
  none: "0px",
  soft: "8px",
  round: "18px",
};

const MOTION_CURVE: Record<MotionDna, string> = {
  soft: "cubic-bezier(0.22, 1, 0.36, 1)",
  expo: "cubic-bezier(0.16, 1, 0.3, 1)",
  bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  linear: "linear",
};

const FINISH_DIALS: Record<ThemeFinishPreset, { rhythm: ThemeDialRhythm; radius: ThemeDialRadius }> = {
  editorial: { rhythm: "normal", radius: "soft" },
  impact: { rhythm: "compact", radius: "none" },
  minimal: { rhythm: "airy", radius: "soft" },
};

function brandPalette(brand: BrandThemeResult): Record<string, string> {
  const vars = brand.vars;
  return {
    "--c-bg": vars["--brand-surface-page"],
    "--c-bg-raised": vars["--brand-surface-raised"],
    "--c-fg": vars["--brand-ink"],
    "--c-fg-soft": vars["--brand-ink-soft"],
    "--c-accent": vars["--brand-accent"] ?? vars["--brand-cta-bg"],
    "--c-accent-fg": vars["--brand-cta-ink"],
    "--c-rule": vars["--brand-rule"],
    "--f-display": vars["--brand-font-display"],
    "--f-body": vars["--brand-font-text"],
  };
}

function resolveDials(theme: ThemeState): { rhythm: ThemeDialRhythm; radius: ThemeDialRadius } {
  if (theme.finishPreset) return FINISH_DIALS[theme.finishPreset];
  return { rhythm: theme.dials.rhythm, radius: theme.dials.radius };
}

function motionDuration(theme: ThemeState): string {
  const baseMs =
    theme.motionDNA === "soft" ? 700 : theme.motionDNA === "expo" ? 550 : theme.motionDNA === "bounce" ? 650 : 450;
  if (theme.dials.motionIntensity === 0) return "0ms";
  const scale = theme.dials.motionIntensity === 2 ? 1.25 : 1;
  return `${Math.round(baseMs * scale)}ms`;
}

function motionStagger(theme: ThemeState): string {
  if (theme.dials.motionIntensity === 0) return "0ms";
  const base = theme.motionDNA === "expo" ? 40 : theme.motionDNA === "bounce" ? 55 : 70;
  const scale = theme.dials.motionIntensity === 2 ? 1.2 : 1;
  return `${Math.round(base * scale)}ms`;
}

/** Compila ThemeState → custom properties (spec §1.3). */
export function compileSiteTheme(theme: ThemeState, adn?: SiteAdnContext | null): CompiledSiteTheme {
  const polarity = resolveSitePolarity(theme, adn);
  const brandReady = adn?.ready && adn.brandTheme.ready;
  const palette = brandReady
    ? brandPalette(adn.brandTheme)
    : polarity === "dark"
      ? NEUTRAL_DARK
      : NEUTRAL_LIGHT;
  const dials = resolveDials(theme);

  return {
    polarity,
    variables: {
      ...palette,
      ...(!brandReady
        ? {
            "--f-display": '"Helvetica Neue", Helvetica, Arial, sans-serif',
            "--f-body": '"Helvetica Neue", Helvetica, Arial, sans-serif',
          }
        : {}),
      "--space-unit": RHYTHM_UNIT[dials.rhythm],
      "--radius": RADIUS_VALUE[dials.radius],
      "--motion-curve": MOTION_CURVE[theme.motionDNA],
      "--motion-duration": motionDuration(theme),
      "--motion-stagger": motionStagger(theme),
      "--site-max-width": "1080px",
    },
  };
}

export function compiledThemeToCssRoot(compiled: CompiledSiteTheme): string {
  const lines = Object.entries(compiled.variables).map(([key, value]) => `  ${key}: ${value};`);
  return `:root {\n${lines.join("\n")}\n}`;
}

export function siteThemeStylesheet(theme: ThemeState, adn?: SiteAdnContext | null): string {
  const compiled = compileSiteTheme(theme, adn);
  return `${compiledThemeToCssRoot(compiled)}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--c-bg);
  color: var(--c-fg);
  font-family: var(--f-body);
  font-size: calc(var(--space-unit) * 1);
  line-height: 1.55;
}

img, video, iframe { max-width: 100%; display: block; }

a { color: inherit; }

.site-page__header {
  position: sticky;
  top: 0;
  z-index: 2;
  background: color-mix(in srgb, var(--c-bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--c-rule);
}

.site-page__nav {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--space-unit) * 0.75);
  max-width: var(--site-max-width);
  margin: 0 auto;
  padding: calc(var(--space-unit) * 0.75) calc(var(--space-unit) * 1.25);
}

.site-page__nav a {
  text-decoration: none;
  font-size: 0.8125rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-fg-soft);
}

.site-page__nav a:hover,
.site-page__nav a:focus-visible { color: var(--c-fg); }

.site-page__site-nav {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--space-unit) * 0.5);
  max-width: var(--site-max-width);
  margin: 0 auto;
  padding: calc(var(--space-unit) * 0.5) calc(var(--space-unit) * 1.25);
  border-bottom: 1px solid var(--c-rule);
}

.site-page__site-nav a {
  text-decoration: none;
  font-size: 0.875rem;
  color: var(--c-fg-soft);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.site-page__site-nav a[aria-current="page"] {
  color: var(--c-fg);
  background: color-mix(in srgb, var(--c-accent) 12%, transparent);
}

.site-page__site-nav a:hover,
.site-page__site-nav a:focus-visible { color: var(--c-fg); }

.site-page__main { display: block; }

.site-section { padding-block: calc(var(--space-unit) * 2.5); }

.site-section--full { padding-inline: 0; }

.site-section--contained .site-section__inner {
  max-width: var(--site-max-width);
  margin-inline: auto;
  padding-inline: calc(var(--space-unit) * 1.25);
}

.site-section.is-selected {
  outline: 2px solid var(--c-accent);
  outline-offset: -2px;
}

.site-section__inner { width: 100%; }

.site-split {
  display: grid;
  gap: calc(var(--space-unit) * 1.5);
}

.site-split--1 { grid-template-columns: 1fr; }
.site-split--1-1 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.site-split--2-1 { grid-template-columns: 2fr 1fr; }
.site-split--1-2 { grid-template-columns: 1fr 2fr; }
.site-split--1-1-1 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.site-split--bento-a { grid-template-columns: 1.4fr 1fr; }
.site-split--bento-b { grid-template-columns: 1fr 1.4fr; }

.site-cell { min-width: 0; }

.site-text { margin: 0; }

.site-text--h1 {
  font-family: var(--f-display);
  font-size: clamp(2rem, 5vw, 3.25rem);
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -0.02em;
}

.site-text--h2 {
  font-family: var(--f-display);
  font-size: clamp(1.5rem, 3.5vw, 2.25rem);
  font-weight: 650;
  line-height: 1.12;
}

.site-text--h3 {
  font-family: var(--f-display);
  font-size: clamp(1.125rem, 2.5vw, 1.5rem);
  font-weight: 600;
  line-height: 1.2;
}

.site-text--body { font-size: 1.05rem; line-height: 1.6; }

.site-text--quote {
  font-family: var(--f-display);
  font-size: 1.25rem;
  font-style: italic;
  line-height: 1.45;
  color: var(--c-fg-soft);
}

.site-text--caption {
  font-size: 0.8125rem;
  letter-spacing: 0.04em;
  color: var(--c-fg-soft);
}

.site-text--align-left { text-align: left; }
.site-text--align-center { text-align: center; margin-inline: auto; }
.site-text--align-right { text-align: right; margin-left: auto; }

.site-text--width-narrow { max-width: 42ch; }
.site-text--width-normal { max-width: 62ch; }
.site-text--width-full { max-width: none; }

.site-stack {
  display: flex;
  flex-direction: column;
  gap: calc(var(--space-unit) * 1);
  align-items: flex-start;
}

.site-stack--center { align-items: center; text-align: center; }

.site-figure { margin: 0; width: 100%; }

.site-media {
  width: 100%;
  overflow: hidden;
  border-radius: var(--radius);
  background: var(--c-bg-raised);
  border: 1px solid var(--c-rule);
}

.site-media--ratio-1-1 { aspect-ratio: 1 / 1; }
.site-media--ratio-4-3 { aspect-ratio: 4 / 3; }
.site-media--ratio-16-9 { aspect-ratio: 16 / 9; }
.site-media--ratio-9-16 { aspect-ratio: 9 / 16; }
.site-media--ratio-3-2 { aspect-ratio: 3 / 2; }
.site-media--ratio-auto { aspect-ratio: auto; min-height: calc(var(--space-unit) * 10); }

.site-media__asset { width: 100%; height: 100%; object-fit: cover; }
.site-media__asset--contain { object-fit: contain; }

.site-media__placeholder {
  width: 100%;
  height: 100%;
  min-height: calc(var(--space-unit) * 10);
  display: grid;
  place-items: center;
  color: var(--c-fg-soft);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--c-bg-raised) 88%, var(--c-accent) 12%),
    var(--c-bg-raised)
  );
}

.site-media__caption {
  margin-top: calc(var(--space-unit) * 0.5);
  font-size: 0.8125rem;
  color: var(--c-fg-soft);
}

.site-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  padding: calc(var(--space-unit) * 0.65) calc(var(--space-unit) * 1.1);
  font-family: var(--f-body);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid transparent;
}

.site-btn--primary { background: var(--c-accent); color: var(--c-accent-fg); }
.site-btn--secondary { background: transparent; color: var(--c-fg); border-color: var(--c-rule); }

.site-collection { display: grid; gap: calc(var(--space-unit) * 0.75); }
.site-collection--grid-1 { grid-template-columns: 1fr; }
.site-collection--grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.site-collection--grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.site-collection--grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.site-collection--density-compact { gap: calc(var(--space-unit) * 0.45); }
.site-collection--density-airy { gap: calc(var(--space-unit) * 1.1); }
.site-collection__item { min-width: 0; }

.site-collection--carousel { display: block; overflow: hidden; position: relative; }
.site-collection__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  border: 1px solid var(--c-rule);
  background: color-mix(in srgb, var(--c-bg) 88%, transparent);
  color: var(--c-fg);
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  cursor: pointer;
}
.site-collection__nav--prev { left: 0.35rem; }
.site-collection__nav--next { right: 0.35rem; }
.site-collection__carousel-track {
  display: flex;
  gap: calc(var(--space-unit) * 0.75);
  overflow-x: auto;
  scroll-behavior: smooth;
  padding-bottom: calc(var(--space-unit) * 0.25);
}
.site-collection--carousel-snap .site-collection__carousel-track { scroll-snap-type: x mandatory; }
.site-collection--carousel-snap .site-collection__item { scroll-snap-align: start; flex: 0 0 min(78%, 320px); }
.site-collection--carousel-peek .site-collection__item { flex: 0 0 min(82%, 360px); }
.site-collection--carousel:not(.site-collection--carousel-peek) .site-collection__item { flex: 0 0 min(92%, 420px); }

.site-collection--table { display: block; overflow-x: auto; }
.site-collection__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.site-collection__table th,
.site-collection__table td {
  padding: calc(var(--space-unit) * 0.45) calc(var(--space-unit) * 0.65);
  border-bottom: 1px solid var(--c-rule);
  text-align: left;
}
.site-collection--table-sticky .site-collection__table thead th { position: sticky; top: 0; background: var(--c-bg); }
.site-collection--table-zebra .site-collection__table tbody tr:nth-child(even) { background: color-mix(in srgb, var(--c-bg-raised) 70%, transparent); }

.site-collection--marquee { overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
.site-collection__marquee-track {
  display: flex;
  gap: calc(var(--space-unit) * 0.75);
  width: max-content;
  animation: site-marquee var(--site-marquee-duration, 24s) linear infinite;
}
.site-collection--marquee[data-speed="1"] { --site-marquee-duration: 36s; }
.site-collection--marquee[data-speed="2"] { --site-marquee-duration: 24s; }
.site-collection--marquee[data-speed="3"] { --site-marquee-duration: 16s; }
.site-collection--marquee-grayscale .site-media__asset { filter: grayscale(1); }
.site-collection--marquee .site-collection__item { flex: 0 0 auto; width: min(220px, 42vw); }

@keyframes site-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

.site-section--motion-trigger-scroll {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.6s var(--motion-ease, ease), transform 0.6s var(--motion-ease, ease);
}
.site-section--motion-trigger-scroll.is-visible {
  opacity: 1;
  transform: translateY(0);
}
.site-section--motion-trigger-appear {
  animation: site-section-appear 0.7s var(--motion-ease, ease) both;
}

.site-media[data-duotone="true"] .site-media__asset {
  filter: grayscale(1) contrast(1.08);
  mix-blend-mode: multiply;
}
.site-section--motion-soft { --motion-ease: cubic-bezier(0.22, 1, 0.36, 1); }
.site-section--motion-expo { --motion-ease: cubic-bezier(0.16, 1, 0.3, 1); animation-duration: 0.55s; }
.site-section--motion-bounce { --motion-ease: cubic-bezier(0.34, 1.56, 0.64, 1); animation-duration: 0.85s; }
.site-section--motion-linear { --motion-ease: linear; animation-duration: 0.5s; }

@keyframes site-section-appear {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 720px) {
  .site-split--1-1,
  .site-split--2-1,
  .site-split--1-2,
  .site-split--1-1-1,
  .site-split--bento-a,
  .site-split--bento-b { grid-template-columns: 1fr; }

  .site-collection--grid-2,
  .site-collection--grid-3,
  .site-collection--grid-4 { grid-template-columns: 1fr; }

  .site-collection--carousel .site-collection__item { flex-basis: min(88vw, 320px); }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
}
