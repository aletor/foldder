"use client";

import React from "react";
import type { SlotId } from "@/lib/brandkit/brand-kit-types";

export type BrandKitBlockSkeletonVariant = SlotId;

type BrandKitBlockSkeletonProps = {
  variant: BrandKitBlockSkeletonVariant;
};

export function BrandKitBlockSkeleton({ variant }: BrandKitBlockSkeletonProps) {
  switch (variant) {
    case "logo":
      return (
        <div className="brandKit-block-skeleton brandKit-block-skeleton--logo" aria-hidden>
          <div className="brandKit-block-skeleton__logo-plinth" />
        </div>
      );
    case "palette":
      return (
        <div className="brandKit-block-skeleton brandKit-block-skeleton--palette" aria-hidden>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="brandKit-block-skeleton__swatch" />
          ))}
        </div>
      );
    case "typography":
      return (
        <div className="brandKit-block-skeleton brandKit-block-skeleton--typography" aria-hidden>
          <div className="brandKit-block-skeleton__type-col">
            <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--short" />
            <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--title" />
            <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--specimen" />
          </div>
          <div className="brandKit-block-skeleton__type-col">
            <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--short" />
            <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--title" />
            <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--specimen" />
          </div>
        </div>
      );
    case "gallery":
      return (
        <div className="brandKit-block-skeleton brandKit-block-skeleton--gallery" aria-hidden>
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="brandKit-block-skeleton__thumb" />
          ))}
        </div>
      );
    case "essence":
    case "voice":
    case "visualWorld":
      return (
        <div className={`brandKit-block-skeleton brandKit-block-skeleton--semantic brandKit-block-skeleton--${variant}`} aria-hidden>
          <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--headline" />
          <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--body" />
          <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--body" />
          <div className="brandKit-block-skeleton__line brandKit-block-skeleton__line--body brandKit-block-skeleton__line--narrow" />
        </div>
      );
    default:
      return <div className="brandKit-block-skeleton brandKit-block-skeleton--generic" aria-hidden />;
  }
}
