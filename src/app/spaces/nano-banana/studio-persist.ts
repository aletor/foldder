import { rasterizeLassoToPaintData } from "./lasso-to-paint-data";
import {
  emptyStudioGlobal,
  createStudioCard,
  cardHasStartedChange,
  type StudioCard,
  type StudioGlobal,
  type StudioHistoryBrief,
} from "./studio-types";

const DATA_URL_RE = /^data:/i;

export type StudioDraftState = {
  cards: StudioCard[];
  global: StudioGlobal;
};

export type StudioLightweightCard = Omit<StudioCard, "paintData" | "references"> & {
  paintData: null;
  references: string[];
};

function isPersistableUrl(value: string): boolean {
  if (!value || DATA_URL_RE.test(value)) return false;
  return /^(https?:|\/api\/)/i.test(value) || value.includes("knowledge-files/");
}

export function stripCardForNode(card: StudioCard): StudioLightweightCard {
  return {
    assignedColor: card.assignedColor,
    description: card.description,
    id: card.id,
    lassoPoints: card.lassoPoints,
    paintData: null,
    references: card.references.filter(isPersistableUrl),
  };
}

export function stripDraftForNode(draft: StudioDraftState): StudioDraftState {
  return {
    cards: draft.cards.filter(cardHasStartedChange).map(stripCardForNode),
    global: {
      promptDraft: draft.global.promptDraft,
      text: draft.global.text,
      schemaData: isPersistableUrl(draft.global.schemaData || "") ? draft.global.schemaData : null,
    },
  };
}

function persistableOrNull(value: string | null | undefined): string | null {
  if (!value || DATA_URL_RE.test(value)) return null;
  return value;
}

export function stripBriefForNode(brief: StudioHistoryBrief): StudioHistoryBrief {
  const stripped: StudioHistoryBrief = {
    baseUrl: persistableOrNull(brief.baseUrl),
    cards: brief.cards.map(stripCardForNode),
    global: {
      promptDraft: typeof brief.global.promptDraft === "string" ? brief.global.promptDraft : "",
      text: brief.global.text,
      schemaData: persistableOrNull(brief.global.schemaData),
    },
    outputUrl: brief.outputUrl,
  };
  const rawOutputUrl = persistableOrNull(brief.rawOutputUrl);
  if (rawOutputUrl) stripped.rawOutputUrl = rawOutputUrl;
  if (brief.compose) stripped.compose = brief.compose;
  return stripped;
}

export function hydrateCardPaint(card: StudioCard, frame: { height: number; width: number }): StudioCard {
  if (card.paintData || card.lassoPoints.length < 3 || frame.width < 1) return card;
  const paintData = rasterizeLassoToPaintData(card.lassoPoints, frame.width, frame.height);
  if (!paintData) return card;
  return { ...card, paintData };
}

export function hydrateDraftPaint(draft: StudioDraftState, frame: { height: number; width: number }): StudioDraftState {
  return {
    cards: draft.cards.map((card) => hydrateCardPaint(card, frame)),
    global: draft.global,
  };
}

function mediaKey(nodeId: string): string {
  return `foldder-nb-studio-media:${nodeId}`;
}

type StudioMediaStore = {
  briefs: Record<string, { schemaData?: string | null; composeMaskPreview?: string | null }>;
  cards: Record<string, { paintData?: string | null; references?: string[] }>;
  schemaData?: string | null;
};

function readMedia(nodeId: string): StudioMediaStore {
  if (typeof sessionStorage === "undefined") return { briefs: {}, cards: {} };
  try {
    const raw = sessionStorage.getItem(mediaKey(nodeId));
    if (!raw) return { briefs: {}, cards: {} };
    const parsed = JSON.parse(raw) as StudioMediaStore;
    return {
      briefs: parsed.briefs ?? {},
      cards: parsed.cards ?? {},
      schemaData: parsed.schemaData ?? null,
    };
  } catch {
    return { briefs: {}, cards: {} };
  }
}

function writeMedia(nodeId: string, store: StudioMediaStore): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(mediaKey(nodeId), JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function persistStudioMedia(nodeId: string, draft: StudioDraftState, briefs: StudioHistoryBrief[]): void {
  const cards: StudioMediaStore["cards"] = {};
  for (const card of draft.cards) {
    cards[card.id] = {
      paintData: card.paintData,
      references: card.references,
    };
  }
  const briefMedia: StudioMediaStore["briefs"] = {};
  for (const brief of briefs) {
    briefMedia[brief.outputUrl] = {
      schemaData: brief.global.schemaData,
      composeMaskPreview: brief.composeMaskPreview ?? null,
    };
    for (const card of brief.cards) {
      cards[`${brief.outputUrl}:${card.id}`] = {
        paintData: card.paintData,
        references: card.references,
      };
    }
  }
  writeMedia(nodeId, { briefs: briefMedia, cards, schemaData: draft.global.schemaData });
}

export function mergeStudioMedia(nodeId: string, draft: StudioDraftState, briefs: StudioHistoryBrief[]): {
  briefs: StudioHistoryBrief[];
  draft: StudioDraftState;
} {
  const store = readMedia(nodeId);
  const cards = draft.cards.map((card) => {
    const extra = store.cards[card.id];
    if (!extra) return card;
    return {
      ...card,
      paintData: card.paintData || extra.paintData || null,
      references: card.references.length ? card.references : extra.references ?? [],
    };
  });
  const nextDraft: StudioDraftState = {
    cards,
    global: {
      promptDraft: draft.global.promptDraft,
      text: draft.global.text,
      schemaData: draft.global.schemaData || store.schemaData || null,
    },
  };
  const nextBriefs = briefs.map((brief) => {
    const extra = store.briefs[brief.outputUrl];
    return {
      ...brief,
      composeMaskPreview: brief.composeMaskPreview || extra?.composeMaskPreview || null,
      cards: brief.cards.map((card) => {
        const media = store.cards[`${brief.outputUrl}:${card.id}`];
        if (!media) return card;
        return {
          ...card,
          paintData: card.paintData || media.paintData || null,
          references: card.references.length ? card.references : media.references ?? [],
        };
      }),
      global: {
        promptDraft: brief.global.promptDraft ?? "",
        text: brief.global.text,
        schemaData: brief.global.schemaData || extra?.schemaData || null,
      },
    };
  });
  return { briefs: nextBriefs, draft: nextDraft };
}

export function emptyDraft(): StudioDraftState {
  return { cards: [], global: emptyStudioGlobal() };
}

export function coerceStudioDraft(raw: unknown): StudioDraftState {
  if (!raw || typeof raw !== "object") return emptyDraft();
  const draft = raw as Partial<StudioDraftState>;
  if (!Array.isArray(draft.cards)) return emptyDraft();
  return {
    cards: draft.cards.map((card, index) => ({
      ...createStudioCard(index),
      ...card,
      lassoPoints: Array.isArray(card.lassoPoints) ? card.lassoPoints : [],
      paintData: typeof card.paintData === "string" ? card.paintData : null,
      references: Array.isArray(card.references) ? card.references : [],
    })),
    global: {
      promptDraft: typeof draft.global?.promptDraft === "string" ? draft.global.promptDraft : "",
      schemaData: typeof draft.global?.schemaData === "string" ? draft.global.schemaData : null,
      text: typeof draft.global?.text === "string" ? draft.global.text : "",
    },
  };
}
