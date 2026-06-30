import type { Metadata } from "next";
import { AnimationLab } from "./AnimationLab";
import "./lab.css";

export const metadata: Metadata = {
  title: "Foldder Lab",
  description: "Sandbox para animaciones de bloques y diseño de espacios",
  robots: { index: false, follow: false },
};

export default function LabPage() {
  return <AnimationLab />;
}
