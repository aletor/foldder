import { describe, expect, it } from "vitest";
import {
  appendStoryConversationTurn,
  conversationForScope,
  conversationPriorTurns,
  emptyStoryConversation,
  resetStoryConversation,
} from "./writer-conversation";

describe("Story conversation", () => {
  it("resets locally without touching Story when scope changes", () => {
    const pedro = emptyStoryConversation({ type: "entity", entityId: "pedro" });
    const filled = appendStoryConversationTurn(pedro, {
      question: "¿Qué motiva a Pedro?",
      answer: "Recuperar el control.",
      entityIds: ["pedro"],
      conversationSummary: "Se explora la motivación de Pedro.",
    });
    expect(filled.summary).toContain("motivación");
    expect(filled.recentTurns).toHaveLength(1);
    const ana = conversationForScope(filled, { type: "entity", entityId: "ana" });
    expect(ana.summary).toBe("");
    expect(ana.recentTurns).toEqual([]);
    expect(ana.relevantEntityIds).toEqual(["ana"]);
    expect(filled.summary).toContain("motivación");
  });

  it("keeps summary when the model omits conversationSummary", () => {
    const start = emptyStoryConversation({ type: "global" });
    const first = appendStoryConversationTurn(start, {
      question: "¿Y si Pedro matara a Juan?",
      answer: "Sería una hipótesis dramática.",
      entityIds: ["pedro", "juan"],
      conversationSummary: "Se explora hipotéticamente que Pedro mate a Juan.",
    });
    const second = appendStoryConversationTurn(first, {
      question: "¿Y Ana?",
      answer: "Ana quedaría marcada.",
      entityIds: ["ana"],
      conversationSummary: null,
    });
    expect(second.summary).toBe(first.summary);
    expect(second.relevantEntityIds).toEqual(["pedro", "juan", "ana"]);
    expect(conversationPriorTurns(second)).toHaveLength(2);
  });

  it("caps recent turns and clears on Nueva conversación", () => {
    let current = emptyStoryConversation({ type: "entity", entityId: "pedro" });
    for (let index = 0; index < 5; index += 1) {
      current = appendStoryConversationTurn(current, {
        question: `Pregunta ${index}`,
        answer: `Respuesta ${index}`,
        entityIds: ["pedro"],
        conversationSummary: `Resumen ${index}`,
      });
    }
    expect(current.recentTurns).toHaveLength(3);
    expect(current.recentTurns[0]?.question).toBe("Pregunta 2");
    const reset = resetStoryConversation({ type: "entity", entityId: "pedro" });
    expect(reset.summary).toBe("");
    expect(reset.recentTurns).toEqual([]);
  });
});
