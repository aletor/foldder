import { NextRequest, NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  StripeBillingConfigurationError,
  StripeBillingValidationError,
  createWalletCheckoutSession,
  parseRequestedTopupCents,
} from "@/lib/stripe-billing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const body = (await req.json().catch(() => ({}))) as {
      amountCents?: unknown;
      amountUsd?: unknown;
      projectId?: unknown;
    };
    const amountCents = parseRequestedTopupCents(body);
    const session = await createWalletCheckoutSession({
      req,
      userEmail: authState.user.email,
      amountCents,
      returnProjectId: typeof body.projectId === "string" ? body.projectId : null,
    });
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (error instanceof StripeBillingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof StripeBillingConfigurationError) {
      const message = error.message.includes("Wallet ledger")
        ? "Wallet billing is not available in this environment."
        : "Stripe billing is not configured.";
      return NextResponse.json(
        { error: message },
        { status: 503 },
      );
    }
    console.error("[billing/checkout]", error);
    const message = error instanceof Error ? error.message : "checkout_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
