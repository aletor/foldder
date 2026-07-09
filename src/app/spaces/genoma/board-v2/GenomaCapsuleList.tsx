"use client";

import React from "react";
import { stripGenomaRichMarkup } from "@/lib/genoma/genoma-rich-text";
import { GenomaRichText } from "./GenomaRichText";

export type GenomaCapsuleItem =
  | string
  | {
      label: string;
      detail?: string;
    };

function capsuleKey(item: GenomaCapsuleItem, index: number): string {
  if (typeof item === "string") return `${index}-${item}`;
  return `${index}-${item.label}`;
}

function CapsuleText({ item, variant }: { item: GenomaCapsuleItem; variant: "default" | "quote" | "warn" }) {
  if (typeof item === "string") {
    if (variant === "quote") {
      return <>&ldquo;{stripGenomaRichMarkup(item)}&rdquo;</>;
    }
    return <GenomaRichText text={item} />;
  }

  return (
    <>
      <GenomaRichText text={item.label} className="genoma-capsule-list__primary" />
      {item.detail ? (
        <span className="genoma-capsule-list__detail">
          {" — "}
          <GenomaRichText text={item.detail} />
        </span>
      ) : null}
    </>
  );
}

export function GenomaCapsuleList({
  items,
  variant = "default",
  className = "",
}: {
  items: GenomaCapsuleItem[];
  variant?: "default" | "quote" | "warn";
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <ol className={`genoma-capsule-list ${className}`.trim()}>
      {items.map((item, index) => (
        <li
          key={capsuleKey(item, index)}
          className={`genoma-capsule-list__item genoma-capsule-list__item--${variant}`}
        >
          <span className="genoma-capsule-list__num" aria-hidden>
            {index + 1}
          </span>
          <span className="genoma-capsule-list__text">
            <CapsuleText item={item} variant={variant} />
          </span>
        </li>
      ))}
    </ol>
  );
}
