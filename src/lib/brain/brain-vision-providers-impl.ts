import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import type { BrainVisionProviderId, BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import { recordApiUsage, parseGeminiUsageMetadata } from "@/lib/api-usage";
import {
  analysisDedupeKeyFromRef,
  buildBrainVisualMockAnalysisFromAsset,
  buildEmptyBrainVisualAnalysisShell,
  mergeVisionJsonIntoAnalysis,
  type BrainVisualAssetRef,
} from "./brain-visual-analysis";
import type { BrainVisionProvider } from "./brain-vision-provider";
import { parseVisionAnalysisJson } from "./brain-vision-json";
import { parseJsonObjectFromVisionModelText } from "./brain-vision-json-from-text";
import { BRAIN_VISION_JSON_SCHEMA_USER_PROMPT } from "./brain-vision-schema-prompt";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID, OPENAI_VISION_ANALYSIS_SERVICE_ID } from "./brain-vision-usage";

function normalizeVisionImageUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  if (u.startsWith("data:image")) return u;
  if (/^https:\/\//i.test(u)) return u;
  return null;
}

function visionFailureFallback(
  _projectId: string,
  asset: BrainVisualAssetRef,
  message: string,
  attempted: BrainVisionProviderId,
): BrainVisualImageAnalysis {
  const dedupe = analysisDedupeKeyFromRef(asset);
  return buildEmptyBrainVisualAnalysisShell(asset, dedupe, {
    analysisStatus: "failed",
    visionProviderAttempted: attempted === "mock" ? undefined : attempted,
    fallbackUsed: true,
    fallbackProvider: "mock",
    analyzerVersion: `${attempted}-failed`,
    failureReason: message.slice(0, 500),
    reasoning: `Visión remota no disponible o error al analizar. ${message}`.trim().slice(0, 800),
  });
}

export function createMockBrainVisionProvider(): BrainVisionProvider {
  return {
    id: "mock",
    async analyzeImage({ projectId, asset }) {
      const base = buildBrainVisualMockAnalysisFromAsset(projectId, asset);
      return {
        ...base,
        analysisStatus: "analyzed",
        analyzedAt: new Date().toISOString(),
        visionProviderId: "mock",
        analyzerVersion: "mock-1",
        fallbackUsed: false,
        imageUrlForVisionAvailable: Boolean(normalizeVisionImageUrl(asset.imageUrlForVision)),
      };
    },
  };
}

export function createOpenAiBrainVisionProvider(): BrainVisionProvider {
  return {
    id: "openai-vision",
    async analyzeImage({ projectId, asset, imageUrl, userEmail, route }) {
      const safeUrl = normalizeVisionImageUrl(imageUrl ?? asset.imageUrlForVision);
      const base = buildEmptyBrainVisualAnalysisShell(asset, analysisDedupeKeyFromRef(asset), {
        analysisStatus: "pending",
        analyzerVersion: "pre-openai-vision",
      });
      if (!safeUrl) {
        return visionFailureFallback(
          projectId,
          asset,
          "Sin URL https ni data URL de imagen; no se puede llamar a OpenAI Vision.",
          "openai-vision",
        );
      }
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        return visionFailureFallback(projectId, asset, "OPENAI_API_KEY no configurada.", "openai-vision");
      }
      const model = process.env.BRAIN_VISION_OPENAI_MODEL?.trim() || "gpt-4o";
      const openai = new OpenAI({ apiKey });
      try {
        const completion = await openai.chat.completions.create({
          model,
          response_format: { type: "json_object" },
          max_tokens: 2_048,
          messages: [
            {
              role: "system",
              content:
                "Eres un director de arte senior. Devuelves solo JSON válido según las instrucciones del usuario.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: BRAIN_VISION_JSON_SCHEMA_USER_PROMPT },
                { type: "image_url", image_url: { url: safeUrl, detail: "high" } },
              ],
            },
          ],
        });
        const text = completion.choices[0]?.message?.content ?? "";
        const raw = parseJsonObjectFromVisionModelText(text);
        if (!parseVisionAnalysisJson(raw)) {
          return visionFailureFallback(
            projectId,
            asset,
            "OpenAI respondió pero el JSON no pasó validación.",
            "openai-vision",
          );
        }
        const merged = mergeVisionJsonIntoAnalysis(base, raw);
        const u = completion.usage;
        await recordApiUsage({
          provider: "openai",
          userEmail,
          serviceId: OPENAI_VISION_ANALYSIS_SERVICE_ID,
          route: route ?? "/api/spaces/brain/visual/reanalyze",
          model,
          operation: "brain_vision_image",
          inputTokens: u?.prompt_tokens,
          outputTokens: u?.completion_tokens,
          totalTokens: u?.total_tokens,
        });
        return {
          ...merged,
          analysisStatus: "analyzed",
          analyzedAt: new Date().toISOString(),
          visionProviderId: "openai-vision",
          analyzerVersion: `openai-vision-${model}`,
          fallbackUsed: false,
          imageUrlForVisionAvailable: true,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return visionFailureFallback(projectId, asset, `Error OpenAI Vision: ${msg.slice(0, 240)}`, "openai-vision");
      }
    },
  };
}

export function createGeminiBrainVisionProvider(): BrainVisionProvider {
  return {
    id: "gemini-vision",
    async analyzeImage({ projectId, asset, imageUrl, userEmail, route }) {
      const safeUrl = normalizeVisionImageUrl(imageUrl ?? asset.imageUrlForVision);
      const base = buildEmptyBrainVisualAnalysisShell(asset, analysisDedupeKeyFromRef(asset), {
        analysisStatus: "pending",
        analyzerVersion: "pre-gemini-vision",
      });
      if (!safeUrl) {
        return visionFailureFallback(
          projectId,
          asset,
          "Sin URL https ni data URL de imagen; no se puede llamar a Gemini Vision.",
          "gemini-vision",
        );
      }
      const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
      if (!apiKey) {
        return visionFailureFallback(projectId, asset, "GEMINI_API_KEY / GOOGLE_API_KEY no configurada.", "gemini-vision");
      }
      // `gemini-2.0-flash` devuelve 404 para cuentas nuevas en la API de Google AI; 2.5 Flash es GA estable.
      const modelName = process.env.BRAIN_VISION_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
      try {
        let mime = "image/jpeg";
        let b64 = "";
        if (safeUrl.startsWith("data:")) {
          const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(safeUrl);
          if (!m) {
            return visionFailureFallback(projectId, asset, "data URL de imagen no reconocida.", "gemini-vision");
          }
          mime = m[1];
          b64 = m[2].replace(/\s/g, "");
        } else {
          const res = await fetch(safeUrl, { signal: AbortSignal.timeout(25_000) });
          if (!res.ok) {
            return visionFailureFallback(
              projectId,
              asset,
              `No se pudo descargar la imagen (${res.status}).`,
              "gemini-vision",
            );
          }
          const buf = Buffer.from(await res.arrayBuffer());
          b64 = buf.toString("base64");
          const ct = res.headers.get("content-type");
          if (ct?.startsWith("image/")) mime = ct.split(";")[0].trim();
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction:
            "Eres un director de arte senior. Respondes únicamente con JSON válido según las instrucciones, sin markdown.",
        });
        const r = await model.generateContent([
          { text: BRAIN_VISION_JSON_SCHEMA_USER_PROMPT },
          { inlineData: { mimeType: mime, data: b64 } },
        ]);
        const text = r.response.text();
        const raw = parseJsonObjectFromVisionModelText(text);
        if (!parseVisionAnalysisJson(raw)) {
          return visionFailureFallback(
            projectId,
            asset,
            "Gemini respondió pero el JSON no pasó validación.",
            "gemini-vision",
          );
        }
        const merged = mergeVisionJsonIntoAnalysis(base, raw);
        const u = parseGeminiUsageMetadata(r.response);
        await recordApiUsage({
          provider: "gemini",
          userEmail,
          serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
          route: route ?? "/api/spaces/brain/visual/reanalyze",
          model: modelName,
          operation: "brain_vision_image",
          inputTokens: u?.inputTokens,
          outputTokens: u?.outputTokens,
          totalTokens: u?.totalTokens,
        });
        return {
          ...merged,
          analysisStatus: "analyzed",
          analyzedAt: new Date().toISOString(),
          visionProviderId: "gemini-vision",
          analyzerVersion: `gemini-vision-${modelName}`,
          fallbackUsed: false,
          imageUrlForVisionAvailable: true,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return visionFailureFallback(projectId, asset, `Error Gemini Vision: ${msg.slice(0, 240)}`, "gemini-vision");
      }
    },
  };
}

/**
 * Orden: `BRAIN_VISION_PROVIDER` (mock|gemini|openai) → Gemini si hay clave → OpenAI si hay clave → mock.
 */
/** Forzar proveedor en re-estudio (ignora solo `BRAIN_VISION_PROVIDER` para esta corrida). */
export function createBrainVisionProviderForRestudy(choice: "gemini" | "openai" | "mock"): BrainVisionProvider {
  if (choice === "mock") return createMockBrainVisionProvider();
  if (choice === "openai") return createOpenAiBrainVisionProvider();
  return createGeminiBrainVisionProvider();
}

export function createDefaultBrainVisionProvider(): BrainVisionProvider {
  const pref = (process.env.BRAIN_VISION_PROVIDER || "").trim().toLowerCase();
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (pref === "mock") return createMockBrainVisionProvider();
  if (pref === "openai" && openaiKey) return createOpenAiBrainVisionProvider();
  if (pref === "gemini" && geminiKey) return createGeminiBrainVisionProvider();
  if (geminiKey) return createGeminiBrainVisionProvider();
  if (openaiKey) return createOpenAiBrainVisionProvider();
  return createMockBrainVisionProvider();
}
