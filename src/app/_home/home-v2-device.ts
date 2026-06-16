import { useEffect, useState } from "react";

export const HOME_V2_ROOT_SELECTOR = "[data-foldder-home-v2]";

export type HomeV2DeviceProfile = {
  /** Coarse pointer / no hover (iPad, phones) */
  isTouch: boolean;
  /** Touch device within tablet width (~768–1024px) */
  isTablet: boolean;
  reducedMotion: boolean;
  /** Lighter animations, native scroll, paused media */
  perfMode: boolean;
};

const SSR_PROFILE: HomeV2DeviceProfile = {
  isTouch: false,
  isTablet: false,
  reducedMotion: false,
  perfMode: false,
};

export function readHomeV2DeviceProfile(): HomeV2DeviceProfile {
  if (typeof window === "undefined") return SSR_PROFILE;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const isTablet = isTouch && window.matchMedia("(max-width: 1024px)").matches;
  const perfMode = reducedMotion || isTouch;

  return { isTouch, isTablet, reducedMotion, perfMode };
}

export function applyHomeV2DeviceAttributes(root?: HTMLElement | null): HomeV2DeviceProfile {
  const profile = readHomeV2DeviceProfile();
  const el = root ?? document.querySelector<HTMLElement>(HOME_V2_ROOT_SELECTOR);
  if (!el) return profile;

  el.toggleAttribute("data-home-v2-touch", profile.isTouch);
  el.toggleAttribute("data-home-v2-tablet", profile.isTablet);
  el.toggleAttribute("data-home-v2-perf", profile.perfMode);

  return profile;
}

export function useHomeV2DeviceProfile(): HomeV2DeviceProfile {
  const [profile, setProfile] = useState<HomeV2DeviceProfile>(() =>
    typeof window !== "undefined" ? readHomeV2DeviceProfile() : SSR_PROFILE,
  );

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(HOME_V2_ROOT_SELECTOR);
    const sync = () => setProfile(applyHomeV2DeviceAttributes(root));

    sync();

    const queries = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(hover: none), (pointer: coarse)"),
      window.matchMedia("(max-width: 1024px)"),
    ];

    queries.forEach((query) => query.addEventListener("change", sync));
    return () => queries.forEach((query) => query.removeEventListener("change", sync));
  }, []);

  return profile;
}
