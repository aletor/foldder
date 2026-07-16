"use client";

import React, { useMemo } from "react";
import type { GalleryGeneratedItem } from "@/lib/brandkit/brand-kit-gallery-plan";
import type { GalleryImageVisualState } from "@/lib/brandkit/brand-kit-gallery-image-state";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";
import { BrandKitClickableImage } from "./BrandKitClickableImage";
import { BrandKitCellContextMenu } from "./BrandKitCellContextMenu";
import { Check, Eye, RefreshCw, Star } from "lucide-react";

function stateLabel(state: GalleryImageVisualState): string | null {
  switch (state) {
    case "auto_accepted":
      return brandKitLocaleEs.galleryImageStateAuto;
    case "approved":
      return brandKitLocaleEs.galleryImageStateApproved;
    case "locked":
      return brandKitLocaleEs.galleryImageStateLocked;
    case "discarded":
      return brandKitLocaleEs.galleryImageStateDiscarded;
    case "error":
      return brandKitLocaleEs.galleryImageStateError;
    default:
      return null;
  }
}

export function BrandKitGalleryImageTile({
  item,
  state,
  isPrimary = false,
  errorMessage,
  presentationMode = false,
  isRegenerating = false,
  disabled = false,
  onView,
  onApprove,
  onRegenerate,
  onDiscard,
  onSetPrimary,
  onDownload,
  onRetry,
}: {
  item?: GalleryGeneratedItem;
  state: GalleryImageVisualState;
  isPrimary?: boolean;
  errorMessage?: string;
  presentationMode?: boolean;
  isRegenerating?: boolean;
  disabled?: boolean;
  onView?: () => void;
  onApprove?: () => void;
  onRegenerate?: () => void;
  onDiscard?: () => void;
  onSetPrimary?: () => void;
  onDownload?: () => void;
  onRetry?: () => void;
}) {
  const label = stateLabel(state);
  const showImage = Boolean(item?.previewUrl) && state !== "empty";
  const showError = state === "error";
  const showLoading = state === "loading";
  const showEmpty = state === "empty" && !showError && !showLoading;
  const dimmed = state === "discarded";

  const moreItems = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      onClick: () => void;
      disabled?: boolean;
    }> = [];
    if (showImage && onSetPrimary && !isPrimary) {
      items.push({
        id: "primary",
        label: brandKitLocaleEs.galleryImageSetPrimary,
        onClick: () => onSetPrimary(),
        disabled,
      });
    }
    if (showImage && onDownload) {
      items.push({
        id: "download",
        label: brandKitLocaleEs.galleryImageDownload,
        onClick: () => onDownload(),
      });
    }
    if (showImage && onDiscard && state !== "discarded") {
      items.push({
        id: "discard",
        label: brandKitLocaleEs.galleryImageDiscard,
        onClick: () => onDiscard(),
        disabled,
      });
    }
    return items;
  }, [disabled, isPrimary, onDiscard, onDownload, onSetPrimary, showImage, state]);

  if (presentationMode && state !== "approved" && state !== "locked") {
    return null;
  }

  return (
    <div
      className={`brandKit-gallery-tile brandKit-gallery-tile--${state}${isPrimary ? " is-primary" : ""}${dimmed ? " is-dimmed" : ""}`}
    >
      {showLoading ? <div className="brandKit-gallery-tile__loading" aria-hidden /> : null}
      {showEmpty ? <div className="brandKit-gallery-tile__empty" aria-hidden /> : null}

      {showImage ? (
        <div className="brandKit-gallery-tile__media">
          <BrandKitClickableImage src={item!.previewUrl!} fit="cover" eager />
          {isPrimary ? (
            <span className="brandKit-gallery-tile__primary-badge" title={brandKitLocaleEs.galleryImageSetPrimary}>
              <Star size={12} aria-hidden />
            </span>
          ) : null}
        </div>
      ) : null}

      {showError ? (
        <div className="brandKit-gallery-tile__error" role="status">
          <p className="brandKit-gallery-tile__error-title">{brandKitLocaleEs.galleryImageStateError}</p>
          {errorMessage ? <p className="brandKit-gallery-tile__error-msg">{errorMessage}</p> : null}
          <p className="brandKit-gallery-tile__error-hint">{brandKitLocaleEs.gallerySlotErrorNoCharge}</p>
          {!presentationMode && onRetry ? (
            <BrandKitFoldderButton variant="ghost" compact icon={RefreshCw} onClick={onRetry} disabled={disabled}>
              {brandKitLocaleEs.gallerySlotRetry}
            </BrandKitFoldderButton>
          ) : null}
        </div>
      ) : null}

      {label ? (
        <span className={`brandKit-gallery-tile__state brandKit-gallery-tile__state--${state}`}>{label}</span>
      ) : null}

      {!presentationMode && (showImage || showError) ? (
        <div className="brandKit-gallery-tile__actions" role="toolbar" aria-label="Acciones de imagen">
          {showImage && onView ? (
            <BrandKitFoldderButton
              variant="ghost"
              iconOnly
              round
              icon={Eye}
              onClick={onView}
              title={brandKitLocaleEs.galleryImageView}
              aria-label={brandKitLocaleEs.galleryImageView}
            />
          ) : null}
          {showImage && onApprove && state === "auto_accepted" ? (
            <BrandKitFoldderButton
              variant="ghost"
              iconOnly
              round
              icon={Check}
              onClick={onApprove}
              disabled={disabled}
              title={brandKitLocaleEs.galleryImageApprove}
              aria-label={brandKitLocaleEs.galleryImageApprove}
            />
          ) : null}
          {onRegenerate ? (
            <BrandKitFoldderButton
              variant="ghost"
              iconOnly
              round
              icon={RefreshCw}
              className={isRegenerating ? "is-spinning" : ""}
              onClick={onRegenerate}
              disabled={disabled}
              title={brandKitLocaleEs.galleryImageReplace}
              aria-label={brandKitLocaleEs.galleryImageReplace}
            />
          ) : null}
          {moreItems.length ? <BrandKitCellContextMenu items={moreItems} /> : null}
        </div>
      ) : null}
    </div>
  );
}
