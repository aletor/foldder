import { setResponsiveOverride } from "./site-creator-responsive-overrides";
import { patchContainerTune } from "./site-creator-responsive-tunes";
import type {
  ResponsiveEditableBand,
  ResponsiveTargetRef,
  SiteBlueprintV1,
} from "./site-creator-types";

const DEFAULT_BANDS: ResponsiveEditableBand[] = ["tablet", "mobile"];

/** Defaults al crear sección: Mantener composición, sin padding/gap extra. */
export function applyNewSectionResponsiveDefaults(
  blueprint: SiteBlueprintV1,
  sectionId: string,
): SiteBlueprintV1 {
  const target: ResponsiveTargetRef = { kind: "blueprintNode", nodeId: sectionId };
  let next = blueprint;
  for (const band of DEFAULT_BANDS) {
    ({ blueprint: next } = setResponsiveOverride({
      blueprint: next,
      target,
      band,
      mode: "preserve",
    }));
    ({ blueprint: next } = patchContainerTune({
      blueprint: next,
      target,
      band,
      patch: { padding: 0, gap: 0, minHeight: 0 },
    }));
  }
  return next;
}
