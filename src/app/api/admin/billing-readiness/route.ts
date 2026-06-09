import { NextResponse } from "next/server";
import { requireFoldderAdmin } from "@/lib/admin-auth";
import { getBillingReadinessReport } from "@/lib/billing-readiness";

export const runtime = "nodejs";

export async function GET() {
  try {
    const guard = await requireFoldderAdmin();
    if (!guard.ok) return guard.response;
    return NextResponse.json(getBillingReadinessReport());
  } catch (error) {
    console.error("[admin][billing-readiness]", error);
    return NextResponse.json({ error: "Failed to read billing readiness" }, { status: 500 });
  }
}
