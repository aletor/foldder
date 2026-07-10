"use client";

import React, { useRef } from "react";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { GenomaFoldderButton } from "./GenomaFoldderButton";
import { Crop, Upload } from "lucide-react";

export function GenomaLogoDetectionEmpty({
  onUploadLogo,
  onAdjustHint,
}: {
  onUploadLogo?: (file: File) => void | Promise<void>;
  onAdjustHint?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="genoma-v2-logo-empty">
      <p className="genoma-v2-logo-empty__title">{genomaLocaleEs.logoDetectionFailedTitle}</p>
      <p className="genoma-v2-logo-empty__copy">{genomaLocaleEs.logoDetectionFailedCopy}</p>
      <ul className="genoma-v2-logo-empty__tips">
        <li>{genomaLocaleEs.logoDetectionTipUpload}</li>
        <li>{genomaLocaleEs.logoDetectionTipPdf}</li>
        <li>{genomaLocaleEs.logoDetectionTipAdjust}</li>
      </ul>
      <div className="genoma-v2-logo-empty__actions">
        {onUploadLogo ? (
          <>
            <GenomaFoldderButton icon={Upload} onClick={() => fileRef.current?.click()}>
              {genomaLocaleEs.uploadLogo}
            </GenomaFoldderButton>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="genoma-v2-sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUploadLogo(file);
                event.target.value = "";
              }}
            />
          </>
        ) : null}
        {onAdjustHint ? (
          <GenomaFoldderButton variant="muted" icon={Crop} onClick={onAdjustHint}>
            {genomaLocaleEs.logoDetectionRetryAdjust}
          </GenomaFoldderButton>
        ) : null}
      </div>
    </div>
  );
}
