"use client";

import React from "react";
import type { ShowcaseRequirement } from "@/lib/brandkit/brand-kit-showcase-requirements";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

export function BrandKitShowcaseRequirements({
  requirements,
}: {
  requirements: ShowcaseRequirement[];
}) {
  return (
    <div className="brandKit-showcase-requirements">
      <p className="brandKit-showcase-requirements__lead">{brandKitLocaleEs.showcaseRequirementsLead}</p>
      <ul className="brandKit-showcase-requirements__list">
        {requirements.map((item) => (
          <li
            key={item.id}
            className={`brandKit-showcase-requirements__item${item.met ? " is-met" : ""}`}
          >
            <span className="brandKit-showcase-requirements__mark" aria-hidden>
              {item.met ? "✓" : "○"}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
