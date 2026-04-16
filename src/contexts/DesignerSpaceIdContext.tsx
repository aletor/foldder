"use client";

import React, { createContext, useContext } from "react";

/** Space activo en el lienzo (null en root o sin espacio). Usado para rutas S3 de assets Designer. */
export const DesignerSpaceIdContext = createContext<string | null>(null);

export function useDesignerSpaceId(): string | null {
  return useContext(DesignerSpaceIdContext);
}
