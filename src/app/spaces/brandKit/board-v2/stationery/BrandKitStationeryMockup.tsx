"use client";

import React from "react";
import type { BrandKitStationeryView } from "@/lib/brandkit/brand-kit-stationery";
import { BrandKitStationeryCard } from "./BrandKitStationeryCard";
import { BrandKitStationeryLetterhead } from "./BrandKitStationeryLetterhead";
import { BrandKitStationeryEnvelope } from "./BrandKitStationeryEnvelope";

/** Mockup fotográfico CSS — composición de piezas reales (capa 2). */
export function BrandKitStationeryMockup({ view }: { view: BrandKitStationeryView }) {
  return (
    <div className="brandKit-stationery-mockup" aria-hidden>
      <div className="brandKit-stationery-mockup__surface" />
      <div className="brandKit-stationery-mockup__letter">
        <BrandKitStationeryLetterhead view={view} />
      </div>
      <div className="brandKit-stationery-mockup__card">
        <BrandKitStationeryCard view={view} />
      </div>
      <div className="brandKit-stationery-mockup__envelope">
        <BrandKitStationeryEnvelope view={view} />
      </div>
    </div>
  );
}
