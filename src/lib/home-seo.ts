import type { Metadata } from "next";
import type { AppLanguage } from "@/lib/i18n";

export const FOLDDER_SITE_ORIGIN = "https://foldder.com";

export const FOLDDER_HOME_PATH: Record<AppLanguage, string> = {
  es: "/",
  en: "/en",
};

export function foldderHomeUrl(language: AppLanguage): string {
  return `${FOLDDER_SITE_ORIGIN}${FOLDDER_HOME_PATH[language]}`;
}

const OG_IMAGE = `${FOLDDER_SITE_ORIGIN}/og-image.jpg`;

const HOME_SEO: Record<
  AppLanguage,
  {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    twitterDescription: string;
    locale: "es_ES" | "en_US";
    alternateLocale: "es_ES" | "en_US";
    jsonLdDescription: string;
  }
> = {
  es: {
    title: "Foldder | Plataforma creativa con IA y automatización",
    description:
      "Foldder conecta diseño, imagen, vídeo y contenido en una plataforma creativa con IA. Automatiza flujos de trabajo y produce contenido de marca a escala.",
    ogTitle: "Foldder | Plataforma creativa con IA",
    ogDescription:
      "De la idea a la producción final. Conecta guiones, diseño, imágenes, vídeo y memoria de marca en un único flujo creativo con IA.",
    twitterDescription:
      "Diseña, genera y automatiza contenido con IA. Un sistema creativo conectado para producir más y mantener tu identidad de marca.",
    locale: "es_ES",
    alternateLocale: "en_US",
    jsonLdDescription:
      "Plataforma creativa con IA para flujos de trabajo conectados y producción de contenido a escala.",
  },
  en: {
    title: "Foldder | AI Creative Platform & Content Automation",
    description:
      "Foldder brings design, images, video and content together in one AI creative platform. Automate workflows and scale on-brand creative production.",
    ogTitle: "Foldder | AI Creative Production Platform",
    ogDescription:
      "From idea to final delivery. Connect scripts, design, images, video and brand knowledge in one AI-powered creative workflow.",
    twitterDescription:
      "Create, design and automate content with AI. Connected creative workflows built for consistent, scalable production.",
    locale: "en_US",
    alternateLocale: "es_ES",
    jsonLdDescription:
      "AI-powered creative workspace for design, video, scripts, brand assets and automated content workflows.",
  },
};

export function homeMetadata(language: AppLanguage): Metadata {
  const seo = HOME_SEO[language];
  const url = foldderHomeUrl(language);

  return {
    title: { absolute: seo.title },
    description: seo.description,
    robots: "index, follow, max-image-preview:large",
    alternates: {
      canonical: url,
      languages: {
        es: foldderHomeUrl("es"),
        en: foldderHomeUrl("en"),
        "x-default": foldderHomeUrl("es"),
      },
    },
    openGraph: {
      type: "website",
      siteName: "Foldder",
      locale: seo.locale,
      alternateLocale: [seo.alternateLocale],
      title: seo.ogTitle,
      description: seo.ogDescription,
      url,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Foldder" }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle,
      description: seo.twitterDescription,
      images: [OG_IMAGE],
    },
  };
}

export function homeJsonLd(language: AppLanguage) {
  const seo = HOME_SEO[language];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${FOLDDER_SITE_ORIGIN}/#website`,
        name: "Foldder",
        url: foldderHomeUrl("es"),
        description: seo.jsonLdDescription,
        inLanguage: ["es", "en"],
      },
      {
        "@type": "WebApplication",
        "@id": `${FOLDDER_SITE_ORIGIN}/#app`,
        name: "Foldder",
        url: foldderHomeUrl("es"),
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        description: seo.jsonLdDescription,
        inLanguage: language,
      },
    ],
  };
}
