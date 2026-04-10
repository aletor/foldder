import { NextRequest } from "next/server";
import { geminiImageGenerate, GeminiGenerateError } from "@/lib/gemini-image-generate";

/**
 * Misma carga útil que POST /api/gemini/generate, pero respuesta NDJSON:
 * líneas {"type":"phase"|"progress","progress":n,"stage":"..."} y cierre {"type":"done",...}
 * o {"type":"error","error":"..."}.
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const body = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        const result = await geminiImageGenerate(
          body,
          (progress, stage) => {
            send({ type: "phase", progress, stage });
          },
          { usageRoute: "/api/gemini/generate-stream" },
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
