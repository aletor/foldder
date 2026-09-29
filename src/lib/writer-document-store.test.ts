import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
  handlers: {},
  hasGoogleProvider: false,
}));

import { spacesOwnerHash } from "@/lib/spaces-access-control";
import {
  readWriterDocument,
  writeWriterDocument,
  writerDocumentObjectKey,
  WriterDocumentStoreError,
} from "@/lib/writer-document-store";

const documentId = "33333333-3333-4333-8333-333333333333";
const email = "writer@local.foldder";
let root = "";

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe("writer document store", () => {
  it("keeps the file under the owner and out of the space graph", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "writer-doc-"));
    const key = writerDocumentObjectKey(email, documentId);
    expect(key).toContain(spacesOwnerHash(email));
    expect(key).toContain(`/writer-documents/${documentId}.json`);
    expect(key).not.toContain(spacesOwnerHash("other@local.foldder"));

    const content = {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text: "Capítulo" }] }],
    };
    const saved = await writeWriterDocument(
      email,
      documentId,
      { content, memory: [{ id: "casa", kind: "canon", text: "María vive en la casa" }] },
      { localRoot: root, s3Enabled: false },
    );
    expect(saved.documentKey).toBe(key);

    const loaded = await readWriterDocument(email, documentId, { localRoot: root, s3Enabled: false });
    expect(loaded?.content).toEqual(content);
    expect(loaded?.memory?.[0]).toMatchObject({ id: "casa", kind: "canon", status: "established", text: "María vive en la casa" });
    expect(await readWriterDocument("other@local.foldder", documentId, { localRoot: root, s3Enabled: false })).toBeNull();
  });

  it("reads a v1 file with more than 80 notes without dropping any", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "writer-doc-"));
    const owner = spacesOwnerHash(email);
    const file = path.join(root, owner, `${documentId}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const memory = Array.from({ length: 100 }, (_, index) => ({
      id: `note-${index}`,
      kind: "canon",
      text: `Nota ${index} del archivo viejo`,
      scope: index % 2 === 0 ? { type: "entity", entityId: "ana" } : undefined,
    }));
    await fs.writeFile(
      file,
      JSON.stringify({ schemaVersion: 1, content: { type: "doc", content: [{ type: "paragraph" }] }, memory }),
    );
    const loaded = await readWriterDocument(email, documentId, { localRoot: root, s3Enabled: false });
    expect(loaded?.schemaVersion).toBe(2);
    expect(loaded?.memory).toHaveLength(100);
    expect(loaded?.story.entities.some((entity) => entity.notes.some((note) => note.id === "note-99"))).toBe(true);
    expect(loaded?.memory?.find((entry) => entry.id === "note-80")?.text).toBe("Nota 80 del archivo viejo");
  });

  it("reads an older file that has no memory list", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "writer-doc-"));
    const owner = spacesOwnerHash(email);
    const file = path.join(root, owner, `${documentId}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, content: { type: "doc", content: [{ type: "paragraph" }] } }));
    const loaded = await readWriterDocument(email, documentId, { localRoot: root, s3Enabled: false });
    expect(loaded?.memory).toEqual([]);
  });

  it("rejects a document that is not a tree", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "writer-doc-"));
    await expect(
      writeWriterDocument(email, documentId, { content: { type: "paragraph" } }, { localRoot: root, s3Enabled: false }),
    ).rejects.toBeInstanceOf(WriterDocumentStoreError);
  });
});
