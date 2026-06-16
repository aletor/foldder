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
import { FlowsWallpaperBackground } from "./_home/FlowsWallpaperBackground";
import { LetterImageSwapHeadline } from "./_home/LetterImageSwapHeadline";
import { NodePerspectiveGallery } from "./_home/NodePerspectiveGallery";
import "./_home/home-v2.css";

const REAL_FLOWS = [
  {
    title: "Cartel para redes",
    nodes: ["Inspiration", "Brain", "Image Creation", "Designer"],
  },
  {
    title: "Vídeo para web",
    nodes: ["Brain", "Cine", "Video Editor", "Export"],
  },
  {
    title: "Artículo + publicación",
    nodes: ["Notes", "Brain", "Guionista", "Enhancer", "Export"],
  },
  {
    title: "Branding completo",
    nodes: ["Inspiration", "Brain", "Designer", "Image Creation", "Presenter"],
  },
  {
    title: "Presentación interactiva",
    nodes: ["Brain", "Designer", "Presenter", "Export"],
  },
  {
    title: "Producto ecommerce",
    nodes: ["Inspiration", "Brain", "Image Creation", "PhotoRoom", "Export"],
  },
] as const;

const BILLING_STEPS = ["Recarga", "Genera", "Controla"] as const;

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

function PillFlow({ nodes }: { nodes: readonly string[] }) {
  return (
    <div data-foldder-home-pills>
      {nodes.map((node, index) => (
        <span key={`${node}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? <span data-foldder-home-pill-arrow aria-hidden>→</span> : null}
          <span data-foldder-home-pill>{node}</span>
        </span>
      ))}
    </div>
  );
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function HomePage() {
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
              src="/logo_home.svg"
              alt=""
              width={80}
              height={38}
              className="h-auto w-full max-w-none shrink-0 object-contain"
              priority
            />
          </Link>
          <h1 id="hero-heading" data-home-v2-headline data-home-v2-headline--on-dark data-home-v2-headline--balance>
            <span data-home-v2-hero-line="struck">
              una app que
              <br />
              crea por ti.
            </span>
            <span data-home-v2-hero-primary>
              <span data-home-v2-hero-emphasis>
                el estudio
                <br />
                creativo
              </span>
            </span>
            <span data-home-v2-hero-line="gradient">que crea ...contigo</span>
          </h1>
          <p data-home-v2-hero-lead className="max-w-md text-white/45">
            Tú diriges cada decisión. Foldder conecta textos, imágenes, vídeos, marcas y presentaciones para convertir
            una idea en piezas completas con inteligencia artificial.
          </p>
          <div data-home-v2-hero-actions className="flex flex-wrap items-stretch gap-0 border border-white/15">
            <GoogleAccessButton
              label="Empieza a crear"
              authenticatedLabel="Entrar en Foldder"
              className="flex h-10 min-w-[10rem] flex-1 items-center justify-center gap-2 bg-blue-600 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            />
            <button
              type="button"
              onClick={() => scrollToId("flows")}
              className="flex h-10 min-w-[10rem] flex-1 items-center justify-center border-l border-white/15 bg-black/40 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-white/10 sm:flex-none"
            >
              Ver flujos
            </button>
          </div>
        </div>
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
          <p data-home-v2-body className="max-w-lg text-zinc-950/48">
            Foldder trabaja como un equipo creativo expandido, pero cada decisión sigue estando en tus manos.
          </p>
        </div>
      </section>

      <section data-home-v2-module id="flows" aria-labelledby="flows-heading">
        <div data-home-v2-flows-stage>
          <FlowsWallpaperBackground />
          <div data-home-v2-flows-stage-content>
            <div className="flows-stage-header pt-10" data-home-v2-section-inset>
              <div data-home-v2-section-copy>
                <h2 id="flows-heading" data-home-v2-headline data-home-v2-headline--on-dark>
                  Flujos
                </h2>
                <p data-home-v2-body className="max-w-2xl text-white/70">
                Conecta un nodo Prompt a Nano Banana: el texto viaja por el conector y la imagen se genera en el nodo de
                destino.
                </p>
              </div>
            </div>
            <FlowsCanvasDemo />
          </div>
        </div>
        <div className="pb-8 pt-2" data-home-v2-section-inset>
          <h3 data-home-v2-headline className="max-w-[42rem] text-[clamp(1.1rem,2.5vw,1.75rem)]">
            Flujos reales
          </h3>
        </div>
        <div className="pb-8 pt-4" data-home-v2-section-inset>
          <div className="grid max-w-6xl grid-cols-1 divide-y divide-zinc-950/10 border border-zinc-950/10 sm:grid-cols-2 sm:divide-x lg:grid-cols-3">
            {REAL_FLOWS.map((flow) => (
              <article
                key={flow.title}
                data-foldder-home-cell
                className="flex min-h-[200px] flex-col justify-between gap-6 bg-white p-4 sm:min-h-[240px]"
              >
                <h3 data-home-v2-headline>{flow.title}</h3>
                <PillFlow nodes={flow.nodes} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        data-home-v2-module
        data-home-v2-module--brain
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
            <p data-home-v2-body className="text-white/48">
              Brain convierte tu marca, referencias y reglas en contexto activo para todo lo que creas.
            </p>
            <ul data-home-v2-brain-features>
              <li data-home-v2-brain-feature>
                <p data-home-v2-brain-feature-title>Recuerda tu marca</p>
                <p data-home-v2-brain-feature-desc>Tono, claims, paleta, referencias y reglas.</p>
              </li>
              <li data-home-v2-brain-feature>
                <p data-home-v2-brain-feature-title>Conecta el criterio</p>
                <p data-home-v2-brain-feature-desc>
                  Texto, imagen, vídeo, diseño y presentación crean con el mismo ADN.
                </p>
              </li>
              <li data-home-v2-brain-feature>
                <p data-home-v2-brain-feature-title>Aprende de ti</p>
                <p data-home-v2-brain-feature-desc>
                  Acepta, corrige, descarta y Brain entiende mejor tu forma de crear.
                </p>
              </li>
            </ul>
          </div>
          <div data-home-v2-brain-visual-col>
            <BrainSectionVisual />
          </div>
        </div>
      </section>

      <section data-home-v2-module id="nodes" aria-labelledby="nodes-heading">
        <div data-home-v2-section-copy data-home-v2-section-inset className="pt-10 pb-1 lg:pt-14 lg:pb-2">
          <p data-home-v2-eyebrow className="text-[10px] uppercase tracking-[0.14em] text-violet-300">Nodos</p>
          <h2 id="nodes-heading" data-home-v2-headline>
            Parte del proceso.
          </h2>
          <p data-home-v2-body className="max-w-md text-zinc-950/48">
            Sube tu marca, referencias, documentos y reglas. Brain convierte ese conocimiento en contexto activo para
            todos tus nodos.
          </p>
        </div>
        <div className="-mt-2 px-0 pb-10 sm:mt-0 sm:pb-12 lg:pb-14">
          <NodePerspectiveGallery />
        </div>
      </section>

      <section data-home-v2-module id="billing" aria-labelledby="billing-heading">
        <div className="py-10" data-home-v2-section-inset>
          <div data-home-v2-section-copy>
            <h2 id="billing-heading" data-home-v2-headline data-home-v2-headline--balance>
              Saldo prepago. Coste visible. Control total.
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-0 border border-zinc-950/10 sm:grid-cols-3">
              {BILLING_STEPS.map((step, index) => (
                <div
                  key={step}
                  data-home-v2-billing-step
                  className={`flex flex-col border-b border-zinc-950/10 bg-white p-5 sm:border-b-0 ${
                    index < BILLING_STEPS.length - 1 ? "sm:border-r sm:border-zinc-950/10" : ""
                  }`}
                >
                  <span data-home-v2-eyebrow className="text-[9px] uppercase tracking-[0.12em] text-zinc-950/35">
                    0{index + 1}
                  </span>
                  <span data-home-v2-headline className="mt-2">
                    {step}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => scrollToId("start")}
              className="mt-6 flex h-10 items-center border border-zinc-950/10 bg-zinc-950/[0.03] px-4 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-950 transition hover:bg-zinc-950/[0.06]"
            >
              Ver precios
            </button>
          </div>
        </div>
      </section>

      <section
        data-home-v2-module
        data-home-v2-module--start
        id="start"
        aria-labelledby="start-heading"
        className="relative overflow-hidden"
      >
        <ColorWaveBackground />
        <div className="relative z-[1] flex flex-col items-center px-5 py-16 text-center sm:px-8 lg:px-12 xl:px-16">
          <h2
            id="start-heading"
            data-home-v2-headline
            data-home-v2-headline--on-dark
            data-home-v2-headline--balance
            className="max-w-4xl"
          >
            <LetterImageSwapHeadline text="Tu Foldder no será igual que el de nadie." />
          </h2>
          <p data-home-v2-body className="mt-5 max-w-xl text-white/48">
            Úsalo para escribir, diseñar, montar, presentar, vender, explorar, crear campañas o construir tu propio
            sistema creativo.
          </p>
          <div className="mt-10 w-full max-w-[380px] border border-white/12">
            <GoogleAccessButton
              label="Empieza"
              authenticatedLabel="Entrar en Foldder"
              className="flex h-12 w-full items-center justify-center gap-2 bg-blue-600 px-6 text-[11px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
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
