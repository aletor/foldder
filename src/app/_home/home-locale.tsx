"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppLanguage } from "@/lib/i18n";

const HomeLocaleContext = createContext<AppLanguage>("es");

export function HomeLocaleProvider({
  locale,
  children,
}: {
  locale: AppLanguage;
  children: ReactNode;
}) {
  return <HomeLocaleContext.Provider value={locale}>{children}</HomeLocaleContext.Provider>;
}

export function useHomeLocale(): AppLanguage {
  return useContext(HomeLocaleContext);
}
