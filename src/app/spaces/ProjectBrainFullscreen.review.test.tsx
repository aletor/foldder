import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import { defaultProjectAssets, type ProjectAssetsMetadata } from "./project-assets-metadata";
import { ProjectBrainFullscreen } from "./ProjectBrainFullscreen";

/** Evita el autofill visual (llamadas a /api/gemini) en tests. */
function assetsMetadataForTests(): ProjectAssetsMetadata {
  const base = defaultProjectAssets();
  const fill = <K extends keyof ProjectAssetsMetadata["strategy"]["visualStyle"]>(key: K) => ({
    ...base.strategy.visualStyle[key],
    imageUrl: "https://example.com/brain-test-visual.png",
  });
  return {
    ...base,
    knowledge: {
      ...base.knowledge,
      corporateContext: "Resumen recibido en el pozo para la marca de prueba.",
      documents: [
        {
          id: "doc-brain-review-1",
          name: "Brief de marca.txt",
          size: 1024,
          mime: "text/plain",
          scope: "core",
          brainSourceScope: "brand",
          type: "document",
          format: "txt",
          status: "Analizado",
          uploadedAt: "2026-01-01T10:00:00.000Z",
          extractedContext: "Resumen recibido en el pozo para la marca de prueba.",
        },
      ],
    },
    strategy: {
      ...base.strategy,
      visualStyle: {
        protagonist: fill("protagonist"),
        environment: fill("environment"),
        textures: fill("textures"),
        people: fill("people"),
      },
    },
  };
}

function jsonResponse(data: unknown, ok = true): Response {
  const text = JSON.stringify(data);
  return {
    ok,
    status: ok ? 200 : 400,
    text: async () => text,
  } as Response;
}

const pendingRow: StoredLearningCandidate = {
  id: "lc-ui-1",
  projectId: "proj-ui",
  telemetryNodeType: "DESIGNER",
  status: "PENDING_REVIEW",
  candidate: {
    type: "PROJECT_MEMORY",
    scope: "PROJECT",
    topic: "tono",
    value: "Preferís párrafos cortos en fichas de producto.",
    confidence: 0.55,
    reasoning: "Detectamos ajustes repetidos en longitud de copy.",
    evidence: {
      sourceNodeIds: ["designer-1"],
      sourceNodeTypes: ["designer"],
      primarySourceNodeId: "designer-1",
      evidenceSource: "telemetry",
      examples: ["Ejemplo de párrafo corto"],
      eventCounts: { evt_MANUAL_OVERRIDE: 2 },
    },
  },
  sourceSessionIds: ["sess-1"],
  createdAt: "2026-01-01T12:00:00.000Z",
};

const pendingRowWithTrace: StoredLearningCandidate = {
  ...pendingRow,
  id: "lc-ui-trace-1",
  decisionTraceId: "bdt_learning_candidate_ui_test",
  decisionTrace: {
    id: "bdt_learning_candidate_ui_test",
    kind: "learning_candidate",
    createdAt: "2026-01-01T12:01:00.000Z",
    targetNodeType: "designer",
    targetNodeId: "designer-1",
    inputs: [
      { id: "candidate_topic", kind: "candidate", label: "PROJECT_MEMORY / tono" },
      { id: "ev_1", kind: "event_count", label: "evt_MANUAL_OVERRIDE: 2" },
    ],
    outputSummary: {
      title: "Learning Candidate",
      summary: "Origen visual/restudy: visual_reference. Detectamos ajustes repetidos en longitud de copy.",
      confidence: 0.55,
      warnings: ["señal parcial"],
    },
    conflicts: [
      {
        id: "conf-1",
        left: "tono breve",
        right: "tono largo",
        resolution: "priorizar breve",
        severity: "medium",
      },
    ],
    discardedSignals: [
      {
        id: "discarded-1",
        kind: "slice",
        summary: "safe_generation",
        reason: "available_but_not_used",
      },
    ],
    confidence: 0.55,
  },
};

describe("ProjectBrainFullscreen — pestaña Por revisar", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/spaces/brain/learning/pending")) {
        return jsonResponse({ items: [pendingRow] });
      }
      if (url.includes("/api/spaces/brain/telemetry/summary")) {
        return jsonResponse({ nodes: [] });
      }
      if (url.includes("/api/spaces/brain/learning/resolve")) {
        return jsonResponse({ ok: true, learningId: pendingRow.id, action: "PROMOTE_TO_DNA" });
      }
      return jsonResponse({ ok: true });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra ADN y conocimiento base (sidebar) al abrir", async () => {
    const onChange = vi.fn();
    const assets = assetsMetadataForTests();
    render(
      <ProjectBrainFullscreen
        open
        onClose={() => {}}
        assetsMetadata={assets}
        onAssetsMetadataChange={onChange}
        projectId="proj-ui"
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: /^Brain$/i })).toBeInTheDocument();
    await user.click(screen.getByTestId("brain-tab-sources"));
    await user.click(screen.getByTestId("brain-subtab-knowledge"));
    expect(await within(dialog).findByText(/Brief de marca\.txt/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Ver ADN/i }));
    expect(await within(dialog).findByText(/Resumen recibido en el pozo/i)).toBeInTheDocument();
  });

  it("muestra vacío cuando no hay pendientes", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/spaces/brain/learning/pending")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/api/spaces/brain/telemetry/summary")) {
        return jsonResponse({ nodes: [] });
      }
      return jsonResponse({ ok: true });
    });
    const onChange = vi.fn();
    render(
      <ProjectBrainFullscreen
        open
        onClose={() => {}}
        assetsMetadata={assetsMetadataForTests()}
        onAssetsMetadataChange={onChange}
        projectId="proj-empty"
      />,
    );
    await user.click(await screen.findByTestId("brain-tab-review"));
    expect(await screen.findByText(/Brain está al día/i)).toBeInTheDocument();
  });

  it("muestra tarjeta con ejemplo, origen, Ver por qué y acciones", async () => {
    const onChange = vi.fn();
    render(
      <ProjectBrainFullscreen
        open
        onClose={() => {}}
        assetsMetadata={assetsMetadataForTests()}
        onAssetsMetadataChange={onChange}
        projectId="proj-ui"
      />,
    );
    await user.click(await screen.findByTestId("brain-tab-review"));
    expect(await screen.findByText(/Brain ha detectado que Preferís párrafos cortos/i)).toBeInTheDocument();
    expect(screen.getByText(/Designer · información recibida/i)).toBeInTheDocument();
    expect(screen.getByText(/Telemetría de nodo/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ver razonamiento/i }));
    expect(screen.getByText(/Detectamos ajustes repetidos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver por qué/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ver por qué/i }));
    expect(await screen.findByText(/Origen: una acción reciente/i)).toBeInTheDocument();
  });

  it("muestra “Por qué Brain propone esto” cuando el pending trae decisionTrace", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/spaces/brain/learning/pending")) {
        return jsonResponse({ items: [pendingRowWithTrace] });
      }
      if (url.includes("/api/spaces/brain/telemetry/summary")) {
        return jsonResponse({ nodes: [] });
      }
      return jsonResponse({ ok: true });
    });
    const onChange = vi.fn();
    render(
      <ProjectBrainFullscreen
        open
        onClose={() => {}}
        assetsMetadata={assetsMetadataForTests()}
        onAssetsMetadataChange={onChange}
        projectId="proj-ui"
      />,
    );
    await user.click(await screen.findByTestId("brain-tab-review"));
    const toggle = await screen.findByText(/Por qué Brain propone esto/i);
    expect(toggle).toBeInTheDocument();
    await user.click(toggle);
    expect(await screen.findByText(/Propuesta de aprendizaje/i)).toBeInTheDocument();
    expect(screen.getByText(/Origen visual\/restudy/i)).toBeInTheDocument();
    expect(screen.getByText(/Inputs principales:/i)).toBeInTheDocument();
    expect(screen.getByText(/Warnings:/i)).toBeInTheDocument();
    expect(screen.getByText(/Conflictos:/i)).toBeInTheDocument();
    expect(screen.getByText(/Señales descartadas:/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("no muestra “Por qué Brain propone esto” si el pending no trae decisionTrace", async () => {
    const onChange = vi.fn();
    render(
      <ProjectBrainFullscreen
        open
        onClose={() => {}}
        assetsMetadata={assetsMetadataForTests()}
        onAssetsMetadataChange={onChange}
        projectId="proj-ui"
      />,
    );
    await user.click(await screen.findByTestId("brain-tab-review"));
    await screen.findByText(/Brain ha detectado que Preferís párrafos cortos/i);
    expect(screen.queryByText(/Por qué Brain propone esto/i)).toBeNull();
  });

  async function openReviewAndClickAction(actionLabel: RegExp, bodySnippet: string) {
    const onChange = vi.fn();
    render(
      <ProjectBrainFullscreen
        open
        onClose={() => {}}
        assetsMetadata={assetsMetadataForTests()}
        onAssetsMetadataChange={onChange}
        projectId="proj-ui"
      />,
    );
    await user.click(await screen.findByTestId("brain-tab-review"));
    await screen.findByText(/Brain ha detectado que Preferís párrafos cortos/i);
    await user.click(screen.getByRole("button", { name: actionLabel }));
    await waitFor(() => {
      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      const resolveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/spaces/brain/learning/resolve"));
      expect(resolveCall).toBeDefined();
      const init = resolveCall![1] as { method?: string; body?: string };
      expect(init.method).toBe("POST");
      expect(init.body).toContain(bodySnippet);
      expect(init.body).toContain("lc-ui-1");
    });
  }

  it("Guardar en ADN → resolve con PROMOTE_TO_DNA", async () => {
    await openReviewAndClickAction(/Guardar en ADN/i, "PROMOTE_TO_DNA");
  });

  it("Tras Guardar en ADN se actualizan assets del proyecto (no solo toast)", async () => {
    const onChange = vi.fn();
    render(
      <ProjectBrainFullscreen
        open
        onClose={() => {}}
        assetsMetadata={assetsMetadataForTests()}
        onAssetsMetadataChange={onChange}
        projectId="proj-ui"
      />,
    );
    await user.click(await screen.findByTestId("brain-tab-review"));
    await screen.findByText(/Brain ha detectado que Preferís párrafos cortos/i);
    await user.click(screen.getByRole("button", { name: /Guardar en ADN/i }));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const payload = onChange.mock.calls[0]![0] as ProjectAssetsMetadata;
    expect(payload.knowledge.projectOnlyMemories?.length).toBeGreaterThan(0);
    expect(payload.knowledge.projectOnlyMemories?.[0]?.value).toMatch(/párrafos cortos/i);
  });

  it("Descartar no modifica assets", async () => {
    const onChange = vi.fn();
    render(
      <ProjectBrainFullscreen
        open
        onClose={() => {}}
        assetsMetadata={assetsMetadataForTests()}
        onAssetsMetadataChange={onChange}
        projectId="proj-ui"
      />,
    );
    await user.click(await screen.findByTestId("brain-tab-review"));
    await screen.findByText(/Brain ha detectado que Preferís párrafos cortos/i);
    await user.click(screen.getByRole("button", { name: /Descartar/i }));
    await waitFor(() => {
      const resolveCall = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
        String(c[0]).includes("/api/spaces/brain/learning/resolve"),
      );
      expect(resolveCall).toBeDefined();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Solo este proyecto → KEEP_IN_PROJECT", async () => {
    await openReviewAndClickAction(/Solo este proyecto/i, "KEEP_IN_PROJECT");
  });

  it("Guardar como contexto puntual → SAVE_AS_CONTEXT", async () => {
    await openReviewAndClickAction(/Guardar como contexto puntual/i, "SAVE_AS_CONTEXT");
  });

  it("Descartar → DISMISS", async () => {
    await openReviewAndClickAction(/Descartar/i, "DISMISS");
  });
});
