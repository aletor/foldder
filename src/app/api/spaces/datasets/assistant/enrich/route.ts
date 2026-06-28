import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import axios from "axios";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { recordApiUsage } from "@/lib/api-usage";
import { buildUserAssetObjectKey, requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { uploadBufferToS3Key } from "@/lib/s3-utils";
import { normalizeUploadedImageForFoldder } from "@/lib/foldder-server-image-optimization";
import { stableKnowledgeFileUrlFromKey } from "@/lib/s3-media-hydrate";
import { filterImageUrlsByIntent } from "@/lib/gemini-image-intent-verify";
import { ASSISTANT_CAPS } from "@/app/spaces/dataset/dataset-assistant-types";

export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

type ColumnSpec = { label: string; type: string };
type EnrichBody = {
  query?: string;
  columns?: ColumnSpec[];
  imageColumn?: string;
  maxRows?: number;
  context?: string;
  projectId?: string;
  workspaceId?: string;
};

type TavilyResult = { title: string; url: string; content: string };

async function tavilySearch(
  apiKey: string,
  query: string,
  opts: { maxResults?: number; rawContent?: boolean; images?: boolean; depth?: "basic" | "advanced" },
): Promise<{ results: TavilyResult[]; images: string[] }> {
  const res = await axios.post(
    "https://api.tavily.com/search",
    {
      api_key: apiKey,
      query,
      search_depth: opts.depth ?? "advanced",
      max_results: opts.maxResults ?? 8,
      include_answer: false,
      include_raw_content: opts.rawContent ?? false,
      include_images: opts.images ?? false,
    },
    { timeout: 20_000, headers: { "Content-Type": "application/json" } },
  );
  const data = res.data as {
    results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string }>;
    images?: Array<string | { url?: string }>;
  };
  const results: TavilyResult[] = Array.isArray(data.results)
    ? data.results.map((r) => ({
        title: String(r.title ?? ""),
        url: String(r.url ?? ""),
        content: String(r.raw_content || r.content || ""),
      }))
    : [];
  const images: string[] = Array.isArray(data.images)
    ? data.images
        .map((im) => (typeof im === "string" ? im : im?.url))
        .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
    : [];
  return { results, images };
}

async function fetchAndStoreImage(
  candidateUrls: string[],
  userEmail: string,
): Promise<{ url: string; s3Key: string } | null> {
  for (const u of candidateUrls.slice(0, 6)) {
    try {
      const img = await axios.get<ArrayBuffer>(u, {
        responseType: "arraybuffer",
        timeout: 10_000,
        maxContentLength: 4 * 1024 * 1024,
        headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
      });
      const mime = String(img.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (!mime.startsWith("image/")) continue;
      const buf = Buffer.from(img.data);
      if (!buf.length || buf.length > 4 * 1024 * 1024) continue;
      const normalized = await normalizeUploadedImageForFoldder(buf, mime);
      const key = buildUserAssetObjectKey({
        userEmail,
        folder: "datasets/copilot-images",
        filename: `foto-${Date.now()}.${normalized.ext}`,
      });
      await uploadBufferToS3Key(key, normalized.buffer, normalized.contentType);
      const url = stableKnowledgeFileUrlFromKey(key) || key;
      return { url, s3Key: key };
    } catch {
      continue;
    }
  }
  return null;
}

function firstTextLabel(columns: ColumnSpec[], imageColumn: string | undefined): string | null {
  const col = columns.find((c) => c.type !== "image" && c.label !== imageColumn) ?? columns[0];
  return col?.label ?? null;
}

export async function POST(req: NextRequest) {
  let authEmail = "";
  let usageEmail: string | undefined;
  try {
    await assertApiServiceEnabled("openai-dataset-assistant");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    authEmail = authState.user.email;
    usageEmail = authState.user.email;
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as EnrichBody;
  const query = (body.query ?? "").trim();
  const columns = Array.isArray(body.columns) ? body.columns.filter((c) => c && c.label) : [];
  const imageColumn = (body.imageColumn ?? "").trim() || undefined;
  const maxRows = Math.max(1, Math.min(ASSISTANT_CAPS.maxWebRows, Number(body.maxRows) || 25));

  if (!query || columns.length === 0) {
    return NextResponse.json({ error: "Faltan query o columnas." }, { status: 400 });
  }

  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      const warnings: string[] = [];
      try {
        if (!tavilyKey) {
          emit({ type: "error", message: "Búsqueda web no configurada (falta TAVILY_API_KEY)." });
          controller.close();
          return;
        }
        if (!openaiKey) {
          emit({ type: "error", message: "OPENAI_API_KEY no configurada." });
          controller.close();
          return;
        }

        // 1) Búsqueda web.
        emit({ type: "phase", phase: "search", message: "Buscando en la web…" });
        const search = await tavilySearch(tavilyKey, query, {
          maxResults: 8,
          rawContent: true,
          images: false,
          depth: "advanced",
        });
        if (search.results.length === 0) {
          emit({ type: "done", rows: [], columns, citations: [], warnings: ["La búsqueda no devolvió resultados."] });
          controller.close();
          return;
        }

        // 2) Extracción estructurada.
        emit({ type: "phase", phase: "extract", message: "Extrayendo datos de las fuentes…" });
        const sourcesBlock = search.results
          .slice(0, 8)
          .map((r, i) => `### Fuente ${i + 1}: ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 2500)}`)
          .join("\n\n");
        const columnsBlock = columns.map((c) => `- ${c.label} (${c.type})`).join("\n");

        const openai = new OpenAI({ apiKey: openaiKey });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 3000,
          messages: [
            {
              role: "system",
              content:
                "Extraes filas estructuradas SOLO a partir de las fuentes dadas. NO inventes datos: si un dato no aparece en las fuentes, déjalo vacío. Para columnas de tipo image deja el valor vacío (las fotos se obtienen aparte). Devuelve JSON estricto: {\"rows\":[{\"cells\":{\"<label>\":valor},\"source\":\"url de la fuente principal de esa fila\"}],\"note\":\"aviso opcional\"}. Respeta el número máximo de filas indicado.",
            },
            {
              role: "user",
              content: `Petición: ${query}\n\nColumnas a rellenar:\n${columnsBlock}\n\nMáximo de filas: ${maxRows}\n\nFuentes:\n${sourcesBlock}`,
            },
          ],
        });

        const usage = completion.usage;
        if (usage) {
          await recordApiUsage({
            provider: "openai",
            userEmail: usageEmail,
            serviceId: "openai-dataset-assistant",
            route: "/api/spaces/datasets/assistant/enrich",
            model: "gpt-4o",
            operation: "enrich",
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            projectId: typeof body.projectId === "string" ? body.projectId.trim() || undefined : undefined,
            workspaceId: typeof body.workspaceId === "string" ? body.workspaceId.trim() || undefined : undefined,
          });
        }

        const raw = completion.choices[0]?.message?.content || "{}";
        let parsed: { rows?: Array<{ cells?: Record<string, unknown>; source?: string }>; note?: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { rows: [] };
        }
        const note = typeof parsed.note === "string" ? parsed.note.trim() : "";
        if (note) warnings.push(note);

        const labelSet = new Set(columns.map((c) => c.label.toLowerCase()));
        const rows = (Array.isArray(parsed.rows) ? parsed.rows : [])
          .slice(0, maxRows)
          .map((r) => {
            const cellsRaw = r.cells && typeof r.cells === "object" ? r.cells : {};
            const cells: Record<string, string | number | boolean> = {};
            for (const [k, v] of Object.entries(cellsRaw)) {
              if (!labelSet.has(k.toLowerCase())) continue;
              if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") cells[k] = v;
              else if (v != null) cells[k] = String(v);
            }
            return { cells, source: typeof r.source === "string" ? r.source : undefined } as {
              cells: Record<string, unknown>;
              source?: string;
            };
          });

        // 3) Fotos de cara (opcional).
        if (imageColumn && rows.length > 0) {
          const nameLabel = firstTextLabel(columns, imageColumn);
          const targetRows = rows.slice(0, ASSISTANT_CAPS.maxImages);
          if (rows.length > ASSISTANT_CAPS.maxImages) {
            warnings.push(`Solo se buscaron fotos para las primeras ${ASSISTANT_CAPS.maxImages} filas.`);
          }
          let geminiVerify = Boolean(geminiKey);
          if (geminiVerify) {
            try {
              await assertApiServiceEnabled("gemini-search-verify");
            } catch {
              geminiVerify = false;
            }
          }
          let done = 0;
          for (const row of targetRows) {
            done += 1;
            const name = nameLabel ? String(row.cells[nameLabel] ?? "").trim() : "";
            emit({
              type: "phase",
              phase: "images",
              message: name ? `Trayendo foto: ${name}` : "Trayendo fotos…",
              current: done,
              total: targetRows.length,
            });
            if (!name) continue;
            try {
              const imgSearch = await tavilySearch(tavilyKey, `${name} ${query} foto cara retrato`, {
                maxResults: 6,
                images: true,
                depth: "basic",
              });
              let candidates = imgSearch.images;
              if (geminiVerify && geminiKey && candidates.length > 1) {
                try {
                  const filtered = await filterImageUrlsByIntent(candidates, `foto de cara / retrato de ${name}`, geminiKey, {
                    targetCount: 3,
                    usageUserEmail: usageEmail,
                  });
                  if (filtered.length > 0) candidates = filtered;
                } catch {
                  /* verificación best-effort */
                }
              }
              const stored = candidates.length > 0 ? await fetchAndStoreImage(candidates, authEmail) : null;
              if (stored) {
                row.cells[imageColumn] = { kind: "image", url: stored.url, s3Key: stored.s3Key };
              }
            } catch {
              /* sin foto para esta fila */
            }
          }
        }

        // 4) Citas.
        const citationSeen = new Set<string>();
        const citations: Array<{ url: string; title?: string }> = [];
        for (const r of search.results) {
          if (r.url && !citationSeen.has(r.url)) {
            citationSeen.add(r.url);
            citations.push({ url: r.url, title: r.title || undefined });
          }
        }

        emit({ type: "done", rows, columns, citations, warnings });
        controller.close();
      } catch (error) {
        console.error("[datasets/assistant/enrich]", error);
        try {
          emit({ type: "error", message: error instanceof Error ? error.message : "Error en la búsqueda." });
        } catch {
          /* stream ya cerrado */
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
