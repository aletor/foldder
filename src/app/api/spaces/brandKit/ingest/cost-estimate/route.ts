import { NextRequest } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { estimateBrandKitIngestCost } from "@/lib/brandkit/ingest/brand-kit-ingest-cost-estimate";
import { buildBrandKitIngestFileHintsFromBuffers } from "@/lib/brandkit/ingest/brand-kit-ingest-file-hints-server";

export const runtime = "nodejs";

function collectUploadFiles(formData: FormData): File[] {
  const plural = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (plural.length > 0) return plural;
  return formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
}

export async function POST(req: NextRequest) {
  const auth = await requireSpacesAuthUser(req);
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("FormData")
        ? "El archivo supera el límite de subida del servidor. Prueba con un PDF más pequeño o contacta soporte."
        : error instanceof Error
          ? error.message
          : "No se pudo leer el formulario de subida";
    return Response.json({ error: message }, { status: 413 });
  }

  const enableLlm = formData.get("enableLlm") !== "false";
  const files = collectUploadFiles(formData);

  if (!files.length) {
    return Response.json({ error: "No files" }, { status: 400 });
  }

  const buffers = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mime: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );

  const hints = await buildBrandKitIngestFileHintsFromBuffers(buffers);
  const estimate = estimateBrandKitIngestCost(hints, enableLlm);

  return Response.json({ hints, estimate });
}
