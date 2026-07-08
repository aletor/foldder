import type { Metadata } from "next";
import { BenchmarkView } from "./BenchmarkView";
import "../logo-lab.css";

export const metadata: Metadata = {
  title: "Logo Lab · Benchmark",
  robots: { index: false, follow: false },
};

export default function BenchmarkPage() {
  return <BenchmarkView />;
}
