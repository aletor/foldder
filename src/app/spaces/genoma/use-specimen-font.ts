"use client";

import { useEffect } from "react";
import type { TypographyValue } from "@/lib/genoma/model/trait-values";
import { specimenFontStack } from "@/lib/genoma/specimen/typography-specimen";

const loadedStylesheets = new Set<string>();
const loadedUploads = new Set<string>();

export function useSpecimenFont(typography: TypographyValue | null | undefined): void {
  useEffect(() => {
    if (!typography?.specimenAvailable) return;

    if (typography.specimenSource === "google-fonts" && typography.specimenCssUrl) {
      if (loadedStylesheets.has(typography.specimenCssUrl)) return;
      loadedStylesheets.add(typography.specimenCssUrl);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = typography.specimenCssUrl;
      link.dataset.genomaSpecimen = typography.family;
      document.head.appendChild(link);
      return;
    }

    if (typography.specimenSource === "upload" && typography.specimenFontUrl) {
      const key = `${typography.family}|${typography.specimenFontUrl.slice(0, 48)}`;
      if (loadedUploads.has(key)) return;
      loadedUploads.add(key);
      const styleId = `genoma-specimen-${typography.family.replace(/\W+/g, "-").toLowerCase()}`;
      if (document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      const family = typography.family.replace(/'/g, "\\'");
      style.textContent = `@font-face{font-family:'${family}';src:url('${typography.specimenFontUrl}') format('woff2');font-display:swap;}`;
      document.head.appendChild(style);
    }
  }, [typography]);
}

export { specimenFontStack };
