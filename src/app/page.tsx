"use client";

import Image from "next/image";
import Link from "next/link";
import { GoogleAccessButton } from "@/components/GoogleAccessButton";
import { useLanguage } from "@/components/LanguageProvider";
import { LANGUAGE_OPTIONS } from "@/lib/i18n";
import { BrainColorWaveBackground } from "./_home/BrainColorWaveBackground";
import { HeroPhotoColumnsBackground } from "./_home/HeroPhotoColumnsBackground";
import { ManifestoParticleBackground } from "./_home/ManifestoParticleBackground";
import { FlowsCanvasDemo } from "./_home/FlowsCanvasDemo";
import { FlowsWallpaperBackground } from "./_home/FlowsWallpaperBackground";
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

function BrainHubVisual() {
  const spokes = [
    { label: "Guionista", className: "top-3 left-1/2 -translate-x-1/2" },
    { label: "Designer", className: "right-4 top-1/2 -translate-y-1/2" },
    { label: "Image Creation", className: "left-4 top-1/2 -translate-y-1/2" },
    { label: "Cine", className: "bottom-8 left-1/4 -translate-x-1/2" },
    { label: "Presenter", className: "bottom-8 right-1/4 translate-x-1/2" },
  ];

  return (
    <div data-home-v2-brain-hub className="grid place-items-center" aria-hidden>
      <svg data-home-v2-brain-lines className="absolute inset-0 h-full w-full" aria-hidden>
        <line x1="50%" y1="50%" x2="50%" y2="14%" />
        <line x1="50%" y1="50%" x2="86%" y2="50%" />
        <line x1="50%" y1="50%" x2="14%" y2="50%" />
        <line x1="50%" y1="50%" x2="28%" y2="82%" />
        <line x1="50%" y1="50%" x2="72%" y2="82%" />
      </svg>
      <span data-home-v2-brain-core className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em]">
        Brain
      </span>
      {spokes.map((spoke) => (
        <span key={spoke.label} data-home-v2-brain-spoke className={`absolute ${spoke.className}`}>
          {spoke.label}
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
        className="relative flex min-h-[100dvh] flex-col overflow-hidden px-5 py-8 sm:px-8 sm:py-10 lg:px-12 xl:px-16"
      >
        <HeroPhotoColumnsBackground />
        <HeroChrome />
        <div
          data-home-v2-hero-content
          className="relative z-[1] mr-auto flex w-full max-w-xl flex-1 flex-col justify-center pb-6 pt-4"
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
          <p data-home-v2-hero-lead className="max-w-md text-[11px] leading-relaxed text-white/45">
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
        className="relative flex flex-col justify-center overflow-hidden px-5 py-16 sm:px-8 lg:px-12 xl:px-16"
      >
        <ManifestoParticleBackground />
        <div className="relative z-[1] mx-auto w-full max-w-4xl">
          <h2 id="manifesto-heading" className="sr-only">
            Manifiesto
          </h2>
          <div className="space-y-2 sm:space-y-3">
            {(["Tú decides.", "Foldder conecta.", "La IA acelera."] as const).map((line) => (
              <p key={line} data-home-v2-manifesto-line data-home-v2-headline>
                {line}
              </p>
            ))}
          </div>
          <p className="mt-8 max-w-lg text-[11px] leading-relaxed text-zinc-950/48">
            Foldder trabaja como un equipo creativo expandido, pero cada decisión sigue estando en tus manos.
          </p>
        </div>
      </section>

      <section data-home-v2-module id="flows" aria-labelledby="flows-heading">
        <div data-home-v2-flows-stage>
          <FlowsWallpaperBackground />
          <div data-home-v2-flows-stage-content>
            <div className="flows-stage-header px-5 pt-10 sm:px-8 lg:px-12 xl:px-16">
              <h2 id="flows-heading" data-home-v2-headline data-home-v2-headline--on-dark className="mx-auto max-w-6xl">
                Flujos
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-[11px] leading-relaxed text-white/70">
                Conecta un nodo Prompt a Nano Banana: el texto viaja por el conector y la imagen se genera en el nodo de
                destino.
              </p>
            </div>
            <FlowsCanvasDemo />
          </div>
        </div>
        <div className="px-5 pb-8 pt-2 sm:px-8 lg:px-12 xl:px-16">
          <h3 data-home-v2-headline className="mx-auto max-w-6xl text-[clamp(1.1rem,2.5vw,1.75rem)]">
            Flujos reales
          </h3>
        </div>
        <div className="px-5 pb-8 pt-4 sm:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-zinc-950/10 border border-zinc-950/10 sm:grid-cols-2 sm:divide-x lg:grid-cols-3">
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
        className="relative overflow-hidden"
      >
        <BrainColorWaveBackground />
        <div className="relative z-[1] mx-auto grid max-w-6xl gap-0 lg:grid-cols-[minmax(280px,1fr)_minmax(300px,1.1fr)] lg:divide-x lg:divide-white/10">
          <div className="border-b border-white/10 px-5 py-10 sm:px-8 lg:border-b-0 lg:px-10 lg:py-14">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-300">Brain</p>
            <h2 id="brain-heading" data-home-v2-headline data-home-v2-headline--on-dark className="mt-3">
              El cerebro de tu proyecto.
            </h2>
            <p className="mt-4 max-w-md text-[11px] leading-relaxed text-white/45">
              Sube tu marca, referencias, documentos y reglas. Brain convierte ese conocimiento en contexto activo para
              todos tus nodos.
            </p>
          </div>
          <div className="px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
            <BrainHubVisual />
          </div>
        </div>
      </section>

      <section data-home-v2-module id="nodes" aria-labelledby="nodes-heading">
        <div className="mx-auto max-w-6xl">
          <div className="px-5 pt-10 pb-1 sm:px-8 lg:px-10 lg:pt-14 lg:pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-300">Nodos</p>
            <h2 id="nodes-heading" data-home-v2-headline className="mt-3">
              Parte del proceso.
            </h2>
            <p className="mt-4 max-w-md text-[11px] leading-relaxed text-zinc-950/48">
              Sube tu marca, referencias, documentos y reglas. Brain convierte ese conocimiento en contexto activo para
              todos tus nodos.
            </p>
          </div>
          <div className="-mt-3 px-5 pb-12 sm:px-8 sm:-mt-4 lg:px-10 lg:-mt-5 lg:pb-14">
            <NodePerspectiveGallery />
          </div>
        </div>
      </section>

      <section data-home-v2-module id="billing" aria-labelledby="billing-heading">
        <div className="px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-6xl">
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
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-950/35">
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

      <section data-home-v2-module id="start" aria-labelledby="start-heading">
        <div className="flex flex-col items-center px-5 py-16 text-center sm:px-8 lg:px-12 xl:px-16">
          <h2 id="start-heading" data-home-v2-headline data-home-v2-headline--balance className="max-w-4xl">
            Tu Foldder no será igual que el de nadie.
          </h2>
          <p className="mt-5 max-w-xl text-[11px] leading-relaxed text-zinc-950/48">
            Úsalo para escribir, diseñar, montar, presentar, vender, explorar, crear campañas o construir tu propio
            sistema creativo.
          </p>
          <div className="mt-10 w-full max-w-[380px] border border-zinc-950/10">
            <GoogleAccessButton
              label="Empieza"
              authenticatedLabel="Entrar en Foldder"
              className="flex h-12 w-full items-center justify-center gap-2 bg-blue-600 px-6 text-[11px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>
      </section>

      <footer className="flex h-10 shrink-0 items-center justify-center border-t border-zinc-950/10 bg-zinc-950 px-4">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/72">Foldder 2026</p>
      </footer>
    </div>
  );
}
