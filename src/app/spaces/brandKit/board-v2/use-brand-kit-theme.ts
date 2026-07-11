"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import {
  deriveBrandThemeFromDoc,
  type BrandThemePolarity,
  type BrandThemeResult,
} from "@/lib/brandkit/brand-theme-color";

export type BrandKitThemeState = {
  ready: boolean;
  vars: Record<string, string>;
  polarity: BrandThemePolarity;
  animate: boolean;
};

const EMPTY_THEME: BrandThemeResult = {
  ready: false,
  polarity: "light",
  vars: {},
  fingerprint: "",
};

function shouldClearPersistedTheme(doc: BrandKitDocument): boolean {
  const slot = doc.slots.palette;
  return slot.status === "empty" || (slot.status === "pending" && !slot.value);
}

export function useBrandKitTheme(doc: BrandKitDocument): BrandKitThemeState {
  const [persisted, setPersisted] = useState<BrandThemeResult>(() => {
    const initial = deriveBrandThemeFromDoc(doc);
    return initial.ready ? initial : EMPTY_THEME;
  });
  const [animate, setAnimate] = useState(false);
  const prevFingerprintRef = useRef<string | null>(null);
  const seededRef = useRef(false);

  const live = useMemo(() => deriveBrandThemeFromDoc(doc), [doc]);

  useLayoutEffect(() => {
    if (live.ready) {
      setPersisted(live);
      return;
    }
    if (shouldClearPersistedTheme(doc)) {
      setPersisted(EMPTY_THEME);
    }
  }, [doc, live]);

  const active = live.ready
    ? live
    : persisted.ready
      ? persisted
      : EMPTY_THEME;

  useLayoutEffect(() => {
    if (!active.ready) {
      prevFingerprintRef.current = null;
      seededRef.current = false;
      setAnimate(false);
      return;
    }

    const fingerprint = active.fingerprint;
    if (!seededRef.current) {
      seededRef.current = true;
      prevFingerprintRef.current = fingerprint;
      setAnimate(false);
      return;
    }

    if (prevFingerprintRef.current !== fingerprint) {
      prevFingerprintRef.current = fingerprint;
      setAnimate(true);
    }
  }, [active.ready, active.fingerprint]);

  return {
    ready: active.ready,
    vars: active.vars,
    polarity: active.polarity,
    animate,
  };
}
