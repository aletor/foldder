"use client";

import type { GenomaBookView } from "@/lib/genoma/projection/book-view";
import { resolveLogoDisplayUrl } from "@/lib/genoma/projection/logo-display-url";
import type { LogoCandidate, LogoProposal } from "@/lib/genoma/logo-intake/types";
import { GenomaLogoImage } from "./GenomaLogoImage";

export type GenomaNodeIdentityState =
  | "empty"
  | "logoOnly"
  | "colorsOnly"
  | "full"
  | "proposedLogo"
  | "proposedWithColors";

function candidateImageSrc(candidate: { cropPng: string; cropMime?: string }): string {
  return `data:${candidate.cropMime ?? "image/png"};base64,${candidate.cropPng}`;
}

export function deriveGenomaNodeIdentityState(
  view: GenomaBookView,
  logoProposal?: LogoProposal | null,
): GenomaNodeIdentityState {
  const logoSlot = view.logo.primary;
  const hasGenomeLogo = Boolean(
    logoSlot.value && resolveLogoDisplayUrl(logoSlot.value, logoSlot.derived),
  );
  const hasProposedLogo = Boolean(logoProposal?.best && !hasGenomeLogo);
  const primary = view.palette.find((entry) => entry.role === "primary")?.slot.value?.hex;
  const secondary = view.palette.find((entry) => entry.role === "secondary")?.slot.value?.hex;
  const hasPrimary = Boolean(primary);
  const hasSecondary = Boolean(secondary);
  const hasColors = hasPrimary || hasSecondary;

  if (!hasGenomeLogo && !hasProposedLogo && !hasColors) return "empty";
  if (hasProposedLogo && hasColors) return "proposedWithColors";
  if (hasProposedLogo && !hasColors) return "proposedLogo";
  if (hasGenomeLogo && !hasColors) return "logoOnly";
  if (!hasGenomeLogo && hasColors) return "colorsOnly";
  return "full";
}

function ProposedLogoPreview({ candidate }: { candidate: LogoCandidate }) {
  return (
    <div className="relative flex h-16 w-full items-center justify-center rounded-sm bg-white/95 px-3 py-2 ring-1 ring-white/30">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={candidateImageSrc(candidate)}
        alt="logo propuesto"
        className="max-h-12 max-w-full object-contain opacity-80"
      />
      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-2 py-0.5 text-[9px] lowercase tracking-wide text-white/90">
        propuesto · confirmar
      </span>
    </div>
  );
}

export function GenomaNodeIdentityPreview({
  view,
  logoProposal,
}: {
  view: GenomaBookView;
  logoProposal?: LogoProposal | null;
}) {
  const state = deriveGenomaNodeIdentityState(view, logoProposal);
  if (state === "empty") return null;

  const logoSlot = view.logo.primary;
  const primary = view.palette.find((entry) => entry.role === "primary")?.slot.value?.hex;
  const secondary = view.palette.find((entry) => entry.role === "secondary")?.slot.value?.hex;
  const primaryName = view.palette.find((entry) => entry.role === "primary")?.slot.value?.name;
  const secondaryName = view.palette.find((entry) => entry.role === "secondary")?.slot.value?.name;
  const proposed = logoProposal?.best ?? null;

  const showGenomeLogo = state === "logoOnly" || state === "full";
  const showProposedLogo = state === "proposedLogo" || state === "proposedWithColors";
  const showColors = state === "colorsOnly" || state === "full" || state === "proposedWithColors";

  return (
    <div className="genoma-node-identity mt-4 flex w-full max-w-[220px] flex-col items-center gap-3">
      {showGenomeLogo ? (
        <div className="flex h-16 w-full items-center justify-center rounded-sm bg-white/95 px-3 py-2">
          {logoSlot.value ? (
            <GenomaLogoImage
              logo={logoSlot.value}
              derived={logoSlot.derived}
              alt="logo"
              className="max-h-12 max-w-full object-contain"
            />
          ) : null}
        </div>
      ) : null}

      {showProposedLogo && proposed ? <ProposedLogoPreview candidate={proposed} /> : null}

      {state === "logoOnly" ? (
        <p className="text-[11px] lowercase tracking-wide text-white/55">colores pendientes</p>
      ) : null}

      {state === "colorsOnly" ? (
        <p className="text-[11px] lowercase tracking-wide text-white/55">logo pendiente</p>
      ) : null}

      {state === "proposedLogo" ? (
        <p className="text-[11px] lowercase tracking-wide text-white/55">colores pendientes</p>
      ) : null}

      {showColors ? (
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            {primary ? (
              <span
                className="h-5 w-5 rounded-full ring-1 ring-white/20"
                style={{ backgroundColor: primary }}
                title={`primario ${primary}`}
              />
            ) : null}
            {secondary ? (
              <span
                className="h-5 w-5 rounded-full ring-1 ring-white/20"
                style={{ backgroundColor: secondary }}
                title={`secundario ${secondary}`}
              />
            ) : null}
          </div>
          {primaryName || secondaryName ? (
            <p className="max-w-[200px] truncate text-[10px] lowercase tracking-wide text-white/60">
              {[primaryName, secondaryName].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
