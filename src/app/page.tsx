"use client";

import Image from "next/image";
import Link from "next/link";
import { GoogleAccessButton } from "@/components/GoogleAccessButton";
import { useLanguage } from "@/components/LanguageProvider";
import { LANGUAGE_OPTIONS } from "@/lib/i18n";
import { ColorWaveBackground } from "./_home/ColorWaveBackground";
import { BrainSectionVisual } from "./_home/BrainSectionVisual";
import { HeroPhotoColumnsBackground } from "./_home/HeroPhotoColumnsBackground";
import { ManifestoParticleBackground } from "./_home/ManifestoParticleBackground";
import { FlowsCanvasDemo } from "./_home/FlowsCanvasDemo";
import { FlowsPresetButtons } from "./_home/FlowsPresetButtons";
import { FlowsWallpaperBackground } from "./_home/FlowsWallpaperBackground";
import { LetterImageSwapHeadline } from "./_home/LetterImageSwapHeadline";
import { NodePerspectiveGallery } from "./_home/NodePerspectiveGallery";
import { FormattedText } from "./_home/FormattedText";
import { useHomeV2DeviceProfile } from "./_home/home-v2-device";
import { scrollHomeToSection, useHomeSectionScroll } from "./_home/useHomeSectionScroll";
import "./_home/home-v2.css";

const BILLING_CARDS = [
  {
    title: "Elige",
    description: "**Suscripción, bolsa fija o créditos.**",
  },
  {
    title: "Crea",
    description: "**Genera, edita, monta** o presenta.",
  },
  {
    title: "Controla",
    description: "**Confirma cada acción** antes de usar recursos.",
  },
] as const;

function HeroChrome() {
  const { language, setLanguage } = useLanguage();

  return (
    <div data-home-v2-hero-chrome className="relative z-[2] flex items-center justify-end gap-4">
      <div
        data-foldder-home-lang
        data-home-v2-hero-lang
        className="flex shrink-0 items-stretch divide-x divide-white/15 border border-white/15"
        data-foldder-i18n-ignore
      >
        {LANGUAGE_OPTIONS.map((option) => {
          const active = option.id === language;
          return (
            <button
              key={option.id}
              type="button"
              aria-label={option.label}
              aria-pressed={active}
              onClick={() => setLanguage(option.id)}
              className={`flex h-10 min-w-10 items-center justify-center px-3 text-[10px] font-black uppercase tracking-[0.1em] transition ${
                active
                  ? "bg-white text-zinc-950"
                  : "bg-black/40 text-white/45 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option.shortLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function scrollToId(id: string) {
  scrollHomeToSection(id);
}

export default function HomePage() {
  useHomeV2DeviceProfile();
  useHomeSectionScroll();

  return (
    <div data-foldder-home-v2 className="flex min-h-screen flex-col overflow-x-hidden">
      <section
        data-home-v2-module
        data-home-v2-module--hero
        id="hero"
        aria-labelledby="hero-heading"
        className="relative flex min-h-[100dvh] flex-col overflow-hidden py-8 sm:py-10"
      >
        <HeroPhotoColumnsBackground />
        <HeroChrome />
        <div
          data-home-v2-hero-content
          data-home-v2-section-copy
          className="relative z-[1] mr-auto flex w-full flex-1 flex-col justify-center pb-6 pt-4"
        >
          <Link href="/" data-home-v2-hero-logo data-foldder-home-link aria-label="Foldder">
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
                NO CREA
                <br />
                POR TI,
              </span>
            </span>
            <span data-home-v2-hero-line="gradient">CREA CONTIGO.</span>
          </h1>
          <FormattedText
            as="p"
            data-home-v2-hero-lead
            className="text-white/45"
            text="**FOLDDER** es el lugar donde ocurre tu **proceso creativo**: inspiración, escritura, imagen, vídeo, diseño y presentación trabajando dentro de **un mismo sistema**."
          />
          <div data-home-v2-hero-actions className="flex flex-wrap items-stretch">
            <GoogleAccessButton
              label="Empieza a crear"
              authenticatedLabel="Entrar en Foldder"
              className="flex h-10 min-w-[10rem] flex-1 items-center justify-center gap-2 bg-blue-600 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            />
            <button
              type="button"
              onClick={() => scrollToId("flows")}
              className="flex h-10 min-w-[10rem] flex-1 items-center justify-center border border-white/15 bg-black/40 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-white/10 sm:flex-none"
            >
              Ver flujos
            </button>
          </div>
        </div>
        <p data-home-v2-hero-caption aria-label="Hecho con Foldder">
          <span data-home-v2-hero-caption-text>Hecho con </span>
          <span data-home-v2-hero-caption-mark>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo_home.svg"
              alt=""
              data-home-v2-hero-caption-icon
            />
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
            Manifiesto
          </h2>
          <div data-home-v2-manifesto-lines className="space-y-2 sm:space-y-3">
            {(["Tú decides.", "Foldder conecta.", "La IA acelera."] as const).map((line) => (
              <p key={line} data-home-v2-manifesto-line data-home-v2-headline>
                {line}
              </p>
            ))}
          </div>
          <FormattedText
            as="p"
            data-home-v2-body
            className="max-w-lg text-zinc-950/48"
            text="Foldder trabaja como un **equipo creativo expandido**, pero **cada decisión** sigue estando **en tus manos**."
          />
        </div>
      </section>

      <section data-home-v2-module id="flows" aria-labelledby="flows-heading">
        <div data-home-v2-flows-stage>
          <FlowsWallpaperBackground />
          <div data-home-v2-flows-stage-content>
            <div className="flows-stage-header" data-home-v2-flows-copy data-home-v2-section-copy data-home-v2-section-inset>
              <p data-home-v2-eyebrow className="text-[10px] uppercase tracking-[0.14em] text-violet-300/90">
                Flujos
              </p>
              <h2 id="flows-heading" data-home-v2-headline data-home-v2-headline--on-dark>
                <span data-home-v2-brain-claim-line>ELIGE TU CAMINO</span>
                <br />
                <span data-home-v2-brain-claim-line>PARA UN GRAN RESULTADO.</span>
              </h2>
              <FlowsPresetButtons />
            </div>
            <FlowsCanvasDemo />
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
          <p data-home-v2-eyebrow className="text-[10px] uppercase tracking-[0.14em] text-violet-300">Nodos</p>
          <h2 id="nodes-heading" data-home-v2-headline>
            <span data-home-v2-brain-claim-line>HERRAMIENTAS</span>
            <br />
            <span data-home-v2-brain-claim-line>QUE SE CONECTAN.</span>
          </h2>
        </div>
        <div data-home-v2-nodes-gallery aria-label="Galería de nodos">
          <NodePerspectiveGallery />
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
          <div
            data-home-v2-brain-copy
            data-home-v2-section-copy
            data-home-v2-section-inset
          >
            <p data-home-v2-eyebrow className="text-[10px] uppercase tracking-[0.14em] text-violet-300/90">
              Brain
            </p>
            <h2 id="brain-heading" data-home-v2-headline data-home-v2-headline--on-dark>
              <span data-home-v2-brain-claim-line>EL ADN VIVO</span>
              <br />
              <span data-home-v2-brain-claim-line>DE TU PROYECTO.</span>
            </h2>
            <FormattedText
              as="p"
              data-home-v2-body
              className="text-white/48"
              text="Brain convierte tu **marca, referencias y reglas** en **contexto activo** para todo lo que creas."
            />
            <ul data-home-v2-brain-features>
              <li data-home-v2-brain-feature>
                <p data-home-v2-brain-feature-title>Recuerda tu marca</p>
                <FormattedText
                  as="p"
                  data-home-v2-brain-feature-desc
                  text="**Tono, claims y paleta**, referencias y reglas."
                />
              </li>
              <li data-home-v2-brain-feature>
                <p data-home-v2-brain-feature-title>Conecta el criterio</p>
                <FormattedText
                  as="p"
                  data-home-v2-brain-feature-desc
                  text="Texto, imagen, vídeo, diseño y presentación crean con el **mismo ADN**."
                />
              </li>
              <li data-home-v2-brain-feature>
                <p data-home-v2-brain-feature-title>Aprende de ti</p>
                <FormattedText
                  as="p"
                  data-home-v2-brain-feature-desc
                  text="**Acepta, corrige, descarta** y Brain entiende mejor **tu forma de crear**."
                />
              </li>
            </ul>
          </div>
          <div data-home-v2-brain-visual-col>
            <BrainSectionVisual />
          </div>
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
          <div
            data-home-v2-start-billing
            data-home-v2-billing-copy
            data-home-v2-section-copy
            data-home-v2-section-inset
          >
            <p data-home-v2-eyebrow className="text-[10px] uppercase tracking-[0.14em] text-violet-300/90">
              Saldo
            </p>
            <h2 id="billing-heading" data-home-v2-headline data-home-v2-headline--on-dark data-home-v2-headline--balance>
              <span data-home-v2-brain-claim-line>LA IA SOLO TRABAJA</span>
              <br />
              <span data-home-v2-brain-claim-line>CUANDO TÚ LO DECIDES.</span>
            </h2>
            <FormattedText
              as="p"
              data-home-v2-body
              className="max-w-2xl text-white/52"
              text="Usa Foldder con **suscripción, bolsa fija o créditos**. Cada acción de IA **se confirma antes de ejecutarse**, para que siempre tengas **control** sobre lo que creas y lo que consumes."
            />
            <ul data-home-v2-billing-features>
              {BILLING_CARDS.map((card) => (
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
            <LetterImageSwapHeadline text="Tu Foldder no será igual que el de nadie." />
          </h2>
          <FormattedText
            as="p"
            data-home-v2-body
            className="mt-5 max-w-xl text-white/48"
            text="Úsalo para **escribir, diseñar, montar y presentar**, vender, explorar, crear campañas o construir tu **propio sistema creativo**."
          />
          <div className="mt-10 w-full max-w-[380px] border border-white/12">
            <GoogleAccessButton
              label="Empieza"
              authenticatedLabel="Entrar en Foldder"
              className="flex h-12 w-full items-center justify-center gap-2 bg-blue-600 px-6 text-[11px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
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
  );
}
