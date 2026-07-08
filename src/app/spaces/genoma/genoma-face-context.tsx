"use client";

import { createContext, useContext } from "react";
import type { Genome } from "@/lib/genoma/model/trait";
import type { TraitId } from "@/lib/genoma/model/trait-ids";
import type { GenomaBookView } from "@/lib/genoma/projection/book-view";

type GenomaFaceContextValue = {
  genome?: Genome;
  view: GenomaBookView;
  onGenomeChange?: (g: Genome) => void;
  onCrown?: (traitId: TraitId, candidateId: string) => void;
  onVectorizeLogo?: (candidateId: string) => void | Promise<void>;
  onIntakeLogoUnlock?: () => void | Promise<void>;
  vectorizeEnabled?: boolean;
};

const GenomaFaceContext = createContext<GenomaFaceContextValue | null>(null);

export function GenomaFaceProvider({
  value,
  children,
}: {
  value: GenomaFaceContextValue;
  children: React.ReactNode;
}) {
  return <GenomaFaceContext.Provider value={value}>{children}</GenomaFaceContext.Provider>;
}

export function useGenomaFaceContext(): GenomaFaceContextValue | null {
  return useContext(GenomaFaceContext);
}
