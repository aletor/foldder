import { NextRequest } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { runGenomaDocumentProbe } from "@/lib/genoma/studio/document-probe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSpacesAuthUser(req);
    if (!auth.ok) return auth.response;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return Response.json({ error: "Archivo requerido" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await runGenomaDocumentProbe({
      buffer,
      fileName: file.name,
      mime: file.type || "application/octet-stream",
    });

    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de análisis";
    return Response.json({ error: message }, { status: 500 });
  }
}
