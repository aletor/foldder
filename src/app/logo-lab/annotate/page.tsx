import { Suspense } from "react";
import type { Metadata } from "next";
import { GoldenAnnotateClient } from "./GoldenAnnotateClient";
import "../logo-lab.css";

export const metadata: Metadata = {
  title: "Logo Lab · Anotación GT",
  robots: { index: false, follow: false },
};

export default function GoldenAnnotatePage() {
  return (
    <Suspense fallback={<p className="logo-lab-loading">cargando…</p>}>
      <GoldenAnnotateClient />
    </Suspense>
  );
}
