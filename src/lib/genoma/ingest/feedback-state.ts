import type { Genome } from "../model/trait";
import { emptyGenome } from "../model/trait";
import type { GenomaIngestSectionId, GenomaIngestStreamEvent, GenomaSectionPreview } from "@/lib/genoma/ingest/types";
import { GENOMA_INGEST_SECTION_ORDER } from "@/lib/genoma/ingest/types";
import {
  COPY_GENOME_COMPLETE,
  copyConsolidatingGenome,
  copyReadingBrand,
  copyReadingNewSources,
  copyReceivingFiles,
  copyVisitingUrl,
} from "@/lib/genoma/ingest/feedback-copy";
import { buildConsolidatedFromGenome, type ConsolidatedRowState } from "./consolidated-registry";

export type { ConsolidatedRowState };

export type SectionRowState = {
  status: "pending" | "running" | "resolved" | "error";
  runningLabel?: string;
  preview?: GenomaSectionPreview;
  errorMessage?: string;
  fileName?: string;
};

export type IngestTimelineStep = {
  key: "received" | "pages" | "vision" | "logo" | "palette" | "typography" | "visual" | "voice";
  status: "pending" | "running" | "done";
  label: string;
  detail?: string;
  progress?: { done: number; total: number };
  thumbs?: string[];
  swatches?: string[];
};

export type ActivitySessionState = {
  active: boolean;
  /** true cuando el genoma ya tenía material antes de este lote. */
  incremental: boolean;
  phase: "receiving" | "reading" | "discovering" | "done";
  statusLine: string | null;
  receiveCount: number;
  sections: Record<GenomaIngestSectionId, SectionRowState>;
  micro: { text: string; id: number } | null;
  logoIntake?: LogoIntakeActivityState;
  ingestStartedAt?: number;
  cardPhase?: string | null;
  timeline: IngestTimelineStep[];
};

export type LogoIntakeActivityState = {
  status: "pending" | "running" | "resolved" | "error";
  phase?: "reading" | "detecting" | "quality";
  label?: string;
  errorMessage?: string;
};

export type GenomaIngestFeedbackState = {
  /** Registro permanente — no se reinicia al soltar otro archivo. */
  consolidated: Record<GenomaIngestSectionId, ConsolidatedRowState>;
  /** Tarjeta efímera de la ingesta en curso. */
  activity: ActivitySessionState | null;
  urlVisiting: string | null;
};

export function emptySectionRows(): Record<GenomaIngestSectionId, SectionRowState> {
  return Object.fromEntries(
    GENOMA_INGEST_SECTION_ORDER.map((id) => [id, { status: "pending" as const }]),
  ) as Record<GenomaIngestSectionId, SectionRowState>;
}

function emptyActivity(incremental = false): ActivitySessionState {
  return {
    active: false,
    incremental,
    phase: "receiving",
    statusLine: null,
    receiveCount: 0,
    sections: emptySectionRows(),
    micro: null,
    timeline: [],
    cardPhase: null,
  };
}

function upsertTimelineStep(
  steps: IngestTimelineStep[],
  key: IngestTimelineStep["key"],
  patch: Partial<IngestTimelineStep> & Pick<IngestTimelineStep, "label">,
): IngestTimelineStep[] {
  const idx = steps.findIndex((s) => s.key === key);
  const next: IngestTimelineStep = {
    key,
    status: patch.status ?? "running",
    label: patch.label,
    detail: patch.detail,
    progress: patch.progress,
    thumbs: patch.thumbs,
    swatches: patch.swatches,
  };
  if (idx >= 0) {
    const copy = [...steps];
    copy[idx] = { ...copy[idx], ...next, swatches: patch.swatches ?? copy[idx]?.swatches };
    return copy;
  }
  return [...steps, next];
}

export function idleIngestFeedback(genome: Genome = emptyGenome()): GenomaIngestFeedbackState {
  return {
    consolidated: buildConsolidatedFromGenome(genome),
    activity: null,
    urlVisiting: null,
  };
}

const SECTION_LABELS: Record<GenomaIngestSectionId, string> = {
  palette: "Paleta",
  logo: "Logo",
  typography: "Tipografía",
  visual: "Universo visual",
  voice: "Voz",
};

export function sectionLabel(id: GenomaIngestSectionId): string {
  return SECTION_LABELS[id];
}

type Action =
  | { type: "reset"; genome?: Genome }
  | { type: "files_dropped"; count: number }
  | { type: "genome_sync"; genome: Genome }
  | { type: "stream_event"; event: GenomaIngestStreamEvent };

export function reduceIngestFeedback(
  state: GenomaIngestFeedbackState,
  action: Action,
): GenomaIngestFeedbackState {
  switch (action.type) {
    case "reset":
      return idleIngestFeedback(action.genome);
    case "files_dropped": {
      const incremental = consolidatedHasContent(state);
      return {
        ...state,
        urlVisiting: null,
        activity: {
          active: true,
          incremental,
          phase: "receiving",
          statusLine: incremental
            ? copyReadingNewSources(action.count)
            : copyConsolidatingGenome(action.count),
          receiveCount: action.count,
          sections: emptySectionRows(),
          micro: null,
          logoIntake: { status: "pending" },
          ingestStartedAt: Date.now(),
          timeline: [
            {
              key: "received",
              status: "running",
              label: `Documentos recibidos (${action.count})`,
            },
          ],
          cardPhase: "recibiendo…",
        },
      };
    }
    case "genome_sync":
      return {
        ...state,
        consolidated: buildConsolidatedFromGenome(action.genome),
      };
    case "stream_event":
      return applyStreamEvent(state, action.event);
    default:
      return state;
  }
}

function ensureActivity(state: GenomaIngestFeedbackState): ActivitySessionState {
  return state.activity ?? { ...emptyActivity(), active: true };
}

function applyStreamEvent(
  state: GenomaIngestFeedbackState,
  event: GenomaIngestStreamEvent,
): GenomaIngestFeedbackState {
  const activity = ensureActivity(state);
  const nextActivity: ActivitySessionState = {
    ...activity,
    active: true,
    sections: { ...activity.sections },
    timeline: activity.timeline ?? [],
  };
  const next: GenomaIngestFeedbackState = { ...state, activity: nextActivity };

  switch (event.type) {
    case "ingest_receive":
      next.activity = {
        ...nextActivity,
        phase: "receiving",
        statusLine: copyReadingNewSources(event.fileCount),
        receiveCount: event.fileCount,
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "received", {
          status: "done",
          label: `Documentos recibidos (${event.fileCount})`,
        }),
      };
      return next;

    case "ingest_reading":
      next.activity = {
        ...nextActivity,
        phase: "discovering",
        statusLine: copyReadingBrand(event.sourceCount),
        receiveCount: Math.max(nextActivity.receiveCount, event.sourceCount),
      };
      next.urlVisiting = null;
      return next;

    case "url_visiting":
      next.urlVisiting = copyVisitingUrl(event.domain);
      return next;

    case "section_running": {
      next.activity = {
        ...nextActivity,
        phase: "discovering",
        statusLine: null,
        sections: {
          ...nextActivity.sections,
          [event.section]: {
            status: "running",
            runningLabel: event.label,
          },
        },
      };
      return next;
    }

    case "section_resolved": {
      next.activity = {
        ...nextActivity,
        sections: {
          ...nextActivity.sections,
          [event.section]: {
            status: "resolved",
            preview: event.preview,
          },
        },
        micro: { text: event.micro, id: Date.now() },
      };
      return next;
    }

    case "section_error": {
      next.activity = {
        ...nextActivity,
        sections: {
          ...nextActivity.sections,
          [event.section]: {
            status: "error",
            errorMessage: event.message,
            fileName: event.fileName,
          },
        },
      };
      return next;
    }

    case "source_error":
      next.activity = {
        ...nextActivity,
        micro: { text: event.message, id: Date.now() },
      };
      return next;

    case "page_vision_pass": {
      const text =
        event.status === "running"
          ? `Análisis visual · ${event.pagesSelected ?? "?"} páginas…`
          : event.summary ??
            (event.status === "skipped"
              ? `Análisis visual omitido · ${event.skipReason ?? "sin detalle"}`
              : `Análisis visual · ${event.pagesAnalyzed ?? 0} pág. · ${event.status}`);
      next.activity = {
        ...nextActivity,
        phase: "discovering",
        statusLine: event.status === "running" ? text : null,
        micro: event.status !== "running" ? { text, id: Date.now() } : nextActivity.micro,
        cardPhase: event.status === "running" ? "leyendo…" : nextActivity.cardPhase,
      };
      return next;
    }

    case "micro":
      next.activity = {
        ...nextActivity,
        micro: { text: event.text, id: Date.now() },
      };
      return next;

    case "genome_update":
      next.consolidated = buildConsolidatedFromGenome(event.genome);
      if (next.activity?.active) {
        const sections = { ...next.activity.sections };
        for (const id of GENOMA_INGEST_SECTION_ORDER) {
          const row = next.consolidated[id];
          if (row.status !== "empty" && row.preview && sections[id].status !== "running") {
            sections[id] = { ...sections[id], status: "resolved", preview: row.preview };
          }
        }
        next.activity = { ...next.activity, sections };
      }
      return next;

    case "done":
      next.activity = {
        ...nextActivity,
        phase: "done",
        statusLine: null,
      };
      next.urlVisiting = null;
      return next;

    case "logo_intake_running": {
      next.activity = {
        ...nextActivity,
        logoIntake: {
          status: "running",
          phase: event.phase,
          label: event.label,
        },
      };
      return next;
    }

    case "logo_intake_done": {
      const result = event.result;
      let label = "propuesta lista";
      if (result.locked) {
        label = `logo validado · ${result.newSightings ?? 0} avistamientos`;
      } else if (!result.proposal?.best) {
        label = "sin candidatos detectados";
      } else if (result.proposal.lowQuality) {
        label = "candidatos de baja calidad";
      }
      next.activity = {
        ...nextActivity,
        logoIntake: {
          status: "resolved",
          phase: "quality",
          label,
        },
      };
      return next;
    }

    case "logo_intake_error": {
      const message =
        event.message === "missing_gemini_api_key"
          ? "no se pudo completar el análisis visual · reintentar"
          : event.message;
      next.activity = {
        ...nextActivity,
        logoIntake: {
          status: "error",
          errorMessage: message,
        },
      };
      return next;
    }

    case "pages_preparing":
      next.activity = {
        ...nextActivity,
        phase: "discovering",
        cardPhase: "preparando…",
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "pages", {
          status: event.done >= event.total ? "done" : "running",
          label:
            event.done >= event.total
              ? `Páginas preparadas (${event.total} de ${event.total})`
              : `Páginas preparadas (${event.done} de ${event.total})`,
          progress: { done: event.done, total: event.total },
        }),
      };
      return next;

    case "vision_started":
      next.activity = {
        ...nextActivity,
        phase: "discovering",
        cardPhase: "leyendo…",
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "vision", {
          status: "running",
          label: `Leyendo tus ${event.pages} páginas…`,
          thumbs: event.thumbs,
        }),
      };
      return next;

    case "vision_retrying":
      next.activity = {
        ...nextActivity,
        cardPhase: "leyendo…",
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "vision", {
          status: "running",
          label: `Leyendo tus páginas…`,
          detail: `reintentando análisis visual (${event.attempt}/${event.max})…`,
          thumbs: nextActivity.timeline?.find((s) => s.key === "vision")?.thumbs,
        }),
      };
      return next;

    case "vision_finished":
      next.activity = {
        ...nextActivity,
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "vision", {
          status: "done",
          label: "Páginas leídas",
          detail: `${Math.round(event.ms / 1000)} s`,
          thumbs: nextActivity.timeline?.find((s) => s.key === "vision")?.thumbs,
        }),
      };
      return next;

    case "candidates_found":
      next.activity = {
        ...nextActivity,
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "logo", {
          status: "running",
          label: `Logo — ${event.count} candidatos · eligiendo el mejor…`,
        }),
        cardPhase: "logo…",
      };
      return next;

    case "logo_best_ready":
      next.activity = {
        ...nextActivity,
        cardPhase: "propuesto · confirmar",
        logoIntake: { status: "resolved", label: "propuesta lista" },
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "logo", {
          status: "done",
          label: "Logo propuesto",
          detail: "propuesta lista",
          thumbs: [event.thumb],
        }),
      };
      return next;

    case "palette_sampling":
      next.activity = {
        ...nextActivity,
        cardPhase: "colores…",
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "palette", {
          status: event.done >= event.total ? "done" : "running",
          label: `Colores de marca — muestreando color ${event.done} de ${event.total}…`,
          progress: { done: event.done, total: event.total },
          swatches: nextActivity.timeline?.find((s) => s.key === "palette")?.swatches,
        }),
      };
      return next;

    case "color_crowned": {
      const prevSwatches = nextActivity.timeline?.find((s) => s.key === "palette")?.swatches ?? [];
      next.activity = {
        ...nextActivity,
        cardPhase: "colores…",
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "palette", {
          status: "running",
          label: "Colores de marca",
          swatches: [...prevSwatches, event.hex],
        }),
      };
      return next;
    }

    case "palette_done":
      next.activity = {
        ...nextActivity,
        timeline: upsertTimelineStep(nextActivity.timeline ?? [], "palette", {
          status: "done",
          label: `Colores de marca (${event.count})`,
          swatches: nextActivity.timeline?.find((s) => s.key === "palette")?.swatches,
        }),
      };
      return next;

    case "ingest_done": {
      const seconds = Math.max(1, Math.round(event.totalMs / 1000));
      next.activity = {
        ...nextActivity,
        phase: "done",
        statusLine: `libro actualizado · ${seconds} s`,
        cardPhase: null,
      };
      return next;
    }

    default:
      return next;
  }
}

export function shouldClearCompleteMicro(text: string): boolean {
  return text === COPY_GENOME_COMPLETE;
}

export function consolidatedHasContent(state: GenomaIngestFeedbackState): boolean {
  return GENOMA_INGEST_SECTION_ORDER.some((id) => state.consolidated[id].status !== "empty");
}

/** Consolidado visible solo tras el primer lote o en ingesta incremental. */
export function shouldShowConsolidatedBox(state: GenomaIngestFeedbackState): boolean {
  if (!consolidatedHasContent(state)) return false;
  if (!state.activity?.active) return true;
  return state.activity.incremental;
}
