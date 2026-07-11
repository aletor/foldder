"use client";

import React, { useMemo } from "react";
import { autoEmphasizeBrandKitText, parseBrandKitRichText } from "@/lib/brandkit/brand-kit-rich-text";

export function BrandKitRichText({
  text,
  className,
  as: Tag = "span",
  emphasizeTerms = [],
}: {
  text: string;
  className?: string;
  as?: "span" | "p";
  emphasizeTerms?: string[];
}) {
  const rendered = useMemo(() => {
    const enriched = emphasizeTerms.length ? autoEmphasizeBrandKitText(text, emphasizeTerms) : text;
    return parseBrandKitRichText(enriched);
  }, [emphasizeTerms, text]);

  return (
    <Tag className={className}>
      {rendered.map((segment, index) =>
        segment.type === "bold" ? (
          <span key={index} className="brandKit-rich-text__emph">
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </Tag>
  );
}
