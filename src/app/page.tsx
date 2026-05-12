"use client";

import Image from "next/image";
import Link from "next/link";
import { GoogleAccessButton } from "@/components/GoogleAccessButton";
import { useLanguage } from "@/components/LanguageProvider";
import type { AppLanguage } from "@/lib/i18n";
import type { ReactNode } from "react";
import {
  Brain,
  CheckCircle2,
  FileText,
  Film,
  FolderKanban,
  Heart,
  Lock,
  Megaphone,
  PenTool,
  Presentation,
  Sparkles,
  Workflow,
} from "lucide-react";

type Capability = {
  icon: ReactNode;
  title: string;
  text: string;
  tone: string;
};

const HOME_COPY: Record<AppLanguage, {
  headlineBeforeGradient: string;
  headlineGradientOne: string;
  headlineAfterGradient: string;
  headlineGradientTwo: string;
  googleLabel: string;
  googleAuthenticatedLabel: string;
  secureLine: string;
  capabilities: string[];
  sectionEyebrow: string;
  sectionTitle: string;
  sectionText: string;
  featureRows: Array<{ title: string; text: string }>;
  cards: Array<{ title: string; text: string }>;
}> = {
  es: {
    headlineBeforeGradient: "Un",
    headlineGradientOne: "workspace",
    headlineAfterGradient: "para producción",
    headlineGradientTwo: "creativa completa.",
    googleLabel: "Continuar con Google",
    googleAuthenticatedLabel: "Elegir cuenta de Google",
    secureLine: "Acceso seguro con Google. Sin pasos extra.",
    capabilities: ["Diseña", "Genera", "Presenta", "Organiza"],
    sectionEyebrow: "Qué puedes crear",
    sectionTitle: "Sistemas creativos completos, no outputs aislados.",
    sectionText:
      "Foldder conecta guion, diseño, vídeo, edición, assets y memoria de marca para convertir cualquier idea en una pieza final.",
    featureRows: [
      {
        title: "Memoria creativa",
        text: "Reutiliza ideas, assets y conocimiento en todos tus proyectos.",
      },
      {
        title: "Flujo visual",
        text: "Todo se conecta en un flujo visual de principio a fin.",
      },
      {
        title: "Entrega final",
        text: "Entrega piezas pulidas, coherentes y listas para marca.",
      },
    ],
    cards: [
      {
        title: "Películas y vídeo",
        text: "Guiones, escenas, storyboards, planos generados, edición, audio y subtítulos.",
      },
      {
        title: "Anuncios y campañas",
        text: "Conceptos, claims, rutas visuales y entregables adaptados a cada canal.",
      },
      {
        title: "Diseño gráfico",
        text: "Layouts, carteles, assets de marca y composiciones visuales editables.",
      },
      {
        title: "Redes sociales",
        text: "Posts, carruseles, vídeos cortos, captions y adaptaciones de contenido.",
      },
      {
        title: "Guiones y contenido",
        text: "Artículos, guiones, tono editorial, reescrituras y sistemas de contenido.",
      },
      {
        title: "Presentaciones",
        text: "Slides, decks, PDFs, historias visuales y materiales listos para cliente.",
      },
    ],
  },
  en: {
    headlineBeforeGradient: "One",
    headlineGradientOne: "workspace",
    headlineAfterGradient: "for complete",
    headlineGradientTwo: "creative production.",
    googleLabel: "Continue with Google",
    googleAuthenticatedLabel: "Choose Google account",
    secureLine: "Secure sign-in with Google. No extra steps.",
    capabilities: ["Design", "Generate", "Present", "Organize"],
    sectionEyebrow: "What you can create",
    sectionTitle: "Complete creative systems, not isolated outputs.",
    sectionText:
      "Foldder connects script, design, video, editing, assets and brand memory so any idea can become a finished piece.",
    featureRows: [
      {
        title: "Creative Memory",
        text: "Reuse ideas, assets and knowledge across every project.",
      },
      {
        title: "Visual Workflow",
        text: "Everything connects in a visual flow from start to finish.",
      },
      {
        title: "Final Delivery",
        text: "Deliver polished, consistent and on-brand everywhere.",
      },
    ],
    cards: [
      {
        title: "Films & Video",
        text: "Scripts, scenes, storyboards, generated shots, editing, audio and subtitles.",
      },
      {
        title: "Ads & Campaigns",
        text: "Concepts, claims, visual routes and deliverables adapted to every channel.",
      },
      {
        title: "Graphic Design",
        text: "Layouts, posters, brand assets and editable visual compositions.",
      },
      {
        title: "Social Media",
        text: "Posts, carousels, short videos, captions and content adaptations.",
      },
      {
        title: "Scripts & Content",
        text: "Articles, scripts, editorial tone, rewrites and structured content systems.",
      },
      {
        title: "Presentations",
        text: "Slides, decks, PDFs, visual stories and polished client-ready materials.",
      },
    ],
  },
};

const capabilityIcons = [
  <PenTool key="design" size={17} />,
  <Sparkles key="generate" size={17} />,
  <Presentation key="present" size={17} />,
  <FolderKanban key="organize" size={17} />,
];

const cardIcons: Array<Pick<Capability, "icon" | "tone">> = [
  { icon: <Film size={18} />, tone: "bg-violet-100 text-violet-600" },
  { icon: <Megaphone size={18} />, tone: "bg-orange-100 text-orange-500" },
  { icon: <PenTool size={18} />, tone: "bg-emerald-100 text-emerald-600" },
  { icon: <Heart size={18} />, tone: "bg-pink-100 text-pink-500" },
  { icon: <FileText size={18} />, tone: "bg-sky-100 text-sky-600" },
  { icon: <Presentation size={18} />, tone: "bg-violet-100 text-violet-600" },
];

function AccessPanel({ copy }: { copy: (typeof HOME_COPY)[AppLanguage] }) {
  return (
    <div className="w-full max-w-[360px] rounded-[15px] border-0 bg-white/88 p-3 shadow-[0_18px_50px_rgba(69,49,110,0.12)] backdrop-blur-xl">
      <GoogleAccessButton
        label={copy.googleLabel}
        authenticatedLabel={copy.googleAuthenticatedLabel}
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-[15px] border border-zinc-200/80 bg-white px-4 py-3 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70"
      />
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] leading-5 text-zinc-500">
        <Lock size={12} className="text-violet-500" />
        {copy.secureLine}
      </p>
    </div>
  );
}

function CapabilityCard({ item }: { item: Capability }) {
  return (
    <article className="flex min-h-[104px] gap-3 rounded-[15px] border border-zinc-200 bg-white p-3 sm:min-h-[112px] sm:p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] sm:h-10 sm:w-10 ${item.tone}`}>
        {item.icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold leading-snug text-zinc-950 sm:text-sm">{item.title}</h3>
        <p className="mt-1.5 text-[11px] leading-5 text-zinc-500 sm:text-xs">{item.text}</p>
      </div>
    </article>
  );
}

function FeatureRow({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="flex gap-3 rounded-[15px] border border-zinc-200 bg-white p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-violet-100 text-violet-600">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold leading-snug text-zinc-950 sm:text-sm">{title}</h3>
        <p className="mt-1 text-[11px] leading-5 text-zinc-500 sm:text-xs">{text}</p>
      </div>
    </article>
  );
}

export default function Home() {
  const { language } = useLanguage();
  const copy = HOME_COPY[language];
  const capabilities = copy.cards.map((card, index) => ({
    ...card,
    ...cardIcons[index],
  }));

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-zinc-950">
      <section className="relative min-h-[620px] px-6 py-6 sm:min-h-[660px] sm:px-12 lg:min-h-[76vh] lg:px-20 lg:py-7 xl:px-28">
        <Image
          src="/home-hero-1920.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[58%_center]"
        />
        <div className="relative z-10 mx-auto flex min-h-[calc(620px-3rem)] w-full max-w-7xl flex-col sm:min-h-[calc(660px-3rem)] lg:min-h-[calc(76vh-3.5rem)]">
          <header className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex translate-y-[58px] items-center sm:translate-y-[78px] lg:translate-y-[100px]"
              aria-label="Foldder home"
            >
              <Image
                src="/logo_big.svg"
                alt="Foldder"
                width={168}
                height={58}
                className="h-auto w-[136px] sm:w-[153px] lg:w-[165px]"
                priority
              />
            </Link>
          </header>

          <div className="flex flex-1 items-center pb-8 pt-16 sm:pt-20 lg:pb-12 lg:pt-36">
            <div className="flex w-full max-w-[560px] flex-col items-start">
              <h1 className="max-w-[520px] text-[clamp(2.55rem,4.45vw,4.45rem)] font-black leading-[0.88] text-zinc-950">
                {copy.headlineBeforeGradient}{" "}
                <span className="bg-gradient-to-r from-violet-700 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent">
                  {copy.headlineGradientOne}
                </span>{" "}
                {copy.headlineAfterGradient}
                <br />
                <span className="bg-gradient-to-r from-zinc-950 via-violet-700 to-fuchsia-500 bg-clip-text text-transparent">
                  {copy.headlineGradientTwo}
                </span>
              </h1>

              <div className="mt-7">
                <AccessPanel copy={copy} />
              </div>
              <div className="mt-6 grid w-full max-w-[430px] grid-cols-4 gap-3 text-center text-[11px] font-medium text-zinc-600">
                {copy.capabilities.map((label, index) => (
                  <div key={label} className="flex flex-col items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[13px] bg-white/74 text-violet-600 shadow-[0_8px_22px_rgba(69,49,110,0.06)]">
                      {capabilityIcons[index]}
                    </span>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto w-full max-w-7xl bg-white px-6 pb-12 pt-8 sm:px-10 md:px-12 lg:px-20 lg:pt-10 xl:px-28">
        <section id="posibilidades">
          <div className="grid gap-8 md:grid-cols-[minmax(230px,0.4fr)_minmax(0,0.6fr)] md:items-start lg:gap-10">
            <div className="flex flex-col md:pr-2 lg:pr-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-600">
                {copy.sectionEyebrow}
              </p>
              <h2 className="mt-3 max-w-[430px] text-[1.65rem] font-semibold leading-[1.08] text-zinc-950 sm:text-3xl md:text-[1.75rem] lg:text-3xl">
                {copy.sectionTitle}
              </h2>
              <p className="mt-4 max-w-[430px] text-sm leading-6 text-zinc-500">
                {copy.sectionText}
              </p>
              <div className="mt-5 grid gap-4">
                <FeatureRow
                  icon={<Brain size={17} />}
                  title={copy.featureRows[0].title}
                  text={copy.featureRows[0].text}
                />
                <FeatureRow
                  icon={<Workflow size={17} />}
                  title={copy.featureRows[1].title}
                  text={copy.featureRows[1].text}
                />
                <FeatureRow
                  icon={<CheckCircle2 size={17} />}
                  title={copy.featureRows[2].title}
                  text={copy.featureRows[2].text}
                />
              </div>
            </div>
            <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 md:gap-4 lg:gap-x-8 lg:gap-y-7">
              {capabilities.map((item) => (
                <CapabilityCard key={item.title} item={item} />
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="flex min-h-10 items-center justify-center bg-black px-6 py-3 text-[11px] font-medium tracking-wide text-white/75">
        Foldder 2026
      </footer>
    </div>
  );
}
