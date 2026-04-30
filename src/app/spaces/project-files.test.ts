import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { collectFoldderLibrarySections } from "./foldder-library";
import {
  createProjectExportFile,
  getProjectFilesFromMetadata,
  reconcileProjectFilesFromNodes,
  setProjectFilesInMetadata,
  upsertProjectFile,
  type ProjectFile,
} from "./project-files";

describe("ProjectFiles metadata", () => {
  it("normaliza exports antiguos/incompletos como category exports", () => {
    const metadata = {
      projectFiles: {
        version: 1,
        items: [
          {
            id: "legacy-export",
            name: "Deck.pdf",
            kind: "export",
            createdAt: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    };

    const files = getProjectFilesFromMetadata(metadata);
    expect(files.items[0]?.category).toBe("exports");
    expect(files.items[0]?.extension).toBe(".export");
  });

  it("reconcilia nodos Studio como Media Files sin crear exports", () => {
    const nodes: Node[] = [
      {
        id: "designer-1",
        type: "designer",
        position: { x: 0, y: 0 },
        data: { label: "Deck OARO", value: "data:image/png;base64,thumb" },
      },
    ];

    const files = reconcileProjectFilesFromNodes({}, nodes);
    expect(files.items).toHaveLength(1);
    expect(files.items[0]).toMatchObject({
      kind: "designer",
      extension: ".design",
      backingNodeId: "designer-1",
    });
    expect(files.items[0]?.category).not.toBe("exports");
  });

  it("upsert de un export no sustituye el archivo editable fuente", () => {
    const designFile: ProjectFile = {
      id: "file-design",
      name: "Deck OARO.design",
      kind: "designer",
      extension: ".design",
      nodeType: "designer",
      backingNodeId: "designer-1",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    };
    const metadata = setProjectFilesInMetadata({}, { version: 1, items: [designFile] });
    const exportFile = createProjectExportFile({
      name: "Deck OARO.pdf",
      extension: ".pdf",
      sourceFileId: designFile.id,
      sourceNodeId: designFile.backingNodeId,
      mimeType: "application/pdf",
      exportedFrom: "designer",
      exportFormat: "pdf",
    });

    const next = upsertProjectFile(metadata, exportFile);
    expect(next.items.some((file) => file.id === designFile.id)).toBe(true);
    expect(next.items.some((file) => file.kind === "export" && file.category === "exports")).toBe(true);
  });
});

describe("Foldder library sections", () => {
  it("separa Media Files y Exports desde la misma fuente projectFiles", () => {
    const designFile: ProjectFile = {
      id: "file-design",
      name: "Deck OARO.design",
      kind: "designer",
      extension: ".design",
      nodeType: "designer",
      backingNodeId: "designer-1",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    };
    const exportFile = createProjectExportFile({
      name: "Deck OARO.pdf",
      extension: ".pdf",
      sourceFileId: designFile.id,
      sourceNodeId: designFile.backingNodeId,
      exportedFrom: "designer",
      exportFormat: "pdf",
    });

    const sections = collectFoldderLibrarySections({
      nodes: [],
      assetsMetadata: {},
      projectScopeId: "project-1",
      projectFiles: { version: 1, items: [designFile, exportFile] },
    });

    expect(sections.mediaFiles.map((file) => file.id)).toEqual(["file-design"]);
    expect(sections.exports.map((file) => file.id)).toEqual([exportFile.id]);
  });
});
