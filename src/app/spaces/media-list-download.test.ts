import { describe, expect, it } from "vitest";
import {
  inferMediaListImageDownloadExtension,
  mediaListDownloadFilename,
  mediaListImageLikelyHasTransparency,
} from "./media-list-download";
import type { MediaListItem } from "./media-list-output";

function imageItem(partial: Partial<MediaListItem>): MediaListItem {
  return {
    id: "i1",
    order: 0,
    title: "Fila 1",
    mediaType: "image",
    status: "generated",
    ...partial,
  };
}

describe("media-list-download", () => {
  it("detects transparency for matte / png sources", () => {
    expect(
      mediaListImageLikelyHasTransparency(
        imageItem({ s3Key: "knowledge-files/user-assets/ab/matte/1.png" }),
      ),
    ).toBe(true);
    expect(mediaListImageLikelyHasTransparency(imageItem({ url: "data:image/png;base64,abc" }))).toBe(
      true,
    );
    expect(mediaListImageLikelyHasTransparency(imageItem({ url: "https://cdn/x.jpg" }))).toBe(false);
  });

  it("uses .png for transparent images instead of default .jpg", () => {
    expect(
      inferMediaListImageDownloadExtension(
        imageItem({ s3Key: "knowledge-files/user-assets/ab/matte/cutout.png" }),
      ),
    ).toBe(".png");
    expect(
      mediaListDownloadFilename(imageItem({ title: "Recorte", url: "data:image/png;base64,abc" })),
    ).toBe("Recorte.png");
  });

  it("keeps .jpg for opaque jpeg sources", () => {
    expect(
      inferMediaListImageDownloadExtension(
        imageItem({ url: "https://cdn/out.jpg", mimeType: "image/jpeg" }),
      ),
    ).toBe(".jpg");
    expect(mediaListDownloadFilename(imageItem({ title: "Foto", url: "https://cdn/out.jpg" }))).toBe(
      "Foto.jpg",
    );
  });

  it("respects extension already present in title", () => {
    expect(mediaListDownloadFilename(imageItem({ title: "export.webp" }))).toBe("export.webp");
  });
});
