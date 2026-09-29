import { fetchPostWithWalletPreflight, FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER, notifyWalletFromApiResponse } from "@/lib/wallet-fetch-preflight";
import {
  WRITER_AI_ROUTE,
  type StoryAskModelAnswer,
  type StoryDeltaPayload,
  type StoryUpdateModelAnswer,
  type WriterAiRequest,
  type WriterAskStoryContext,
  type WriterAskStoryPreview,
  type WriterUpdateStoryBatch,
  type WriterUpdateStoryPreview,
} from "./writer-ai";
import type { WriterProfile } from "./writer-document";

export type WriterAiResult = { ok: true; text: string } | { ok: false; error: string };

export async function requestWriterAssist(input: WriterAiRequest): Promise<WriterAiResult> {
  let response: Response;
  try {
    response = await fetchPostWithWalletPreflight(WRITER_AI_ROUTE, input, {
      headers: { "x-foldder-operation-id": crypto.randomUUID() },
    });
  } catch {
    return { ok: false, error: "No se ha podido escribir la propuesta." };
  }
  await notifyWalletFromApiResponse(response);
  const body = (await response.json().catch(() => null)) as { text?: unknown; error?: unknown } | null;
  if (!response.ok) {
    return {
      ok: false,
      error: typeof body?.error === "string" && body.error.trim() ? body.error : "No se ha podido escribir la propuesta.",
    };
  }
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return { ok: false, error: "La propuesta llegó vacía." };
  return { ok: true, text };
}

export type WriterAskStoryPayload = {
  action: "ask_story";
  profile: WriterProfile;
  question: string;
  previous: { question: string; answer: string } | null;
  preview: WriterAskStoryPreview;
  storyContext: WriterAskStoryContext;
};

export type WriterAskStoryResult =
  | {
      ok: true;
      answer: string;
      suggestedMemories: StoryAskModelAnswer["suggestedMemories"];
      usedContextSummary: string;
      storyDelta: StoryDeltaPayload | null;
      conversationSummary: string | null;
    }
  | { ok: false; error: string };

export async function requestWriterAskStory(input: WriterAskStoryPayload): Promise<WriterAskStoryResult> {
  let response: Response;
  try {
    response = await fetchPostWithWalletPreflight(WRITER_AI_ROUTE, input, {
      headers: { "x-foldder-operation-id": crypto.randomUUID() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/cancelada/i.test(message)) return { ok: false, error: message };
    return { ok: false, error: "No se ha podido consultar Story." };
  }
  await notifyWalletFromApiResponse(response);
  const body = (await response.json().catch(() => null)) as {
    answer?: unknown;
    suggestedMemories?: unknown;
    usedContextSummary?: unknown;
    storyDelta?: unknown;
    conversationSummary?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    return {
      ok: false,
      error: typeof body?.error === "string" && body.error.trim() ? body.error : "No se ha podido consultar Story.",
    };
  }
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (!answer) return { ok: false, error: "No se ha podido leer la respuesta." };
  const suggestedMemories = Array.isArray(body?.suggestedMemories)
    ? body.suggestedMemories.flatMap((item) => {
        if (!item || typeof item !== "object" || typeof (item as { text?: unknown }).text !== "string") return [];
        const text = (item as { text: string }).text.trim();
        return text ? [{ text }] : [];
      })
    : [];
  const usedContextSummary = typeof body?.usedContextSummary === "string" ? body.usedContextSummary.trim() : "";
  const storyDelta = body?.storyDelta && typeof body.storyDelta === "object" ? (body.storyDelta as StoryDeltaPayload) : null;
  const conversationSummary =
    typeof body?.conversationSummary === "string" && body.conversationSummary.trim() ? body.conversationSummary.trim() : null;
  return { ok: true, answer, suggestedMemories: suggestedMemories.slice(0, 1), usedContextSummary, storyDelta, conversationSummary };
}

export type WriterUpdateStoryPayload = {
  action: "update_story";
  profile: WriterProfile;
  batch: WriterUpdateStoryBatch;
  preview: WriterUpdateStoryPreview;
};

export type WriterUpdateStoryResult =
  | { ok: true; storyDelta: StoryUpdateModelAnswer["storyDelta"]; presentationDelta?: StoryUpdateModelAnswer["presentationDelta"] }
  | { ok: false; error: string };

export async function requestWriterStoryUpdate(
  input: WriterUpdateStoryPayload,
  options?: { skipPreflight?: boolean },
): Promise<WriterUpdateStoryResult> {
  let response: Response;
  try {
    response = await fetchPostWithWalletPreflight(WRITER_AI_ROUTE, input, {
      headers: {
        "x-foldder-operation-id": crypto.randomUUID(),
        ...(options?.skipPreflight ? { [FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER]: "1" } : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/cancelada/i.test(message)) return { ok: false, error: message };
    return { ok: false, error: "No se ha podido actualizar Story." };
  }
  await notifyWalletFromApiResponse(response);
  const body = (await response.json().catch(() => null)) as { storyDelta?: unknown; presentationDelta?: unknown; error?: unknown } | null;
  if (!response.ok) {
    return {
      ok: false,
      error: typeof body?.error === "string" && body.error.trim() ? body.error : "No se ha podido actualizar Story.",
    };
  }
  if (!body?.storyDelta || typeof body.storyDelta !== "object") return { ok: false, error: "No se ha podido leer la respuesta." };
  const presentationDelta =
    body.presentationDelta && typeof body.presentationDelta === "object"
      ? (body.presentationDelta as StoryUpdateModelAnswer["presentationDelta"])
      : undefined;
  return {
    ok: true,
    storyDelta: body.storyDelta as StoryUpdateModelAnswer["storyDelta"],
    ...(presentationDelta ? { presentationDelta } : {}),
  };
}
