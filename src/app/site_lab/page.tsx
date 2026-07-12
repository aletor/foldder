import type { Metadata } from "next";
import { SiteLabView } from "./SiteLabView";
import "./site-lab.css";

export const metadata: Metadata = {
  title: "Site Lab",
  description: "Sandbox temporal para experimentar conceptos del editor de sitios",
  robots: { index: false, follow: false },
};

export default function SiteLabPage() {
  return <SiteLabView />;
}
