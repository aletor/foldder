import type { SlotStatus } from "@/lib/brandkit/brand-kit-types";
import type { SlotMotionState } from "./use-brand-kit-board-slot-motion";

export type BrandKitBlockMotionProps = {
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
