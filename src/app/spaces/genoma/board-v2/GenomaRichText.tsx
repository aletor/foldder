"use client";

import React, { useMemo } from "react";
import { autoEmphasizeGenomaText, parseGenomaRichText } from "@/lib/genoma/genoma-rich-text";

export function GenomaRichText({
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
    const enriched = emphasizeTerms.length ? autoEmphasizeGenomaText(text, emphasizeTerms) : text;
    return parseGenomaRichText(enriched);
  }, [emphasizeTerms, text]);

  return (
    <Tag className={className}>
      {rendered.map((segment, index) =>
        segment.type === "bold" ? (
          <span key={index} className="genoma-rich-text__emph">
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </Tag>
  );
}
