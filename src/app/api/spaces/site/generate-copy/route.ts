import { NextResponse } from "next/server";
import OpenAI from "openai";
import { recordApiUsage } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { estimateOpenAIUsd } from "@/lib/pricing-config";
import { resolveSiteAdnForPublish, type SiteAdnPublishPayload } from "@/lib/site/site-publish";
import {
  buildSiteGenerateCopyPrompt,
  parseSiteGeneratedCopy,
  type SiteGenerateCopyAction,
} from "@/lib/site/site-generate-copy";
import {
  releaseApiWalletChargeOnError,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";

const MODEL =
  process.env.OPENAI_SITE_COPY_MODEL?.trim() ||
  process.env.OPENAI_TEXT_CONTENT_MODEL?.trim() ||
  "gpt-4o-mini";

function isAction(value: unknown): value is SiteGenerateCopyAction {
  return (
    value === "hero" ||
    value === "manifesto" ||
    value === "faq" ||
    value === "pricing" ||
    value === "cta" ||
    value === "rewrite"
  );
}

export async function POST(req: Request) {
  let walletCharge: ApiWalletCharge | null = null;
  try {
    await assertApiServiceEnabled("openai-assistant");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as {
      action?: unknown;
      locale?: unknown;
      currentText?: unknown;
      adn?: SiteAdnPublishPayload | null;
    };

    if (!isAction(body.action)) {
      return NextResponse.json({ error: "action inválida" }, { status: 400 });
    }

    const locale = typeof body.locale === "string" ? body.locale.trim() || "es" : "es";
    const currentText = typeof body.currentText === "string" ? body.currentText : "";
    const adn = resolveSiteAdnForPublish(body.adn ?? null);
    const { system, user } = buildSiteGenerateCopyPrompt({
      action: body.action,
      locale,
      brandContext: adn,
      currentText,
    });

    const estimatedCostUsd = estimateOpenAIUsd(MODEL, Math.ceil((system.length + user.length) / 4), 900);
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "openai-assistant",
      provider: "openai",
      route: "/api/spaces/site/generate-copy",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.6 }),
      metadata: { model: MODEL, action: body.action },
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.45,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      return NextResponse.json({ error: "Respuesta vacía del modelo" }, { status: 502 });
    }

    const result = parseSiteGeneratedCopy(body.action, raw);
    await walletCharge?.capture({
      actualCostMicros: reserveUsdToMicros(
        estimateOpenAIUsd(
          MODEL,
          response.usage?.prompt_tokens ?? 0,
          response.usage?.completion_tokens ?? 0,
        ),
      ),
    });
    walletCharge = null;

    void recordApiUsage({
      userEmail: authState.user.email,
      serviceId: "openai-assistant",
      provider: "openai",
      route: "/api/spaces/site/generate-copy",
      model: MODEL,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (walletCharge) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    console.error("[site/generate-copy]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al generar copy" },
      { status: 500 },
    );
  }
}
