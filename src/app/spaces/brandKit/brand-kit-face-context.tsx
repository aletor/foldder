"use client";

import { createContext, useContext } from "react";
import type { Genome } from "@/lib/brandkit/model/trait";
import type { TraitId } from "@/lib/brandkit/model/trait-ids";
import type { BrandKitBookView } from "@/lib/brandkit/projection/book-view";

type BrandKitFaceContextValue = {
  genome?: Genome;
  view: BrandKitBookView;
  onGenomeChange?: (g: Genome) => void;
  onCrown?: (traitId: TraitId, candidateId: string) => void;
  onVectorizeLogo?: (candidateId: string) => void | Promise<void>;
  onIntakeLogoUnlock?: () => void | Promise<void>;
  vectorizeEnabled?: boolean;
};

const BrandKitFaceContext = createContext<BrandKitFaceContextValue | null>(null);

export function BrandKitFaceProvider({
  value,
  children,
}: {
  value: BrandKitFaceContextValue;
  children: React.ReactNode;
}) {
  return <BrandKitFaceContext.Provider value={value}>{children}</BrandKitFaceContext.Provider>;
}

export function useBrandKitFaceContext(): BrandKitFaceContextValue | null {
  return useContext(BrandKitFaceContext);
}
