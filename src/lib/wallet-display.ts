import type { WalletStatusResponse } from "@/lib/wallet-client-events";

export type WalletLedgerDisplayEntry = WalletStatusResponse["recentEntries"][number];

export type WalletLedgerDisplay = {
  title: string;
  subtitle: string;
  icon: "credit" | "reserve" | "release" | "image" | "video" | "text" | "search" | "storage" | "adjustment";
  tone: "positive" | "pending" | "neutral" | "warning" | "danger";
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
