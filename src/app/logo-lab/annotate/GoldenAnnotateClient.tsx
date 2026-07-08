"use client";

import { useSearchParams } from "next/navigation";
import { GoldenAnnotateView } from "./GoldenAnnotateView";

export function GoldenAnnotateClient() {
  const params = useSearchParams();
  const doc = params.get("doc") ?? undefined;
  const run = params.get("run") ?? undefined;
  const inspect = params.get("inspect") === "1";
  return <GoldenAnnotateView initialDocId={doc} inspectRunId={inspect ? run : undefined} />;
}
