import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { recordApiUsage } from "@/lib/api-usage";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { coerceAssistantPlan } from "@/app/spaces/dataset/dataset-assistant-apply";

export const runtime = "nodejs";

type SchemaColumn = { key?: string; label?: string; type?: string; options?: string[] };
type AssistantRequestBody = {
  query?: string;
  list?: {
    name?: string;
    schema?: SchemaColumn[];
    rowCount?: number;
    sampleRows?: Array<Record<string, string>>;
  };
  otherLists?: Array<{ name?: string }>;
  projectId?: string;
  workspaceId?: string;
};

const SYSTEM_PROMPT = `Eres "Dataset Copilot", un planificador que opera sobre tablas tipadas dentro de una app de diseño.

REGLAS CRÍTICAS
- NUNCA modificas la tabla directamente: devuelves SOLO un plan JSON que el usuario revisa y confirma.
- BÚSQUEDA WEB (importante): si piden datos del mundo real o en tiempo real que NO están en la tabla y que el usuario NO aporta (p. ej. "alineación del Real Madrid de hoy", estadísticas, biografías, fotos de cara), NO los inventes. En su lugar:
  - intent="retrieve",
  - rellena "web": { query, columns:[{label,type}], imageColumn?, maxRows, targetName },
  - "query" = consulta de búsqueda refinada en el idioma adecuado,
  - "columns" = las columnas pedidas (usa type "image" para fotos y pon su label en "imageColumn"),
  - "maxRows" = nº razonable (p. ej. 11 titulares), nunca más de 50,
  - deja "ops" vacío (las filas se traen tras confirmar la búsqueda),
  - "summary"/"question" describen la búsqueda (p. ej. "Buscaré la alineación titular del Real Madrid de hoy", "¿Busco?").
- Para borrar o editar filas SIEMPRE usa un "filter" estructurado; el cliente lo evalúa sobre los datos reales y cuenta las coincidencias (tú no cuentas).
- Sé conservador: una intención por mensaje. Respeta los topes (máx 200 filas, 16 columnas, 12 ops por plan).

FORMATO DE SALIDA (JSON estricto):
{
  "intent": "edit" | "transform" | "create" | "qa" | "retrieve",
  "summary": "frase corta en español de lo que harás",
  "question": "pregunta de confirmación en español, p. ej. '¿Los elimino?'",
  "answer": "(solo si intent=qa) respuesta directa",
  "target": { "mode": "active" | "new", "suggestedName": "Nombre si mode=new" },
  "ops": [ ... ],
  "web": { "query": "...", "columns": [{"label":"Nombre","type":"text"}], "imageColumn": "Foto", "maxRows": 11, "targetName": "Real Madrid · Titulares" },
  "warnings": ["avisos opcionales"]
}

OPERACIONES (ops[].kind):
- create_table: { kind, name, columns:[{label,type}], rows?:[{cells:{<columna>:valor}}] }
- add_columns:  { kind, columns:[{label,type}] }
- remove_columns: { kind, columns:["label"] }
- rename_column: { kind, column:"label", newLabel:"nuevo" }
- add_rows: { kind, rows:[{cells:{<columna>:valor}}] }   // solo datos que aporta el usuario
- delete_rows: { kind, filter:{ all?:[cond], any?:[cond] } }
- update_cells: { kind, filter?:{...}, set:[{column:"label", value:...}] }
- dedupe_rows: { kind, column:"label" }

types de columna válidos: "text","number","image","video","color","boolean","select","url".
Usa "image" para fotos (se rellenarán cuando llegue la web).

CONDICIONES de filtro (op):
"eq","neq","gt","gte","lt","lte","contains","not_contains","starts_with","ends_with","empty","not_empty".
Ejemplo "más de 25 años": { "column":"edad", "op":"gt", "value":25 }.

Responde SIEMPRE en español en summary/question/warnings.`;

function buildUserPrompt(body: AssistantRequestBody): string {
  const query = (body.query ?? "").trim();
  const list = body.list ?? {};
  const schema = Array.isArray(list.schema) ? list.schema : [];
  const schemaLines = schema
    .map((c) => `- ${c.label ?? c.key ?? "?"} (key: ${c.key ?? "?"}, tipo: ${c.type ?? "text"})`)
    .join("\n");
  const sample = Array.isArray(list.sampleRows) ? list.sampleRows.slice(0, 24) : [];
  const sampleBlock = sample.length
    ? sample.map((row, i) => `  fila ${i + 1}: ${JSON.stringify(row)}`).join("\n")
    : "  (sin filas)";
  const others =
    Array.isArray(body.otherLists) && body.otherLists.length
      ? `\nOtras pestañas del Dataset: ${body.otherLists.map((l) => l.name ?? "?").join(", ")}`
      : "";

  return `Tabla activa: "${list.name ?? "Tabla"}" (${list.rowCount ?? sample.length} filas)
Columnas:
${schemaLines || "  (sin columnas)"}
Muestra de filas (texto):
${sampleBlock}${others}

Petición del usuario:
"""
${query}
"""

Devuelve únicamente el JSON del plan.`;
}

export async function POST(req: NextRequest) {
  try {
    await assertApiServiceEnabled("openai-dataset-assistant");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;

    const body = (await req.json()) as AssistantRequestBody;
    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "Falta la instrucción." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY no configurada." }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(body) },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const plan = coerceAssistantPlan(parsed);

    const usage = completion.usage;
    if (usage) {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
        serviceId: "openai-dataset-assistant",
        route: "/api/spaces/datasets/assistant",
        model: "gpt-4o",
        operation: "plan",
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        projectId: typeof body.projectId === "string" ? body.projectId.trim() || undefined : undefined,
        workspaceId: typeof body.workspaceId === "string" ? body.workspaceId.trim() || undefined : undefined,
      });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    console.error("[datasets/assistant]", error);
    return NextResponse.json({ error: "No se pudo generar el plan." }, { status: 500 });
  }
}
