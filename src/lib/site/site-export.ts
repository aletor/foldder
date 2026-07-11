import JSZip from "jszip";
import {
  buildPublishedSiteBundle,
  type BuildPublishedSiteBundleInput,
} from "./site-publish";

export async function buildPublishedSiteZipBuffer(
  input: BuildPublishedSiteBundleInput,
): Promise<{ buffer: Buffer; filename: string }> {
  const bundle = await buildPublishedSiteBundle(input);
  const zip = new JSZip();

  for (const doc of bundle.documents) {
    zip.file(doc.file, doc.html);
  }

  zip.file(
    "meta.json",
    JSON.stringify(
      {
        slug: bundle.slug,
        title: bundle.title,
        locale: bundle.locale,
        snapshotHash: bundle.snapshotHash,
        exportedAt: new Date().toISOString(),
        pages: bundle.documents.map((doc) => ({
          pageId: doc.pageId,
          pathSlug: doc.pathSlug,
          title: doc.title,
          file: doc.file,
        })),
      },
      null,
      2,
    ),
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, filename: `${bundle.slug}.zip` };
}
