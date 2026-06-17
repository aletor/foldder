export type CineStudioTab = "direction" | "script" | "cast" | "backgrounds" | "storyboard" | "output";

export type CineWorkflowSnapshot = {
  hasScript: boolean;
  hasAnalysis: boolean;
};

export type CineTabAccess = {
  id: CineStudioTab;
  unlocked: boolean;
  lockReason?: string;
  step: number;
};

const TAB_ORDER: CineStudioTab[] = ["direction", "script", "cast", "backgrounds", "storyboard", "output"];

const TAB_STEPS: Record<CineStudioTab, number> = {
  direction: 1,
  script: 2,
  cast: 3,
  backgrounds: 3,
  storyboard: 4,
  output: 5,
};

export function getCineWorkflowSnapshot(scriptText: string, hasDetected: boolean, sceneCount: number): CineWorkflowSnapshot {
  const hasScript = scriptText.trim().length > 0;
  const hasAnalysis = hasDetected || sceneCount > 0;
  return { hasScript, hasAnalysis };
}

export function getCineTabAccess(snapshot: CineWorkflowSnapshot): CineTabAccess[] {
  return TAB_ORDER.map((id) => {
    if (id === "direction") {
      return { id, unlocked: true, step: TAB_STEPS[id] };
    }
    if (id === "script") {
      return { id, unlocked: true, step: TAB_STEPS[id] };
    }
    if (!snapshot.hasScript) {
      return {
        id,
        unlocked: false,
        step: TAB_STEPS[id],
        lockReason: "Añade y guarda un guion antes de continuar",
      };
    }
    if (!snapshot.hasAnalysis) {
      return {
        id,
        unlocked: false,
        step: TAB_STEPS[id],
        lockReason: "Analiza el guion para desbloquear producción",
      };
    }
    return { id, unlocked: true, step: TAB_STEPS[id] };
  });
}

/** Primera pestaña que el usuario debe completar ahora. */
export function getCineRecommendedTab(snapshot: CineWorkflowSnapshot, preferred?: CineStudioTab): CineStudioTab {
  if (preferred) {
    const access = getCineTabAccess(snapshot).find((tab) => tab.id === preferred);
    if (access?.unlocked) return preferred;
  }
  if (!snapshot.hasScript) return "script";
  if (!snapshot.hasAnalysis) return "script";
  return "cast";
}

export function isCineTabUnlocked(tab: CineStudioTab, snapshot: CineWorkflowSnapshot): boolean {
  return getCineTabAccess(snapshot).find((item) => item.id === tab)?.unlocked ?? false;
}

export function getCineWorkflowHint(snapshot: CineWorkflowSnapshot): string | null {
  if (!snapshot.hasScript) {
    return "Paso 2 · Escribe o importa un guion para continuar.";
  }
  if (!snapshot.hasAnalysis) {
    return "Paso 2 · Analiza el guion para desbloquear reparto, fondos, storyboard y salida.";
  }
  return null;
}
