"use client";

import { useEffect } from "react";
import { googleFontStylesheetHref } from "../freehand/google-fonts";

function primaryFontFamily(fontFamily: string): string {
  return fontFamily.split(",")[0]?.replace(/['"]/g, "").trim() ?? "";
}

export function useVideoEditorGoogleFonts(fontFamilies: string[]) {
  useEffect(() => {
    const primaries = Array.from(
      new Set(
        fontFamilies
          .map(primaryFontFamily)
          .filter((family) => family && !family.toLowerCase().includes("helvetica") && !family.toLowerCase().includes("arial")),
      ),
    );
    const links: HTMLLinkElement[] = [];
    for (const family of primaries) {
      const href = googleFontStylesheetHref(family);
      if (document.querySelector(`link[data-video-editor-font="${family}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.videoEditorFont = family;
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      for (const link of links) link.remove();
    };
  }, [fontFamilies]);
}
