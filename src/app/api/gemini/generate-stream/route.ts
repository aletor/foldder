import { NextRequest } from "next/server";
import { geminiImageGenerate, GeminiGenerateError } from "@/lib/gemini-image-generate";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

/**
 * Misma carga útil que POST /api/gemini/generate, pero respuesta NDJSON:
 * líneas {"type":"phase"|"progress","progress":n,"stage":"..."} y cierre {"type":"done",...}
 * o {"type":"error","error":"..."}.
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const authState = await requireSpacesAuthUser(req);
  if (!authState.ok) return authState.response;
  const usageUserEmail = authState.user.email;
  const body = await req.json();
  logAdvancedImagePromptPayload(body);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        await assertApiServiceEnabled("gemini-nano");
        const result = await geminiImageGenerate(
          body,
          (progress, stage) => {
            send({ type: "phase", progress, stage });
          },
          { usageRoute: "/api/gemini/generate-stream", usageUserEmail },
        );
        const done: Record<string, unknown> = {
          type: "done",
          output: result.output,
          key: result.key,
          model: result.model,
          time: result.time,
        };
        send(done);
      } catch (err: unknown) {
        if (err instanceof ApiServiceDisabledError) {
          send({
            type: "error",
            error: `API bloqueada en admin: ${err.label}`,
            status: 423,
          });
          return;
        }
        if (err instanceof GeminiGenerateError) {
          send({
            type: "error",
            error: err.message,
            details: err.details,
            status: err.status,
          });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          send({ type: "error", error: message, status: 500 });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

type AdvancedPromptBlockLog = {
  category?: string;
  correctionId: string;
  hasIntegration: boolean;
  hasPhotographicFit: boolean;
  identityAnchor?: string;
  integration?: string;
  originalVisualReference?: string;
  phase: string;
  spatialGuide?: string;
  visualDirection?: string;
};

function logAdvancedImagePromptPayload(body: unknown): void {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const prompt = typeof record.prompt === "string" ? record.prompt : "";
  if (!prompt.includes("IMAGE CREATION ADVANCED - NON DESTRUCTIVE BATCH EDIT")) return;

  const blocks = summarizeAdvancedPromptBlocks(prompt);
  const images = Array.isArray(record.images) ? record.images : [];
  console.info("[gemini/generate-stream] advanced-image prompt sent", {
    blockCount: blocks.length,
    blocks,
    imageCount: images.length,
    model: typeof record.model === "string" ? record.model : undefined,
    promptBytes: Buffer.byteLength(prompt, "utf8"),
  });
}

function summarizeAdvancedPromptBlocks(prompt: string): AdvancedPromptBlockLog[] {
  const blocks: AdvancedPromptBlockLog[] = [];
  let current: AdvancedPromptBlockLog | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const rawLine of prompt.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = line.match(
      /^(RECONSTRUCT ACCEPTED PREVIOUS CHANGE|APPLY NEW CHANGE|APPLY RESOLVED CHANGE)\s+\d+\s+\(([^)]+)\):$/,
    );
    if (header) {
      flush();
      current = {
        correctionId: header[2],
        hasIntegration: false,
        hasPhotographicFit: false,
        phase: header[1],
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("- Category:")) current.category = cleanLogLine(line.replace("- Category:", ""));
    if (line.startsWith("- Integration:")) {
      current.hasIntegration = true;
      current.integration = truncateLogLine(line.replace("- Integration:", ""));
    }
    if (line.includes("Photographic fit:")) current.hasPhotographicFit = true;
    if (line.startsWith("- Use REF-ID-")) current.identityAnchor = cleanLogLine(line.replace("- Use ", "").replace(" as identity anchor.", ""));
    if (line.startsWith("- Original visual reference:")) {
      current.originalVisualReference = cleanLogLine(line.replace("- Original visual reference:", ""));
    }
    if (line.startsWith("- Use REF-DIR-")) current.visualDirection = cleanLogLine(line.replace("- Use ", ""));
    if (line.startsWith("- Spatial guide:")) current.spatialGuide = cleanLogLine(line.replace("- Spatial guide:", ""));
  }
  flush();
  return blocks;
}

function cleanLogLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncateLogLine(value: string, max = 220): string {
  const cleaned = cleanLogLine(value);
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}
