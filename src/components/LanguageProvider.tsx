"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  isAppLanguage,
  translateText,
} from "@/lib/i18n";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (value: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"] as const;
const ORIGINAL_ATTR_PREFIX = "data-foldder-i18n-original-";
const skippedElementSelector =
  "script, style, textarea, pre, code, [contenteditable], [data-foldder-i18n-ignore]";
const originalTextByNode = new WeakMap<Text, string>();

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const loadedStoredLanguageRef = useRef(false);
  const userChangedLanguageRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      loadedStoredLanguageRef.current = true;
      if (userChangedLanguageRef.current) return;
      if (isAppLanguage(storedLanguage)) {
        setLanguageState(storedLanguage);
      } else {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (loadedStoredLanguageRef.current || userChangedLanguageRef.current) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
    document.documentElement.lang = language;
    document.documentElement.dataset.foldderLanguage = language;
    applyLanguageToDocument(language);

    let frame = 0;
    let applying = false;
    const scheduleApply = () => {
      if (applying || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applying = true;
        applyLanguageToDocument(language);
        applying = false;
      });
    };

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [language]);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    userChangedLanguageRef.current = true;
    setLanguageState(nextLanguage);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (text) => translateText(text, language),
    }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return value;
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      className="fixed right-4 top-4 z-[100500] flex items-center gap-1 rounded-[15px] border-0 bg-white/70 p-1 shadow-[0_12px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl"
      data-foldder-i18n-ignore
      title={language === "es" ? "Idioma" : "Language"}
    >
      {LANGUAGE_OPTIONS.map((option) => {
        const isActive = option.id === language;

        return (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={isActive}
            onClick={() => setLanguage(option.id)}
            className={`flex h-8 min-w-8 items-center justify-center rounded-[12px] px-2 text-[11px] font-semibold transition ${
              isActive
                ? "bg-zinc-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.18)]"
                : "bg-transparent text-zinc-500 hover:bg-white/80 hover:text-zinc-950"
            }`}
          >
            {option.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

function applyLanguageToDocument(language: AppLanguage) {
  if (!document.body) return;
  translateElementTree(document.body, language);
  translateAttributes(document.body, language);
}

function translateElementTree(root: ParentNode, language: AppLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return shouldSkipTextNode(node as Text)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });

  let textNode = walker.nextNode() as Text | null;
  while (textNode) {
    translateTextNode(textNode, language);
    textNode = walker.nextNode() as Text | null;
  }
}

function translateTextNode(node: Text, language: AppLanguage) {
  const current = node.nodeValue ?? "";
  if (!current.trim()) return;

  const storedOriginal = originalTextByNode.get(node);
  const translatedStored = storedOriginal ? translateText(storedOriginal, "en") : null;
  const original =
    storedOriginal && (current === storedOriginal || current === translatedStored)
      ? storedOriginal
      : current;

  if (original !== storedOriginal) {
    originalTextByNode.set(node, original);
  }

  const next = language === "es" ? original : translateText(original, language);
  if (next !== current) {
    node.nodeValue = next;
  }
}

function translateAttributes(root: ParentNode, language: AppLanguage) {
  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : [];

  for (const element of elements) {
    if (shouldSkipElement(element)) continue;

    for (const attr of TRANSLATABLE_ATTRIBUTES) {
      const current = element.getAttribute(attr);
      if (!current?.trim()) continue;

      const originalAttr = `${ORIGINAL_ATTR_PREFIX}${attr}`;
      const storedOriginal = element.getAttribute(originalAttr);
      const translatedStored = storedOriginal ? translateText(storedOriginal, "en") : null;
      const original =
        storedOriginal && (current === storedOriginal || current === translatedStored)
          ? storedOriginal
          : current;

      if (original !== storedOriginal) {
        element.setAttribute(originalAttr, original);
      }

      const next = language === "es" ? original : translateText(original, language);
      if (next !== current) {
        element.setAttribute(attr, next);
      }

      if (language === "es") {
        element.removeAttribute(originalAttr);
      }
    }
  }
}

function shouldSkipTextNode(node: Text) {
  const parent = node.parentElement;
  return !parent || shouldSkipElement(parent);
}

function shouldSkipElement(element: Element) {
  return Boolean(element.closest(skippedElementSelector));
}
