import { describe, expect, it } from "vitest";
import {
  collectPopulateShareMediaKeys,
  rewritePopulateMediaUrl,
  rewritePopulateSharePayloadForPublic,
} from "./populate-share-public-media";

const TOKEN = "share_token";
const KEY = "knowledge-files/user-assets/abc/player.png";

describe("rewritePopulateMediaUrl", () => {
  it("rewrites authenticated s3-file URLs to the public share route", () => {
    const next = rewritePopulateMediaUrl(`/api/spaces/s3-file?key=${encodeURIComponent(KEY)}`, TOKEN);
    expect(next).toBe(`/api/populate-share/${TOKEN}/media?key=${encodeURIComponent(KEY)}`);
  });

  it("rewrites expired presigned S3 URLs", () => {
    const next = rewritePopulateMediaUrl(
      `https://bucket.s3.eu-west-1.amazonaws.com/${KEY}?X-Amz-Signature=expired`,
      TOKEN,
    );
    expect(next).toContain("/api/populate-share/");
    expect(next).toContain(encodeURIComponent(KEY));
  });

  it("leaves data URLs and prose alone", () => {
    expect(rewritePopulateMediaUrl("data:image/png;base64,aaa", TOKEN)).toBeNull();
    expect(rewritePopulateMediaUrl(`Mira ${KEY} en el texto`, TOKEN)).toBeNull();
  });
});

describe("rewritePopulateSharePayloadForPublic", () => {
  it("publishes designer frames and dataset images without touching raw keys", () => {
    const payload = {
      rowsSnapshot: [
        {
          cardId: "c1",
          values: {
            photo: {
              type: "image",
              assetId: "a",
              url: `/api/spaces/s3-file?key=${encodeURIComponent(KEY)}`,
              s3Key: KEY,
            },
          },
        },
      ],
      templates: [
        {
          pages: [
            {
              objects: [
                {
                  type: "rect",
                  isImageFrame: true,
                  imageFrameContent: {
                    src: `https://bucket.s3.amazonaws.com/${KEY}?X-Amz-Signature=1`,
                    s3Key: KEY,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const next = rewritePopulateSharePayloadForPublic(payload, TOKEN);
    const publicUrl = `/api/populate-share/${TOKEN}/media?key=${encodeURIComponent(KEY)}`;
    expect(next.rowsSnapshot[0]?.values.photo.url).toBe(publicUrl);
    expect(next.rowsSnapshot[0]?.values.photo.s3Key).toBe(KEY);
    expect(next.templates[0]?.pages[0]?.objects[0]?.imageFrameContent.src).toBe(publicUrl);
    expect(collectPopulateShareMediaKeys(payload).has(KEY)).toBe(true);
  });
});
