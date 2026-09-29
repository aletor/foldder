import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/spaces-access-control", () => ({
  requireSpacesAuthUser: vi.fn(async () => ({
    ok: true,
    user: { email: "writer@local.foldder", image: null, name: "Writer" },
  })),
}));

vi.mock("@/lib/writer-document-store", () => ({
  readWriterDocument: vi.fn(),
  writeWriterDocument: vi.fn(),
  WriterDocumentStoreError: class WriterDocumentStoreError extends Error {
    status = 400;
  },
}));

import { readWriterDocument, writeWriterDocument } from "@/lib/writer-document-store";
import { GET, PUT } from "./route";

const documentId = "44444444-4444-4444-8444-444444444444";

describe("/api/spaces/writer-document", () => {
  beforeEach(() => {
    readWriterDocument.mockReset();
    writeWriterDocument.mockReset();
  });

  it("reads the document for the signed-in user", async () => {
    readWriterDocument.mockResolvedValue({
      schemaVersion: 1,
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    const response = await GET(new Request(`http://localhost/api/spaces/writer-document?documentId=${documentId}`));
    expect(response.status).toBe(200);
    expect(readWriterDocument).toHaveBeenCalledWith("writer@local.foldder", documentId);
  });

  it("writes the tree and returns only the file key", async () => {
    writeWriterDocument.mockResolvedValue({
      documentKey: "knowledge-files/user-assets/abc/writer-documents/doc.json",
    });
    const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] };
    const response = await PUT(
      new Request("http://localhost/api/spaces/writer-document", {
        method: "PUT",
        body: JSON.stringify({ documentId, content }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { documentKey: string; content?: unknown };
    expect(body.documentKey).toContain("writer-documents");
    expect(body.content).toBeUndefined();
    expect(writeWriterDocument).toHaveBeenCalledWith("writer@local.foldder", documentId, {
      content,
      story: undefined,
      memory: undefined,
      dismissals: undefined,
    });
  });

  it("rejects an id that is not a document id", async () => {
    const response = await GET(new Request("http://localhost/api/spaces/writer-document?documentId=../secret"));
    expect(response.status).toBe(400);
    expect(readWriterDocument).not.toHaveBeenCalled();
  });
});
