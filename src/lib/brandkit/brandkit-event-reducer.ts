import type { BrandKitBoardMeta, SectionId } from "./types";
import type { BrandKitEvent } from "./run-event-adapter";
import { normalizeBrandKitBoardMeta, recordSectionEvent, shouldApplySectionEvent } from "./interpretation";

function mergeSectionState(
  boardMeta: BrandKitBoardMeta,
  updates: Partial<Record<SectionId, "idle" | "running" | "error">>,
): BrandKitBoardMeta["board"]["sectionState"] {
  return { ...boardMeta.board.sectionState, ...updates };
}

function clearRunningSections(sectionState: BrandKitBoardMeta["board"]["sectionState"]) {
  const next: BrandKitBoardMeta["board"]["sectionState"] = { ...sectionState };
  for (const [key, state] of Object.entries(next)) {
    if (state === "running") next[key as SectionId] = "idle";
  }
  return next;
}

export function reduceBrandKitEvent(
  boardMetaInput: BrandKitBoardMeta | undefined,
  event: BrandKitEvent,
): BrandKitBoardMeta {
  const boardMeta = normalizeBrandKitBoardMeta(boardMetaInput);

  switch (event.type) {
    case "run.started": {
      const running = Object.fromEntries(event.affected.map((s) => [s, "running" as const])) as Partial<
        Record<SectionId, "running">
      >;
      return {
        ...boardMeta,
        board: {
          ...boardMeta.board,
          lastRunId: event.runId,
          sectionState: mergeSectionState(boardMeta, running),
        },
      };
    }
    case "section.updated": {
      if (!shouldApplySectionEvent(boardMeta, event.section, event.runId, event.seq)) {
        return boardMeta;
      }
      let next = recordSectionEvent(boardMeta, event.section, event.runId, event.seq);
      if (event.final) {
        next = {
          ...next,
          board: {
            ...next.board,
            sectionState: mergeSectionState(next, { [event.section]: "idle" }),
          },
        };
      }
      return next;
    }
    case "run.completed":
      return {
        ...boardMeta,
        review: event.review,
        board: {
          ...boardMeta.board,
          lastRunId: event.runId,
          sectionState: clearRunningSections(boardMeta.board.sectionState),
        },
      };
    case "run.failed": {
      const errorPatch = event.section
        ? ({ [event.section]: "error" as const } satisfies Partial<Record<SectionId, "error">>)
        : {};
      return {
        ...boardMeta,
        board: {
          ...boardMeta.board,
          lastRunId: event.runId,
          sectionState: { ...clearRunningSections(boardMeta.board.sectionState), ...errorPatch },
        },
      };
    }
    default:
      return boardMeta;
  }
}
