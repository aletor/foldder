import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignerPageState } from "./DesignerNode";
import type { FreehandObject } from "../FreehandStudio";
import { DEFAULT_DESIGNER_PAGE_FORMAT } from "../indesign/page-formats";
import { importDesignerDeFile, packDesignerDeFile } from "./designer-document-file";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAD0lEQVR42mP8z5/hBQAFgwJ/lQ3+1wAAAABJRU5ErkJggg==";

const blobStore = new Map<string, Blob>();
let blobCounter = 0;

beforeEach(() => {
  blobStore.clear();
  blobCounter = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("data:")) {
        const base64 = url.split(",")[1] ?? "";
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "image/png" });
        return { ok: true, blob: async () => blob } as Response;
      }
      if (url.startsWith("blob:")) {
        const blob = blobStore.get(url);
        if (!blob) throw new Error(`missing blob ${url}`);
        return { ok: true, blob: async () => blob } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const id = `blob:test-${blobCounter++}`;
    blobStore.set(id, blob);
    return id;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    blobStore.delete(url);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sampleDocumentPages(): DesignerPageState[] {
  const nestedImage = {
    id: "img-nested",
    type: "image",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    src: TINY_PNG,
    intrinsicRatio: 1,
    _designerDatasetBinding: {
      listId: "",
      listKey: "",
      fieldId: "",
      fieldKey: "",
      kind: "image" as const,
      slotLabel: "Foto jugador",
      slotId: "slot-player-photo",
    },
  } as unknown as FreehandObject;

  const folder = {
    id: "folder1",
    type: "groupContainer",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    children: [nestedImage],
  } as unknown as FreehandObject;

  const text = {
    id: "txt1",
    type: "text",
    x: 10,
    y: 10,
    width: 200,
    height: 40,
    textMode: "point",
    text: "Messi",
    fontFamily: "Helvetica",
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: 0,
    textAlign: "left",
    _designerDatasetBinding: {
      source: "list" as const,
      listId: "list-players",
      listKey: "players",
      fieldId: "f_name",
      fieldKey: "name",
      kind: "text" as const,
    },
    _designerDatasetPropertyBindings: {
      fontSize: {
        propertyKey: "fontSize",
        source: "list" as const,
        listId: "list-players",
        listKey: "players",
        fieldId: "f_size",
        fieldKey: "size",
      },
    },
  } as unknown as FreehandObject;

  return [
    {
      id: "page-1",
      format: DEFAULT_DESIGNER_PAGE_FORMAT,
      objects: [folder, text],
      datasetRowIndex: 0,
      datasetLoopListId: "list-players",
      datasetLoopCardId: "card-messi",
      slideKey: "slide-portada",
      slideName: "Portada",
    },
  ];
}

function findObjectById(objects: FreehandObject[], id: string): FreehandObject | undefined {
  for (const obj of objects) {
    if (obj.id === id) return obj;
    if (obj.type === "groupContainer") {
      const nested = findObjectById(obj.children, id);
      if (nested) return nested;
    }
    if (obj.type === "clippingContainer") {
      const nested = findObjectById(obj.content, id);
      if (nested) return nested;
    }
    if (obj.type === "booleanGroup") {
      const nested = findObjectById(obj.children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

describe("designer-document-file", () => {
  it("roundtrip conserva bindings dinámicos, bucle y metadatos de slide", async () => {
    const pages = sampleDocumentPages();
    const blob = await packDesignerDeFile({
      pages,
      activePageIndex: 0,
      autoImageOptimization: true,
    });
    const file = new File([blob], "test.de", { type: "application/zip" });
    const imported = await importDesignerDeFile(file);

    expect(imported.activePageIndex).toBe(0);
    expect(imported.autoImageOptimization).toBe(true);
    expect(imported.pages).toHaveLength(1);

    const page = imported.pages[0]!;
    expect(page.slideKey).toBe("slide-portada");
    expect(page.slideName).toBe("Portada");
    expect(page.datasetRowIndex).toBe(0);
    expect(page.datasetLoopListId).toBe("list-players");
    expect(page.datasetLoopCardId).toBe("card-messi");

    const img = findObjectById(page.objects, "img-nested");
    expect(img?.type).toBe("image");
    expect((img as { src?: string }).src).toMatch(/^blob:/);
    expect(img?._designerDatasetBinding).toMatchObject({
      slotId: "slot-player-photo",
      slotLabel: "Foto jugador",
      kind: "image",
    });

    const txt = findObjectById(page.objects, "txt1");
    expect(txt?._designerDatasetBinding).toMatchObject({
      listId: "list-players",
      fieldId: "f_name",
      kind: "text",
    });
    expect(txt?._designerDatasetPropertyBindings?.fontSize).toMatchObject({
      propertyKey: "fontSize",
      fieldId: "f_size",
    });
  });
});
