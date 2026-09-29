import { type WriterDocumentContent } from "./writer-document";
import type { WriterMemoryEntry } from "./writer-memory";
import { migrateMemoryToStory, normalizeStory, projectWriterMemory, type WriterStory } from "./writer-story";

export type WriterDocumentFile = {
  content: WriterDocumentContent;
  story: WriterStory;
  memory: WriterMemoryEntry[];
  dismissals: string[];
};

async function readPayload(response: Response): Promise<{
  error?: string;
  content?: WriterDocumentContent;
  story?: unknown;
  memory?: unknown;
  dismissals?: unknown;
  documentKey?: string;
}> {
  return (await response.json().catch(() => ({}))) as {
    error?: string;
    content?: WriterDocumentContent;
    story?: unknown;
    memory?: unknown;
    dismissals?: unknown;
    documentKey?: string;
  };
}

export async function fetchWriterDocument(documentId: string): Promise<WriterDocumentFile> {
  const response = await fetch(`/api/spaces/writer-document?documentId=${encodeURIComponent(documentId)}`);
  const payload = await readPayload(response);
  if (!response.ok || !payload.content || payload.content.type !== "doc") {
    throw new Error(payload.error || "No se ha podido abrir el documento");
  }
  const story = normalizeStory(payload.story) ?? migrateMemoryToStory(payload.memory);
  return {
    content: payload.content,
    story,
    memory: projectWriterMemory(story),
    dismissals: Array.isArray(payload.dismissals) ? payload.dismissals.filter((item): item is string => typeof item === "string") : [],
  };
}

export async function putWriterDocument(
  documentId: string,
  content: WriterDocumentContent,
  story: WriterStory,
  dismissals: string[] = [],
): Promise<{ documentKey: string }> {
  const response = await fetch("/api/spaces/writer-document", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, content, story, dismissals }),
  });
  const payload = await readPayload(response);
  if (!response.ok || !payload.documentKey) {
    throw new Error(payload.error || "No se ha podido guardar el documento");
  }
  return { documentKey: payload.documentKey };
}
