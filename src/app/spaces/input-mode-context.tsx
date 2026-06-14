"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  detectInputMode,
  readInputModePreference,
  resolveInputMode,
  writeInputModePreference,
  type InputMode,
  type InputModePreference,
} from "@/lib/input-mode";

type InputModeContextValue = {
  mode: InputMode;
  preference: InputModePreference;
  isTouchUI: boolean;
  setPreference: (pref: InputModePreference) => void;
};

const InputModeContext = createContext<InputModeContextValue | null>(null);

export function InputModeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<InputModePreference>("auto");
  const [mode, setMode] = useState<InputMode>("desktop");

  const refreshMode = useCallback((pref: InputModePreference) => {
    setMode(resolveInputMode(pref));
  }, []);

  useEffect(() => {
    const pref = readInputModePreference();
    setPreferenceState(pref);
    refreshMode(pref);
  }, [refreshMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse), (any-pointer: coarse)");
    const onChange = () => {
      if (readInputModePreference() === "auto") {
        setMode(detectInputMode());
      }
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const setPreference = useCallback(
    (pref: InputModePreference) => {
      writeInputModePreference(pref);
      setPreferenceState(pref);
      refreshMode(pref);
    },
    [refreshMode],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mode === "touch") {
      document.documentElement.setAttribute("data-foldder-touch-ui", "true");
    } else {
      document.documentElement.removeAttribute("data-foldder-touch-ui");
    }
    return () => document.documentElement.removeAttribute("data-foldder-touch-ui");
  }, [mode]);

  const value = useMemo<InputModeContextValue>(
    () => ({
      mode,
      preference,
      isTouchUI: mode === "touch",
      setPreference,
    }),
    [mode, preference, setPreference],
  );

  return <InputModeContext.Provider value={value}>{children}</InputModeContext.Provider>;
}

export function useInputMode(): InputModeContextValue {
  const ctx = useContext(InputModeContext);
  if (!ctx) {
    return {
      mode: "desktop",
      preference: "auto",
      isTouchUI: false,
      setPreference: () => {},
    };
  }
  return ctx;
}
