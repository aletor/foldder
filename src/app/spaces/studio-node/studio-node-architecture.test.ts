import { describe, expect, it } from "vitest";

import { FOLDDER_STUDIO_BODY_CLASS, FOLDDER_STUDIO_PORTAL_Z, getStudioNodeManifest, STUDIO_NODE_MANIFESTS } from "./studio-node-architecture";

describe("Studio node architecture", () => {
  it("centralizes the shared studio body class and layer", () => {
    expect(FOLDDER_STUDIO_BODY_CLASS).toBe("nb-studio-open");
    expect(FOLDDER_STUDIO_PORTAL_Z).toBeGreaterThanOrEqual(100000);
  });

  it("declares complex studio nodes in one manifest", () => {
    expect(STUDIO_NODE_MANIFESTS.designer.chrome).toBe("freehand");
    expect(STUDIO_NODE_MANIFESTS.photoRoom.ownsPortal).toBe(true);
    expect(STUDIO_NODE_MANIFESTS.guionista.chrome).toBe("editorial");
    expect(STUDIO_NODE_MANIFESTS.cine.chrome).toBe("cinematic");
  });

  it("resolves manifests by node type or app id", () => {
    expect(getStudioNodeManifest("designer")?.label).toBe("Designer");
    expect(getStudioNodeManifest("photoRoom")?.label).toBe("PhotoRoom");
    expect(getStudioNodeManifest("brain")?.nodeType).toBe("projectBrain");
    expect(getStudioNodeManifest("unknown")).toBeUndefined();
  });
});
