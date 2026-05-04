import type OpenAI from "openai";

export type BrainDnaExtraction = {
  empresa: { propuesta_valor: string; sector: string; diferenciadores: string[] };
  audiencia: { perfil_cliente: string; problemas_principales: string[]; necesidades: string[] };
  producto: { funcionalidades: string[]; beneficios: string[] };
  casos_uso: Array<{ aplicacion: string; sector: string }>;
  mercado: {
    tam: string;
    sam: string;
    som: string;
    horizonte_temporal: string;
    segmento_objetivo: string;
    indicadores_clave: Array<{
      concepto: string;
      valor: string;
      unidad: string;
      periodo: string;
      nota: string;
    }>;
  };
  data_relevante_numerica: string[];
  diferencial_competitivo?: string;
  tono_marca?: string;
  visual_signals?: {
    protagonist: string[];
    environment: string[];
    textures: string[];
    colors: string[];
    people: string[];
    tone: string[];
    evidence_text: string[];
  };
};

const DNA_JSON_SHAPE = `{
  "empresa": { "propuesta_valor": "", "sector": "", "diferenciadores": [] },
  "audiencia": { "perfil_cliente": "", "problemas_principales": [], "necesidades": [] },
  "producto": { "funcionalidades": [], "beneficios": [] },
  "casos_uso": [ { "aplicacion": "", "sector": "" } ],
  "mercado": {
    "tam": "",
    "sam": "",
    "som": "",
    "horizonte_temporal": "",
    "segmento_objetivo": "",
    "indicadores_clave": [ { "concepto": "", "valor": "", "unidad": "", "periodo": "", "nota": "" } ]
  },
  "data_relevante_numerica": [],
  "diferencial_competitivo": "",
  "tono_marca": "",
  "visual_signals": {
    "protagonist": [],
    "environment": [],
    "textures": [],
    "colors": [],
    "people": [],
    "tone": [],
    "evidence_text": []
  }
}`;

function defaultDna(): BrainDnaExtraction {
  return {
    empresa: { propuesta_valor: "", sector: "", diferenciadores: [] },
    audiencia: { perfil_cliente: "", problemas_principales: [], necesidades: [] },
    producto: { funcionalidades: [], beneficios: [] },
    casos_uso: [],
    mercado: {
      tam: "",
      sam: "",
      som: "",
      horizonte_temporal: "",
      segmento_objetivo: "",
      indicadores_clave: [],
    },
    data_relevante_numerica: [],
    diferencial_competitivo: "",
    tono_marca: "",
    visual_signals: {
      protagonist: [],
      environment: [],
      textures: [],
      colors: [],
      people: [],
      tone: [],
      evidence_text: [],
    },
  };
}

function compactLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

/**
 * pdf2json puede devolver bloques en orden visual irregular.
 * Este normalizador limpia ruido y reordena secciones numeradas (1), 2), 3)...)
 * para mejorar la extracción semántica posterior.
 */
export function normalizeExtractedText(raw: string): string {
  const lines = raw
    .replace(/\r/g, "\n")
    .split("\n")
    .map(compactLine)
    .filter(Boolean);

  if (lines.length === 0) return "";

  const sectionHeader = /^(\d{1,2})\)\s+/;
  const hasSections = lines.some((l) => sectionHeader.test(l));
  if (!hasSections) return lines.join("\n");

  const prelude: string[] = [];
  const sections = new Map<number, string[]>();
  let current: number | null = null;

  for (const line of lines) {
    const m = line.match(sectionHeader);
    if (m) {
      current = Number(m[1]);
      if (!sections.has(current)) sections.set(current, []);
    }
    if (current === null) {
      prelude.push(line);
    } else {
      sections.get(current)?.push(line);
    }
  }

  const sorted = [...sections.keys()].sort((a, b) => a - b);
  const merged: string[] = [];
  if (prelude.length > 0) merged.push(...prelude, "");
  for (const key of sorted) {
    merged.push(...(sections.get(key) || []), "");
  }
  return merged.join("\n").trim();
}

function normalizeIndicadores(input: unknown): BrainDnaExtraction["mercado"]["indicadores_clave"] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        concepto: typeof o.concepto === "string" ? o.concepto : "",
        valor: typeof o.valor === "string" ? o.valor : "",
        unidad: typeof o.unidad === "string" ? o.unidad : "",
        periodo: typeof o.periodo === "string" ? o.periodo : "",
        nota: typeof o.nota === "string" ? o.nota : "",
      };
    });
}

function normalizeStringArray(input: unknown, max = 24): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const v = item.replace(/\s+/g, " ").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeVisualSignals(input: unknown): NonNullable<BrainDnaExtraction["visual_signals"]> {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    protagonist: normalizeStringArray(obj.protagonist, 12),
    environment: normalizeStringArray(obj.environment, 12),
    textures: normalizeStringArray(obj.textures, 12),
    colors: normalizeStringArray(obj.colors, 16),
    people: normalizeStringArray(obj.people, 12),
    tone: normalizeStringArray(obj.tone, 10),
    evidence_text: normalizeStringArray(obj.evidence_text, 20),
  };
}

export function safeParseDna(raw: string): BrainDnaExtraction {
  try {
    const parsed = JSON.parse(raw);
    const mercadoIn = parsed?.mercado || {};
    return {
      ...defaultDna(),
      ...(parsed || {}),
      empresa: { ...defaultDna().empresa, ...(parsed?.empresa || {}) },
      audiencia: { ...defaultDna().audiencia, ...(parsed?.audiencia || {}) },
      producto: { ...defaultDna().producto, ...(parsed?.producto || {}) },
      casos_uso: Array.isArray(parsed?.casos_uso) ? parsed.casos_uso : [],
      mercado: {
        ...defaultDna().mercado,
        ...(mercadoIn || {}),
        indicadores_clave: normalizeIndicadores(mercadoIn?.indicadores_clave),
      },
      data_relevante_numerica: Array.isArray(parsed?.data_relevante_numerica)
        ? parsed.data_relevante_numerica.filter((x: unknown): x is string => typeof x === "string")
        : [],
      visual_signals: normalizeVisualSignals(parsed?.visual_signals),
    };
  } catch {
    return defaultDna();
  }
}

function extractNumericSignals(rawText: string): string[] {
  const lines = rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const pattern =
    /(\$?\s?\d+(?:[.,]\d+)?\s?(?:[KMB]|MM|bn|m|k|%)|\d+(?:[.,]\d+)?\s?anos|\d+(?:[.,]\d+)?\s?years|\d+(?:[.,]\d+)?\s?DAU)/i;

  const out: string[] = [];
  for (const line of lines) {
    if (
      pattern.test(line) ||
      /\b(TAM|SAM|SOM|mercado|market|usuarios|concurrencias|coste|budget)\b/i.test(line)
    ) {
      out.push(line);
    }
  }
  return [...new Set(out)].slice(0, 24);
}

function enrichWithNumericSignals(text: string, dna: BrainDnaExtraction): BrainDnaExtraction {
  const numeric = extractNumericSignals(text);
  const merged = [...new Set([...(dna.data_relevante_numerica || []), ...numeric])];

  const maybeTam = merged.find((l) => /\bTAM\b/i.test(l));
  const maybeSam = merged.find((l) => /\bSAM\b/i.test(l));
  const maybeSom = merged.find((l) => /\bSOM\b/i.test(l));
  const maybeSegment = merged.find((l) => /\b(segmento|target|freelancers|agencias|equipos creativos)\b/i.test(l));
  const maybeHorizon = merged.find((l) => /\b(\d+\s?anos|\d+\s?years|202[0-9])\b/i.test(l));

  const mercado = {
    ...dna.mercado,
    tam: dna.mercado?.tam || maybeTam || "",
    sam: dna.mercado?.sam || maybeSam || "",
    som: dna.mercado?.som || maybeSom || "",
    segmento_objetivo: dna.mercado?.segmento_objetivo || maybeSegment || "",
    horizonte_temporal: dna.mercado?.horizonte_temporal || maybeHorizon || "",
  };

  const indicadores = [...(mercado.indicadores_clave || [])];
  for (const line of merged) {
    if (indicadores.length >= 12) break;
    const hasMetric =
      /\b(TAM|SAM|SOM|DAU|usuarios|concurrencias|coste|budget|MTD)\b/i.test(line) ||
      /\$?\s?\d+(?:[.,]\d+)?\s?(?:[KMB]|MM|bn|m|k|%)/i.test(line);
    if (!hasMetric) continue;
    if (indicadores.some((x) => `${x.concepto} ${x.valor}`.includes(line))) continue;
    indicadores.push({
      concepto: line.slice(0, 80),
      valor: line,
      unidad: "",
      periodo: "",
      nota: "",
    });
  }

  return {
    ...dna,
    mercado: { ...mercado, indicadores_clave: indicadores },
    data_relevante_numerica: merged,
  };
}

function dnaSignalScore(dna: BrainDnaExtraction): number {
  let score = 0;
  if (dna.empresa?.propuesta_valor?.trim()) score += 1;
  if (dna.empresa?.sector?.trim()) score += 1;
  score += dna.empresa?.diferenciadores?.length || 0;
  if (dna.audiencia?.perfil_cliente?.trim()) score += 1;
  score += dna.audiencia?.problemas_principales?.length || 0;
  score += dna.audiencia?.necesidades?.length || 0;
  score += dna.producto?.funcionalidades?.length || 0;
  score += dna.producto?.beneficios?.length || 0;
  score += dna.casos_uso?.length || 0;
  if (dna.mercado?.tam?.trim()) score += 1;
  if (dna.mercado?.sam?.trim()) score += 1;
  if (dna.mercado?.som?.trim()) score += 1;
  score += dna.mercado?.indicadores_clave?.length || 0;
  score += dna.data_relevante_numerica?.length || 0;
  if (dna.diferencial_competitivo?.trim()) score += 1;
  if (dna.tono_marca?.trim()) score += 1;
  return score;
}

export function chunkText(input: string, maxChars = 12000): string[] {
  const text = input.trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  const out: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + maxChars, text.length);
    if (end < text.length) {
      const pivot = text.lastIndexOf("\n", end);
      if (pivot > cursor + Math.floor(maxChars * 0.5)) {
        end = pivot;
      }
    }
    out.push(text.slice(cursor, end));
    cursor = end;
  }
  return out;
}

export type BrainOpenAiChatUsageHook = (
  model: string,
  usage: OpenAI.Chat.Completions.ChatCompletion["usage"],
) => void;

async function extractChunkDna(
  openai: OpenAI,
  text: string,
  mode: "strict" | "technical",
  onChatUsage?: BrainOpenAiChatUsageHook,
): Promise<BrainDnaExtraction> {
  const systemPrompt =
    mode === "strict"
      ? `You are an expert strategic marketing AI. Extract corporate DNA from the provided text.
Return JSON only and strictly using this shape: ${DNA_JSON_SHAPE}
Never invent unknown facts; leave empty values when absent.
CRITICAL: preserve market and numeric references exactly when present (TAM/SAM/SOM, DAU, budgets, percentages, years).`
      : `You are an expert strategic marketing AI working on technical/internal business documents.
Extract corporate DNA even when language is operational (costs, infra, performance, MVP notes).
Return JSON only and strictly using this shape: ${DNA_JSON_SHAPE}
Use only evidence from text; when wording is technical, translate to business language conservatively.
Never fabricate numbers, names or claims not present in the text.
CRITICAL: capture numeric and market data explicitly into mercado + data_relevante_numerica.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      { role: "user", content: `Extract corporate DNA from this content:\n\n${text}` },
    ],
  });
  onChatUsage?.("gpt-4o", completion.usage);
  return safeParseDna(completion.choices[0]?.message?.content || "{}");
}

export async function extractDnaFromTextRobust(
  openai: OpenAI,
  fullText: string,
  onChatUsage?: BrainOpenAiChatUsageHook,
): Promise<BrainDnaExtraction> {
  const normalized = normalizeExtractedText(fullText);
  const chunks = chunkText(normalized, 12000).slice(0, 8);
  if (chunks.length === 0) return defaultDna();

  const runPipeline = async (mode: "strict" | "technical"): Promise<BrainDnaExtraction> => {
    const partial: BrainDnaExtraction[] = [];
    for (const chunk of chunks) {
      let ok = false;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
        try {
          const dna = await extractChunkDna(openai, chunk, mode, onChatUsage);
          partial.push(dna);
          ok = true;
        } catch (e) {
          lastError = e;
        }
      }
      if (!ok) throw lastError instanceof Error ? lastError : new Error("Chunk extraction failed");
    }

    if (partial.length === 1) return partial[0];

    const mergeCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Merge multiple partial corporate DNA JSON objects into one canonical JSON.
Return JSON only and strictly using this shape: ${DNA_JSON_SHAPE}
Combine and deduplicate arrays.
Preserve market and numeric information.`,
        },
        { role: "user", content: JSON.stringify({ partial }, null, 2) },
      ],
    });
    onChatUsage?.("gpt-4o", mergeCompletion.usage);
    return safeParseDna(mergeCompletion.choices[0]?.message?.content || "{}");
  };

  const strictDna = enrichWithNumericSignals(normalized, await runPipeline("strict"));
  if (dnaSignalScore(strictDna) >= 3) return strictDna;

  const technicalDna = enrichWithNumericSignals(normalized, await runPipeline("technical"));
  return dnaSignalScore(technicalDna) >= dnaSignalScore(strictDna) ? technicalDna : strictDna;
}

export async function extractDnaFromImageRobust(
  openai: OpenAI,
  base64Image: string,
  mimeType: string,
  onChatUsage?: BrainOpenAiChatUsageHook,
): Promise<BrainDnaExtraction> {
  const userContent = [
    {
      type: "text" as const,
      text:
        "Analiza esta imagen como director/a de estrategia de marca. No te limites al texto visible: interpreta composición, producto protagonista, entorno, texturas/materiales, personas y tono.",
    },
    { type: "image_url" as const, image_url: { url: `data:${mimeType};base64,${base64Image}` } },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert strategic marketing AI with visual brand analysis skills.
Extract corporate DNA from the full visual scene (not only OCR text).
Return JSON only and strictly using this shape: ${DNA_JSON_SHAPE}
Rules:
1) Identify hero product/model when possible (e.g. "Engine A 26") and preserve literal strings from image/OCR.
2) Fill visual_signals with concise, concrete phrases:
   - protagonist: what is visually central (product/model/object)
   - environment: scene/place/style
   - textures: materials/surfaces/colors/patterns
   - colors: exact hex colors when visible or inferable, plus short color names if no hex is safe
   - people: number/type/action/posture/mood
   - tone: brand mood and art direction
3) Keep values evidence-based and specific; avoid vague generic text.
4) Capture any numeric and market references explicitly.
5) If uncertain, provide best plausible hypothesis but never leave visual_signals empty.`,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
  });
  onChatUsage?.("gpt-4o", completion.usage);
  const parsed = safeParseDna(completion.choices[0]?.message?.content || "{}");
  const visualEvidence = [
    ...(parsed.visual_signals?.evidence_text || []),
    ...(parsed.visual_signals?.protagonist || []),
  ].join("\n");
  return enrichWithNumericSignals(visualEvidence, parsed);
}

export function buildReadableCorporateContext(
  docs: Array<{ name: string; extractedContext?: string; status?: string }>,
): string {
  return docs
    .filter((d) => d.status === "Analizado" && d.extractedContext)
    .map((d) => {
      try {
        const parsed = JSON.parse(d.extractedContext || "{}");
        return `### Document: ${d.name}
**Empresa:** ${parsed.empresa?.propuesta_valor || ""}
**Diferencial:** ${parsed.diferencial_competitivo || ""}
**Tono:** ${parsed.tono_marca || ""}
**Audiencia:** ${parsed.audiencia?.perfil_cliente || ""}
**Producto:** ${(parsed.producto?.beneficios || []).join(", ")}
**TAM:** ${parsed.mercado?.tam || ""}
**SAM:** ${parsed.mercado?.sam || ""}
**SOM:** ${parsed.mercado?.som || ""}
**KPIs:** ${(parsed.data_relevante_numerica || []).slice(0, 6).join(" | ")}`;
      } catch {
        return `### Document: ${d.name}\n${d.extractedContext || ""}`;
      }
    })
    .join("\n\n");
}
