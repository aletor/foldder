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

  useEffect(() => {
    cleanupLegacyUnscopedBrainSuggestionStorageOnce();
  }, []);

  const isHome = pathname === "/";

  return (
    <LanguageProvider>
      {isSpaces ? (
        <main className="h-screen w-screen overflow-hidden">{children}</main>
      ) : (
        <div
          className={`min-h-screen w-full ${isHome ? "bg-black" : "bg-[var(--background)]"}`}
        >
          {children}
        </div>
      )}
      {!isSpaces && pathname !== "/" ? <LanguageSwitcher /> : null}
      {pathname !== "/" ? <BackgroundRadioPlayer /> : null}
    </LanguageProvider>
  );
}
