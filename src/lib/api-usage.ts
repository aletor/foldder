import fs from "fs/promises";
import path from "path";
import { appendUsageLineToS3Queued, isUsageS3Enabled, readUsageLogFromS3 } from "@/lib/api-usage-s3";
import { USAGE_PERIOD_START_ISO } from "@/lib/usage-constants";
import {
  estimateGeminiUsd,
  estimateOpenAIUsd,
  estimateOpenAIEmbeddingUsd,
} from "@/lib/pricing-config";
import { auth } from "@/lib/auth";

export {
  estimateGeminiImageGenerationUsd,
  estimateGeminiUsd,
  estimateOpenAIUsd,
  estimateOpenAIEmbeddingUsd,
} from "@/lib/pricing-config";

export const DEFAULT_USAGE_SINCE_ISO = USAGE_PERIOD_START_ISO;

export const USAGE_SERVICE_CATEGORIES = [
  "ia-text",
  "ia-image",
  "ia-video",
  "visual-analysis",
  "brain",
  "embeddings",
  "external-api",
  "infrastructure",
  "unknown",
] as const;

export type UsageServiceCategory = (typeof USAGE_SERVICE_CATEGORIES)[number];

export const USAGE_SERVICE_CATEGORY_LABEL_ES: Record<UsageServiceCategory, string> = {
  "ia-text": "IA texto",
  "ia-image": "IA imagen",
  "ia-video": "IA vídeo",
  "visual-analysis": "Análisis visual",
  brain: "Brain",
  embeddings: "Embeddings",
  "external-api": "APIs externas",
  infrastructure: "Infraestructura",
  unknown: "Sin clasificar",
};

const AI_COST_CATEGORIES = new Set<UsageServiceCategory>([
  "ia-text",
  "ia-image",
  "ia-video",
  "visual-analysis",
  "brain",
  "embeddings",
]);

/** Filas del panel: consumo externo relevante (IA, Brain, embeddings, APIs, infra, legado). */
export const USAGE_SERVICES = [
  { id: "gemini-nano", label: "Gemini · Nano Banana (imagen 3 Flash / Pro)", category: "ia-image" as const },
  { id: "gemini-veo", label: "Gemini · Veo 3.1 (vídeo)", category: "ia-video" as const },
  { id: "seedance-video", label: "Volcengine Ark · Seedance (vídeo)", category: "ia-video" as const },
  { id: "gemini-analyze", label: "Gemini · Análisis de áreas (2.5 Flash)", category: "visual-analysis" as const },
  { id: "gemini-search-verify", label: "Gemini · Verificación imágenes (búsqueda web)", category: "visual-analysis" as const },
  { id: "gemini-vision-analysis", label: "Gemini · Análisis visual Brain (referencias / Designer)", category: "visual-analysis" as const },
  {
    id: "gemini-brand-visual-dna",
    label: "Gemini · Brand Visual DNA (interpretación por clusters)",
    category: "visual-analysis" as const,
  },
  { id: "openai-vision-analysis", label: "OpenAI · Análisis visual Brain (referencias / Designer)", category: "visual-analysis" as const },
  { id: "openai-assistant", label: "OpenAI · Asistente del lienzo (GPT-4o mini)", category: "ia-text" as const },
  { id: "openai-enhance", label: "OpenAI · Mejorar prompt (GPT-4o)", category: "ia-text" as const },
  { id: "openai-describe", label: "OpenAI · Describir imagen/vídeo (GPT-4o)", category: "visual-analysis" as const },
  { id: "grok-video", label: "xAI Grok · Vídeo (Imagine)", category: "ia-video" as const },
  { id: "runway-gen3", label: "Runway · Gen-3 Alpha Turbo", category: "ia-video" as const },
  { id: "replicate-bg", label: "Replicate · Quitar fondo", category: "ia-image" as const },
  { id: "replicate-vmatte", label: "Replicate · Video matte (RVM)", category: "ia-video" as const },
  { id: "openai-brain-analyze", label: "OpenAI · Brain análisis documental", category: "brain" as const },
  { id: "openai-brain-chat", label: "OpenAI · Brain chat conocimiento", category: "brain" as const },
  { id: "openai-brain-content", label: "OpenAI · Brain generación contenido", category: "brain" as const },
  { id: "openai-embeddings", label: "OpenAI · Embeddings", category: "embeddings" as const },
  { id: "pinterest-search", label: "Pinterest · Search API", category: "external-api" as const },
  { id: "beeble-api", label: "Beeble · API proxy", category: "external-api" as const },
  { id: "runway-status", label: "Runway · Status polling", category: "ia-video" as const },
  { id: "grok-status", label: "xAI Grok · Status polling", category: "ia-video" as const },
  { id: "s3-assets", label: "AWS S3 · Assets / uploads", category: "infrastructure" as const },
  { id: "s3-knowledge", label: "AWS S3 · Brain knowledge files", category: "infrastructure" as const },
  { id: "unknown-ai", label: "Sin clasificar · IA (legado)", category: "unknown" as const },
  { id: "unknown-external", label: "Sin clasificar · externo (legado)", category: "unknown" as const },
] as const;

export type UsageServiceId = (typeof USAGE_SERVICES)[number]["id"];

export function usageServiceCategory(id: UsageServiceId): UsageServiceCategory {
  const row = USAGE_SERVICES.find((s) => s.id === id);
  return row?.category ?? "unknown";
}

export type UsageProvider =
  | "gemini"
  | "openai"
  | "grok"
  | "runway"
  | "replicate"
  | "volcengine"
  | "pinterest"
  | "beeble"
  | "aws";

export type UsageRecordLine = {
  ts: string;
  provider: UsageProvider;
  userEmail?: string;
  /** Clave estable para agregación por fila del panel */
  serviceId?: UsageServiceId;
  route: string;
  model?: string;
  /** p. ej. chat | embedding | proxy_fetch */
  operation?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Coste persistido (compatible con líneas antiguas). */
  costUsd: number;
  /**
   * Si false, la llamada no aporta a totales USD (polling, APIs sin pricing, infra sin coste).
   * Omisión = true (legado).
   */
  costIsKnown?: boolean;
  projectId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
  /** Bytes transferidos o almacenados (p. ej. proxy, upload). */
  bytes?: number;
  note?: string;
};

/** Local / servidor con disco persistente (mismo criterio que `spaces-db.json`). */
const USAGE_FILE_DATA = path.join(process.cwd(), "data", "api-usage.jsonl");
/** Vercel y muchos entornos serverless: solo `/tmp` es escribible. */
const USAGE_FILE_TMP = path.join("/tmp", "foldder-api-usage.jsonl");

function usageWritePaths(): string[] {
  if (process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return [USAGE_FILE_TMP, USAGE_FILE_DATA];
  }
  return [USAGE_FILE_DATA, USAGE_FILE_TMP];
}

function usageReadPaths(): string[] {
  return [USAGE_FILE_DATA, USAGE_FILE_TMP];
}

const SERVICE_IDS = new Set<string>(USAGE_SERVICES.map((s) => s.id));

function isUsageServiceId(id: string): id is UsageServiceId {
  return SERVICE_IDS.has(id);
}

function warnAmbiguousLegacy(reason: string, r: Pick<UsageRecordLine, "route" | "provider" | "model" | "note">) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[api-usage] inferServiceIdFromRecord: línea legada ambigua → bucket de reserva.", reason, {
    route: r.route,
    provider: r.provider,
    model: r.model,
    note: r.note?.slice?.(0, 120),
  });
}

/** Líneas antiguas sin `serviceId`: inferir desde ruta / proveedor (sin asumir gemini-nano por defecto). */
export function inferServiceIdFromRecord(r: UsageRecordLine): UsageServiceId {
  if (r.serviceId && isUsageServiceId(r.serviceId)) return r.serviceId;
  const routePath = r.route || "";

  if (routePath.includes("/gemini/generate")) return "gemini-nano";
  if (routePath.includes("/gemini/generate-stream")) return "gemini-nano";
  if (routePath.includes("/gemini/video")) return "gemini-veo";
  if (routePath.includes("/seedance/video")) return "seedance-video";
  if (routePath.includes("/analyze-areas")) return "gemini-analyze";
  if (routePath.includes("/spaces/search")) {
    if (
      r.provider === "gemini" &&
      (r.operation === "image_intent_verify" || String(r.note || "").toLowerCase().includes("verify"))
    ) {
      return "gemini-search-verify";
    }
    warnAmbiguousLegacy("/spaces/search sin evidencia clara de verificación Gemini", r);
    return "unknown-ai";
  }
  if (routePath.includes("/assistant")) return "openai-assistant";
  if (routePath.includes("/enhance")) return "openai-enhance";
  if (routePath.includes("/describe")) return "openai-describe";
  if (routePath.includes("/grok/generate")) return "grok-video";
  if (routePath.includes("/grok/status")) return "grok-status";
  if (routePath.includes("/runway/generate")) return "runway-gen3";
  if (routePath.includes("/runway/status")) return "runway-status";
  if (routePath.includes("/video-matte")) return "replicate-vmatte";
  if (routePath.includes("/matte")) return "replicate-bg";
  if (routePath.includes("/brain/brand-visual-dna/analyze")) return "gemini-brand-visual-dna";
  if (routePath.includes("/brain/knowledge/analyze")) return "openai-brain-analyze";
  if (routePath.includes("/brain/knowledge/chat")) return "openai-brain-chat";
  if (routePath.includes("/brain/content/generate")) return "openai-brain-content";
  if (routePath.includes("/brain/knowledge/update")) return "openai-embeddings";
  if (routePath.includes("/pinterest/search")) return "pinterest-search";
  if (routePath.includes("/beeble/")) return "beeble-api";

  if (r.provider === "gemini") {
    warnAmbiguousLegacy("provider gemini sin ruta reconocida", r);
    return "unknown-ai";
  }
  if (r.provider === "openai") {
    warnAmbiguousLegacy("provider openai sin ruta reconocida", r);
    return "unknown-ai";
  }
  if (r.provider === "grok" || r.provider === "runway" || r.provider === "replicate" || r.provider === "volcengine") {
    warnAmbiguousLegacy(`provider ${r.provider} sin ruta reconocida`, r);
    return "unknown-external";
  }
  if (r.provider === "pinterest" || r.provider === "beeble" || r.provider === "aws") {
    return "unknown-external";
  }
  warnAmbiguousLegacy("proveedor desconocido", r);
  return "unknown-external";
}

function pricedCostUsd(r: UsageRecordLine): number {
  if (r.costIsKnown === false) return 0;
  return r.costUsd ?? 0;
}

function resolveCostUsd(partial: Omit<UsageRecordLine, "ts" | "costUsd"> & { costUsd?: number }): {
  costUsd: number;
  costIsKnown: boolean;
} {
  const userMarkedUnknown = partial.costIsKnown === false;
  if (userMarkedUnknown) {
    return { costUsd: partial.costUsd ?? 0, costIsKnown: false };
  }
  if (partial.costUsd != null) {
    return { costUsd: partial.costUsd, costIsKnown: true };
  }
  const it = partial.inputTokens ?? 0;
  const ot = partial.outputTokens ?? 0;
  const tt = partial.totalTokens ?? it + ot;
  if (partial.provider === "openai") {
    const isEmb =
      partial.serviceId === "openai-embeddings" ||
      partial.operation === "embedding" ||
      (partial.model || "").toLowerCase().includes("embedding");
    if (isEmb) {
      return {
        costUsd: Math.round(estimateOpenAIEmbeddingUsd(partial.model, tt) * 1_000_000) / 1_000_000,
        costIsKnown: true,
      };
    }
    return {
      costUsd: Math.round(estimateOpenAIUsd(partial.model, it, ot) * 1_000_000) / 1_000_000,
      costIsKnown: true,
    };
  }
  if (partial.provider === "gemini") {
    return {
      costUsd: Math.round(estimateGeminiUsd(partial.model, it, ot) * 1_000_000) / 1_000_000,
      costIsKnown: true,
    };
  }
  return { costUsd: 0, costIsKnown: true };
}

/**
 * Persiste un evento de uso. `serviceId` obligatorio en código nuevo.
 * Orden: S3 (cola + ETag) si hay credenciales, más copia local en `data/` o `/tmp` como respaldo.
 */
export async function recordApiUsage(
  partial: Omit<UsageRecordLine, "ts" | "costUsd"> & { costUsd?: number } & { serviceId: UsageServiceId },
): Promise<void> {
  const { costUsd, costIsKnown } = resolveCostUsd(partial);
  const line: UsageRecordLine = {
    ...partial,
    ts: new Date().toISOString(),
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    costIsKnown,
  };
  const payload = JSON.stringify(line) + "\n";

  let s3Ok = false;
  if (isUsageS3Enabled()) {
    try {
      await appendUsageLineToS3Queued(payload);
      s3Ok = true;
    } catch (e) {
      console.error("[api-usage] fallo persistencia S3:", e);
    }
  }

  let localOk = false;
  let lastLocalErr: unknown;
  for (const file of usageWritePaths()) {
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, payload, "utf8");
      localOk = true;
      break;
    } catch (e) {
      lastLocalErr = e;
    }
  }

  if (!s3Ok && !localOk) {
    console.error(
      "[api-usage] CRITICAL: no se guardó el uso en S3 ni en disco. Revisa credenciales / permisos.",
      line,
      "último error local:",
      lastLocalErr,
    );
  }
}

export async function resolveUsageUserEmailFromRequest(req: Request): Promise<string | undefined> {
  const devCode = req.headers.get("x-foldder-dev-passcode");
  if (process.env.NODE_ENV !== "production" && devCode === "6666") {
    return "dev-bypass@local.foldder";
  }
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  return email || undefined;
}

export type ServiceAgg = {
  id: UsageServiceId;
  label: string;
  category: UsageServiceCategory;
  calls: number;
  totalTokens: number;
  costUsd: number;
  bytes: number;
  /** Llamadas con costIsKnown !== false y coste > 0 */
  pricedCalls: number;
  /** Llamadas con costIsKnown === false o coste 0 explícito de API sin pricing */
  unpricedCalls: number;
};

export type UsageCategorySection = {
  category: UsageServiceCategory;
  label: string;
  services: ServiceAgg[];
  subtotalCostUsd: number;
  subtotalTokens: number;
  subtotalBytes: number;
};

export async function aggregateUsageSince(sinceIso: string): Promise<{
  since: string;
  services: ServiceAgg[];
  categories: UsageCategorySection[];
  totals: {
    estimatedAiUsd: number;
    estimatedCompleteUsd: number;
    totalTokens: number;
    totalBytes: number;
    unpricedCalls: number;
  };
  /** @deprecated usar totals.estimatedCompleteUsd */
  totalCostUsd: number;
  totalTokens: number;
}> {
  const sinceMs = new Date(sinceIso).getTime();

  const byId: Record<UsageServiceId, ServiceAgg> = {} as Record<UsageServiceId, ServiceAgg>;
  for (const s of USAGE_SERVICES) {
    byId[s.id] = {
      id: s.id,
      label: s.label,
      category: s.category,
      calls: 0,
      totalTokens: 0,
      costUsd: 0,
      bytes: 0,
      pricedCalls: 0,
      unpricedCalls: 0,
    };
  }

  const lineSet = new Set<string>();

  if (isUsageS3Enabled()) {
    try {
      const s3 = await readUsageLogFromS3();
      for (const line of s3.split("\n")) {
        if (line.trim()) lineSet.add(line);
      }
    } catch (e) {
      console.error("[api-usage] lectura S3:", e);
    }
  }

  for (const file of usageReadPaths()) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split("\n")) {
        if (line.trim()) lineSet.add(line);
      }
    } catch {
      /* sin archivo */
    }
  }

  let unpricedCallsAll = 0;

  for (const line of lineSet) {
    try {
      const r = JSON.parse(line) as UsageRecordLine;
      if (new Date(r.ts).getTime() < sinceMs) continue;
      const sid = inferServiceIdFromRecord(r);
      if (!byId[sid]) continue;
      const row = byId[sid];
      row.calls += 1;
      const tt =
        r.totalTokens ??
        (r.inputTokens != null || r.outputTokens != null ? (r.inputTokens ?? 0) + (r.outputTokens ?? 0) : 0);
      row.totalTokens += tt;
      row.bytes += typeof r.bytes === "number" && Number.isFinite(r.bytes) ? r.bytes : 0;
      const cUsd = r.costUsd ?? 0;
      const costKnown = r.costIsKnown !== false;
      if (!costKnown) {
        row.unpricedCalls += 1;
        unpricedCallsAll += 1;
      } else {
        row.costUsd += cUsd;
        if (cUsd > 0) row.pricedCalls += 1;
      }
    } catch {
      /* línea corrupta */
    }
  }

  const services = USAGE_SERVICES.map((s) => {
    const row = byId[s.id];
    return {
      ...row,
      costUsd: Math.round(row.costUsd * 1_000_000) / 1_000_000,
    };
  });

  const byCat = new Map<UsageServiceCategory, UsageCategorySection>();
  for (const c of USAGE_SERVICE_CATEGORIES) {
    byCat.set(c, {
      category: c,
      label: USAGE_SERVICE_CATEGORY_LABEL_ES[c],
      services: [],
      subtotalCostUsd: 0,
      subtotalTokens: 0,
      subtotalBytes: 0,
    });
  }
  for (const s of services) {
    const sec = byCat.get(s.category)!;
    sec.services.push(s);
    sec.subtotalCostUsd += s.costUsd;
    sec.subtotalTokens += s.totalTokens;
    sec.subtotalBytes += s.bytes;
  }
  const categories = USAGE_SERVICE_CATEGORIES.map((c) => {
    const sec = byCat.get(c)!;
    return {
      ...sec,
      subtotalCostUsd: Math.round(sec.subtotalCostUsd * 1_000_000) / 1_000_000,
    };
  }).filter((sec) => sec.services.some((x) => x.calls > 0 || x.bytes > 0));

  let estimatedAiUsd = 0;
  let estimatedCompleteUsd = 0;
  let totalTokens = 0;
  let totalBytes = 0;
  for (const s of services) {
    totalTokens += s.totalTokens;
    totalBytes += s.bytes;
    estimatedCompleteUsd += s.costUsd;
    if (AI_COST_CATEGORIES.has(s.category)) estimatedAiUsd += s.costUsd;
  }
  estimatedAiUsd = Math.round(estimatedAiUsd * 1_000_000) / 1_000_000;
  estimatedCompleteUsd = Math.round(estimatedCompleteUsd * 1_000_000) / 1_000_000;

  return {
    since: sinceIso,
    services,
    categories,
    totals: {
      estimatedAiUsd,
      estimatedCompleteUsd,
      totalTokens,
      totalBytes,
      unpricedCalls: unpricedCallsAll,
    },
    totalCostUsd: estimatedCompleteUsd,
    totalTokens,
  };
}

export type UsageByService = {
  serviceId: UsageServiceId;
  label: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
};

export type UsageByUser = {
  userEmail: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
};

export type UsageByProviderModel = {
  provider: UsageProvider;
  model: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
};

export type UsageByDay = {
  day: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
  uniqueUsers: number;
};

export async function getUsageDeepReportSince(sinceIso: string): Promise<{
  since: string;
  totals: { calls: number; costUsd: number; totalTokens: number };
  byService: UsageByService[];
  byUser: UsageByUser[];
  byProviderModel: UsageByProviderModel[];
  byDay: UsageByDay[];
}> {
  const sinceMs = new Date(sinceIso).getTime();
  const lineSet = new Set<string>();

  if (isUsageS3Enabled()) {
    try {
      const s3 = await readUsageLogFromS3();
      for (const line of s3.split("\n")) if (line.trim()) lineSet.add(line);
    } catch (e) {
      console.error("[api-usage] deep report lectura S3:", e);
    }
  }

  for (const file of usageReadPaths()) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split("\n")) if (line.trim()) lineSet.add(line);
    } catch {
      /* ignore */
    }
  }

  const byService = new Map<UsageServiceId, UsageByService>();
  const byUser = new Map<string, UsageByUser>();
  const byProviderModel = new Map<string, UsageByProviderModel>();
  const byDay = new Map<string, { calls: number; costUsd: number; totalTokens: number; users: Set<string> }>();

  for (const s of USAGE_SERVICES) {
    byService.set(s.id, {
      serviceId: s.id,
      label: s.label,
      calls: 0,
      costUsd: 0,
      totalTokens: 0,
    });
  }

  let totalCalls = 0;
  let totalCost = 0;
  let totalTokens = 0;

  for (const line of lineSet) {
    try {
      const r = JSON.parse(line) as UsageRecordLine;
      const ts = new Date(r.ts).getTime();
      if (!Number.isFinite(ts) || ts < sinceMs) continue;
      const sid = inferServiceIdFromRecord(r);
      const cost = pricedCostUsd(r);
      const tokens =
        r.totalTokens ??
        (r.inputTokens != null || r.outputTokens != null ? (r.inputTokens ?? 0) + (r.outputTokens ?? 0) : 0);
      const userEmail = (r.userEmail || "unknown@unattributed").trim().toLowerCase();
      const provider = r.provider;
      const model = (r.model || "unknown").trim();
      const day = new Date(ts).toISOString().slice(0, 10);

      const svc = byService.get(sid);
      if (svc) {
        svc.calls += 1;
        svc.costUsd += cost;
        svc.totalTokens += tokens;
      }

      const u = byUser.get(userEmail) ?? {
        userEmail,
        calls: 0,
        costUsd: 0,
        totalTokens: 0,
      };
      u.calls += 1;
      u.costUsd += cost;
      u.totalTokens += tokens;
      byUser.set(userEmail, u);

      const pmKey = `${provider}::${model}`;
      const pm = byProviderModel.get(pmKey) ?? {
        provider,
        model,
        calls: 0,
        costUsd: 0,
        totalTokens: 0,
      };
      pm.calls += 1;
      pm.costUsd += cost;
      pm.totalTokens += tokens;
      byProviderModel.set(pmKey, pm);

      const d = byDay.get(day) ?? {
        calls: 0,
        costUsd: 0,
        totalTokens: 0,
        users: new Set<string>(),
      };
      d.calls += 1;
      d.costUsd += cost;
      d.totalTokens += tokens;
      d.users.add(userEmail);
      byDay.set(day, d);

      totalCalls += 1;
      totalCost += cost;
      totalTokens += tokens;
    } catch {
      /* corrupted line */
    }
  }

  const normMoney = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

  return {
    since: sinceIso,
    totals: {
      calls: totalCalls,
      costUsd: normMoney(totalCost),
      totalTokens,
    },
    byService: [...byService.values()]
      .map((r) => ({ ...r, costUsd: normMoney(r.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byUser: [...byUser.values()]
      .map((r) => ({ ...r, costUsd: normMoney(r.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byProviderModel: [...byProviderModel.values()]
      .map((r) => ({ ...r, costUsd: normMoney(r.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byDay: [...byDay.entries()]
      .map(([day, v]) => ({
        day,
        calls: v.calls,
        costUsd: normMoney(v.costUsd),
        totalTokens: v.totalTokens,
        uniqueUsers: v.users.size,
      }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export function parseGeminiUsageMetadata(data: {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  const u = data.usageMetadata;
  if (!u) return null;
  const inputTokens = u.promptTokenCount ?? 0;
  const outputTokens = u.candidatesTokenCount ?? 0;
  const totalTokens = u.totalTokenCount ?? inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}
