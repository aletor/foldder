import { execFileSync } from "node:child_process";
import { isVectorizerConfigured } from "@/lib/brandkit/vectorizer-ai-client";

export type LogoVectorizeEngine = "vectorizer_ai" | "vtracer" | "fallback";

export function resolveLogoVectorizeEngine(): LogoVectorizeEngine {
  if (process.env.BRAND_KIT_LOGO_INTAKE_VECTORIZER === "vectorizer_ai" && isVectorizerConfigured()) {
    return "vectorizer_ai";
  }
  try {
    execFileSync("vtracer", ["--version"], { stdio: "pipe" });
    return "vtracer";
  } catch {
    return "fallback";
  }
}

export function resolveLogoVectorizeCapabilities(): {
  engine: LogoVectorizeEngine;
  billable: boolean;
  vectorizeEnabled: boolean;
} {
  const walletConfigured = isVectorizerConfigured();
  const engine = resolveLogoVectorizeEngine();
  return {
    engine,
    billable: walletConfigured,
    vectorizeEnabled: walletConfigured,
  };
}
