import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type CostEndpointGuard = {
  route: string;
  services: string[];
};

const COST_ENDPOINTS: CostEndpointGuard[] = [
  { route: "src/app/api/beeble/[...path]/route.ts", services: ['"beeble-api"'] },
  { route: "src/app/api/gemini/analyze-areas/route.ts", services: ['"gemini-analyze"'] },
  { route: "src/app/api/gemini/analyze-correction/route.ts", services: ['"gemini-analyze"'] },
  { route: "src/app/api/gemini/describe-region/route.ts", services: ['"gemini-analyze"'] },
  { route: "src/app/api/gemini/generate/route.ts", services: ['"gemini-nano"'] },
  { route: "src/app/api/gemini/generate-stream/route.ts", services: ['"gemini-nano"'] },
  { route: "src/app/api/gemini/reference-upload/route.ts", services: ['"gemini-nano"'] },
  { route: "src/app/api/gemini/video/route.ts", services: ['"gemini-veo"'] },
  { route: "src/app/api/grok/generate/route.ts", services: ['"grok-video"'] },
  { route: "src/app/api/grok/status/[id]/route.ts", services: ['"grok-status"'] },
  { route: "src/app/api/inspiration/search/route.ts", services: ['serviceId'] },
  { route: "src/app/api/openai/enhance/route.ts", services: ['"openai-enhance"'] },
  { route: "src/app/api/openai/generate-stream/route.ts", services: ['"openai-images"'] },
  { route: "src/app/api/runway/generate/route.ts", services: ['"runway-gen3"'] },
  { route: "src/app/api/runway/status/[id]/route.ts", services: ['"runway-status"'] },
  { route: "src/app/api/seedance/video/route.ts", services: ['"seedance-video"'] },
  { route: "src/app/api/spaces/assistant/route.ts", services: ['"openai-assistant"'] },
  { route: "src/app/api/spaces/cine/analyze/route.ts", services: ['"openai-cine-analyze"'] },
  { route: "src/app/api/spaces/datasets/assistant/route.ts", services: ['"openai-dataset-assistant"'] },
  { route: "src/app/api/spaces/datasets/assistant/enrich/route.ts", services: ['"openai-dataset-assistant"'] },
  { route: "src/app/api/spaces/describe/route.ts", services: ['"openai-describe"'] },
  { route: "src/app/api/spaces/guionista/route.ts", services: ['"openai-brain-content"'] },
  { route: "src/app/api/spaces/brandKit/crawl/route.ts", services: ['"brand-kit-llm-synthesis"'] },
  { route: "src/app/api/spaces/brandKit/ingest/route.ts", services: ['"brand-kit-llm-synthesis"'] },
  { route: "src/app/api/spaces/brandKit/gallery/generate/route.ts", services: ['"gemini-nano"'] },
  { route: "src/app/api/spaces/matte/route.ts", services: ['"replicate-bg"'] },
  { route: "src/app/api/spaces/layerizer/preview-mask/route.ts", services: ['"layerizer-segment"'] },
  { route: "src/app/api/spaces/search/route.ts", services: ['"gemini-search-verify"'] },
  { route: "src/app/api/spaces/text-content/route.ts", services: ['"openai-assistant"'] },
  { route: "src/app/api/spaces/video-matte/route.ts", services: ['"replicate-vmatte"'] },
  { route: "src/app/api/video-editor/render/route.ts", services: ['"aws-fargate-render"'] },
  { route: "src/app/api/video-editor/subtitles/transcribe/route.ts", services: ['"openai-subtitles"'] },
];

const PROVIDER_SECRET_SAFE_SOURCES = Array.from(
  new Set([
    ...COST_ENDPOINTS.map(({ route }) => route),
    "src/lib/beeble-api.ts",
    "src/lib/gemini-image-generate.ts",
    "src/lib/openai-image-generate.ts",
    "src/lib/gemini-image-intent-verify.ts",
    "src/lib/video-editor/video-editor-fargate-render.ts",
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
  "src/app/api/openai/generate-stream/route.ts",
  "src/app/api/seedance/video/route.ts",
  "src/app/api/spaces/cine/analyze/route.ts",
  "src/app/api/spaces/describe/route.ts",
  "src/app/api/spaces/matte/route.ts",
  "src/app/api/spaces/search/route.ts",
  "src/app/api/spaces/assistant/route.ts",
  "src/app/api/spaces/guionista/route.ts",
  "src/app/api/spaces/brandKit/crawl/route.ts",
  "src/app/api/spaces/brandKit/gallery/generate/route.ts",
  "src/app/api/spaces/text-content/route.ts",
  "src/app/api/spaces/video-matte/route.ts",
  "src/app/api/spaces/brandKit/visual/generate/route.ts",
  "src/app/api/spaces/brandKit/logo/vectorize/route.ts",
  "src/app/api/video-editor/subtitles/transcribe/route.ts",
] as const;

const WALLET_GATED_ASYNC_START_ENDPOINTS = [
  "src/app/api/grok/generate/route.ts",
  "src/app/api/runway/generate/route.ts",
  "src/app/api/video-editor/render/route.ts",
] as const;

const WALLET_GATED_ASYNC_STATUS_ENDPOINTS = [
  "src/app/api/grok/status/[id]/route.ts",
  "src/app/api/runway/status/[id]/route.ts",
  "src/app/api/video-editor/render-status/route.ts",
] as const;

const BILLABLE_PROVIDER_ROUTE_PATTERNS = [
  "new OpenAI(",
  "api.openai.com",
  "OPENAI_API_KEY",
  "GoogleGenerativeAI",
  "GoogleGenAI",
  "generativelanguage.googleapis.com",
  "RunwayML",
  "Replicate",
  "api.x.ai",
  "PEXELS_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "ARENA_CLIENT_ID",
  "ARENA_CLIENT_SECRET",
  "createVideoEditorFargateRenderJob",
];

function routeSource(route: string): string {
  return readFileSync(path.join(process.cwd(), route), "utf8");
}

function apiRouteFiles(dir = path.join(process.cwd(), "src/app/api")): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...apiRouteFiles(full));
    } else if (name === "route.ts") {
      out.push(path.relative(process.cwd(), full));
    }
  }
  return out.sort();
}

describe("cost-sensitive API routes", () => {
  it("classifies every API route that directly touches billable providers", () => {
    const classified = new Set(COST_ENDPOINTS.map(({ route }) => route));
    const offenders = apiRouteFiles().filter((route) => {
      const source = routeSource(route);
      return BILLABLE_PROVIDER_ROUTE_PATTERNS.some((pattern) => source.includes(pattern)) && !classified.has(route);
    });

    expect(offenders).toEqual([]);
  });

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
    const offenders = WALLET_GATED_ASYNC_STATUS_ENDPOINTS.flatMap((route) => {
      const source = routeSource(route);
      const missing: string[] = [];
      if (
        !source.includes("settleProviderJobWalletCharge(") &&
        !source.includes("markVideoEditorRenderUsageRecorded(")
      ) {
        missing.push("settleProviderJobWalletCharge( or markVideoEditorRenderUsageRecorded(");
      }
      if (!source.includes("walletGateErrorResponse(")) {
        missing.push("walletGateErrorResponse(");
      }
      return missing.map((pattern) => `${route} missing ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });
});
