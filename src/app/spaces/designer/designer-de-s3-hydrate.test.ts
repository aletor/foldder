import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "./DesignerNode";
import type { FreehandObject } from "../FreehandStudio";
import { DEFAULT_DESIGNER_PAGE_FORMAT } from "../indesign/page-formats";
import {
  applyDesignerBlobUploadMap,
  collectBlobImageUrlsFromPages,
} from "./designer-de-s3-hydrate";

describe("designer-de-s3-hydrate", () => {
  it("detecta blob: dentro de groupContainer", () => {
    const blobUrl = "blob:folder-image-test";
    const pages: DesignerPageState[] = [
      {
        id: "p1",
        format: DEFAULT_DESIGNER_PAGE_FORMAT,
        objects: [
          {
            id: "folder1",
            type: "groupContainer",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            children: [
              {
                id: "img1",
                type: "image",
                x: 0,
                y: 0,
                width: 20,
                height: 20,
                src: blobUrl,
                intrinsicRatio: 1,
              } as unknown as FreehandObject,
            ],
          } as unknown as FreehandObject,
        ],
      },
    ];

    expect(collectBlobImageUrlsFromPages(pages)).toContain(blobUrl);

    const map = new Map([
      [
        blobUrl,
        { url: "https://cdn.example/opt.png", s3Key: "spaces/x/opt.png", assetId: "asset-1" },
      ],
    ]);
    const next = applyDesignerBlobUploadMap(pages, map);
    const nested = (next[0]!.objects[0] as { children: FreehandObject[] }).children[0] as {
      src?: string;
    };
    expect(nested.src).toBe("https://cdn.example/opt.png");
  });
});
