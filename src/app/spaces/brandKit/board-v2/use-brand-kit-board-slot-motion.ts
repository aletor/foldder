"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BrandKitDocument, SlotId, SlotState, SlotStatus } from "@/lib/brandkit/brand-kit-types";
import { BRAND_KIT_SLOT_IDS } from "@/lib/brandkit/brand-kit-types";

export type SlotMotionPhase = "idle" | "skeleton" | "enter" | "glow";

export type SlotMotionState = {
  phase: SlotMotionPhase;
  /** True while the tile plays its enter animation (internal stagger enabled). */
  stagger: boolean;
};

type SlotSnapshot = {
  status: SlotStatus;
  fingerprint: string;
};

const MATERIAL_STATUSES = new Set<SlotStatus>(["candidates", "resolved", "needs_user"]);
const WAIT_STATUSES = new Set<SlotStatus>(["empty", "pending"]);

const GLOW_MS = 1200;

export function slotMotionFingerprint(slot: SlotState<unknown>): string {
  return `${slot.status}:${slot.updatedAt}:${slot.candidates.length}:${slot.value !== undefined ? 1 : 0}`;
}

export function computeSlotDisplayPhase(
  slot: SlotState<unknown>,
  isAnalyzing: boolean,
  entering: boolean,
  glowing: boolean,
): SlotMotionPhase {
  if (entering) return "enter";
  if (glowing) return "glow";
  if (isAnalyzing && WAIT_STATUSES.has(slot.status)) return "skeleton";
  return "idle";
}

export type SlotMotionTransition = {
  triggerEnter: boolean;
  triggerGlow: boolean;
  nextSnapshot: SlotSnapshot;
};

/** Pure transition logic — testable without React. */
export function detectSlotMotionTransition(
  slot: SlotState<unknown>,
  prev: SlotSnapshot | undefined,
  bootstrapped: boolean,
): SlotMotionTransition {
  const nextSnapshot: SlotSnapshot = {
    status: slot.status,
    fingerprint: slotMotionFingerprint(slot),
  };

  if (!bootstrapped || !prev) {
    return { triggerEnter: false, triggerGlow: false, nextSnapshot };
  }

  const wasWaiting = WAIT_STATUSES.has(prev.status);
  const isMaterial = MATERIAL_STATUSES.has(slot.status);
  const wasMaterial = MATERIAL_STATUSES.has(prev.status);

  if (wasWaiting && isMaterial) {
    return { triggerEnter: true, triggerGlow: false, nextSnapshot };
  }

  if (wasMaterial && isMaterial && prev.fingerprint !== nextSnapshot.fingerprint) {
    return { triggerEnter: false, triggerGlow: true, nextSnapshot };
  }

  return { triggerEnter: false, triggerGlow: false, nextSnapshot };
}

export function buildInitialMotionStates(
  slots: BrandKitDocument["slots"],
  isAnalyzing: boolean,
): Record<SlotId, SlotMotionState> {
  const states = {} as Record<SlotId, SlotMotionState>;
  for (const slotId of BRAND_KIT_SLOT_IDS) {
    const phase = computeSlotDisplayPhase(slots[slotId], isAnalyzing, false, false);
    states[slotId] = { phase, stagger: false };
  }
  return states;
}

export function useBrandKitBoardSlotMotion(
  slots: BrandKitDocument["slots"],
  isAnalyzing: boolean,
): {
  motionBySlot: Record<SlotId, SlotMotionState>;
  onTileEnterEnd: (slotId: SlotId) => void;
} {
  const prevRef = useRef<Partial<Record<SlotId, SlotSnapshot>>>({});
  const bootstrappedRef = useRef(false);
  const glowTimersRef = useRef<Partial<Record<SlotId, ReturnType<typeof setTimeout>>>>({});

  const [entering, setEntering] = useState<Partial<Record<SlotId, boolean>>>({});
  const [glowing, setGlowing] = useState<Partial<Record<SlotId, boolean>>>({});

  useLayoutEffect(() => {
    if (!bootstrappedRef.current) {
      for (const slotId of BRAND_KIT_SLOT_IDS) {
        prevRef.current[slotId] = {
          status: slots[slotId].status,
          fingerprint: slotMotionFingerprint(slots[slotId]),
        };
      }
      bootstrappedRef.current = true;
      return;
    }

    const nextEntering: Partial<Record<SlotId, boolean>> = {};
    const nextGlowing: Partial<Record<SlotId, boolean>> = {};

    for (const slotId of BRAND_KIT_SLOT_IDS) {
      const slot = slots[slotId];
      const transition = detectSlotMotionTransition(slot, prevRef.current[slotId], true);
      prevRef.current[slotId] = transition.nextSnapshot;

      if (transition.triggerEnter) {
        nextEntering[slotId] = true;
      } else if (transition.triggerGlow) {
        nextGlowing[slotId] = true;
        const existing = glowTimersRef.current[slotId];
        if (existing) clearTimeout(existing);
        glowTimersRef.current[slotId] = setTimeout(() => {
          setGlowing((current) => {
            if (!current[slotId]) return current;
            const copy = { ...current };
            delete copy[slotId];
            return copy;
          });
          delete glowTimersRef.current[slotId];
        }, GLOW_MS);
      }
    }

    if (Object.keys(nextEntering).length) {
      setEntering((current) => ({ ...current, ...nextEntering }));
    }
    if (Object.keys(nextGlowing).length) {
      setGlowing((current) => ({ ...current, ...nextGlowing }));
    }
  }, [slots, isAnalyzing]);

  useEffect(
    () => () => {
      for (const timer of Object.values(glowTimersRef.current)) {
        if (timer) clearTimeout(timer);
      }
    },
    [],
  );

  const onTileEnterEnd = useCallback((slotId: SlotId) => {
    setEntering((current) => {
      if (!current[slotId]) return current;
      const copy = { ...current };
      delete copy[slotId];
      return copy;
    });
  }, []);

  const motionBySlot = {} as Record<SlotId, SlotMotionState>;
  for (const slotId of BRAND_KIT_SLOT_IDS) {
    const isEntering = Boolean(entering[slotId]);
    const isGlowing = Boolean(glowing[slotId]);
    const phase = computeSlotDisplayPhase(slots[slotId], isAnalyzing, isEntering, isGlowing);
    motionBySlot[slotId] = {
      phase,
      stagger: isEntering,
    };
  }

  return { motionBySlot, onTileEnterEnd };
}
