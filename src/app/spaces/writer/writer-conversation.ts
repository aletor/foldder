import type { StoryAskScope, StoryAskTurn } from "./writer-ask-story";

/**
 * La conversación es coherencia de diálogo, no Story.
 * Nunca entra en Continuity, Facts, State ni Trace.
 */

export const STORY_CONVERSATION_RECENT = 3;
export const STORY_CONVERSATION_SUMMARY_CHARS = 700;

export type StoryConversation = {
  id: string;
  scope: StoryAskScope;
  summary: string;
  recentTurns: StoryAskTurn[];
  relevantEntityIds: string[];
  updatedAt: string;
};

export function emptyStoryConversation(scope: StoryAskScope = { type: "global" }): StoryConversation {
  return {
    id: crypto.randomUUID(),
    scope,
    summary: "",
    recentTurns: [],
    relevantEntityIds: scope.type === "entity" ? [scope.entityId] : [],
    updatedAt: new Date().toISOString(),
  };
}

/** Reset local. No toca Story y no llama al modelo. */
export function resetStoryConversation(scope: StoryAskScope): StoryConversation {
  return emptyStoryConversation(scope);
}

/**
 * Si cambia la ficha (Pedro → Ana), empezamos conversación nueva.
 * Ampliar a Ana desde Pedro se hace via relevantEntityIds, no arrastrando otra ficha.
 */
export function conversationForScope(current: StoryConversation | null, scope: StoryAskScope): StoryConversation {
  if (!current) return emptyStoryConversation(scope);
  if (sameScope(current.scope, scope)) return current;
  return emptyStoryConversation(scope);
}

export function appendStoryConversationTurn(
  current: StoryConversation,
  input: {
    question: string;
    answer: string;
    entityIds: string[];
    conversationSummary?: string | null;
  },
): StoryConversation {
  const question = clip(input.question, 500);
  const answer = clip(input.answer, 500);
  if (!question || !answer) return current;
  const recentTurns = [...current.recentTurns, { question, answer }].slice(-STORY_CONVERSATION_RECENT);
  const relevant = [...current.relevantEntityIds];
  for (const id of input.entityIds) {
    if (id && !relevant.includes(id)) relevant.push(id);
  }
  const summary =
    typeof input.conversationSummary === "string" && input.conversationSummary.trim()
      ? clip(input.conversationSummary, STORY_CONVERSATION_SUMMARY_CHARS)
      : current.summary;
  return {
    ...current,
    summary,
    recentTurns,
    relevantEntityIds: relevant.slice(0, 8),
    updatedAt: new Date().toISOString(),
  };
}

export function conversationPriorTurns(conversation: StoryConversation | null): StoryAskTurn[] {
  if (!conversation) return [];
  return conversation.recentTurns.slice(-2);
}

export function sameScope(left: StoryAskScope, right: StoryAskScope): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "global" && right.type === "global") return true;
  return left.type === "entity" && right.type === "entity" && left.entityId === right.entityId;
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}
