import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  StripeBillingConfigurationError,
  StripeBillingValidationError,
  handleStripeWebhook,
} from "@/lib/stripe-billing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("stripe-signature") || "";
    if (!signature) {
      return NextResponse.json({ error: "Missing Stripe-Signature header" }, { status: 400 });
    }
    const payload = await req.text();
    const result = await handleStripeWebhook({ payload, signature });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
    }
    if (error instanceof StripeBillingConfigurationError) {
      return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
    }
    if (error instanceof StripeBillingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("[billing/stripe-webhook]", error);
    return NextResponse.json({ error: "stripe_webhook_failed" }, { status: 500 });
  }
}
