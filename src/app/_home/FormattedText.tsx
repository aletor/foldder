"use client";

import type { HTMLAttributes, ReactNode } from "react";

export function splitBoldMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

type FormattedTextProps = {
  text: string;
  as?: "p" | "span";
} & HTMLAttributes<HTMLElement>;

export function FormattedText({ text, as: Tag = "span", ...props }: FormattedTextProps) {
  return <Tag {...props}>{splitBoldMarkdown(text)}</Tag>;
}
