import type {
  GenerativeFillCorrection,
  GenerativeFillRect,
  GenerativeFillResponseBody,
} from "@/lib/designer/generative-fill/types";

export async function requestGenerativeFill(args: {
  composite: string;
  selections: GenerativeFillRect[];
  pageWidth: number;
  pageHeight: number;
  prompt?: string;
  feather?: number;
  contextBleed?: number;
  seed?: number;
  mode?: "inpaint" | "outpaint";
}): Promise<GenerativeFillResponseBody> {
  const res = await fetch("/api/spaces/designer/generative-fill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = (await res.json()) as GenerativeFillResponseBody & { error?: string };
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Generative fill failed (${res.status})`);
  }
  return body;
}

export type { GenerativeFillCorrection, GenerativeFillRect };
