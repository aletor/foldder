import type { DesignerImageStudioSession } from "./designer-image-studio-types";

const pending = new Map<string, DesignerImageStudioSession>();

export function registerPendingNanoStudioOpenFromDesigner(
  nanoNodeId: string,
  session: DesignerImageStudioSession,
): void {
  pending.set(nanoNodeId, session);
}

export function takePendingNanoStudioOpenFromDesigner(
  nanoNodeId: string,
): DesignerImageStudioSession | null {
  const session = pending.get(nanoNodeId);
  if (!session) return null;
  pending.delete(nanoNodeId);
  return session;
}

export function dispatchOpenNanoStudioFromDesigner(
  nanoNodeId: string,
  session: DesignerImageStudioSession,
): void {
  window.dispatchEvent(
    new CustomEvent("foldder-open-nano-studio-from-designer", {
      detail: { nanoNodeId, session },
    }),
  );
}

export const FOLDDER_OPEN_DESIGNER_STUDIO_EVENT = "foldder-open-designer-studio";
