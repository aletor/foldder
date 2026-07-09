"use client";

import React, { useMemo } from "react";
import { parseGenomaRichText } from "@/lib/genoma/genoma-rich-text";

export function GenomaRichText({
  text,
  className,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  as?: "span" | "p";
}) {
  const segments = useMemo(() => parseGenomaRichText(text), [text]);

  return (
    <Tag className={className}>
      {segments.map((segment, index) =>
        segment.type === "bold" ? (
          <strong key={index} className="genoma-rich-text__bold">
            {segment.text}
          </strong>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </Tag>
  );
}
