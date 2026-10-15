import type { AppLanguage } from "@/lib/i18n";

export type HomeCopy = {
  heroPrimary: string;
  heroGradient: string;
  heroLead: string;
  startCreating: string;
  enterFoldder: string;
  betaBefore: string;
  betaAfter: string;
  madeWith: string;
  manifestoLabel: string;
  manifestoLines: readonly [string, string, string];
  manifestoBody: string;
  brandkitEyebrow: string;
  brandkitHeadline: readonly [string, string];
  brandkitBody: string;
  brandkitFeatures: readonly { title: string; description: string }[];
  nodesEyebrow: string;
  nodesHeadline: readonly [string, string];
  nodesGalleryLabel: string;
  previousNode: string;
  nextNode: string;
  selectNode: (label: string) => string;
  nodeDetailLabel: (index: number, total: number) => string;
  billingEyebrow: string;
  billingHeadline: readonly [string, string];
  billingBody: string;
  billingCards: readonly { title: string; description: string }[];
  closingHeadline: string;
  closingBody: string;
  startShort: string;
};

const ES: HomeCopy = {
  heroPrimary: "NO CREA\nPOR TI,",
  heroGradient: "CREA CONTIGO.",
  heroLead:
    "**FOLDDER** es el lugar donde ocurre tu **proceso creativo**: inspiración, escritura, imagen, vídeo, diseño y presentación trabajando dentro de **un mismo sistema**.",
  startCreating: "Empieza a crear",
  enterFoldder: "Entrar en Foldder",
  betaBefore: "Solo acceso",
  betaAfter: " para miembros",
  madeWith: "Hecho con ",
  manifestoLabel: "Manifiesto",
  manifestoLines: ["Tú decides.", "Foldder conecta.", "La IA acelera."],
  manifestoBody:
    "Foldder trabaja como un **equipo creativo expandido**, pero **cada decisión** sigue estando **en tus manos**.",
  brandkitEyebrow: "Brandkit",
  brandkitHeadline: ["EL ADN VIVO", "DE TU PROYECTO."],
  brandkitBody:
    "Brandkit convierte tu **marca, referencias y reglas** en **contexto activo** para todo lo que creas.",
  brandkitFeatures: [
    { title: "Recuerda tu marca", description: "**Tono, claims y paleta**, referencias y reglas." },
    {
      title: "Conecta el criterio",
      description: "Texto, imagen, vídeo, diseño y presentación crean con el **mismo ADN**.",
    },
    {
      title: "Aprende de ti",
      description: "**Acepta, corrige, descarta** y Brandkit entiende mejor **tu forma de crear**.",
    },
  ],
  nodesEyebrow: "Nodos",
  nodesHeadline: ["HERRAMIENTAS", "QUE SE CONECTAN."],
  nodesGalleryLabel: "Galería de nodos",
  previousNode: "Nodo anterior",
  nextNode: "Nodo siguiente",
  selectNode: (label) => `Seleccionar ${label}`,
  nodeDetailLabel: (index, total) => `Detalle del nodo ${index} de ${total}`,
  billingEyebrow: "Saldo",
  billingHeadline: ["LA IA SOLO TRABAJA", "CUANDO TÚ LO DECIDES."],
  billingBody:
    "Usa Foldder con **suscripción, bolsa fija o créditos**. Cada acción de IA **se confirma antes de ejecutarse**, para que siempre tengas **control** sobre lo que creas y lo que consumes.",
  billingCards: [
    { title: "Elige", description: "**Suscripción, bolsa fija o créditos.**" },
    { title: "Crea", description: "**Genera, edita, monta** o presenta." },
    { title: "Controla", description: "**Confirma cada acción** antes de usar recursos." },
  ],
  closingHeadline: "Tu Foldder no será igual que el de nadie.",
  closingBody:
    "Úsalo para **escribir, diseñar, montar y presentar**, vender, explorar, crear campañas o construir tu **propio sistema creativo**.",
  startShort: "Empieza",
};

const EN: HomeCopy = {
  heroPrimary: "DOES NOT\nCREATE FOR YOU,",
  heroGradient: "CREATES WITH YOU.",
  heroLead:
    "**FOLDDER** is where your **creative process** happens: inspiration, writing, image, video, design and presentation working inside **one system**.",
  startCreating: "Start creating",
  enterFoldder: "Enter Foldder",
  betaBefore: "Members-only",
  betaAfter: " access",
  madeWith: "Made with ",
  manifestoLabel: "Manifesto",
  manifestoLines: ["You decide.", "Foldder connects.", "AI accelerates."],
  manifestoBody:
    "Foldder works as an **extended creative team**, but **every decision** still stays **in your hands**.",
  brandkitEyebrow: "Brandkit",
  brandkitHeadline: ["THE LIVING DNA", "OF YOUR PROJECT."],
  brandkitBody:
    "Brandkit turns your **brand, references and rules** into **active context** for everything you create.",
  brandkitFeatures: [
    { title: "Remembers your brand", description: "**Tone, claims and palette**, references and rules." },
    {
      title: "Connects the criteria",
      description: "Text, image, video, design and presentation are created with the **same DNA**.",
    },
    {
      title: "Learns from you",
      description: "**Accept, correct, discard** and Brandkit understands **how you create**.",
    },
  ],
  nodesEyebrow: "Nodes",
  nodesHeadline: ["TOOLS", "THAT CONNECT."],
  nodesGalleryLabel: "Node gallery",
  previousNode: "Previous node",
  nextNode: "Next node",
  selectNode: (label) => `Select ${label}`,
  nodeDetailLabel: (index, total) => `Node detail ${index} of ${total}`,
  billingEyebrow: "Balance",
  billingHeadline: ["AI ONLY WORKS", "WHEN YOU DECIDE."],
  billingBody:
    "Use Foldder with a **subscription, a fixed pack or credits**. Every AI action **is confirmed before it runs**, so you always stay in **control** of what you create and what you spend.",
  billingCards: [
    { title: "Choose", description: "**Subscription, fixed pack or credits.**" },
    { title: "Create", description: "**Generate, edit, assemble** or present." },
    { title: "Control", description: "**Confirm every action** before using resources." },
  ],
  closingHeadline: "Your Foldder will not look like anyone else's.",
  closingBody:
    "Use it to **write, design, edit and present**, sell, explore, build campaigns or construct your **own creative system**.",
  startShort: "Start",
};

export const HOME_COPY: Record<AppLanguage, HomeCopy> = { es: ES, en: EN };
