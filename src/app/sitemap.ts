import type { MetadataRoute } from "next";
import { foldderHomeUrl } from "@/lib/home-seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    es: foldderHomeUrl("es"),
    en: foldderHomeUrl("en"),
  };

  return [
    {
      url: foldderHomeUrl("es"),
      lastModified: new Date("2026-10-13"),
      changeFrequency: "weekly",
      priority: 1,
      alternates: { languages },
    },
    {
      url: foldderHomeUrl("en"),
      lastModified: new Date("2026-10-13"),
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: { languages },
    },
  ];
}
