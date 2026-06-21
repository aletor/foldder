/**
 * Limita llamadas del cliente a rutas /api de IA:
 * - Máximo 8 concurrentes.
 * - La misma petición (método + URL + cuerpo) no puede repetirse antes de 4 s (salvo polling).
 * - Duplicados exactos reciben 429; bloqueo global solo tras ráfagas sospechosas.
 */

import { getAiRequestLabelForPathname } from "@/lib/ai-api-labels";

const MAX_CONCURRENT = 8;
const REPEAT_WINDOW_MS = 4000;
const REPEAT_STRIKE_WINDOW_MS = 15_000;
const REPEAT_STRIKES_BEFORE_VERIFY = 5;

type GuardState = {
  verifyBlocked: boolean;
  lastRepeatAt: Map<string, number>;
  repeatStrikeCount: number;
  repeatStrikeWindowStart: number;
};

const guardState: GuardState = {
  verifyBlocked: false,
  lastRepeatAt: new Map(),
  repeatStrikeCount: 0,
  repeatStrikeWindowStart: 0,
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
  guardState.repeatStrikeCount = 0;
  guardState.repeatStrikeWindowStart = 0;
  notifyVerify();
  return true;
}

/** Tests / Strict Mode. */
export function resetExternalApiGuardForTests(): void {
  guardState.verifyBlocked = false;
  guardState.lastRepeatAt.clear();
  guardState.repeatStrikeCount = 0;
  guardState.repeatStrikeWindowStart = 0;
  notifyVerify();
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
  return /^\/api\/grok\/status\//.test(pathname) || /^\/api\/runway\/status\//.test(pathname);
}

function fingerprintString(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${raw.length}:${h >>> 0}`;
}

function readBodyFingerprint(input: RequestInfo | URL, init: RequestInit | undefined, method: string): string {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return "";

  const body = init?.body;
  if (typeof body === "string") return fingerprintString(body);
  if (body instanceof URLSearchParams) return fingerprintString(body.toString());

  if (body == null && input instanceof Request) {
    return `req:${fingerprintString(input.url)}`;
  }

  return "";
}

function repeatKey(method: string, abs: URL, bodyFingerprint: string): string {
  const base = `${method} ${abs.pathname}${abs.search}`;
  return bodyFingerprint ? `${base}#${bodyFingerprint}` : base;
}

function registerRepeatStrike(): void {
  const now = Date.now();
  if (now - guardState.repeatStrikeWindowStart > REPEAT_STRIKE_WINDOW_MS) {
    guardState.repeatStrikeWindowStart = now;
    guardState.repeatStrikeCount = 0;
  }
  guardState.repeatStrikeCount += 1;
  if (guardState.repeatStrikeCount >= REPEAT_STRIKES_BEFORE_VERIFY) {
    guardState.verifyBlocked = true;
    notifyVerify();
  }
}

function json429(kind: "blocked" | "repeat"): Response {
  const message =
    kind === "repeat"
      ? "La misma petición a la API no puede repetirse antes de 4 segundos. Pulsa «Verificar» si necesitas continuar."
      : "Las llamadas a APIs externas están bloqueadas hasta verificación. Pulsa «Verificar» para continuar.";
  return new Response(
    JSON.stringify({
      error: "EXTERNAL_API_GUARD",
      reason: kind,
      message,
    }),
    { status: 429, headers: { "Content-Type": "application/json" } },
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
        const bodyFingerprint = readBodyFingerprint(input, init, method);
        const key = repeatKey(method, abs, bodyFingerprint);
        const prev = guardState.lastRepeatAt.get(key) ?? 0;
        if (prev > 0 && Date.now() - prev < REPEAT_WINDOW_MS) {
          registerRepeatStrike();
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

export const externalApiGuardLimits = {
  maxConcurrent: MAX_CONCURRENT,
  repeatWindowMs: REPEAT_WINDOW_MS,
} as const;
