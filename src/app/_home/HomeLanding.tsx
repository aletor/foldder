"use client";

import Image from "next/image";
import Link from "next/link";
import { GoogleAccessButton } from "@/components/GoogleAccessButton";
import { LANGUAGE_OPTIONS, type AppLanguage } from "@/lib/i18n";
import { FOLDDER_HOME_PATH } from "@/lib/home-seo";
import { ColorWaveBackground } from "./ColorWaveBackground";
import { BrainSectionVisual } from "./BrainSectionVisual";
import { HeroPhotoColumnsBackground } from "./HeroPhotoColumnsBackground";
import { ManifestoParticleBackground } from "./ManifestoParticleBackground";
import { NodePerspectiveGallery } from "./NodePerspectiveGallery";
import { FormattedText } from "./FormattedText";
import { HOME_COPY } from "./home-copy";
import { HomeLocaleProvider } from "./home-locale";
import { useHomeV2DeviceProfile } from "./home-v2-device";
import { useHomeSectionScroll } from "./useHomeSectionScroll";
import "./home-v2.css";

function HeroChrome({ locale }: { locale: AppLanguage }) {
  return (
    <div data-home-v2-hero-chrome className="relative z-[2] flex items-center justify-end gap-4">
      <div
        data-foldder-home-lang
        data-home-v2-hero-lang
        className="flex shrink-0 items-stretch divide-x divide-white/15 border border-white/15"
        data-foldder-i18n-ignore
      >
        {LANGUAGE_OPTIONS.map((option) => {
          const active = option.id === locale;
          return (
            <Link
              key={option.id}
              href={FOLDDER_HOME_PATH[option.id]}
              hrefLang={option.id}
              aria-label={option.label}
              aria-current={active ? "true" : undefined}
              className={`flex h-10 min-w-10 items-center justify-center px-3 text-[10px] font-black uppercase tracking-[0.1em] transition ${
                active
                  ? "bg-white text-zinc-950"
                  : "bg-black/40 text-white/45 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option.shortLabel}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BetaNote({ copy, center = false }: { copy: (typeof HOME_COPY)["es"]; center?: boolean }) {
  return (
    <p data-home-v2-access-note="" {...(center ? { "data-home-v2-access-note--center": "" } : {})}>
      {copy.betaBefore} <span data-home-v2-access-note-beta>Beta</span>
      {copy.betaAfter}
    </p>
  );
}

export function HomeLanding({ locale }: { locale: AppLanguage }) {
  useHomeV2DeviceProfile();
  useHomeSectionScroll();
  const copy = HOME_COPY[locale];
  const [heroLineA, heroLineB] = copy.heroPrimary.split("\n");

  return (
    <HomeLocaleProvider locale={locale}>
      <div data-foldder-home-v2 data-foldder-i18n-ignore className="flex min-h-screen flex-col overflow-x-hidden">
        <section
          data-home-v2-module
          data-home-v2-module--hero
          id="hero"
          aria-labelledby="hero-heading"
          className="relative flex min-h-[100dvh] flex-col overflow-hidden py-8 sm:py-10"
        >
          <HeroPhotoColumnsBackground />
          <HeroChrome locale={locale} />
          <div
            data-home-v2-hero-content
            data-home-v2-section-copy
            className="relative z-[1] mr-auto flex w-full flex-1 flex-col justify-center pb-6 pt-4"
          >
            <Link href={FOLDDER_HOME_PATH[locale]} data-home-v2-hero-logo data-foldder-home-link aria-label="Foldder">
              <Image
                src="/home-v2/hero-logo-line.png"
                alt=""
                width={627}
                height={794}
                className="h-auto w-full max-w-none shrink-0 object-contain"
                priority
              />
            </Link>
            <h1 id="hero-heading" data-home-v2-headline data-home-v2-headline--on-dark data-home-v2-headline--balance>
              <span data-home-v2-hero-primary>
                <span data-home-v2-hero-emphasis>
                  {heroLineA}
                  <br />
                  {heroLineB}
                </span>
              </span>
              <span data-home-v2-hero-line="gradient">{copy.heroGradient}</span>
            </h1>
            <FormattedText as="p" data-home-v2-hero-lead className="text-white/45" text={copy.heroLead} />
            <div data-home-v2-hero-actions className="flex flex-wrap items-stretch">
              <div data-home-v2-hero-cta>
                <GoogleAccessButton
                  label={copy.startCreating}
                  authenticatedLabel={copy.enterFoldder}
                  loadingLabel={locale === "en" ? "Checking session..." : "Comprobando sesión..."}
                  className="flex h-10 min-w-[10rem] flex-1 items-center justify-center gap-2 bg-blue-600 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                />
                <BetaNote copy={copy} />
              </div>
            </div>
          </div>
          <p data-home-v2-hero-caption aria-label={locale === "en" ? "Made with Foldder" : "Hecho con Foldder"}>
            <span data-home-v2-hero-caption-text>{copy.madeWith}</span>
            <span data-home-v2-hero-caption-mark>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo_home.svg" alt="" data-home-v2-hero-caption-icon />
              <span data-home-v2-hero-caption-brand>FOLDDER</span>
            </span>
          </p>
        </section>

        <section
          data-home-v2-module
          data-home-v2-module--manifesto
          id="manifesto"
          aria-labelledby="manifesto-heading"
          className="relative flex flex-col justify-center overflow-hidden py-16"
          data-home-v2-section-inset
        >
          <ManifestoParticleBackground />
          <div data-home-v2-section-copy className="relative z-[1]">
            <h2 id="manifesto-heading" className="sr-only">
              {copy.manifestoLabel}
            </h2>
            <div data-home-v2-manifesto-lines className="space-y-2 sm:space-y-3">
              {copy.manifestoLines.map((line) => (
                <p key={line} data-home-v2-manifesto-line data-home-v2-headline>
                  {line}
                </p>
              ))}
            </div>
            <FormattedText
              as="p"
              data-home-v2-body
              className="max-w-lg text-zinc-950/48"
              text={copy.manifestoBody}
            />
          </div>
        </section>

        <section
          data-home-v2-module
          data-home-v2-module--brain
          data-home-v2-scroll-align="start"
          id="brain"
          aria-labelledby="brain-heading"
          className="relative"
        >
          <div data-home-v2-brain-layout className="relative z-[1]">
            <div data-home-v2-brain-copy data-home-v2-section-copy data-home-v2-section-inset>
              <p data-home-v2-eyebrow className="text-[10px] uppercase tracking-[0.14em] text-violet-300/90">
                {copy.brandkitEyebrow}
              </p>
              <h2 id="brain-heading" data-home-v2-headline data-home-v2-headline--on-dark>
                <span data-home-v2-brain-claim-line>{copy.brandkitHeadline[0]}</span>
                <br />
                <span data-home-v2-brain-claim-line>{copy.brandkitHeadline[1]}</span>
              </h2>
              <FormattedText as="p" data-home-v2-body className="text-white/48" text={copy.brandkitBody} />
              <ul data-home-v2-brain-features>
                {copy.brandkitFeatures.map((feature) => (
                  <li key={feature.title} data-home-v2-brain-feature>
                    <p data-home-v2-brain-feature-title>{feature.title}</p>
                    <FormattedText as="p" data-home-v2-brain-feature-desc text={feature.description} />
                  </li>
                ))}
              </ul>
            </div>
            <div data-home-v2-brain-visual-col>
              <BrainSectionVisual />
            </div>
          </div>
        </section>

        <section
          data-home-v2-module
          data-home-v2-module--nodes
          data-home-v2-scroll-align="start"
          id="nodes"
          aria-labelledby="nodes-heading"
        >
          <div data-home-v2-section-copy data-home-v2-section-inset data-home-v2-nodes-copy>
            <p data-home-v2-eyebrow className="text-[10px] uppercase tracking-[0.14em] text-violet-300">
              {copy.nodesEyebrow}
            </p>
            <h2 id="nodes-heading" data-home-v2-headline>
              <span data-home-v2-brain-claim-line>{copy.nodesHeadline[0]}</span>
              <br />
              <span data-home-v2-brain-claim-line>{copy.nodesHeadline[1]}</span>
            </h2>
          </div>
          <div data-home-v2-nodes-gallery aria-label={copy.nodesGalleryLabel}>
            <NodePerspectiveGallery />
          </div>
        </section>

        <section
          data-home-v2-module
          data-home-v2-module--start
          data-home-v2-scroll-align="start"
          id="start"
          aria-labelledby="billing-heading start-heading"
          className="relative overflow-hidden"
        >
          <ColorWaveBackground />
          <div data-home-v2-start-inner className="relative z-[1] flex w-full flex-col py-16">
            <div data-home-v2-start-billing data-home-v2-billing-copy data-home-v2-section-copy data-home-v2-section-inset>
              <p data-home-v2-eyebrow className="text-[10px] uppercase tracking-[0.14em] text-violet-300/90">
                {copy.billingEyebrow}
              </p>
              <h2 id="billing-heading" data-home-v2-headline data-home-v2-headline--on-dark data-home-v2-headline--balance>
                <span data-home-v2-brain-claim-line>{copy.billingHeadline[0]}</span>
                <br />
                <span data-home-v2-brain-claim-line>{copy.billingHeadline[1]}</span>
              </h2>
              <FormattedText as="p" data-home-v2-body className="max-w-2xl text-white/52" text={copy.billingBody} />
              <ul data-home-v2-billing-features>
                {copy.billingCards.map((card) => (
                  <li key={card.title} data-home-v2-billing-feature>
                    <p data-home-v2-billing-feature-title>{card.title}</p>
                    <FormattedText as="p" data-home-v2-billing-feature-desc text={card.description} />
                  </li>
                ))}
              </ul>
            </div>

            <div
              data-home-v2-start-closing
              className="flex flex-col items-center px-5 text-center sm:px-8 lg:px-12 xl:px-16"
            >
              <h2
                id="start-heading"
                data-home-v2-headline
                data-home-v2-headline--on-dark
                data-home-v2-headline--balance
                className="max-w-4xl"
              >
                {copy.closingHeadline}
              </h2>
              <FormattedText
                as="p"
                data-home-v2-body
                className="mt-5 max-w-xl text-white/48"
                text={copy.closingBody}
              />
              <div data-home-v2-start-cta className="mt-10 w-full max-w-[380px]">
                <div className="w-full border border-white/12">
                  <GoogleAccessButton
                    label={copy.startShort}
                    authenticatedLabel={copy.enterFoldder}
                    loadingLabel={locale === "en" ? "Checking session..." : "Comprobando sesión..."}
                    className="flex h-12 w-full items-center justify-center gap-2 bg-blue-600 px-6 text-[11px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <BetaNote copy={copy} center />
              </div>
            </div>
          </div>
        </section>

        <footer className="flex h-10 shrink-0 items-center justify-center border-t border-zinc-950/10 bg-zinc-950 px-4">
          <p data-home-v2-body className="text-[10px] uppercase tracking-[0.12em] text-white/72">
            Foldder 2026
          </p>
        </footer>
      </div>
    </HomeLocaleProvider>
  );
}
