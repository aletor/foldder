import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type CostEndpointGuard = {
  route: string;
  services: string[];
};

const COST_ENDPOINTS: CostEndpointGuard[] = [
  { route: "src/app/api/beeble/[...path]/route.ts", services: ['"beeble-api"'] },
  { route: "src/app/api/gemini/analyze-areas/route.ts", services: ['"gemini-analyze"'] },
  { route: "src/app/api/gemini/describe-region/route.ts", services: ['"gemini-analyze"'] },
  { route: "src/app/api/gemini/generate/route.ts", services: ['"gemini-nano"'] },
  { route: "src/app/api/gemini/generate-stream/route.ts", services: ['"gemini-nano"'] },
  { route: "src/app/api/gemini/reference-upload/route.ts", services: ['"gemini-nano"'] },
  { route: "src/app/api/gemini/video/route.ts", services: ['"gemini-veo"'] },
  { route: "src/app/api/grok/generate/route.ts", services: ['"grok-video"'] },
  { route: "src/app/api/grok/status/[id]/route.ts", services: ['"grok-status"'] },
  { route: "src/app/api/openai/enhance/route.ts", services: ['"openai-enhance"'] },
  { route: "src/app/api/runway/generate/route.ts", services: ['"runway-gen3"'] },
  { route: "src/app/api/runway/status/[id]/route.ts", services: ['"runway-status"'] },
  { route: "src/app/api/seedance/video/route.ts", services: ['"seedance-video"'] },
  { route: "src/app/api/spaces/assistant/route.ts", services: ['"openai-assistant"'] },
  { route: "src/app/api/spaces/brain/content/generate/route.ts", services: ['"openai-brain-content"', '"openai-embeddings"'] },
  { route: "src/app/api/spaces/brain/knowledge/analyze/route.ts", services: ['"openai-brain-analyze"', '"openai-embeddings"'] },
  { route: "src/app/api/spaces/brain/knowledge/chat/route.ts", services: ['"openai-brain-chat"', '"openai-embeddings"'] },
  { route: "src/app/api/spaces/brain/knowledge/update/route.ts", services: ['"openai-embeddings"'] },
  { route: "src/app/api/spaces/brain/visual/mosaic-intelligence/route.ts", services: ["GEMINI_VISION_ANALYSIS_SERVICE_ID"] },
  { route: "src/app/api/spaces/brain/visual/reanalyze/route.ts", services: ['"openai-vision-analysis"', '"gemini-vision-analysis"'] },
  { route: "src/app/api/spaces/cine/analyze/route.ts", services: ['"openai-cine-analyze"'] },
  { route: "src/app/api/spaces/describe/route.ts", services: ['"openai-describe"'] },
  { route: "src/app/api/spaces/guionista/route.ts", services: ['"openai-brain-content"'] },
  { route: "src/app/api/spaces/matte/route.ts", services: ['"replicate-bg"'] },
  { route: "src/app/api/spaces/search/route.ts", services: ['"gemini-search-verify"'] },
  { route: "src/app/api/spaces/text-content/route.ts", services: ['"openai-assistant"'] },
  { route: "src/app/api/spaces/video-matte/route.ts", services: ['"replicate-vmatte"'] },
];

const PROVIDER_SECRET_SAFE_SOURCES = Array.from(
  new Set([
    ...COST_ENDPOINTS.map(({ route }) => route),
    "src/lib/beeble-api.ts",
    "src/lib/gemini-image-generate.ts",
    "src/lib/gemini-image-intent-verify.ts",
  ]),
);

const WALLET_GATED_SYNC_ENDPOINTS = [
  "src/app/api/gemini/analyze-areas/route.ts",
  "src/app/api/gemini/analyze-correction/route.ts",
  "src/app/api/gemini/describe-region/route.ts",
  "src/app/api/gemini/generate/route.ts",
  "src/app/api/gemini/generate-stream/route.ts",
  "src/app/api/gemini/video/route.ts",
  "src/app/api/openai/enhance/route.ts",
  "src/app/api/seedance/video/route.ts",
  "src/app/api/spaces/cine/analyze/route.ts",
  "src/app/api/spaces/describe/route.ts",
  "src/app/api/spaces/matte/route.ts",
  "src/app/api/spaces/search/route.ts",
  "src/app/api/spaces/assistant/route.ts",
  "src/app/api/spaces/guionista/route.ts",
  "src/app/api/spaces/text-content/route.ts",
  "src/app/api/spaces/video-matte/route.ts",
] as const;

const WALLET_GATED_ASYNC_START_ENDPOINTS = [
  "src/app/api/grok/generate/route.ts",
  "src/app/api/runway/generate/route.ts",
] as const;

const WALLET_GATED_ASYNC_STATUS_ENDPOINTS = [
  "src/app/api/grok/status/[id]/route.ts",
  "src/app/api/runway/status/[id]/route.ts",
] as const;

function routeSource(route: string): string {
  return readFileSync(path.join(process.cwd(), route), "utf8");
}

describe("cost-sensitive API routes", () => {
  it("require an authenticated Foldder session", () => {
    const offenders = COST_ENDPOINTS.filter(({ route }) => {
      const source = routeSource(route);
      return !source.includes("requireSpacesAuthUser(") && !source.includes("auth(");
    }).map(({ route }) => route);

    expect(offenders).toEqual([]);
  });

  it("are wired to admin API controls before provider calls", () => {
    const offenders = COST_ENDPOINTS.flatMap(({ route, services }) => {
      const source = routeSource(route);
      return services
        .filter((service) => !source.includes(`assertApiServiceEnabled(${service}`))
        .map((service) => `${route} -> ${service}`);
    });

    expect(offenders).toEqual([]);
  });

  it("do not accept provider API keys from client request headers", () => {
    const forbiddenPatterns = [
      "req.headers.get(\"x-api-key\")",
      "req.headers.get('x-api-key')",
      "req.headers.get(\"x-beeble-api-key\")",
      "req.headers.get('x-beeble-api-key')",
    ];
    const offenders = COST_ENDPOINTS.flatMap(({ route }) => {
      const source = routeSource(route);
      return forbiddenPatterns
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${route} -> ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });

  it("do not place provider API keys in upstream query strings", () => {
    const forbiddenPatterns = [
      "generateContent?key=",
      ":download?key=",
      "?key=${apiKey}",
      "encodeURIComponent(apiKey)",
    ];
    const offenders = PROVIDER_SECRET_SAFE_SOURCES.flatMap((route) => {
      const source = routeSource(route);
      return forbiddenPatterns
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${route} -> ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });

  it("reserve and settle wallet balance before synchronous provider calls", () => {
    const requiredPatterns = [
      "reserveApiWalletCharge(",
      "releaseApiWalletChargeOnError(",
      "walletGateErrorResponse(",
      "walletCharge?.capture(",
    ];
    const offenders = WALLET_GATED_SYNC_ENDPOINTS.flatMap((route) => {
      const source = routeSource(route);
      return requiredPatterns
        .filter((pattern) => !source.includes(pattern))
        .map((pattern) => `${route} missing ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });

  it("link async provider jobs to wallet reservations", () => {
    const requiredPatterns = [
      "reserveApiWalletCharge(",
      "linkApiWalletChargeToProviderJob(",
      "releaseApiWalletChargeOnError(",
      "walletGateErrorResponse(",
    ];
    const offenders = WALLET_GATED_ASYNC_START_ENDPOINTS.flatMap((route) => {
      const source = routeSource(route);
      return requiredPatterns
        .filter((pattern) => !source.includes(pattern))
        .map((pattern) => `${route} missing ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });

  it("settle async provider reservations from terminal status routes", () => {
    const requiredPatterns = [
      "settleProviderJobWalletCharge(",
      "walletGateErrorResponse(",
    ];
    const offenders = WALLET_GATED_ASYNC_STATUS_ENDPOINTS.flatMap((route) => {
      const source = routeSource(route);
      return requiredPatterns
        .filter((pattern) => !source.includes(pattern))
        .map((pattern) => `${route} missing ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });
});
