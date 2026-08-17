import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  materializeSiteCreatorPublishImages,
  optimizeSiteCreatorPublishImage,
  shouldSkipSiteCreatorPublishOptimize,
} from "./site-creator-publish-images";

async function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 20, b: 20 } },
  })
    .png()
    .toBuffer();
}

describe("site-creator-publish-images", () => {
  it("skips optimize for OPT keys even if the client omits the flag", () => {
    expect(
      shouldSkipSiteCreatorPublishOptimize({
        layerId: "a",
        s3Key: "knowledge-files/spaces/x/designer/a_OPT.webp",
        alreadyOptimized: false,
      }),
    ).toBe(true);
  });

  it("skips optimize when collect marked s3KeyOpt and there is an s3 key", () => {
    expect(
      shouldSkipSiteCreatorPublishOptimize({
        layerId: "a",
        s3Key: "knowledge-files/project-media/opt.png",
        alreadyOptimized: true,
      }),
    ).toBe(true);
  });

  it("does not skip a data URL even if the client claims alreadyOptimized", () => {
    expect(
      shouldSkipSiteCreatorPublishOptimize({
        layerId: "a",
        src: "data:image/png;base64,aaa",
        alreadyOptimized: true,
      }),
    ).toBe(false);
  });

  it("copies OPT bytes without re-encoding", async () => {
    const body = await pngBuffer(2400, 800);
    const out = await optimizeSiteCreatorPublishImage({
      body,
      contentType: "image/png",
      skipOptimize: true,
      layerId: "hero",
    });
    expect(out.body.equals(body)).toBe(true);
    expect(out.contentType).toBe("image/png");
  });

  it("resizes non-OPT rasters to a long side of 2000 or less", async () => {
    const body = await pngBuffer(2400, 800);
    const out = await optimizeSiteCreatorPublishImage({
      body,
      contentType: "image/png",
      skipOptimize: false,
      layerId: "hero",
    });
    const meta = await sharp(out.body).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(2000);
    expect(out.body.equals(body)).toBe(false);
  });

  it("aborts when a raster cannot be read", async () => {
    await expect(
      optimizeSiteCreatorPublishImage({
        body: Buffer.from("not-an-image"),
        contentType: "image/png",
        skipOptimize: false,
        layerId: "broken",
      }),
    ).rejects.toThrow(/No se pudo optimizar la imagen de la capa broken/);
  });

  it("materializes a large data URL as an optimized asset and fails closed on garbage", async () => {
    const png = await pngBuffer(2200, 900);
    const src = `data:image/png;base64,${png.toString("base64")}`;
    const result = await materializeSiteCreatorPublishImages([
      { layerId: "photo", src, alreadyOptimized: false },
    ]);
    expect(result.files).toHaveLength(1);
    const meta = await sharp(result.files[0]!.body).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(2000);
    expect(result.hrefByLayerId.photo).toMatch(/^assets\/img-/);

    await expect(
      materializeSiteCreatorPublishImages([
        { layerId: "bad", src: "data:image/png;base64,@@@", alreadyOptimized: false },
      ]),
    ).rejects.toThrow(/No se pudo copiar la imagen de la capa bad|No se pudo optimizar la imagen de la capa bad/);
  });
});
