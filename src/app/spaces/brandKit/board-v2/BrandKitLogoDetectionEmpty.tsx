"use client";

import React, { useRef } from "react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";
import { Crop, Upload } from "lucide-react";

export function BrandKitLogoDetectionEmpty({
  onUploadLogo,
  onAdjustHint,
}: {
  onUploadLogo?: (file: File) => void | Promise<void>;
  onAdjustHint?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="brandKit-v2-logo-empty">
      <p className="brandKit-v2-logo-empty__title">{brandKitLocaleEs.logoDetectionFailedTitle}</p>
      <p className="brandKit-v2-logo-empty__copy">{brandKitLocaleEs.logoDetectionFailedCopy}</p>
      <ul className="brandKit-v2-logo-empty__tips">
        <li>{brandKitLocaleEs.logoDetectionTipUpload}</li>
        <li>{brandKitLocaleEs.logoDetectionTipPdf}</li>
        <li>{brandKitLocaleEs.logoDetectionTipAdjust}</li>
      </ul>
      <div className="brandKit-v2-logo-empty__actions">
        {onUploadLogo ? (
          <>
            <BrandKitFoldderButton icon={Upload} onClick={() => fileRef.current?.click()}>
              {brandKitLocaleEs.uploadLogo}
            </BrandKitFoldderButton>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="brandKit-v2-sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUploadLogo(file);
                event.target.value = "";
              }}
            />
          </>
        ) : null}
        {onAdjustHint ? (
          <BrandKitFoldderButton variant="muted" icon={Crop} onClick={onAdjustHint}>
            {brandKitLocaleEs.logoDetectionRetryAdjust}
          </BrandKitFoldderButton>
        ) : null}
      </div>
    </div>
  );
}
