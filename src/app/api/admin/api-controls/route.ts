import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getApiServiceControls,
  setApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { USAGE_SERVICES, type UsageServiceId } from "@/lib/api-usage";

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

async function ensureAdmin(): Promise<
  { ok: true; actorEmail: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isAdminUser(email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, actorEmail: email };
}

const SERVICE_IDS = new Set(USAGE_SERVICES.map((s) => s.id));

function isUsageServiceId(value: string): value is UsageServiceId {
  return SERVICE_IDS.has(value as UsageServiceId);
}

export async function GET() {
  try {
    const guard = await ensureAdmin();
    if (!guard.ok) return guard.response;
    const controls = await getApiServiceControls();
    return NextResponse.json({
      controls: Object.values(controls),
    });
  } catch (error) {
    console.error("[admin][api-controls][GET] failed:", error);
    return NextResponse.json({ error: "Failed to read API controls" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await ensureAdmin();
    if (!guard.ok) return guard.response;

    const body = (await req.json()) as { serviceId?: string; enabled?: boolean };
    const serviceId = (body.serviceId || "").trim();
    if (!isUsageServiceId(serviceId)) {
      return NextResponse.json({ error: "Invalid serviceId" }, { status: 400 });
    }
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
    }

    const controls = await setApiServiceEnabled(
      serviceId,
      body.enabled,
      guard.actorEmail,
    );
    return NextResponse.json({
      controls: Object.values(controls),
    });
  } catch (error) {
    console.error("[admin][api-controls][POST] failed:", error);
    return NextResponse.json({ error: "Failed to update API controls" }, { status: 500 });
  }
}
