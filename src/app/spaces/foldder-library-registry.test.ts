import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  buildFoldderLibraryView,
  getFoldderLibraryFromMetadata,
  orphanLibraryAssetsForRemovedNodes,
  reconcileFoldderLibraryRegistry,
  renameLibraryAsset,
  stableLibraryAssetId,
} from "./foldder-library-registry";
import { createProjectExportFile } from "./project-files";

describe("foldder-library-registry", () => {
  it("marca huérfanos cuando el nodo origen desaparece", () => {
    const dedupe = "s3:projects/demo/image.png";
    const id = stableLibraryAssetId("generated", dedupe);
    const registry = {
      version: 1 as const,
      items: [
        {
          id,
          dedupeKey: dedupe,
          bucket: "generated" as const,
          lifecycle: "active" as const,
          displayName: "Nano Banana 1.png",
          url: "https://cdn.example.com/image.png",
          kind: "image" as const,
          sourceNodeId: "node-1",
          sourceLabel: "nanoBanana",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    };

    const orphaned = orphanLibraryAssetsForRemovedNodes(registry, ["node-1"]);
    expect(orphaned.items[0]?.lifecycle).toBe("orphaned");

    const reconciled = reconcileFoldderLibraryRegistry({
      nodes: [],
      assetsMetadata: {},
      projectScopeId: "p1",
      registry: orphaned,
    });
    expect(reconciled.items.find((item) => item.id === id)?.lifecycle).toBe("orphaned");
  });

  it("reactiva assets cuando el nodo vuelve al grafo", () => {
    const url = "https://cdn.example.com/live.png";
    const nodes: Node[] = [
      {
        id: "nb-1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: { value: url, type: "image" },
      },
    ];
    const dedupe = url;
    const id = stableLibraryAssetId("generated", dedupe);
    const registry = {
      version: 1 as const,
      items: [
        {
          id,
          dedupeKey: dedupe,
          bucket: "generated" as const,
          lifecycle: "orphaned" as const,
          displayName: "Imagen IA",
          url,
          kind: "image" as const,
          sourceNodeId: "nb-1",
          sourceLabel: "nanoBanana",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    };

    const next = reconcileFoldderLibraryRegistry({
      nodes,
      assetsMetadata: {},
      projectScopeId: "p1",
      registry,
    });
    expect(next.items.find((item) => item.id === id)?.lifecycle).toBe("active");
  });

  it("incluye exports automáticos y manuales en exportados", () => {
    const exportFile = createProjectExportFile({
      name: "hero.png",
      extension: ".png",
      fileUrl: "https://cdn.example.com/hero.png",
      thumbnailUrl: "https://cdn.example.com/hero.png",
      mimeType: "image/png",
      exportedFrom: "imageExport",
    });

    const reconciled = reconcileFoldderLibraryRegistry({
      nodes: [],
      assetsMetadata: {},
      projectScopeId: "p1",
      projectFiles: { version: 1, items: [exportFile] },
      registry: getFoldderLibraryFromMetadata({}),
    });

    const view = buildFoldderLibraryView({
      registry: reconciled,
      liveNodeIds: new Set(),
    });
    expect(view.exported.some((item) => item.displayName.includes("hero"))).toBe(true);
  });

  it("persiste displayName al renombrar", () => {
    const registry = getFoldderLibraryFromMetadata({
      foldderLibrary: {
        version: 1,
        items: [
          {
            id: "lib_imported_key",
            dedupeKey: "key",
            bucket: "imported",
            lifecycle: "active",
            displayName: "Antes",
            kind: "image",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
    });
    const next = renameLibraryAsset(registry, "lib_imported_key", "Después");
    expect(next.items[0]?.displayName).toBe("Después");
  });
});
