"use client";

import React from "react";
import type { SlotId } from "@/lib/genoma/genoma-types";

export type GenomaBlockSkeletonVariant = SlotId;

type GenomaBlockSkeletonProps = {
  variant: GenomaBlockSkeletonVariant;
};

export function GenomaBlockSkeleton({ variant }: GenomaBlockSkeletonProps) {
  switch (variant) {
    case "logo":
      return (
        <div className="genoma-block-skeleton genoma-block-skeleton--logo" aria-hidden>
          <div className="genoma-block-skeleton__logo-plinth" />
        </div>
      );
    case "palette":
      return (
        <div className="genoma-block-skeleton genoma-block-skeleton--palette" aria-hidden>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="genoma-block-skeleton__swatch" />
          ))}
        </div>
      );
    case "typography":
      return (
        <div className="genoma-block-skeleton genoma-block-skeleton--typography" aria-hidden>
          <div className="genoma-block-skeleton__type-col">
            <div className="genoma-block-skeleton__line genoma-block-skeleton__line--short" />
            <div className="genoma-block-skeleton__line genoma-block-skeleton__line--title" />
            <div className="genoma-block-skeleton__line genoma-block-skeleton__line--specimen" />
          </div>
          <div className="genoma-block-skeleton__type-col">
            <div className="genoma-block-skeleton__line genoma-block-skeleton__line--short" />
            <div className="genoma-block-skeleton__line genoma-block-skeleton__line--title" />
            <div className="genoma-block-skeleton__line genoma-block-skeleton__line--specimen" />
          </div>
        </div>
      );
    case "gallery":
      return (
        <div className="genoma-block-skeleton genoma-block-skeleton--gallery" aria-hidden>
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="genoma-block-skeleton__thumb" />
          ))}
        </div>
      );
    case "essence":
    case "voice":
    case "visualWorld":
      return (
        <div className={`genoma-block-skeleton genoma-block-skeleton--semantic genoma-block-skeleton--${variant}`} aria-hidden>
          <div className="genoma-block-skeleton__line genoma-block-skeleton__line--headline" />
          <div className="genoma-block-skeleton__line genoma-block-skeleton__line--body" />
          <div className="genoma-block-skeleton__line genoma-block-skeleton__line--body" />
          <div className="genoma-block-skeleton__line genoma-block-skeleton__line--body genoma-block-skeleton__line--narrow" />
        </div>
      );
    default:
      return <div className="genoma-block-skeleton genoma-block-skeleton--generic" aria-hidden />;
  }
}
