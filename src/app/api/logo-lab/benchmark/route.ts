import { NextRequest, NextResponse } from "next/server";
import {
  listBenchmarkRuns,
  loadBenchmarkRun,
  loadLatestBenchmarkRun,
} from "@/lib/genoma/logo-lab/golden/benchmark";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId")?.trim();

  if (runId === "latest" || (!runId && request.nextUrl.searchParams.get("latest") === "1")) {
    const latest = loadLatestBenchmarkRun();
    if (!latest) {
      return NextResponse.json({ error: "no_runs" }, { status: 404 });
    }
    return NextResponse.json(latest);
  }

  if (runId) {
    try {
      return NextResponse.json(loadBenchmarkRun(runId));
    } catch {
      return NextResponse.json({ error: "run_not_found" }, { status: 404 });
    }
  }

  return NextResponse.json({ runs: listBenchmarkRuns() });
}
