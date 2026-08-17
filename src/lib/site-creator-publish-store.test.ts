import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPublishedSiteId,
  isSafePublishedRelativePath,
  isValidPublishedSiteId,
  planPublishedSiteOverwrite,
  publicSitePath,
  readPublishedSiteFile,
  writePublishedSite,
  deletePublishedSite,
  decodeDataUrl,
} from "@/lib/site-creator-publish-store";

describe("site-creator-publish-store", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("rejects traversal ids and paths", () => {
    expect(isValidPublishedSiteId("not-hex")).toBe(false);
    expect(isValidPublishedSiteId("aa".repeat(16))).toBe(true);
    expect(isSafePublishedRelativePath("../index.html")).toBe(false);
    expect(isSafePublishedRelativePath("assets/../../secret")).toBe(false);
    expect(isSafePublishedRelativePath("assets/img-ab.webp")).toBe(true);
    expect(publicSitePath("aa".repeat(16))).toBe(`/s/${"aa".repeat(16)}/`);
  });

  it("writes index.html last and deletes leftovers", () => {
    const plan = planPublishedSiteOverwrite({
      existingRelativePaths: ["index.html", "styles.css", "assets/old.webp", "script.js"],
      nextRelativePaths: ["index.html", "styles.css", "script.js", "assets/new.webp"],
    });
    expect(plan.uploadOrder.at(-1)).toBe("index.html");
    expect(plan.uploadOrder.includes("assets/new.webp")).toBe(true);
    expect(plan.deleteRelativePaths).toEqual(["assets/old.webp"]);
  });

  it("overwrites a local folder without remnants", async () => {
    const localRoot = await fs.mkdtemp(path.join(os.tmpdir(), "site-pub-"));
    tmpDirs.push(localRoot);
    const siteId = createPublishedSiteId();
    const opts = { localRoot, s3Enabled: false as const };

    await writePublishedSite(
      siteId,
      [
        { relativePath: "assets/img-old.webp", body: Buffer.from("old"), contentType: "image/webp" },
        { relativePath: "styles.css", body: Buffer.from("a{}"), contentType: "text/css" },
        { relativePath: "script.js", body: Buffer.from("1"), contentType: "text/javascript" },
        { relativePath: "index.html", body: Buffer.from("<html>1</html>"), contentType: "text/html" },
      ],
      opts,
    );

    await writePublishedSite(
      siteId,
      [
        { relativePath: "assets/img-new.webp", body: Buffer.from("new"), contentType: "image/webp" },
        { relativePath: "styles.css", body: Buffer.from("b{}"), contentType: "text/css" },
        { relativePath: "script.js", body: Buffer.from("2"), contentType: "text/javascript" },
        { relativePath: "index.html", body: Buffer.from("<html>2</html>"), contentType: "text/html" },
      ],
      opts,
    );

    const html = await readPublishedSiteFile(siteId, "index.html", opts);
    expect(html?.body.toString("utf8")).toBe("<html>2</html>");
    expect(await readPublishedSiteFile(siteId, "assets/img-new.webp", opts)).toBeTruthy();
    expect(await readPublishedSiteFile(siteId, "assets/img-old.webp", opts)).toBeNull();

    const deleted = await deletePublishedSite(siteId, opts);
    expect(deleted).toBeGreaterThan(0);
    expect(await readPublishedSiteFile(siteId, "index.html", opts)).toBeNull();
  });

  it("decodes data urls for copied assets", () => {
    const decoded = decodeDataUrl("data:image/png;base64,aGVsbG8=");
    expect(decoded?.contentType).toBe("image/png");
    expect(decoded?.body.toString("utf8")).toBe("hello");
  });
});
