import {
  GUI_FORMAT_LABELS,
  type GuionistaApproach,
  type GuionistaFormat,
  type GuionistaSettings,
  type GuionistaSocialAdaptation,
  type GuionistaVersion,
  makeGuionistaId,
  nowIso,
  plainTextFromMarkdown,
  previewText,
} from "./guionista-types";

type GenerateArgs = {
  briefing: string;
  format: GuionistaFormat;
  settings: GuionistaSettings;
  approach?: GuionistaApproach | null;
  brainHints?: string[];
};

function clean(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function titleFromBriefing(briefing: string, fallback: string): string {
  const text = clean(briefing).replace(/^[-–•\d.\s]+/, "");
  if (!text) return fallback;
  const first = text.split(/[.!?\n]/)[0]?.trim() || text;
  return first.length > 64 ? `${first.slice(0, 61)}…` : first;
}

function toneLine(settings: GuionistaSettings): string {
  const tone = {
    natural: "natural y claro",
    professional: "profesional y preciso",
    premium: "premium, sobrio y memorable",
    institutional: "institucional y confiable",
    ironic: "ligeramente ironico y afilado",
    emotional: "emocional y cercano",
  }[settings.tone];
  const goal = {
    explain: "explicar",
    convince: "convencer",
    sell: "vender",
    present: "presentar",
    inspire: "inspirar",
    conversation: "abrir conversacion",
  }[settings.goal];
  return `${tone}, orientado a ${goal}`;
}

export function createGuionistaApproaches(args: GenerateArgs): GuionistaApproach[] {
  const seed = titleFromBriefing(args.briefing, GUI_FORMAT_LABELS[args.format]);
  const base = clean(args.briefing) || "una idea pendiente de desarrollar";
  return [
    {
      id: makeGuionistaId("gui_approach"),
      title: seed,
      idea: `Convertir "${base}" en una pieza clara que avance desde una observacion fuerte hacia una conclusion util.`,
      tone: `Inteligente, ${toneLine(args.settings)}.`,
      rationale: "Enfoque seguro para convertir una idea inicial en narrativa ordenada.",
      format: args.format,
    },
    {
      id: makeGuionistaId("gui_approach"),
      title: `${seed} desde el problema`,
      idea: `Empezar por la tension o problema que hay detras de la idea, y resolverlo con una narrativa practica.`,
      tone: `Directo, editorial, con ritmo.`,
      rationale: "Parte de la tension para construir interes y necesidad.",
      format: args.format,
    },
    {
      id: makeGuionistaId("gui_approach"),
      title: `${seed} como oportunidad`,
      idea: `Plantear la idea como una oportunidad: que cambia, por que importa y que deberia hacer la audiencia despues.`,
      tone: `Inspirador, concreto y facil de recordar.`,
      rationale: "Convierte el briefing en una lectura positiva y accionable.",
      format: args.format,
    },
  ];
}

function formatBody(args: GenerateArgs, title: string): { markdown: string; structured: Record<string, unknown> } {
  const brief = clean(args.briefing) || "Idea pendiente de desarrollar.";
  const approach = args.approach;
  const brainLine = args.brainHints?.length ? `\n\nContexto Brain usado: ${args.brainHints.slice(0, 5).join(", ")}.` : "";
  const extra = args.settings.extraInstructions ? `\n\nNota de direccion: ${args.settings.extraInstructions}` : "";
  const opening = approach?.idea || brief;

  if (args.format === "post") {
    const text = `# ${title}\n\n${opening}\n\n${brief}\n\nLo importante no es hacerlo mas grande. Es hacerlo mas claro, mas util y mas facil de accionar.\n\nCierre: si la idea funciona, deberia poder explicarse sin artificio.${extra}${brainLine}`;
    return { markdown: text, structured: { postText: text, hashtags: [] } };
  }
  if (args.format === "article") {
    const text = `# ${title}\n\n## Entradilla\n${opening}\n\n## Desarrollo\n${brief}\n\nUna buena narrativa no consiste en decorar una idea, sino en ordenar la energia que ya tiene. Primero aparece la tension: que esta pasando, por que importa y que se esta interpretando mal. Despues aparece el punto de vista: una forma mas simple de leer el problema.\n\n## Cierre\nLa conclusion debe dejar una sensacion concreta: esto se entiende, esto importa y esto puede hacerse mejor.${extra}${brainLine}`;
    return { markdown: text, structured: { title, intro: opening, body: brief, closing: "Esto puede hacerse mejor." } };
  }
  if (args.format === "script") {
    const text = `# ${title}\n\n## Voz en off\n${opening}\n\n${brief}\n\n## Texto en pantalla\n- Una idea clara\n- Una tension reconocible\n- Un cierre accionable\n\n## Notas visuales\nRitmo limpio, planos sencillos, transiciones sobrias. Duracion aproximada: 45-60 segundos.${extra}${brainLine}`;
    return { markdown: text, structured: { voiceOver: opening, onScreenText: ["Una idea clara", "Una tension reconocible"], visualNotes: "Ritmo limpio" } };
  }
  if (args.format === "scenes") {
    const text = `# ${title}\n\n## Escena 01 · Planteamiento\nVisual: un contexto reconocible.\nAccion: aparece la tension principal.\nVoz/dialogo: ${opening}\nIntencion emocional: curiosidad.\nDuracion: 10s.\n\n## Escena 02 · Desarrollo\nVisual: detalle del problema.\nAccion: se ordenan las piezas.\nVoz/dialogo: ${brief}\nIntencion emocional: claridad.\nDuracion: 15s.\n\n## Escena 03 · Cierre\nVisual: solucion simple.\nAccion: la idea queda sintetizada.\nIntencion emocional: confianza.\nDuracion: 10s.${extra}${brainLine}`;
    return { markdown: text, structured: { scenes: [{ name: "Escena 01", action: opening }, { name: "Escena 02", action: brief }] } };
  }
  if (args.format === "slides") {
    const text = `# ${title}\n\n## Slide 1 · Idea central\n- ${opening}\n\n## Slide 2 · Por que importa\n- ${brief}\n- La audiencia necesita una lectura clara.\n\n## Slide 3 · Punto de vista\n- Simplificar sin perder profundidad.\n- Convertir ruido en decision.\n\n## Slide 4 · Cierre\n- Que hacemos ahora.\n- Siguiente accion recomendada.${extra}${brainLine}`;
    return { markdown: text, structured: { slides: [{ title: "Idea central", bullets: [opening] }, { title: "Por que importa", bullets: [brief] }] } };
  }
  if (args.format === "campaign") {
    const text = `# ${title}\n\n## Claim principal\n${title}\n\n## Subclaim\n${opening}\n\n## Titulares\n- Menos ruido. Mas direccion.\n- La idea correcta, dicha con claridad.\n- Convierte pensamiento en narrativa.\n\n## Bajadas\n- ${brief}\n\n## CTAs\n- Descubrir mas\n- Empezar ahora\n- Ver propuesta${extra}${brainLine}`;
    return { markdown: text, structured: { claim: title, headlines: ["Menos ruido. Mas direccion."], ctas: ["Descubrir mas"] } };
  }
  const text = `# ${title}\n\n## Texto original\n${brief}\n\n## Texto reescrito\n${opening}\n\nUna version mas clara, ordenada y facil de leer: ${brief}\n\n## Mejora aplicada\nClaridad, ritmo y foco.${extra}${brainLine}`;
  return { markdown: text, structured: { original: brief, rewritten: plainTextFromMarkdown(text), improvement: "claridad" } };
}

export function createGuionistaVersion(args: GenerateArgs & { label?: string; sourceAction?: string }): GuionistaVersion {
  const title = args.approach?.title || titleFromBriefing(args.briefing, GUI_FORMAT_LABELS[args.format]);
  const body = formatBody(args, title);
  const now = nowIso();
  return {
    id: makeGuionistaId("gui_version"),
    label: args.label || "Primer borrador",
    title,
    format: args.format,
    markdown: body.markdown,
    plainText: plainTextFromMarkdown(body.markdown),
    createdAt: now,
    sourceAction: args.sourceAction,
    structured: body.structured,
  };
}

export function transformGuionistaVersion(version: GuionistaVersion, action: string, targetFormat?: GuionistaFormat): GuionistaVersion {
  const base = version.markdown.trim();
  const now = nowIso();
  const title = targetFormat === "slides"
    ? `${version.title} · Slides`
    : targetFormat === "script"
      ? `${version.title} · Guion`
      : action === "Crear titulares"
        ? `${version.title} · Titulares`
        : version.title;
  const actionIntro: Record<string, string> = {
    "Mas corto": "Version mas corta y concentrada.",
    "Mas claro": "Version mas clara, con menos friccion y mejor orden.",
    "Mas humano": "Version mas humana, cercana y natural.",
    "Mas premium": "Version mas premium, sobria y precisa.",
    "Mas directo": "Version mas directa, con menos rodeo.",
    "Mas ironico": "Version ligeramente ironica, sin perder claridad.",
    "Crear titulares": "Titulares derivados de la version activa.",
    "Convertir en slides": "Estructura de slides derivada de la version activa.",
    "Convertir en guion": "Guion derivado de la version activa.",
  };
  const markdown = action === "Crear titulares"
    ? `# ${title}\n\n- ${version.title}\n- Menos ruido. Mas narrativa.\n- La idea que faltaba ordenar.\n- De pensamiento a texto util.\n- Una forma mas clara de decirlo.\n\n## Base\n${previewText(base, 360)}`
    : targetFormat === "slides"
      ? `# ${title}\n\n## Slide 1 · Hook\n- ${version.title}\n\n## Slide 2 · Idea\n- ${previewText(base, 180)}\n\n## Slide 3 · Desarrollo\n- Punto principal\n- Prueba o razon\n- Implicacion\n\n## Slide 4 · Cierre\n- Mensaje final\n- Siguiente accion`
      : targetFormat === "script"
        ? `# ${title}\n\n## Voz en off\n${previewText(base, 520)}\n\n## Texto en pantalla\n- ${version.title}\n- Idea principal\n- Cierre\n\n## Notas visuales\nPlanos limpios, ritmo medio, cierre claro.`
        : `# ${title}\n\n${actionIntro[action] || "Nueva version."}\n\n${base}`;
  return {
    id: makeGuionistaId("gui_version"),
    label: action,
    title,
    format: targetFormat || version.format,
    markdown,
    plainText: plainTextFromMarkdown(markdown),
    createdAt: now,
    sourceAction: action,
    structured: { transformedFrom: version.id, action },
  };
}

export function createSocialAdaptations(args: {
  title: string;
  markdown: string;
  sourceAssetId?: string;
  sourceVersionId?: string;
}): GuionistaSocialAdaptation[] {
  const base = plainTextFromMarkdown(args.markdown);
  const short = previewText(base, 180);
  const xText = short.length > 280 ? `${short.slice(0, 276)}…` : short;
  const now = nowIso();
  const mk = (platform: GuionistaSocialAdaptation["platform"], text: string, hashtags: string[] = []) => ({
    id: makeGuionistaId("gui_social"),
    platform,
    title: `${args.title} · ${platform === "Short" ? "Short caption" : platform}`,
    text,
    hashtags,
    sourceAssetId: args.sourceAssetId,
    sourceVersionId: args.sourceVersionId,
    createdAt: now,
    updatedAt: now,
    status: "draft" as const,
    format: "post" as const,
  });
  return [
    mk("LinkedIn", `${args.title}\n\n${previewText(base, 520)}\n\nUna idea para abrir conversacion con mas claridad y menos ruido.`, ["#estrategia", "#creatividad", "#narrativa"]),
    mk("Instagram", `${args.title}\n\n${previewText(base, 320)}\n\nUna forma mas visual de contar lo importante.`, ["#ideas", "#contenido", "#marca"]),
    mk("X", xText, []),
    mk("Short", `${args.title}. ${previewText(base, 110)}`, []),
  ];
}
