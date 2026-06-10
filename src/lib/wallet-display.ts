import type { WalletStatusResponse } from "@/lib/wallet-client-events";

export type WalletLedgerDisplayEntry = WalletStatusResponse["recentEntries"][number];

export type WalletLedgerDisplay = {
  title: string;
  subtitle: string;
  icon: "credit" | "reserve" | "release" | "image" | "video" | "text" | "search" | "storage" | "adjustment";
  tone: "positive" | "pending" | "neutral" | "warning" | "danger";
};

export type WalletActivityDisplayRow = {
  id: string;
  title: string;
  nodeLabel: string;
  providerLabel: string;
  latestAt: string;
  icon: WalletLedgerDisplay["icon"];
  tone: WalletLedgerDisplay["tone"];
  status: "credited" | "settled" | "reserved" | "released" | "adjustment";
  reserveMicros: number;
  captureMicros: number;
  releaseMicros: number;
  netMicros: number;
  entryCount: number;
};

function compactRouteLabel(route?: string): string {
  if (!route) return "Wallet Foldder";
  return route
    .replace(/^\/api\//, "")
    .replace(/\[id\]/g, "estado")
    .split("/")
    .filter(Boolean)
    .slice(-2)
    .join(" · ");
}

function serviceKind(entry: WalletLedgerDisplayEntry): "video" | "image" | "text" | "search" | "storage" | "utility" {
  const service = (entry.serviceId || "").toLowerCase();
  const route = (entry.route || "").toLowerCase();
  if (
    service.includes("video") ||
    service.includes("veo") ||
    service.includes("runway") ||
    service.includes("grok") ||
    route.includes("/video") ||
    route.includes("/runway/") ||
    route.includes("/grok/")
  ) {
    return "video";
  }
  if (
    service.includes("nano") ||
    service.includes("replicate-bg") ||
    service.includes("vision") ||
    route.includes("/generate") ||
    route.includes("/matte") ||
    route.includes("/analyze-areas") ||
    route.includes("/describe-region")
  ) {
    return "image";
  }
  if (service.includes("search") || route.includes("/search")) return "search";
  if (service.includes("s3") || route.includes("upload")) return "storage";
  if (
    service.includes("openai") ||
    service.includes("brain") ||
    route.includes("/guionista") ||
    route.includes("/assistant") ||
    route.includes("/text-content") ||
    route.includes("/cine/")
  ) {
    return "text";
  }
  return "utility";
}

export function walletServiceLabel(entry: WalletLedgerDisplayEntry): string {
  const service = (entry.serviceId || "").toLowerCase();
  const route = (entry.route || "").toLowerCase();

  if (service === "gemini-veo") return "Vídeo Veo";
  if (service === "seedance-video") return "Vídeo Seedance";
  if (service === "runway-gen3") return "Vídeo Runway";
  if (service === "grok-video") return "Vídeo Grok";
  if (service === "replicate-vmatte") return "Video matte";
  if (service === "gemini-nano") return "Imagen generada";
  if (service === "replicate-bg") return "Fondo eliminado";
  if (service === "gemini-analyze") return "Imagen analizada";
  if (service === "openai-enhance") return "Prompt mejorado";
  if (service === "openai-cine-analyze") return "Guion analizado";
  if (service === "gemini-search-verify") return "Búsqueda verificada";
  if (service === "openai-assistant" && route.includes("/text-content")) return "Texto editado";
  if (service === "openai-assistant") return "Asistente";
  if (service === "openai-brain-content" && route.includes("/guionista")) return "Guion generado";
  if (service === "openai-brain-content") return "Contenido generado";
  if (service === "openai-brain-chat") return "Brain chat";
  if (service === "openai-brain-analyze") return "Brain analizado";
  if (service === "openai-embeddings") return "Memoria actualizada";
  if (service === "s3-assets") return "Asset guardado";
  if (service === "s3-knowledge") return "Conocimiento guardado";
  if (entry.provider) return entry.provider;
  return compactRouteLabel(entry.route);
}

export function movementAmountMicros(entry: WalletLedgerDisplayEntry): number {
  if (entry.balanceDeltaMicros !== 0) return entry.balanceDeltaMicros;
  if (entry.availableDeltaMicros !== 0) return entry.availableDeltaMicros;
  return entry.amountMicros;
}

export function walletProviderLabel(entry: WalletLedgerDisplayEntry): string {
  const provider = (entry.provider || "").toLowerCase();
  const service = (entry.serviceId || "").toLowerCase();
  const route = (entry.route || "").toLowerCase();
  if (provider === "openai" || service.includes("openai")) return "OpenAI";
  if (provider === "gemini" || service.includes("gemini")) return "Gemini";
  if (provider === "runway" || service.includes("runway")) return "Runway";
  if (provider === "replicate" || service.includes("replicate")) return "Replicate";
  if (provider === "seedance" || service.includes("seedance")) return "Seedance";
  if (provider === "grok" || service.includes("grok")) return "Grok";
  if (provider === "aws" || service.includes("aws") || route.includes("/video-editor/render")) return "AWS";
  if (provider === "s3" || service.includes("s3")) return "S3";
  if (entry.provider) return entry.provider;
  return "Foldder";
}

export function walletNodeLabel(entry: WalletLedgerDisplayEntry): string {
  const service = (entry.serviceId || "").toLowerCase();
  const route = (entry.route || "").toLowerCase();
  if (route.includes("/spaces/guionista")) return "Nodo Guionista";
  if (route.includes("/spaces/text-content")) return "Nodo Texto";
  if (route.includes("/spaces/cine/")) return "Nodo Cine";
  if (route.includes("/spaces/assistant")) return "Asistente del canvas";
  if (route.includes("/spaces/search")) return "Nodo Inspiration";
  if (route.includes("/spaces/describe")) return "Nodo Media";
  if (route.includes("/gemini/generate")) return "Nodo Imagen IA";
  if (route.includes("/gemini/video")) return "Nodo Video";
  if (route.includes("/runway/") || route.includes("/grok/") || route.includes("/seedance/")) return "Nodo Video";
  if (route.includes("/video-editor/")) return "Editor de vídeo";
  if (route.includes("/spaces/matte") || route.includes("/spaces/video-matte")) return "Nodo Recorte";
  if (route.includes("/openai/enhance")) return "Nodo Prompt";
  if (service.includes("brain")) return "Brain";
  if (service.includes("knowledge") || service.includes("embeddings")) return "Memoria";
  if (service.includes("s3")) return "Assets";
  return compactRouteLabel(entry.route);
}

export function describeWalletLedgerEntry(entry: WalletLedgerDisplayEntry): WalletLedgerDisplay {
  const label = walletServiceLabel(entry);
  const kind = serviceKind(entry);
  const icon =
    kind === "video"
      ? "video"
      : kind === "image"
        ? "image"
        : kind === "search"
          ? "search"
          : kind === "storage"
            ? "storage"
            : kind === "text"
              ? "text"
              : "adjustment";

  if (entry.type === "purchase") {
    return { title: "Recarga confirmada", subtitle: "Stripe Checkout", icon: "credit", tone: "positive" };
  }
  if (entry.type === "grant") {
    return { title: "Crédito añadido", subtitle: "Foldder", icon: "credit", tone: "positive" };
  }
  if (entry.type === "refund") {
    return { title: "Reembolso aplicado", subtitle: "Stripe", icon: "adjustment", tone: "danger" };
  }
  if (entry.type === "adjustment") {
    return { title: "Ajuste de facturación", subtitle: label, icon: "adjustment", tone: "danger" };
  }
  if (entry.type === "reserve") {
    return { title: "Reserva iniciada", subtitle: label, icon: "reserve", tone: "pending" };
  }
  if (entry.type === "release") {
    return { title: "Reserva liberada", subtitle: label, icon: "release", tone: "positive" };
  }
  if (entry.type === "capture") {
    return { title: label, subtitle: "Consumo aplicado", icon, tone: "neutral" };
  }

  return { title: label, subtitle: compactRouteLabel(entry.route), icon: "adjustment", tone: "neutral" };
}

export function visibleSpentMicros(entries: WalletLedgerDisplayEntry[]): number {
  return entries
    .filter((entry) => entry.type === "capture")
    .reduce((total, entry) => total + Math.abs(movementAmountMicros(entry)), 0);
}

function rowSortDate(entries: WalletLedgerDisplayEntry[]): string {
  return entries
    .map((entry) => entry.createdAt)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || "";
}

function sumEntryAmount(entries: WalletLedgerDisplayEntry[], type: WalletLedgerDisplayEntry["type"]): number {
  return entries
    .filter((entry) => entry.type === type)
    .reduce((total, entry) => total + Math.abs(movementAmountMicros(entry)), 0);
}

function netBalanceAmount(entries: WalletLedgerDisplayEntry[]): number {
  return entries.reduce((total, entry) => total + entry.balanceDeltaMicros, 0);
}

function activityGroupKey(entry: WalletLedgerDisplayEntry): string {
  if (entry.reservationId) return `reservation:${entry.reservationId}`;
  return `entry:${entry.entryId}`;
}

function statusForGroupedEntries(input: {
  captureMicros: number;
  entries: WalletLedgerDisplayEntry[];
  releaseMicros: number;
  reserveMicros: number;
}): WalletActivityDisplayRow["status"] {
  const first = input.entries[0];
  if (first?.type === "purchase" || first?.type === "grant") return "credited";
  if (first?.type === "refund" || first?.type === "adjustment") return "adjustment";
  if (input.captureMicros > 0) return "settled";
  if (input.reserveMicros > 0 && input.releaseMicros >= input.reserveMicros) return "released";
  if (input.reserveMicros > 0) return "reserved";
  return "settled";
}

export function groupWalletActivityRows(entries: WalletLedgerDisplayEntry[]): WalletActivityDisplayRow[] {
  const groups = new Map<string, WalletLedgerDisplayEntry[]>();
  for (const entry of entries) {
    const key = activityGroupKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  return Array.from(groups.entries())
    .map(([id, groupEntries]) => {
      const sortedEntries = [...groupEntries].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      const primaryEntry =
        sortedEntries.find((entry) => entry.type === "capture") ||
        sortedEntries.find((entry) => entry.type === "reserve") ||
        sortedEntries[0];
      const display = describeWalletLedgerEntry(primaryEntry);
      const reserveMicros = sumEntryAmount(sortedEntries, "reserve");
      const captureMicros = sumEntryAmount(sortedEntries, "capture");
      const releaseMicros = sumEntryAmount(sortedEntries, "release");
      const netMicros = netBalanceAmount(sortedEntries) || sortedEntries.reduce((total, entry) => total + movementAmountMicros(entry), 0);
      const status = statusForGroupedEntries({
        captureMicros,
        entries: sortedEntries,
        releaseMicros,
        reserveMicros,
      });
      const tone: WalletLedgerDisplay["tone"] =
        status === "credited"
          ? "positive"
          : status === "adjustment"
            ? "danger"
            : status === "reserved"
              ? "pending"
              : captureMicros > 0
                ? "neutral"
                : "positive";
      const icon =
        status === "credited"
          ? "credit"
          : status === "adjustment"
            ? "adjustment"
            : display.icon;

      return {
        id,
        title: display.title,
        nodeLabel: walletNodeLabel(primaryEntry),
        providerLabel: walletProviderLabel(primaryEntry),
        latestAt: rowSortDate(sortedEntries),
        icon,
        tone,
        status,
        reserveMicros,
        captureMicros,
        releaseMicros,
        netMicros,
        entryCount: sortedEntries.length,
      } satisfies WalletActivityDisplayRow;
    })
    .sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));
}
