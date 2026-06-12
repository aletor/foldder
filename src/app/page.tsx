"use client";

import Image from "next/image";
import Link from "next/link";
import { GoogleAccessButton } from "@/components/GoogleAccessButton";
import { useLanguage } from "@/components/LanguageProvider";
import { LANGUAGE_OPTIONS } from "@/lib/i18n";
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
import "./home.css";

type Capability = {
  icon: ReactNode;
  title: string;
  text: string;
  tone: string;
};

const HOME_COPY: Record<
  AppLanguage,
  {
    headlineBeforeAccent: string;
    headlineAccent: string;
    headlineAfterAccent: string;
    googleLabel: string;
    googleAuthenticatedLabel: string;
    secureLine: string;
    capabilities: string[];
    sectionEyebrow: string;
    sectionTitle: string;
    sectionText: string;
    featureRows: Array<{ title: string; text: string }>;
    cards: Array<{ title: string; text: string }>;
  }
> = {
  es: {
    headlineBeforeAccent: "Un",
    headlineAccent: "workspace",
    headlineAfterAccent: "para producción creativa completa.",
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
    headlineBeforeAccent: "One",
    headlineAccent: "workspace",
    headlineAfterAccent: "for complete creative production.",
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
  <PenTool key="design" size={15} strokeWidth={2.25} />,
  <Sparkles key="generate" size={15} strokeWidth={2.25} />,
  <Presentation key="present" size={15} strokeWidth={2.25} />,
  <FolderKanban key="organize" size={15} strokeWidth={2.25} />,
];

const cardIcons: Array<Pick<Capability, "icon" | "tone">> = [
  { icon: <Film size={16} strokeWidth={2.25} />, tone: "bg-violet-600 text-white" },
  { icon: <Megaphone size={16} strokeWidth={2.25} />, tone: "bg-orange-500 text-white" },
  { icon: <PenTool size={16} strokeWidth={2.25} />, tone: "bg-emerald-600 text-white" },
  { icon: <Heart size={16} strokeWidth={2.25} />, tone: "bg-pink-500 text-white" },
  { icon: <FileText size={16} strokeWidth={2.25} />, tone: "bg-sky-600 text-white" },
  { icon: <Presentation size={16} strokeWidth={2.25} />, tone: "bg-indigo-600 text-white" },
];

const featureIcons = [
  <Brain key="brain" size={15} strokeWidth={2.25} />,
  <Workflow key="workflow" size={15} strokeWidth={2.25} />,
  <CheckCircle2 key="check" size={15} strokeWidth={2.25} />,
];

function HomeTopBar() {
  const { language, setLanguage } = useLanguage();

  return (
    <header data-foldder-home-topbar className="flex shrink-0 items-stretch">
      <Link
        href="/"
        data-foldder-home-link
        className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-zinc-950/10 bg-zinc-950/[0.03]"
        aria-label="Foldder home"
      >
        <Image src="/logo_big.svg" alt="" width={28} height={28} className="h-7 w-7 object-contain" priority />
      </Link>

      <div className="flex min-w-0 flex-1 items-center border-r border-zinc-950/10 px-3">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-zinc-950/85">Foldder</p>
        <p className="ml-2 hidden truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-950/40 sm:inline">
          Creative production workspace
        </p>
      </div>

      <div data-foldder-home-lang className="flex shrink-0 items-stretch divide-x divide-zinc-950/10" data-foldder-i18n-ignore>
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
                active ? "bg-zinc-950 text-white" : "bg-white text-zinc-950/45 hover:bg-zinc-950/[0.04] hover:text-zinc-950"
              }`}
            >
              {option.shortLabel}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function AccessPanel({ copy }: { copy: (typeof HOME_COPY)[AppLanguage] }) {
  return (
    <div data-foldder-home-panel className="w-full max-w-[380px]">
      <GoogleAccessButton
        label={copy.googleLabel}
        authenticatedLabel={copy.googleAuthenticatedLabel}
        className="flex h-10 w-full items-center justify-center gap-2 bg-blue-600 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div
        data-foldder-home-row
        className="flex items-center justify-center gap-1.5 bg-zinc-950/[0.03] px-3 text-[9px] font-semibold text-zinc-950/48"
      >
        <Lock size={11} className="shrink-0 text-violet-600" aria-hidden />
        {copy.secureLine}
      </div>
    </div>
  );
}

function CapabilityCell({ item }: { item: Capability }) {
  return (
    <article
      data-foldder-home-cell
      className="flex min-h-[108px] gap-0 border-b border-r border-zinc-950/10 bg-white transition hover:bg-zinc-950/[0.02] sm:min-h-[116px]"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center ${item.tone}`}>{item.icon}</div>
      <div className="min-w-0 flex-1 border-l border-zinc-950/10 p-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.08em] text-zinc-950">{item.title}</h3>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-950/48">{item.text}</p>
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
    <article data-foldder-home-row className="flex items-stretch bg-white">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-violet-600 text-white">{icon}</div>
      <div className="min-w-0 flex-1 border-l border-zinc-950/10 px-3 py-2.5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.08em] text-zinc-950">{title}</h3>
        <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-950/48">{text}</p>
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
    <div data-foldder-home className="flex min-h-screen flex-col overflow-x-hidden">
      <HomeTopBar />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[240px] flex-1 shrink-0 border-b border-zinc-950/10 sm:min-h-[280px] lg:min-h-0 lg:w-[min(44vw,560px)] lg:border-b-0 lg:border-r">
          <Image
            src="/home-hero-1920.png"
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 44vw"
            className="object-cover object-[58%_center]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-white/5 to-white/70 lg:from-white/10 lg:to-white/55" />
        </div>

        <section className="flex min-w-0 flex-1 flex-col justify-center px-5 py-8 sm:px-8 lg:px-10 lg:py-10 xl:px-14">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Foldder</p>
          <h1 className="mt-3 max-w-[540px] text-[clamp(2rem,4vw,3.35rem)] font-black uppercase leading-[0.92] tracking-[-0.03em] text-zinc-950">
            {copy.headlineBeforeAccent}{" "}
            <span className="text-blue-600">{copy.headlineAccent}</span> {copy.headlineAfterAccent}
          </h1>

          <div className="mt-7">
            <AccessPanel copy={copy} />
          </div>

          <div
            data-foldder-home-panel
            className="mt-5 grid w-full max-w-[380px] grid-cols-4 divide-x divide-zinc-950/10"
          >
            {copy.capabilities.map((label, index) => (
              <div key={label} className="flex flex-col items-center bg-zinc-950/[0.02] px-1 py-3 text-center">
                <span className="flex h-10 w-10 items-center justify-center bg-white text-violet-600">{capabilityIcons[index]}</span>
                <span className="mt-2 text-[8px] font-black uppercase tracking-[0.08em] text-zinc-950/55">{label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <main className="border-t border-zinc-950/10 bg-white">
        <div className="flex h-10 items-center border-b border-zinc-950/10 bg-zinc-950/[0.03] px-5 sm:px-8 lg:px-10 xl:px-14">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-950/70">{copy.sectionEyebrow}</p>
        </div>

        <div className="mx-auto grid max-w-7xl gap-0 lg:grid-cols-[minmax(280px,360px)_1fr] lg:divide-x lg:divide-zinc-950/10">
          <div className="border-b border-zinc-950/10 px-5 py-6 sm:px-8 lg:border-b-0 lg:px-10 lg:py-8 xl:px-14">
            <h2 className="max-w-[340px] text-xl font-black uppercase leading-tight tracking-[-0.02em] text-zinc-950 sm:text-2xl">
              {copy.sectionTitle}
            </h2>
            <p className="mt-4 max-w-[340px] text-[11px] leading-relaxed text-zinc-950/48">{copy.sectionText}</p>

            <div data-foldder-home-panel className="mt-5 overflow-hidden">
              {copy.featureRows.map((row, index) => (
                <FeatureRow key={row.title} icon={featureIcons[index]} title={row.title} text={row.text} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((item) => (
              <CapabilityCell key={item.title} item={item} />
            ))}
          </div>
        </div>
      </main>

      <footer className="flex h-10 shrink-0 items-center justify-center border-t border-zinc-950/10 bg-zinc-950 px-4">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/72">Foldder 2026</p>
      </footer>
    </div>
  );
}
