import type { Genome } from "@/lib/brandkit/model/trait";
import type { BrandKitIngestStreamEvent } from "@/lib/brandkit/ingest/types";
import type { LogoIntakeAnalyzeResult } from "@/lib/brandkit/logo-intake/types";
import type { MaterialPromptPayload } from "@/lib/brandkit/ingest/material-prompt";
import { FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER } from "@/lib/wallet-fetch-preflight";
import {
  confirmBrandKitIngestPaidAnalysis,
  fileContentSha256Hex,
  isPdfFile,
  resolveBrandKitIngestPaidKind,
} from "@/lib/brandkit/ingest/brand-kit-ingest-consent-client";
import {
  BRAND_KIT_INGEST_ALLOW_PAID_FIELD,
  BRAND_KIT_INGEST_OPERATION_ID_FIELD,
  BRAND_KIT_INGEST_PAID_KIND_FIELD,
} from "@/lib/brandkit/ingest/brand-kit-ingest-form";
import {
  freshBrandKitIngestOperationId,
  freshBrandKitVectorizeOperationId,
  freshBrandKitVisualOperationId,
  brandKitOperationId,
  axesSignature,
} from "@/lib/brandkit/ingest/paid-operations";
import type { ImageAxes } from "@/lib/brandkit/model/trait-values";

export async function streamBrandKitIngest(input: {
  files?: FileList | File[];
  url?: string;
  genome: Genome;
  onEvent: (event: BrandKitIngestStreamEvent) => void;
}): Promise<{ genome: Genome; prompts: MaterialPromptPayload[] }> {
  const paidKind = await resolveBrandKitIngestPaidKind(input);
  let paidApproved = false;
  let paidOperationId: string | undefined;

  if (paidKind) {
    const contentSignature =
      paidKind === "url"
        ? input.url!.trim()
        : await (async () => {
            for (const file of Array.from(input.files ?? [])) {
              if (isPdfFile(file)) return fileContentSha256Hex(file);
            }
            return "pdf";
          })();

    const decision = await confirmBrandKitIngestPaidAnalysis({
      kind: paidKind,
      contentSignature,
    });
    if (!decision.allowed) {
      throw new Error(
        decision.reason === "insufficient_balance"
          ? "Saldo insuficiente para analizar este documento."
          : "Análisis cancelado.",
      );
    }
    paidApproved = true;
    paidOperationId = decision.operationId ?? freshBrandKitIngestOperationId(contentSignature);
  }

  const formData = new FormData();
  if (input.url?.trim()) {
    formData.append("url", input.url.trim());
  } else {
    const list = Array.from(input.files ?? []);
    list.forEach((file) => formData.append("file", file));
  }
  formData.append("genome", JSON.stringify(input.genome));
  if (paidApproved && paidKind) {
    formData.append(BRAND_KIT_INGEST_ALLOW_PAID_FIELD, "1");
    formData.append(BRAND_KIT_INGEST_PAID_KIND_FIELD, paidKind);
    if (paidOperationId) {
      formData.append(BRAND_KIT_INGEST_OPERATION_ID_FIELD, paidOperationId);
    }
  }

  const res = await fetch("/api/spaces/brandKit/ingest", {
    method: "POST",
    body: formData,
    headers: { [FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER]: "1" },
  });
  if (!res.ok || !res.body) throw new Error("No pude leer tus archivos");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latestGenome = input.genome;
  const prompts: MaterialPromptPayload[] = [];
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as BrandKitIngestStreamEvent;
      input.onEvent(event);
      if (event.type === "genome_update") latestGenome = event.genome;
      if (event.type === "material_prompt") prompts.push(event.prompt);
      if (event.type === "source_error") streamError = event.message;
    }
  }

  if (streamError) throw new Error(streamError);

  return { genome: latestGenome, prompts };
}

export async function streamCombinedMaterialDrop(input: {
  projectId: string;
  files: FileList | File[];
  genome: Genome;
  onEvent: (event: BrandKitIngestStreamEvent) => void;
}): Promise<{ genome: Genome; prompts: MaterialPromptPayload[]; logoIntake?: LogoIntakeAnalyzeResult }> {
  const paidKind = await resolveBrandKitIngestPaidKind({ files: input.files, genome: input.genome });
  let paidApproved = false;
  let paidOperationId: string | undefined;

  if (paidKind) {
    const contentSignature = await (async () => {
      for (const file of Array.from(input.files ?? [])) {
        if (isPdfFile(file)) return fileContentSha256Hex(file);
      }
      return "pdf";
    })();

    const decision = await confirmBrandKitIngestPaidAnalysis({
      kind: paidKind,
      contentSignature,
    });
    if (!decision.allowed) {
      throw new Error(
        decision.reason === "insufficient_balance"
          ? "Saldo insuficiente para analizar este documento."
          : "Análisis cancelado.",
      );
    }
    paidApproved = true;
    paidOperationId = decision.operationId ?? freshBrandKitIngestOperationId(contentSignature);
  }

  const formData = new FormData();
  formData.append("projectId", input.projectId);
  Array.from(input.files).forEach((file) => formData.append("file", file));
  formData.append("genome", JSON.stringify(input.genome));
  if (paidApproved && paidKind) {
    formData.append(BRAND_KIT_INGEST_ALLOW_PAID_FIELD, "1");
    formData.append(BRAND_KIT_INGEST_PAID_KIND_FIELD, paidKind);
    if (paidOperationId) {
      formData.append(BRAND_KIT_INGEST_OPERATION_ID_FIELD, paidOperationId);
    }
  }

  const res = await fetch("/api/spaces/brandKit/drop-material", {
    method: "POST",
    body: formData,
    headers: { [FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER]: "1" },
  });
  if (!res.ok || !res.body) throw new Error("No pude leer tus archivos");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latestGenome = input.genome;
  const prompts: MaterialPromptPayload[] = [];
  let streamError: string | null = null;
  let logoIntake: LogoIntakeAnalyzeResult | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as BrandKitIngestStreamEvent;
      input.onEvent(event);
      if (event.type === "genome_update") latestGenome = event.genome;
      if (event.type === "material_prompt") prompts.push(event.prompt);
      if (event.type === "source_error") streamError = event.message;
      if (event.type === "logo_intake_done") logoIntake = event.result;
    }
  }

  if (streamError) throw new Error(streamError);

  return { genome: latestGenome, prompts, logoIntake };
}

export async function generateVisualTerritoryImage(
  axes: ImageAxes,
  opts: { cachedImageUrl?: string; referenceImageUrl?: string } = {},
): Promise<string> {
  const signature = axesSignature(axes);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const operationId = freshBrandKitVisualOperationId(signature);
    const res = await fetch("/api/spaces/brandKit/visual/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-foldder-operation-id": operationId,
      },
      body: JSON.stringify({
        axes,
        operationId,
        cachedImageUrl: opts.cachedImageUrl,
        referenceImageUrl: opts.referenceImageUrl,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      imageUrl?: string;
      error?: string;
      code?: string;
    };

    if (res.ok && data.imageUrl) return data.imageUrl;

    if (data.code === "duplicate_wallet_operation" && attempt === 0) continue;

    if (data.code === "insufficient_balance") {
      throw new Error("Saldo insuficiente para generar la imagen de referencia.");
    }
    if (data.code === "wallet_preflight_cancelled") {
      throw new Error("Operación cancelada antes de reservar saldo.");
    }
    throw new Error(data.error ?? "No pude generar la imagen");
  }

  throw new Error("No pude generar la imagen");
}

export type BrandKitLogoVectorizeResult = {
  vectorUrl?: string;
  vectorKey?: string;
  cached?: boolean;
  walletReservationId?: string;
  reason?: string;
  code?: string;
};

export async function vectorizeBrandKitLogo(input: {
  logoUrl: string;
  logoSignature: string;
  cachedVectorUrl?: string;
  vectorSource?: import("@/lib/brandkit/model/evidence").LogoVectorSourceRef;
}): Promise<BrandKitLogoVectorizeResult> {
  const operationId = freshBrandKitVectorizeOperationId(input.logoSignature);
  try {
    const res = await fetch("/api/spaces/brandKit/logo/vectorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-foldder-operation-id": operationId,
      },
      body: JSON.stringify({
        logoUrl: input.logoUrl,
        logoSignature: input.logoSignature,
        cachedVectorUrl: input.cachedVectorUrl,
        vectorSource: input.vectorSource,
        operationId,
      }),
    });
    if (res.status === 503) return { reason: "vectorizer_not_configured" };
    const data = (await res.json()) as BrandKitLogoVectorizeResult & { error?: string; code?: string };
    if (!res.ok) {
      return {
        reason: data.error ?? data.code ?? `http_${res.status}`,
        code: data.code,
      };
    }
    return data;
  } catch {
    return { reason: "network_error" };
  }
}
