/**
 * Limita llamadas del cliente a rutas /api de IA:
 * - Máximo 5 concurrentes.
 * - La misma petición (método + URL) no puede repetirse antes de 4 s (salvo polling de estado).
 * - Si se viola o el usuario está bloqueado, 429 hasta pulsar «Verificar» (solo gesto real isTrusted).
 */

import { getAiRequestLabelForPathname } from "@/lib/ai-api-labels";

const MAX_CONCURRENT = 5;
const REPEAT_WINDOW_MS = 4000;

type GuardState = {
  verifyBlocked: boolean;
  lastRepeatAt: Map<string, number>;
};

const guardState: GuardState = {
  verifyBlocked: false,
  lastRepeatAt: new Map(),
};

const verifyListeners = new Set<() => void>();

export function subscribeExternalApiVerifyBlocked(listener: () => void): () => void {
  verifyListeners.add(listener);
  return () => verifyListeners.delete(listener);
}

function notifyVerify(): void {
  verifyListeners.forEach((l) => l());
}

export function getExternalApiVerifyBlocked(): boolean {
  return guardState.verifyBlocked;
}

/**
 * Desbloqueo tras comprobar repetición o bloqueo global. Solo eventos de usuario reales.
 */
export function clearExternalApiVerifyBlock(ev: { isTrusted: boolean }): boolean {
  if (!ev.isTrusted) return false;
  guardState.verifyBlocked = false;
  guardState.lastRepeatAt.clear();
  notifyVerify();
  return true;
}

class Semaphore {
  private n = 0;
  private readonly q: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    while (this.n >= this.max) {
      await new Promise<void>((resolve) => this.q.push(resolve));
    }
    this.n++;
  }

  release(): void {
    this.n--;
    const w = this.q.shift();
    if (w) w();
  }
}

const semaphore = new Semaphore(MAX_CONCURRENT);

function isExemptFromRepeat(pathname: string): boolean {
  if (/^\/api\/grok\/status\//.test(pathname) || /^\/api\/runway\/status\//.test(pathname)) {
    return true;
  }
  /**
   * Polling de estado: ya exento arriba.
   * Generación Gemini (imagen / vídeo / stream): cada POST puede ser un prompt distinto;
   * la clave de repetición solo usa método + pathname, así que dos generaciones seguidas
   * a `/api/gemini/video` en menos de 4s disparaban EXTERNAL_API_GUARD sin motivo real.
   */
  if (
    pathname === "/api/gemini/video" ||
    pathname === "/api/gemini/generate" ||
    pathname === "/api/gemini/generate-stream" ||
    pathname === "/api/openai/generate-stream" ||
    pathname === "/api/gemini/analyze-areas" ||
    pathname === "/api/gemini/analyze-correction" ||
    pathname === "/api/gemini/describe-region" ||
    pathname === "/api/spaces/cine/analyze" ||
    pathname === "/api/spaces/describe" ||
    pathname === "/api/spaces/text-content" ||
    pathname === "/api/video-editor/subtitles/transcribe" ||
    pathname === "/api/inspiration/search"
  ) {
    return true;
  }
  return false;
}

function repeatKey(method: string, abs: URL): string {
  return `${method} ${abs.pathname}${abs.search}`;
}

function json429(kind: "blocked" | "repeat"): Response {
  const message =
    kind === "repeat"
      ? "La misma petición a la API no puede repetirse antes de 4 segundos. Pulsa «Verificar» para continuar."
      : "Las llamadas a APIs externas están bloqueadas hasta verificación. Pulsa «Verificar» para continuar.";
  return new Response(
    JSON.stringify({
      error: "EXTERNAL_API_GUARD",
      reason: kind,
      message,
    }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Envuelve fetch: solo afecta a rutas con etiqueta IA (misma detección que el HUD).
 */
export function createGuardedFetch(innerFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof window === "undefined") {
      return innerFetch(input, init);
    }

    let urlStr: string;
    if (typeof input === "string") urlStr = input;
    else if (input instanceof Request) urlStr = input.url;
    else urlStr = input.href;

    let pathname: string;
    try {
      const abs = new URL(urlStr, window.location.origin);
      if (abs.origin !== window.location.origin) {
        return innerFetch(input, init);
      }
      pathname = abs.pathname;
    } catch {
      return innerFetch(input, init);
    }

    const label = getAiRequestLabelForPathname(pathname);
    if (!label) {
      return innerFetch(input, init);
    }

    if (guardState.verifyBlocked) {
      return json429("blocked");
    }

    await semaphore.acquire();
    try {
      if (guardState.verifyBlocked) {
        return json429("blocked");
      }

      const abs = new URL(urlStr, window.location.origin);
      const method = (
        init?.method ||
        (input instanceof Request ? input.method : undefined) ||
        "GET"
      ).toUpperCase();

      if (!isExemptFromRepeat(pathname)) {
        const key = repeatKey(method, abs);
        const prev = guardState.lastRepeatAt.get(key) ?? 0;
        if (prev > 0 && Date.now() - prev < REPEAT_WINDOW_MS) {
          guardState.verifyBlocked = true;
          notifyVerify();
          return json429("repeat");
        }
        guardState.lastRepeatAt.set(key, Date.now());
      }

      return await innerFetch(input, init);
    } finally {
      semaphore.release();
    }
  };
}
