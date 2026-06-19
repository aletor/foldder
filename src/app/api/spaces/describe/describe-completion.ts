import type OpenAI from "openai";
import { isValidDescriberStructuredOutput } from "@/lib/parse-describer-sections";
import { isVisionRefusalText } from "@/lib/vision-media-prepare";

type DescribeContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "auto" | "high" | "low" } };

export type DescribeCompletionResult =
  | {
      ok: true;
      description: string;
      finishReason: string;
      promptLabel: string;
      usage?: OpenAI.Completions.CompletionUsage;
    }
  | {
      ok: false;
      description: string;
      finishReason: string;
      promptLabel: string;
      usage?: OpenAI.Completions.CompletionUsage;
    };

export function isAcceptableDescriberCompletion(description: string): boolean {
  return (
    Boolean(description.trim())
    && !isVisionRefusalText(description)
    && isValidDescriberStructuredOutput(description)
  );
}

export async function runDescribeVisionCompletion(input: {
  openai: OpenAI;
  mediaUrlForModel: string;
  prompt: string;
  promptLabel: string;
}): Promise<DescribeCompletionResult> {
  const contentPayload: DescribeContentPart[] = [
    { type: "text", text: input.prompt },
    {
      type: "image_url",
      image_url: { url: input.mediaUrlForModel, detail: "high" },
    },
  ];

  const completion = await input.openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: contentPayload }],
    max_tokens: 4096,
    temperature: 0.35,
  });

  const choice = completion.choices[0];
  const description = choice?.message?.content || "";
  const finishReason = choice?.finish_reason ?? "unknown";

  if (isAcceptableDescriberCompletion(description)) {
    return {
      ok: true,
      description,
      finishReason,
      promptLabel: input.promptLabel,
      usage: completion.usage,
    };
  }

  return {
    ok: false,
    description,
    finishReason,
    promptLabel: input.promptLabel,
    usage: completion.usage,
  };
}
