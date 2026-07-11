import { readPublishedSiteHtml } from "@/lib/site/site-publish-store";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const html = await readPublishedSiteHtml(slug, "index");
  if (!html) {
    return new Response("Sitio no encontrado", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
