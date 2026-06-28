import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { collectProjectMedia, projectMediaDedupeKey } from "./project-media-inventory";

describe("projectMediaDedupeKey", () => {
  it("agrupa distintas prefirmas del mismo objeto knowledge-files", () => {
    const a =
      "https://example.s3.amazonaws.com/knowledge-files/foo/bar.png?X-Amz-Signature=aaa";
    const b =
      "https://example.s3.amazonaws.com/knowledge-files/foo/bar.png?X-Amz-Signature=bbb";
    expect(projectMediaDedupeKey(a)).toBe(projectMediaDedupeKey(b));
    expect(projectMediaDedupeKey(a)).toBe("s3:knowledge-files/foo/bar.png");
  });

  it("sin clave knowledge-files usa la URL tal cual", () => {
    const u = "https://cdn.example.com/img.png?v=1";
    expect(projectMediaDedupeKey(u)).toBe(u);
  });
});

describe("collectProjectMedia", () => {
  it("no duplica generados cuando el mismo S3 aparece con prefirmas distintas", () => {
    const keyPath = "knowledge-files/proj/x.png";
    const url1 = `https://bucket.s3.amazonaws.com/${keyPath}?sig=one`;
    const url2 = `https://bucket.s3.amazonaws.com/${keyPath}?sig=two`;
    const nodes: Node[] = [
      {
        id: "nb1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: { value: url1, type: "image" },
      },
      {
        id: "nb2",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: { value: url2, type: "image" },
      },
    ];
    const { generated } = collectProjectMedia(nodes);
    expect(generated).toHaveLength(1);
    expect(generated[0]?.url).toBe(url1);
  });

  it("recoge media solo en s3Key (sin value URL)", () => {
    const key = "knowledge-files/proj/nano-out.png";
    const nodes: Node[] = [
      {
        id: "nb1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: { s3Key: key, type: "image", generatedByAi: true },
      },
    ];
    const { generated } = collectProjectMedia(nodes);
    expect(generated).toHaveLength(1);
    expect(generated[0]?.nodeId).toBe("nb1");
    expect(generated[0]?.url).toContain(encodeURIComponent(key));
  });

  it("recoge frames de Cine almacenados como imageS3Key", () => {
    const key = "knowledge-files/proj/cine-frame.png";
    const nodes: Node[] = [
      {
        id: "cine1",
        type: "cine",
        position: { x: 0, y: 0 },
        data: {
          characters: [],
          backgrounds: [],
          scenes: [
            {
              id: "s1",
              frames: {
                single: { id: "f1", imageS3Key: key, status: "generated" },
              },
            },
          ],
        },
      },
    ];
    const { generated } = collectProjectMedia(nodes);
    expect(generated.length).toBeGreaterThanOrEqual(1);
    expect(generated.some((item) => item.nodeId === "cine1")).toBe(true);
  });

  it("Inspiration: solo la referencia seleccionada, no todo el grid de búsqueda", () => {
    const selectedUrl = "https://images.pexels.com/photos/selected.jpg";
    const nodes: Node[] = [
      {
        id: "insp1",
        type: "inspiration",
        position: { x: 0, y: 0 },
        data: {
          status: "output",
          value: selectedUrl,
          selected: { id: "r1", imageUrl: selectedUrl, thumbUrl: "https://images.pexels.com/photos/selected-thumb.jpg" },
          results: [
            { id: "r1", imageUrl: selectedUrl, thumbUrl: "https://images.pexels.com/photos/selected-thumb.jpg" },
            { id: "r2", imageUrl: "https://images.pexels.com/photos/other-a.jpg", thumbUrl: "https://images.pexels.com/photos/other-a-thumb.jpg" },
            { id: "r3", imageUrl: "https://images.pexels.com/photos/other-b.jpg", thumbUrl: "https://images.pexels.com/photos/other-b-thumb.jpg" },
          ],
        },
      },
    ];
    const { imported } = collectProjectMedia(nodes);
    expect(imported).toHaveLength(1);
    expect(imported[0]?.url).toBe(selectedUrl);
    expect(imported[0]?.sourceLabel).toBe("Inspiration");
  });

  it("Inspiration sin selección no aporta importados", () => {
    const nodes: Node[] = [
      {
        id: "insp1",
        type: "inspiration",
        position: { x: 0, y: 0 },
        data: {
          status: "results",
          results: [
            { id: "r1", imageUrl: "https://images.pexels.com/photos/a.jpg", thumbUrl: "https://images.pexels.com/photos/a-thumb.jpg" },
          ],
        },
      },
    ];
    const { imported } = collectProjectMedia(nodes);
    expect(imported).toHaveLength(0);
  });

  it("Populate: recoge todas las imágenes de lastRunOutputs y mediaListOutput", () => {
    const keyA = "knowledge-files/proj/pop-a.png";
    const keyB = "knowledge-files/proj/pop-b.png";
    const urlA = `/api/spaces/s3-file?key=${encodeURIComponent(keyA)}`;
    const urlB = `/api/spaces/s3-file?key=${encodeURIComponent(keyB)}`;
    const nodes: Node[] = [
      {
        id: "pop1",
        type: "populate",
        position: { x: 0, y: 0 },
        data: {
          value: urlA,
          lastRunOutputs: [urlA, urlB],
          mediaListOutput: {
            kind: "media_list",
            items: [
              { id: "i1", order: 0, title: "Fila 1", mediaType: "image", url: urlA, s3Key: keyA, status: "generated" },
              { id: "i2", order: 1, title: "Fila 2", mediaType: "image", url: urlB, s3Key: keyB, status: "generated" },
              { id: "i3", order: 2, title: "Pendiente", mediaType: "image", status: "pending" },
            ],
          },
        },
      },
    ];
    const { generated } = collectProjectMedia(nodes);
    expect(generated).toHaveLength(2);
    expect(generated.every((g) => g.sourceLabel === "Populate")).toBe(true);
    expect(generated.some((g) => g.url.includes(encodeURIComponent(keyA)))).toBe(true);
    expect(generated.some((g) => g.url.includes(encodeURIComponent(keyB)))).toBe(true);
  });
});
