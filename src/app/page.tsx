import type { Metadata } from "next";
import { HomeLanding } from "./_home/HomeLanding";
import { homeJsonLd, homeMetadata } from "@/lib/home-seo";

export const metadata: Metadata = homeMetadata("es");

export default function Page() {
  const jsonLd = homeJsonLd("es");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HomeLanding locale="es" />
    </>
  );
}
