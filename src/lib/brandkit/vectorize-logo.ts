/**
 * L6 — Vectorización de logo solo tras validación explícita de `logo.primary`.
 */

import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { logoUrlSignature } from "./logo-signature";

export type LogoVectorizationResult = {
  attempted: boolean;
  vectorUrl?: string;
  vectorKey?: string;
  reason?: string;
};

/** Llama al endpoint server-side (credenciales Vectorizer solo en servidor). */
export async function vectorizeValidatedLogo(
  logoUrl: string | null | undefined,
): Promise<LogoVectorizationResult> {
  const url = logoUrl?.trim();
  if (!url) return { attempted: false, reason: "empty_logo" };

  try {
    const response = await fetch("/api/spaces/brain/brand/vectorize-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoRef: url }),
    });

    if (response.status === 503) {
      return { attempted: false, reason: "vectorizer_not_configured" };
    }

    const payload = (await response.json()) as {
      vectorKey?: string;
      vectorUrl?: string;
      error?: string;
    };

    if (!response.ok) {
      return { attempted: true, reason: payload.error || `http_${response.status}` };
    }

    if (!payload.vectorKey) {
      return { attempted: true, reason: "missing_vector_key" };
    }

    return {
      attempted: true,
      vectorKey: payload.vectorKey,
      vectorUrl: payload.vectorUrl,
    };
  } catch {
    return { attempted: true, reason: "network_error" };
  }
}

export function shouldVectorizeOnValidation(elementKey: string): boolean {
  return elementKey === "logo.primary";
}

export function applyVectorizationToAssets(
  assets: ProjectAssetsMetadata,
  result: LogoVectorizationResult,
): ProjectAssetsMetadata {
  if (!result.vectorKey) return assets;
  return {
    ...assets,
    brand: {
      ...assets.brand,
      logoPrimaryVector: result.vectorKey,
    },
  };
}

export function appendRejectedLogoSignature(
  assets: ProjectAssetsMetadata,
  logoUrl: string | null | undefined,
  phash?: string | null,
): ProjectAssetsMetadata {
  const sig = phash?.trim() || logoUrlSignature(logoUrl);
  if (!sig) return assets;
  const prev = assets.brainMeta?.rejectedLogoSignatures ?? [];
  if (prev.includes(sig)) return assets;
  return {
    ...assets,
    brainMeta: {
      ...assets.brainMeta,
      brainVersion: assets.brainMeta?.brainVersion ?? 1,
      analysisStatus: assets.brainMeta?.analysisStatus ?? "idle",
      staleReasons: assets.brainMeta?.staleReasons ?? [],
      rejectedLogoSignatures: [...prev, sig],
    },
  };
}
