"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { BrandThemePolarity } from "@/lib/brandkit/brand-theme-color";
import { mixHex } from "@/lib/brandkit/brand-theme-color";
import type { BrandKitDocument, BrandKitStationeryContact } from "@/lib/brandkit/brand-kit-types";
import { campaignDisplayTitle } from "@/lib/brandkit/brand-kit-campaign";
import { computeShowcaseConsistency } from "@/lib/brandkit/brand-kit-showcase-consistency";
import { stationeryRequirementsMet } from "@/lib/brandkit/brand-kit-stationery";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import {
  buildBrandKitShowcaseData,
  BRAND_KIT_SHOWCASE_CHAPTER_LABEL,
  type ShowcaseSurfaceMode,
} from "./showcase/brand-kit-showcase-data";
import { BrandKitShowcaseHero } from "./showcase/BrandKitShowcaseHero";
import { BrandKitShowcaseSocialPost } from "./showcase/BrandKitShowcaseSocialPost";
import { BrandKitShowcaseStory } from "./showcase/BrandKitShowcaseStory";
import { BrandKitShowcaseBanner } from "./showcase/BrandKitShowcaseBanner";
import { BrandKitShowcaseRequirements } from "./showcase/BrandKitShowcaseRequirements";
import { BrandKitShowcaseCampaignPanel } from "./showcase/BrandKitShowcaseCampaignPanel";
import { BrandKitStationeryPanel } from "./stationery/BrandKitStationeryPanel";

export type ApplicationsTab = "campaign" | "stationery" | "digital";

const APPLICATIONS_TABS: { id: ApplicationsTab; label: string }[] = [
  { id: "campaign", label: brandKitLocaleEs.applicationsTabCampaign },
  { id: "stationery", label: brandKitLocaleEs.applicationsTabStationery },
  { id: "digital", label: brandKitLocaleEs.applicationsTabDigital },
];

export function BrandKitBanda08({
  doc,
  presentationMode = false,
  brandPolarity = "light",
  brandVars = {},
  onStationeryContactChange,
}: {
  doc: BrandKitDocument;
  presentationMode?: boolean;
  brandPolarity?: BrandThemePolarity;
  brandVars?: Record<string, string>;
  onStationeryContactChange?: (contact: BrandKitStationeryContact) => void;
}) {
  const data = useMemo(
    () => buildBrandKitShowcaseData(doc, presentationMode),
    [doc, presentationMode],
  );
  const [surfaceMode, setSurfaceMode] = useState<ShowcaseSurfaceMode>(
    brandPolarity === "dark" ? "dark" : "light",
  );
  const [activeTab, setActiveTab] = useState<ApplicationsTab>("digital");

  const presentationTab = useMemo((): ApplicationsTab => {
    if (data?.canRenderMockups) return "digital";
    if (stationeryRequirementsMet(doc, true)) return "stationery";
    return "campaign";
  }, [data, doc]);

  useEffect(() => {
    if (presentationMode) setActiveTab(presentationTab);
  }, [presentationMode, presentationTab]);

  const effectiveTab = presentationMode ? presentationTab : activeTab;

  const showcaseStyle = useMemo(() => {
    const page = brandVars["--brand-surface-page"] ?? "#F5F4F1";
    const ink = brandVars["--brand-ink"] ?? "#1A1A1A";
    const inkSoft = brandVars["--brand-ink-soft"] ?? "#666666";
    const rule = brandVars["--brand-rule"] ?? "#E0E0E0";

    const lightPaper = page;
    const darkPaper = mixHex(ink, "#000000", 0.12);
    const paper = surfaceMode === "dark" ? darkPaper : lightPaper;
    const showcaseInk = surfaceMode === "dark" ? lightPaper : ink;
    const showcaseInkSoft = surfaceMode === "dark" ? mixHex(lightPaper, ink, 0.35) : inkSoft;
    const deviceBorder = mixHex(ink, surfaceMode === "dark" ? "#FFFFFF" : "#000000", 0.1);

    return {
      "--showcase-paper": paper,
      "--showcase-ink": showcaseInk,
      "--showcase-ink-soft": showcaseInkSoft,
      "--showcase-device-border": deviceBorder,
      "--showcase-rule": rule,
    } as React.CSSProperties;
  }, [brandVars, surfaceMode]);

  const consistency = useMemo(
    () =>
      data
        ? computeShowcaseConsistency(
            doc,
            {
              logoUrl: data.logoUrl,
              galleryImageUrl: data.galleryImageUrl,
              campaignHeadline: data.campaign.headline,
            },
            brandVars,
          )
        : null,
    [data, doc, brandVars],
  );

  if (!data) return null;

  const primaryHex = brandVars["--brand-primary"];
  const showDigital = data.canRenderMockups && effectiveTab === "digital";
  const showCampaign = effectiveTab === "campaign";
  const showStationery = effectiveTab === "stationery";

  return (
    <section
      className="banda-08"
      aria-label={BRAND_KIT_SHOWCASE_CHAPTER_LABEL}
      data-showcase-surface={surfaceMode}
      style={showcaseStyle}
    >
      <header className="banda-08__header">
        <div className="banda-08__header-main">
          <span className="banda-08__rotulo">{BRAND_KIT_SHOWCASE_CHAPTER_LABEL}</span>
          {data.canRenderMockups ? (
            <p className="banda-08__campaign-title">{campaignDisplayTitle(data.campaign)}</p>
          ) : null}
        </div>
        <div className="banda-08__header-tools">
          {data.canRenderMockups && consistency && effectiveTab === "digital" ? (
            <span className="banda-08__consistency" title={consistency.issues.join(" · ")}>
              {brandKitLocaleEs.showcaseConsistency(consistency.score)}
            </span>
          ) : null}
          <div className="brandKit-showcase-surface-toggle" role="group" aria-label={brandKitLocaleEs.showcaseContextLabel}>
            <span className="brandKit-showcase-surface-toggle__label">{brandKitLocaleEs.showcaseContextLabel}</span>
            <button
              type="button"
              className={`brandKit-showcase-surface-toggle__btn${surfaceMode === "light" ? " is-active" : ""}`}
              onClick={() => setSurfaceMode("light")}
            >
              {brandKitLocaleEs.showcaseContextLight}
            </button>
            <button
              type="button"
              className={`brandKit-showcase-surface-toggle__btn${surfaceMode === "dark" ? " is-active" : ""}`}
              onClick={() => setSurfaceMode("dark")}
            >
              {brandKitLocaleEs.showcaseContextDark}
            </button>
          </div>
        </div>
      </header>

      {!presentationMode ? (
        <nav className="banda-08__tabs" role="tablist" aria-label={brandKitLocaleEs.applicationsTabsLabel}>
          {APPLICATIONS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`banda-08__tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="banda-08__body">
        {!data.canRenderMockups && effectiveTab !== "stationery" ? (
          <BrandKitShowcaseRequirements requirements={data.requirements} />
        ) : null}

        {showCampaign ? <BrandKitShowcaseCampaignPanel campaign={data.campaign} /> : null}

        {showStationery ? (
          <BrandKitStationeryPanel
            doc={doc}
            showcase={data}
            presentationMode={presentationMode}
            onStationeryContactChange={presentationMode ? undefined : onStationeryContactChange}
          />
        ) : null}

        {showDigital && data.canRenderMockups ? (
          <div className="banda-08__editorial-grid">
            <figure className="banda-08__cell banda-08__cell--hero">
              <BrandKitShowcaseHero data={data} />
              <figcaption className="banda-08__caption">{brandKitLocaleEs.showcaseHeroLabel}</figcaption>
            </figure>
            <figure className="banda-08__cell banda-08__cell--post">
              <BrandKitShowcaseSocialPost data={data} primaryHex={primaryHex} />
              <figcaption className="banda-08__caption">{brandKitLocaleEs.showcasePostLabel}</figcaption>
            </figure>
            <figure className="banda-08__cell banda-08__cell--story">
              <BrandKitShowcaseStory data={data} primaryHex={primaryHex} />
              <figcaption className="banda-08__caption">{brandKitLocaleEs.showcaseStoryLabel}</figcaption>
            </figure>
            <figure className="banda-08__cell banda-08__cell--banner">
              <BrandKitShowcaseBanner data={data} />
              <figcaption className="banda-08__caption">{brandKitLocaleEs.showcaseBannerLabel}</figcaption>
            </figure>
          </div>
        ) : null}
      </div>
    </section>
  );
}
