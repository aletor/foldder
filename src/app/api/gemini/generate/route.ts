import { NextRequest, NextResponse } from "next/server";
import { uploadToS3, getPresignedUrl } from "@/lib/s3-utils";
import crypto from "crypto";

// ── Model IDs ──────────────────────────────────────────────────────────────────
const MODELS = {
  flash31:  "gemini-3.1-flash-image-preview", // Nano Banana 2 — speed + quality
  pro3:     "gemini-3-pro-image-preview",      // Nano Banana Pro — professional + thinking
  flash25:  "gemini-2.5-flash-image",          // Nano Banana 1 — fast & cheap
} as const;

// ── Helper: fetch remote image → base64 ───────────────────────────────────────
async function imageUrlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
    const mimeType =
      headerMime ||
      (url.toLowerCase().includes(".png") ? "image/png" : "image/jpeg");
    return {
      data: Buffer.from(buffer).toString("base64"),
      mimeType,
    };
  } catch {
    return null;
  }
}

// ── Helper: parse image (data URL or http URL) → base64 ─────────────────────
async function parseImage(image: string): Promise<{ data: string; mimeType: string } | null> {
  if (!image) return null;
  if (image.startsWith("data:")) {
    const [meta, data] = image.split(";base64,");
    return { data, mimeType: meta.split(":")[1] };
  }
  if (image.startsWith("http")) {
    return imageUrlToBase64(image);
  }
  return null;
}

export async function POST(req: NextRequest) {
  console.log("[Gemini REST] Request received");
  try {
    const {
      prompt,
      images,         // NEW: string[] — up to 4 reference images
      image,          // legacy single image support
      aspect_ratio,
      resolution,
      model: modelKey = "flash31",  // 'flash31' | 'pro3' | 'flash25'
      thinking = false,             // NEW: thinking mode (Pro only)
    } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey)   return NextResponse.json({ error: "API Key not configured" }, { status: 500 });
    if (!prompt)   return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

    const modelId = MODELS[modelKey as keyof typeof MODELS] || MODELS.flash31;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const startTime = Date.now();
    const parts: any[] = [];

    // ── Reference images (legacy single + new multi) ──────────────────────────
    const allImages: string[] = [];
    if (images && Array.isArray(images)) allImages.push(...images.filter(Boolean));
    else if (image)                      allImages.push(image);

    const MAX_REFS = modelKey === "pro3" ? 5 : 4; // Pro supports up to 5 hi-fi
    for (const img of allImages.slice(0, MAX_REFS)) {
      const parsed = await parseImage(img);
      if (parsed) {
        parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
        console.log(`[Gemini REST] Reference image added (${parsed.mimeType})`);
      }
    }

    parts.push({ text: prompt });

    // ── Resolution map ─────────────────────────────────────────────────────────
    let imageSize = "1K";
    const resInput = (resolution || "1k").toLowerCase();
    if (resInput === "0.5k" || resInput === "512") imageSize = "512";
    else imageSize = resInput.toUpperCase(); // 1k→1K, 2k→2K, 4k→4K

    // ── Generation config ──────────────────────────────────────────────────────
    const generationConfig: any = {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: aspect_ratio || "1:1",
        ...(modelId !== MODELS.flash25 && { imageSize }), // flash25 doesn't support imageSize
      },
    };

    // Thinking mode — only for Pro model
    if (thinking && modelId === MODELS.pro3) {
      generationConfig.thinkingConfig = { thinkingBudget: -1 }; // -1 = dynamic (recommended)
      console.log("[Gemini REST] Thinking mode ENABLED");
    }

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig,
    };

    // ── API call with 1 retry on 429 ──────────────────────────────────────────
    let response: Response | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const apiStart = Date.now();
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log(`[Gemini REST] ${modelId} → ${response.status} (${Date.now() - apiStart}ms, attempt ${attempt})`);

      if (response.status === 429 && attempt < 2) {
        console.warn("[Gemini REST] 429 — waiting 5s before retry...");
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      break;
    }

    if (!response) throw new Error("No response from Gemini API");

    const data = await response.json();

    if (data.error) {
      const isQuota = response.status === 429;
      return NextResponse.json({
        error: isQuota ? "Google API Quota Reached (429)" : `Gemini Error (${response.status})`,
        details: data.error?.message || JSON.stringify(data),
      }, { status: response.status || 500 });
    }

    // ── Extract image from response ───────────────────────────────────────────
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason || data.promptFeedback?.blockReason || "UNKNOWN";
    console.log(`[Gemini REST] finishReason: ${finishReason}`);

    let imageBuffer: Buffer | null = null;
    for (const part of candidate?.content?.parts || []) {
      const inlineData = part.inline_data || part.inlineData;
      if (inlineData?.data) {
        imageBuffer = Buffer.from(inlineData.data, "base64");
        break;
      }
    }

    if (!imageBuffer) {
      const textResponse = (candidate?.content?.parts || []).find((p: any) => p.text)?.text || "";
      const msgMap: Record<string, string> = {
        SAFETY:   "Safety violation: Prompt or content blocked.",
        OTHER:    "Content blocked (copyright/safety filter). Try a more generic prompt.",
        UNKNOWN:  "No image was generated. Try a different prompt.",
      };
      return NextResponse.json({
        error: msgMap[finishReason] || msgMap.UNKNOWN,
        details: textResponse || `Finish Reason: ${finishReason}`,
      }, { status: 500 });
    }

    // ── Upload to S3 ──────────────────────────────────────────────────────────
    console.log("[Gemini REST] Saving to S3...");
    const filename = `gemini_${modelKey}_${crypto.randomUUID()}.png`;
    const key = await uploadToS3(filename, imageBuffer, "image/png");
    const url = await getPresignedUrl(key);

    return NextResponse.json({
      output: url,
      key,
      model: modelId,
      time: Date.now() - startTime,
    });

  } catch (error: any) {
    console.error("[Gemini REST] Exception:", error.message);
    return NextResponse.json({ error: `Server Exception: ${error.message}` }, { status: 500 });
  }
}
