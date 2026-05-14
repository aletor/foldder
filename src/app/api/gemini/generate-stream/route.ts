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
