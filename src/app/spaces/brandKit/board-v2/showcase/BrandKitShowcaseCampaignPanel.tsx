"use client";

import React from "react";
import type { BrandKitCampaign } from "@/lib/brandkit/brand-kit-campaign";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

export function BrandKitShowcaseCampaignPanel({ campaign }: { campaign: BrandKitCampaign }) {
  return (
    <div className="brandKit-showcase-campaign-panel">
      <div className="brandKit-showcase-campaign-panel__block">
        <p className="brandKit-showcase-campaign-panel__eyebrow">{brandKitLocaleEs.showcaseCampaignConcept}</p>
        <p className="brandKit-showcase-campaign-panel__concept">{campaign.concept}</p>
      </div>
      <div className="brandKit-showcase-campaign-panel__grid">
        <div>
          <p className="brandKit-showcase-campaign-panel__eyebrow">{brandKitLocaleEs.showcaseCampaignHeadline}</p>
          <p className="brandKit-showcase-campaign-panel__value">{campaign.headline}</p>
        </div>
        {campaign.subheadline ? (
          <div>
            <p className="brandKit-showcase-campaign-panel__eyebrow">{brandKitLocaleEs.showcaseCampaignSubheadline}</p>
            <p className="brandKit-showcase-campaign-panel__value brandKit-showcase-campaign-panel__value--soft">
              {campaign.subheadline}
            </p>
          </div>
        ) : null}
        <div>
          <p className="brandKit-showcase-campaign-panel__eyebrow">{brandKitLocaleEs.showcaseCampaignCta}</p>
          <p className="brandKit-showcase-campaign-panel__value">{campaign.cta}</p>
        </div>
      </div>
      <p className="brandKit-showcase-campaign-panel__rule">{campaign.compositiveRule}</p>
    </div>
  );
}
