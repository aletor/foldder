import type { Metadata } from "next";
import { LogoLabView } from "./LogoLabView";
import "./logo-lab.css";

export const metadata: Metadata = {
  title: "Logo Lab · Genoma",
  description: "Laboratorio de bbox del modelo sobre páginas PDF — camino limpio sin fallback determinista",
  robots: { index: false, follow: false },
};

export default function LogoLabPage() {
  return <LogoLabView />;
}
