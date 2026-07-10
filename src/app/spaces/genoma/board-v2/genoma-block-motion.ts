import type { SlotStatus } from "@/lib/genoma/genoma-types";
import type { SlotMotionState } from "./use-genoma-board-slot-motion";

export type GenomaBlockMotionProps = {
  motion?: SlotMotionState;
};

export function shouldShowAnalyzingSkeleton(motion: SlotMotionState | undefined): boolean {
  return motion?.phase === "skeleton";
}

export function shouldShowLegacyPendingSkeleton(
  motion: SlotMotionState | undefined,
  status: SlotStatus,
): boolean {
  return status === "pending" && !shouldShowAnalyzingSkeleton(motion);
}
