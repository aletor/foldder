/**
 * Carga .env.local (mismo mecanismo que Next) y valida GEMINI_API_KEY antes de corridas reales.
 * .env.local gana sobre exports vacíos del shell (p. ej. GEMINI_API_KEY= en Cursor).
 */

import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

export const GEMINI_KEY_ERROR_MESSAGE =
  "GEMINI_API_KEY ausente o inválida en .env.local — añádela y relanza";

const ENV_LOCAL_OVERRIDE = /^(GEMINI_API_KEY|GOOGLE_API_KEY|BRAND_KIT_.+)$/;

let envLoaded = false;

function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function applyEnvLocalOverrides(): string | null {
  const envLocalPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envLocalPath)) return null;
  const parsed = parseDotEnv(fs.readFileSync(envLocalPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (!value || !ENV_LOCAL_OVERRIDE.test(key)) continue;
    process.env[key] = value;
  }
  return envLocalPath;
}

export function loadScriptEnv(): void {
  if (envLoaded) return;
  loadEnvConfig(process.cwd());
  applyEnvLocalOverrides();
  envLoaded = true;
}

export function resolveGeminiApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
}

export function isValidGeminiApiKey(raw: string | undefined | null): boolean {
  const key = (raw ?? "").trim();
  if (key.length < 20) return false;
  const lower = key.toLowerCase();
  if (lower === "tu_key" || lower.includes("tu_key")) return false;
  return key.startsWith("AIza") || key.startsWith("AQ.");
}

/** Sale con código 1 si la clave falta o parece placeholder. Llama antes de leer PDFs. */
export function assertValidGeminiApiKey(): string {
  loadScriptEnv();
  const key = resolveGeminiApiKey();
  if (!isValidGeminiApiKey(key)) {
    const envLocalPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envLocalPath)) {
      console.error(`${GEMINI_KEY_ERROR_MESSAGE} (no hay .env.local en ${process.cwd()})`);
    } else if ((process.env.GEMINI_API_KEY ?? "") === "" && (process.env.GOOGLE_API_KEY ?? "") === "") {
      console.error(
        `${GEMINI_KEY_ERROR_MESSAGE} (revisa GEMINI_API_KEY en .env.local; si la terminal la exporta vacía, cierra esa sesión o ejecuta desde la raíz del repo)`,
      );
    } else {
      console.error(GEMINI_KEY_ERROR_MESSAGE);
    }
    process.exit(1);
  }
  return key;
}
