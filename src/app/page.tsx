import Image from "next/image";
import Link from "next/link";
import {
  Flame,
  Workflow,
  SlidersHorizontal,
  Users,
  ShieldX,
  Flag,
  Sparkles,
} from "lucide-react";

type Item = {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  text?: string;
  points?: string[];
};

const sections: Item[] = [
  {
    icon: <Flame size={14} />,
    kicker: "Mensaje clave",
    title: "La IA ya no es impredecible.",
    text: "Hasta ahora, la IA generaba resultados visualmente atractivos, pero difíciles de controlar. Foldder cambia eso: puedes definir exactamente qué cambia, dónde y cómo, manteniendo coherencia en toda la pieza.",
    points: ["De resultados bonitos… a decisiones precisas."],
  },
  {
    icon: <Workflow size={14} />,
    kicker: "Propuesta de valor",
    title: "Un sistema continuo de trabajo",
    text: "Foldder no sustituye tu proceso. Lo organiza. Todo ocurre dentro del mismo entorno: ideación, generación, edición, iteración, maquetación y entrega.",
    points: [
      "Sin saltos entre herramientas",
      "Sin pérdida de contexto",
      "Sin reconstrucciones manuales",
      "Con control en cada fase",
    ],
  },
  {
    icon: <SlidersHorizontal size={14} />,
    kicker: "Diferencial real",
    title: "Control que antes no existía",
    text: "Puedes intervenir una imagen o pieza en múltiples zonas, aplicar cambios distintos y resolver todo en una única generación coherente.",
    points: [
      "Edición multi-zona",
      "Cambios simultáneos",
      "Iteraciones consistentes",
      "Resultado final usable",
    ],
  },
  {
    icon: <Users size={14} />,
    kicker: "Quién lo entiende",
    title: "Para quienes ya saben cómo se trabaja esto",
    points: [
      "Directores creativos",
      "Diseñadores senior",
      "Filmmakers",
      "Equipos que entregan a cliente",
    ],
  },
  {
    icon: <ShieldX size={14} />,
    kicker: "Posicionamiento",
    title: "Esto no es para experimentar. Es para trabajar.",
    points: [
      "No es generación automática",
      "No es un playground de IA",
      'No es para probar "a ver qué sale"',
    ],
  },
  {
    icon: <Flag size={14} />,
    kicker: "Cierre",
    title: "No cambia lo que haces. Cambia cómo lo controlas.",
    text: "Foldder no redefine la creatividad. La devuelve a un entorno donde todo está conectado y bajo tu control.",
  },
];

const alternatives = [
  "La IA ya no decide por ti.",
  "Control total. Sin perder tiempo.",
  "Todo en un sitio. Y ahora, bajo control.",
  "Menos sorpresa. Más decisión.",
  "De generar… a dirigir.",
];

function SectionCard({ item }: { item: Item }) {
  return (
    <article className="rounded-2xl border border-white/12 bg-white/[0.02] p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-white/58 uppercase">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[#8f66ff]/35 bg-[#8f66ff]/10 text-[#a882ff] shadow-[0_0_18px_rgba(143,102,255,.22)]">
          {item.icon}
        </span>
        {item.kicker}
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
        {item.title}
      </h2>
      {item.text ? (
        <p className="mt-3 text-sm leading-relaxed text-white/74">{item.text}</p>
      ) : null}
      {item.points ? (
        <ul className="mt-4 space-y-2 text-sm text-white/80">
          {item.points.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8f66ff]/85" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#03060b] text-white">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_24%,rgba(11,80,91,.26),transparent_38%),radial-gradient(circle_at_50%_18%,rgba(108,92,231,.2),transparent_36%),linear-gradient(180deg,#03060b_0%,#03070f_72%,#03060b_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[16%] -z-10 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full border border-cyan-400/10 bg-cyan-300/[0.03] blur-3xl" />

      <main className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-16 pt-12 sm:px-8 sm:pt-20">
        <section className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
          <Image
            src="/logo-folder.png"
            alt="Foldder"
            width={118}
            height={118}
            className="h-auto w-[88px] sm:w-[108px]"
            priority
          />
          <h1 className="mt-5 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            FOLDDER
          </h1>
          <p className="mt-3 text-[12px] font-semibold tracking-[0.34em] text-[#9371f2] uppercase">
            Studio Access
          </p>

          <div className="mt-10 w-full max-w-xl rounded-[28px] border border-cyan-400/55 bg-[linear-gradient(90deg,rgba(255,255,255,.06),rgba(143,102,255,.07))] px-7 py-6 shadow-[0_0_40px_rgba(34,211,238,.12)] backdrop-blur-xl">
            <div className="flex items-center justify-center gap-10">
              <span className="h-3 w-3 rounded-full bg-white/18" />
              <span className="h-3 w-3 rounded-full bg-white/18" />
              <span className="h-12 w-px bg-white/75" />
              <span className="h-3 w-3 rounded-full bg-white/18" />
              <span className="h-3 w-3 rounded-full bg-white/18" />
            </div>
          </div>
          <p className="mt-6 text-[11px] tracking-[0.24em] text-white/40 uppercase">
            Enter security key to initialize studio
          </p>

          <p className="mt-10 max-w-2xl text-3xl leading-tight font-medium tracking-tight sm:text-4xl">
            Por fin, todo en un solo sitio.
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/72 sm:text-base">
            Foldder reúne todo tu proceso creativo —de la idea a la entrega—
            sin cambiar de herramienta, sin perder contexto y sin improvisar
            resultados.
          </p>
          <p className="mt-3 text-xs tracking-[0.14em] text-white/54 uppercase">
            La IA está integrada. Pero aquí decides tú.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a
              href="#contenido"
              className="rounded-xl border border-white/20 bg-white/[0.05] px-4 py-2.5 text-xs font-semibold tracking-[0.1em] text-white/90 uppercase transition hover:border-white/35 hover:bg-white/[0.08]"
            >
              Ver cómo funciona
            </a>
            <Link
              href="/spaces"
              className="rounded-xl border border-[#8f66ff]/55 bg-[#8f66ff]/16 px-4 py-2.5 text-xs font-semibold tracking-[0.1em] text-white uppercase transition hover:bg-[#8f66ff]/24"
            >
              Acceder a demo
            </Link>
          </div>
        </section>

        <section
          id="contenido"
          className="mt-16 grid gap-4 md:grid-cols-2 md:gap-5"
        >
          {sections.map((item) => (
            <SectionCard key={item.title} item={item} />
          ))}
        </section>

        <section className="mt-5 rounded-2xl border border-white/12 bg-white/[0.02] p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-white/58 uppercase">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[#8f66ff]/35 bg-[#8f66ff]/10 text-[#a882ff] shadow-[0_0_18px_rgba(143,102,255,.22)]">
              <Sparkles size={14} />
            </span>
            Alternativas de frase clave
          </div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Frase elegida: “La IA ya no decide por ti.”
          </h2>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {alternatives.map((line, index) => (
              <span
                key={line}
                className={`rounded-xl border px-3 py-1.5 ${
                  index === 0
                    ? "border-[#8f66ff]/55 bg-[#8f66ff]/18 text-white"
                    : "border-white/16 bg-white/[0.03] text-white/72"
                }`}
              >
                {line}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
