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
});
