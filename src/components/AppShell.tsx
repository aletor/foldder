"use client";

import { ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { cleanupLegacyUnscopedBrainSuggestionStorageOnce } from "@/app/spaces/brain-image-suggestions-cache";
import { LanguageProvider, LanguageSwitcher } from "@/components/LanguageProvider";

/** Full-viewport shell: composer canvas without marketing sidebar/topbar. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSpaces =
    pathname === "/spaces" || pathname?.startsWith("/spaces/");

  useEffect(() => {
    cleanupLegacyUnscopedBrainSuggestionStorageOnce();
  }, []);

  return (
    <LanguageProvider>
      {isSpaces ? (
        <main className="h-screen w-screen overflow-hidden">{children}</main>
      ) : (
        <div className="min-h-screen w-full bg-[var(--background)]">{children}</div>
      )}
      {!isSpaces ? <LanguageSwitcher /> : null}
    </LanguageProvider>
  );
}
