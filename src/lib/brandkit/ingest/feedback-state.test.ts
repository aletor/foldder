import { describe, expect, it } from "vitest";
import { proposedGenome } from "../fixtures";
import { buildConsolidatedFromGenome } from "./consolidated-registry";
import {
  idleIngestFeedback,
  reduceIngestFeedback,
  sectionLabel,
  shouldShowConsolidatedBox,
} from "./feedback-state";
import { COPY_GENOME_COMPLETE } from "./feedback-copy";

describe("reduceIngestFeedback", () => {
  it("arranca actividad sin borrar el consolidado previo", () => {
    const base = idleIngestFeedback(proposedGenome());
    expect(base.consolidated.palette.status).not.toBe("empty");

    const next = reduceIngestFeedback(base, { type: "files_dropped", count: 2 });
    expect(next.activity?.incremental).toBe(true);
    expect(next.activity?.statusLine).toBe("Leyendo 2 fuentes nuevas…");
    expect(next.consolidated.palette.status).not.toBe("empty");
    expect(next.consolidated.typography.preview?.kind).toBe("typography");
    expect(next.activity?.sections.palette.status).toBe("pending");
  });

  it("primer lote usa una sola caja de consolidación", () => {
    const next = reduceIngestFeedback(idleIngestFeedback(), { type: "files_dropped", count: 3 });
    expect(next.activity?.incremental).toBe(false);
    expect(next.activity?.statusLine).toBe("Consolidando tu brandKit · 3 documentos");
    expect(shouldShowConsolidatedBox(next)).toBe(false);
  });

  it("pasa a leyendo tu marca y resuelve secciones en la actividad", () => {
    let state = reduceIngestFeedback(idleIngestFeedback(), { type: "files_dropped", count: 1 });
    state = reduceIngestFeedback(state, {
      type: "stream_event",
      event: { type: "ingest_reading", sourceCount: 1 },
    });
    expect(state.activity?.statusLine).toBe("Leyendo tu marca");

    state = reduceIngestFeedback(state, {
      type: "stream_event",
      event: { type: "section_running", section: "palette", label: "Extrayendo colores…" },
    });
    expect(state.activity?.statusLine).toBeNull();
    expect(state.activity?.sections.palette.status).toBe("running");

    state = reduceIngestFeedback(state, {
      type: "stream_event",
      event: {
        type: "section_resolved",
        section: "palette",
        preview: { kind: "palette", swatches: ["#112233", "#445566"] },
        micro: "2 colores extraídos de tu paleta",
      },
    });
    expect(state.activity?.sections.palette.status).toBe("resolved");
    expect(state.activity?.sections.palette.preview?.kind).toBe("palette");
    expect(state.activity?.micro?.text).toBe("2 colores extraídos de tu paleta");
  });

  it("genome_update refresca consolidado y sincroniza previews de actividad", () => {
    let state = reduceIngestFeedback(idleIngestFeedback(), { type: "files_dropped", count: 1 });
    state = reduceIngestFeedback(state, {
      type: "stream_event",
      event: { type: "genome_update", genome: proposedGenome() },
    });
    expect(state.consolidated.typography.status).toBe("proposed");
    expect(state.activity?.sections.typography.preview?.kind).toBe("typography");
    expect(state.activity?.sections.palette.status).toBe("resolved");
  });

  it("marca error de sección sin detener el resto", () => {
    let state = idleIngestFeedback();
    state = reduceIngestFeedback(state, { type: "files_dropped", count: 1 });
    state = reduceIngestFeedback(state, {
      type: "stream_event",
      event: {
        type: "section_error",
        section: "logo",
        fileName: "marca.pdf",
        message: "No pude leer el logo",
      },
    });
    expect(state.activity?.sections.logo.status).toBe("error");
    expect(state.activity?.sections.logo.fileName).toBe("marca.pdf");
  });

  it("cierra actividad con micro de brandKit completo", () => {
    let state = idleIngestFeedback();
    state = reduceIngestFeedback(state, { type: "files_dropped", count: 1 });
    state = reduceIngestFeedback(state, {
      type: "stream_event",
      event: { type: "micro", text: COPY_GENOME_COMPLETE },
    });
    state = reduceIngestFeedback(state, { type: "stream_event", event: { type: "done" } });
    expect(state.activity?.phase).toBe("done");
    expect(state.activity?.micro?.text).toBe(COPY_GENOME_COMPLETE);
  });

  it("expone etiquetas de sección en español", () => {
    expect(sectionLabel("typography")).toBe("Tipografía");
    expect(sectionLabel("voice")).toBe("Voz");
  });
});

describe("buildConsolidatedFromGenome", () => {
  it("refleja material propuesto del brandKit", () => {
    const rows = buildConsolidatedFromGenome(proposedGenome());
    expect(rows.palette.status).not.toBe("empty");
    expect(rows.typography.status).toBe("proposed");
  });
});
