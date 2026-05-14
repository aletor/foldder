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
});
