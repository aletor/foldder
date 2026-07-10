"use client";

import { useEffect } from "react";
import type { TypographyValue } from "@/lib/genoma/genoma-types";
import {
  googleFontFamiliesFromTypography,
} from "@/lib/genoma/brand-theme-color";
import { buildGoogleFontsCssUrl } from "@/lib/genoma/normalize-font-display-name";

const loadedBoardFontUrls = new Set<string>();

export function GenomaBoardGoogleFontsLoader({
  typography,
}: {
  typography?: TypographyValue;
}) {
  useEffect(() => {
    const families = googleFontFamiliesFromTypography(typography);
    const href = buildGoogleFontsCssUrl(families);
    if (!href || loadedBoardFontUrls.has(href)) return;

    loadedBoardFontUrls.add(href);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.genomaBoardFonts = "1";
    document.head.appendChild(link);

    return () => {
      link.remove();
      loadedBoardFontUrls.delete(href);
    };
  }, [typography]);

  return null;
}
