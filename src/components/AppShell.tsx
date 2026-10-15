"use client";

import { ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { cleanupLegacyUnscopedBrainSuggestionStorageOnce } from "@/app/spaces/brain-image-suggestions-cache";
import { BackgroundRadioPlayer } from "@/components/BackgroundRadioPlayer";
import { LanguageProvider, LanguageSwitcher } from "@/components/LanguageProvider";

/** Full-viewport shell: composer canvas without marketing sidebar/topbar. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSpaces =
    pathname === "/spaces" || pathname?.startsWith("/spaces/");
  const isLab = pathname === "/lab" || pathname?.startsWith("/lab/");
  const isPublicForm = pathname === "/f" || pathname?.startsWith("/f/");
  const isFullViewport = isSpaces || isLab || isPublicForm;

  useEffect(() => {
    cleanupLegacyUnscopedBrainSuggestionStorageOnce();
  }, []);

  const isHome = pathname === "/" || pathname === "/en";

  return (
    <LanguageProvider>
      {isFullViewport ? (
        <main className="h-screen w-screen overflow-hidden">{children}</main>
      ) : (
        <div
          className={`min-h-screen w-full ${isHome ? "bg-black" : "bg-[var(--background)]"}`}
        >
          {children}
        </div>
      )}
      {!isFullViewport && !isHome && !isPublicForm ? <LanguageSwitcher /> : null}
      {!isHome && !isLab && !isPublicForm ? <BackgroundRadioPlayer /> : null}
    </LanguageProvider>
  );
}
