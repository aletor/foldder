"use client";

import {
  estimateBrandKitIngestCost,
  formatBrandKitIngestCostDetailLines,
  brandKitIngestCostEstimateLabel,
  type BrandKitIngestCostEstimate,
  type BrandKitIngestFileCostHint,
} from "@/lib/brandkit/ingest/brand-kit-ingest-cost-estimate";
import {
  dispatchWalletOpen,
  dispatchWalletRefresh,
  requestWalletCostDecision,
  type WalletCostDecisionResult,
  type WalletStatusResponse,
} from "@/lib/wallet-client-events";

async function readWalletStatus(): Promise<WalletStatusResponse | null> {
  try {
    const response = await fetch("/api/billing/wallet?limit=8", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const json = (await response.json().catch(() => null)) as WalletStatusResponse | null;
    if (!response.ok || !json) return null;
    return json;
  } catch {
    return null;
  }
}

function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function buildBrandKitIngestFileHints(files: File[]): Promise<BrandKitIngestFileCostHint[]> {
  return Promise.all(
    files.map(async (file) => {
      const dims = await readImageDimensions(file);
      return {
        name: file.name,
        mime: file.type || "application/octet-stream",
        width: dims?.width,
        height: dims?.height,
      };
    }),
  );
}

async function fetchServerIngestCostEstimate(
  files: File[],
  enableLlm: boolean,
): Promise<BrandKitIngestCostEstimate | null> {
  try {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    if (!enableLlm) form.append("enableLlm", "false");

    const response = await fetch("/api/spaces/brandKit/ingest/cost-estimate", {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { estimate?: BrandKitIngestCostEstimate };
    return json.estimate ?? null;
  } catch {
    return null;
  }
}

export async function confirmBrandKitV2IngestCost(input: {
  files: File[];
  enableLlm: boolean;
  language?: "es" | "en";
}): Promise<WalletCostDecisionResult> {
  const language = input.language ?? "es";
  const serverEstimate = await fetchServerIngestCostEstimate(input.files, input.enableLlm);
  const hints = await buildBrandKitIngestFileHints(input.files);
  const estimate = serverEstimate ?? estimateBrandKitIngestCost(hints, input.enableLlm);

  if (!estimate.lines.length || estimate.totalReserveMicros <= 0) {
    return { allowed: true, reason: "approved" };
  }

  const wallet = await readWalletStatus();
  const walletSnapshot: WalletStatusResponse = wallet ?? {
    configured: false,
    account: null,
    recentEntries: [],
    recentEntriesTruncated: false,
    topupPackages: [],
  };

  if (!walletSnapshot.configured) {
    const detail = formatBrandKitIngestCostDetailLines(estimate, language).join("\n");
    const ok = window.confirm(
      `${brandKitIngestCostEstimateLabel(estimate, language)}\n\n${detail}\n\n¿Continuar con la ingesta?`,
    );
    return { allowed: ok, reason: ok ? "approved" : "cancelled" };
  }

  const available = walletSnapshot.account?.availableMicros ?? 0;
  const blocked =
    walletSnapshot.account?.status === "blocked" ||
    walletSnapshot.account?.billingReviewRequired === true;

  if (blocked || available < estimate.totalReserveMicros) {
    dispatchWalletRefresh("preflight_blocked");
    dispatchWalletOpen("insufficient_balance");
    return { allowed: false, reason: "insufficient_balance" };
  }

  const decision = await requestWalletCostDecision({
    id: `brand-kit-ingest:${Date.now()}`,
    label: brandKitIngestCostEstimateLabel(estimate, language),
    route: "/api/spaces/brandKit/ingest",
    category: "analysis",
    estimatedCostMicros: estimate.totalEstimatedMicros,
    reserveMicros: estimate.totalReserveMicros,
    tone: "confirm",
    wallet: walletSnapshot,
    detailLines: formatBrandKitIngestCostDetailLines(estimate, language),
  });

  if (!decision.allowed) {
    dispatchWalletRefresh("preflight_blocked");
    if (decision.reason === "insufficient_balance") dispatchWalletOpen("insufficient_balance");
  }

  return decision;
}
