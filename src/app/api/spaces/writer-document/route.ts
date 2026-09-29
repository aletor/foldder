import { NextResponse } from "next/server";
import { isWriterDocumentId } from "@/app/spaces/writer/writer-document";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  readWriterDocument,
  writeWriterDocument,
  WriterDocumentStoreError,
} from "@/lib/writer-document-store";

export const runtime = "nodejs";

function storeErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof WriterDocumentStoreError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const documentId = new URL(req.url).searchParams.get("documentId") || "";
    if (!isWriterDocumentId(documentId)) {
      return NextResponse.json({ error: "Documento no válido" }, { status: 400 });
    }

    const stored = await readWriterDocument(authState.user.email, documentId);
    if (!stored) return NextResponse.json({ error: "No se encuentra el documento" }, { status: 404 });
    return NextResponse.json({
      documentId,
      content: stored.content,
      story: stored.story,
      memory: stored.memory ?? [],
      dismissals: stored.dismissals ?? [],
    });
  } catch (error) {
    const mapped = storeErrorResponse(error);
    if (mapped) return mapped;
    console.error("[writer-document] read failed", error);
    return NextResponse.json({ error: "No se ha podido leer el documento" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as { documentId?: unknown; content?: unknown; story?: unknown; memory?: unknown; dismissals?: unknown };
    if (!isWriterDocumentId(body.documentId)) {
      return NextResponse.json({ error: "Documento no válido" }, { status: 400 });
    }

    const saved = await writeWriterDocument(authState.user.email, body.documentId, {
      content: body.content,
      story: body.story,
      memory: body.memory,
      dismissals: body.dismissals,
    });
    return NextResponse.json({ documentId: body.documentId, documentKey: saved.documentKey });
  } catch (error) {
    const mapped = storeErrorResponse(error);
    if (mapped) return mapped;
    console.error("[writer-document] write failed", error);
    return NextResponse.json({ error: "No se ha podido guardar el documento" }, { status: 500 });
  }
}
