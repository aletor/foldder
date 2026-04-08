type Listener = () => void;
const listeners = new Set<Listener>();
/** Pila: peticiones concurrentes (la visible es la última iniciada). */
const stack: string[] = [];

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeAiRequestOverlay(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAiRequestOverlaySnapshot(): string | null {
  if (stack.length === 0) return null;
  return stack[stack.length - 1] ?? null;
}

function beginDisplay(apiLabel: string) {
  stack.push(apiLabel);
  notify();
}

function endDisplay() {
  stack.pop();
  notify();
}

/** Nombre corto para el texto "Petición IA […]". */
export function getAiRequestLabelForPathname(pathname: string): string | null {
  if (pathname === "/api/usage") return null;
  if (pathname === "/api/spaces") return null;

  const rules: { test: RegExp; label: string }[] = [
    { test: /^\/api\/gemini\/generate$/, label: "Gemini" },
    { test: /^\/api\/gemini\/video$/, label: "Veo" },
    { test: /^\/api\/gemini\/analyze-areas$/, label: "Gemini" },
    { test: /^\/api\/openai\/enhance$/, label: "OpenAI" },
    { test: /^\/api\/spaces\/assistant$/, label: "Asistente" },
    { test: /^\/api\/spaces\/describe$/, label: "OpenAI" },
    { test: /^\/api\/grok\/generate$/, label: "Grok" },
    { test: /^\/api\/grok\/status\//, label: "Grok" },
    { test: /^\/api\/runway\/generate$/, label: "Runway" },
    { test: /^\/api\/runway\/status\//, label: "Runway" },
    { test: /^\/api\/runway\/upload$/, label: "Runway" },
    { test: /^\/api\/spaces\/matte$/, label: "Replicate" },
    { test: /^\/api\/spaces\/video-matte$/, label: "Replicate" },
    { test: /^\/api\/spaces\/compose$/, label: "Componer" },
    { test: /^\/api\/spaces\/search$/, label: "Búsqueda" },
  ];

  for (const { test, label } of rules) {
    if (test.test(pathname)) return label;
  }
  return null;
}

/**
 * Intercepta fetch solo en el cliente hacia rutas /api/* de IA.
 * Devuelve cleanup para desinstalar (Strict Mode / desmontaje).
 */
export function installAiFetchOverlay(): () => void {
  if (typeof window === "undefined") return () => {};

  const w = window as Window & { __foldderOrigFetch?: typeof fetch };
  if (w.__foldderOrigFetch) {
    return () => {};
  }

  const orig = window.fetch.bind(window);
  w.__foldderOrigFetch = orig;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let urlStr: string;
    if (typeof input === "string") urlStr = input;
    else if (input instanceof Request) urlStr = input.url;
    else urlStr = input.href;

    let pathname: string;
    try {
      const abs = new URL(urlStr, window.location.origin);
      if (abs.origin !== window.location.origin) {
        return orig(input, init);
      }
      pathname = abs.pathname;
    } catch {
      return orig(input, init);
    }

    const label = getAiRequestLabelForPathname(pathname);
    if (label) beginDisplay(label);
    try {
      return await orig(input, init);
    } finally {
      if (label) endDisplay();
    }
  };

  return () => {
    if (w.__foldderOrigFetch) {
      window.fetch = w.__foldderOrigFetch;
      delete w.__foldderOrigFetch;
    }
  };
}
