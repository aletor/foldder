import type { MetadataRoute } from "next";
import { FOLDDER_SITE_ORIGIN } from "@/lib/home-seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${FOLDDER_SITE_ORIGIN}/sitemap.xml`,
    host: FOLDDER_SITE_ORIGIN,
  };
}
