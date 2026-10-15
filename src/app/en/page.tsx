import type { Metadata } from "next";
import { HomeLanding } from "../_home/HomeLanding";
import { homeJsonLd, homeMetadata } from "@/lib/home-seo";

export const metadata: Metadata = homeMetadata("en");

export default function EnglishHomePage() {
  const jsonLd = homeJsonLd("en");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HomeLanding locale="en" />
    </>
  );
}
