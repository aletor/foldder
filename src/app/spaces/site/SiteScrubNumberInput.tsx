"use client";

import React from "react";
import { ScrubNumberInput } from "../ScrubNumberInput";

const SCRUB_TITLE = "Arrastra horizontalmente para cambiar · Mayús ×10 · Clic para escribir";

type Props = Omit<React.ComponentProps<typeof ScrubNumberInput>, "className"> & {
  className?: string;
};

/** Numérico arrastrable con tipografía frameless del Site studio. */
export function SiteScrubNumberInput({ className, title, ...rest }: Props) {
  return (
    <ScrubNumberInput
      title={title ?? SCRUB_TITLE}
      className={["site-studio__scrub", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
