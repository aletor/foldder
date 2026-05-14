import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readRecentSpacesSaveTelemetry } from "@/lib/spaces-save-telemetry";

export const runtime = "nodejs";

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function isAdminUser(email: string): boolean {
  const configured = (
    process.env.FOLDDER_ADMIN_EMAILS ||
    process.env.ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
  if (configured.length === 0) return false;
  return configured.includes(email);
}

async function ensureAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const guard = await ensureAdmin();
    if (guard) return guard;

    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") ?? "2");
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const events = await readRecentSpacesSaveTelemetry({ days, limit });
    const byStatus = events.reduce<Record<string, number>>((acc, event) => {
      acc[event.status] = (acc[event.status] ?? 0) + 1;
      return acc;
    }, {});
    const byOperation = events.reduce<Record<string, number>>((acc, event) => {
      acc[event.operation] = (acc[event.operation] ?? 0) + 1;
      return acc;
    }, {});
    const durations = events.map((event) => event.durationMs).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    const p95Index = durations.length ? Math.min(durations.length - 1, Math.floor(durations.length * 0.95)) : -1;
    const payloadBytes = events.reduce((acc, event) => acc + (event.payloadBytes ?? 0), 0);
    const chunks = events.reduce((acc, event) => acc + (event.chunkCount ?? 0), 0);
    const mediaKeys = events.reduce((acc, event) => acc + (event.mediaKeyCount ?? 0), 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        events: events.length,
        byOperation,
        byStatus,
        mediaKeys,
        payloadBytes,
        storedChunks: chunks,
        p95DurationMs: p95Index >= 0 ? durations[p95Index] : null,
      },
      events,
    });
  } catch (error) {
    console.error("[admin][save-health] failed:", error);
    return NextResponse.json({ error: "Failed to read save telemetry" }, { status: 500 });
  }
}
