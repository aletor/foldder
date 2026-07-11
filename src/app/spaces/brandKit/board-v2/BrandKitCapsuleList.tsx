"use client";

import React from "react";
import { stripBrandKitRichMarkup } from "@/lib/brandkit/brand-kit-rich-text";
import { BrandKitRichText } from "./BrandKitRichText";

export type BrandKitCapsuleItem =
  | string
  | {
      label: string;
      detail?: string;
    };

function capsuleKey(item: BrandKitCapsuleItem, index: number): string {
  if (typeof item === "string") return `${index}-${item}`;
  return `${index}-${item.label}`;
}

function CapsuleText({ item, variant }: { item: BrandKitCapsuleItem; variant: "default" | "quote" | "warn" }) {
  if (typeof item === "string") {
    if (variant === "quote") {
      return <>&ldquo;{stripBrandKitRichMarkup(item)}&rdquo;</>;
    }
    return <BrandKitRichText text={item} />;
  }

  return (
    <>
      <BrandKitRichText text={item.label} className="brandKit-capsule-list__primary" />
      {item.detail ? (
        <span className="brandKit-capsule-list__detail">
          {" — "}
          <BrandKitRichText text={item.detail} />
        </span>
      ) : null}
    </>
  );
}

export function BrandKitCapsuleList({
  items,
  variant = "default",
  className = "",
}: {
  items: BrandKitCapsuleItem[];
  variant?: "default" | "quote" | "warn";
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <ol className={`brandKit-capsule-list ${className}`.trim()}>
      {items.map((item, index) => (
        <li
          key={capsuleKey(item, index)}
          className={`brandKit-capsule-list__item brandKit-capsule-list__item--${variant}`}
        >
          <span className="brandKit-capsule-list__num" aria-hidden>
            {index + 1}
          </span>
          <span className="brandKit-capsule-list__text">
            <CapsuleText item={item} variant={variant} />
          </span>
        </li>
      ))}
    </ol>
  );
}
