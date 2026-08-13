import type { DesignerPageState } from "../designer/DesignerNode";
import type { SiteCreatorOriginState } from "./site-creator-origin";
import type { DesignerSourceSnapshotV1 } from "./site-creator-types";

export type SiteCreatorDisplaySource = "committed" | "live-candidate";

export interface SiteCreatorDisplayPageState {
  committedPage: DesignerPageState | null;
  displayPage: DesignerPageState | null;
  displaySource: SiteCreatorDisplaySource;
}

/**
 * committedPage = sourceSnapshot.page (verdad persistida).
 * displayPage = página viva del mismo Designer, o el snapshot si no hay origen vivo válido.
 */
export function resolveSiteCreatorDisplayPage(args: {
  originState: SiteCreatorOriginState;
  snapshot: DesignerSourceSnapshotV1 | null | undefined;
  livePage: DesignerPageState | null;
}): SiteCreatorDisplayPageState {
  const committedPage = args.snapshot?.page ?? null;
  const canUseLive =
    Boolean(args.livePage) &&
    args.originState !== "different_source" &&
    args.originState !== "incompatible_document" &&
    args.originState !== "source_disconnected";

  if (canUseLive && args.livePage) {
    return {
      committedPage,
      displayPage: args.livePage,
      displaySource: "live-candidate",
    };
  }

  return {
    committedPage,
    displayPage: committedPage,
    displaySource: "committed",
  };
}
