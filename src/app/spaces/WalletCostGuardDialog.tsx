"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CreditCard,
  FileText,
  Image as ImageIcon,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
  Wallet,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import {
  FOLDDER_WALLET_COST_DECISION_EVENT,
  dispatchWalletOpen,
  type WalletCostDecisionEventDetail,
  type WalletCostDecisionRequest,
} from "@/lib/wallet-client-events";

type PendingDecision = {
  request: WalletCostDecisionRequest;
  resolve: WalletCostDecisionEventDetail["resolve"];
};

type DialogLanguage = "es" | "en";

function formatUsd(micros: number, language: DialogLanguage): string {
  const usd = (Number.isFinite(micros) ? micros : 0) / 1_000_000;
  const absUsd = Math.abs(usd);
  const fractionDigits = absUsd > 0 && absUsd < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(usd);
}

function categoryIcon(category: WalletCostDecisionRequest["category"]) {
  if (category === "video") return <Video size={14} />;
  if (category === "image") return <ImageIcon size={14} />;
  if (category === "analysis") return <Search size={14} />;
  if (category === "text") return <FileText size={14} />;
  if (category === "utility") return <ShieldCheck size={14} />;
  return <Sparkles size={14} />;
}

function englishTitle(request: WalletCostDecisionRequest): string {
  switch (request.route) {
    case "/api/gemini/generate":
    case "/api/gemini/generate-stream":
      return "Generate AI image";
    case "/api/gemini/video":
      return "Generate Veo video";
    case "/api/runway/generate":
      return "Generate Runway video";
    case "/api/grok/generate":
      return "Generate Grok video";
    case "/api/seedance/video":
      return "Generate Seedance video";
    case "/api/spaces/video-matte":
      return "Video matte";
    case "/api/gemini/analyze-areas":
      return "Analyze image";
    case "/api/gemini/analyze-correction":
      return "Analyze edit instruction";
    case "/api/gemini/describe-region":
      return "Describe marked region";
    case "/api/openai/enhance":
      return "Improve prompt";
    case "/api/spaces/describe":
      return request.label.toLowerCase().includes("vídeo") ? "Describe video" : "Describe image";
    case "/api/spaces/search":
      return "Verified visual search";
    case "/api/spaces/guionista":
      return "Screenwriter";
    case "/api/spaces/text-content":
      return "Edit text";
    case "/api/spaces/assistant":
      return "Canvas assistant";
    case "/api/spaces/cine/analyze":
      return "Analyze script";
    case "/api/video-editor/subtitles/transcribe":
      return "Transcribe subtitles";
    case "/api/video-editor/render":
      return "Render video";
    default:
      return request.label;
  }
}

function operationTitle(request: WalletCostDecisionRequest, language: DialogLanguage): string {
  return language === "es" ? request.label : englishTitle(request);
}

function operationDescription(request: WalletCostDecisionRequest, language: DialogLanguage): string {
  const es = language === "es";
  switch (request.route) {
    case "/api/gemini/generate":
    case "/api/gemini/generate-stream":
      return es
        ? "Esta generación de imagen usa Image Creation (Gemini o ChatGPT). La reserva depende del modelo y la resolución; al terminar se captura el coste real y se libera el sobrante."
        : "This image generation uses Image Creation (Gemini or ChatGPT). The reserve depends on model and resolution; after completion Foldder captures the real cost and releases the remainder.";
    case "/api/gemini/video":
    case "/api/runway/generate":
    case "/api/grok/generate":
    case "/api/seedance/video":
      return es
        ? "Esta operación crea un trabajo de vídeo externo. Foldder reserva saldo antes de enviar el job, captura el coste al completarse y libera la reserva si falla."
        : "This creates an external video job. Foldder reserves balance before starting it, captures the cost when it completes, and releases the reserve if it fails.";
    case "/api/video-editor/render":
      return es
        ? "El render usa infraestructura de vídeo. La reserva se calcula por duración, resolución y FPS del timeline."
        : "Rendering uses video infrastructure. The reserve is based on timeline duration, resolution, and FPS.";
    case "/api/video-editor/subtitles/transcribe":
      return es
        ? "La transcripción usa una API de pago y se estima por duración del audio o vídeo."
        : "Transcription uses a paid API and is estimated from audio or video duration.";
    case "/api/spaces/search":
      return es
        ? "La búsqueda puede verificar visualmente los resultados con Gemini. Se reserva el peor caso de hasta dos pasadas de verificación."
        : "Search may visually verify results with Gemini. Foldder reserves for the worst case: up to two verification passes.";
    case "/api/spaces/describe":
    case "/api/gemini/analyze-areas":
    case "/api/gemini/analyze-correction":
    case "/api/gemini/describe-region":
      return es
        ? "Este análisis visual usa una API de pago. Foldder reserva el máximo estimado y ajusta el saldo al coste real cuando termina."
        : "This visual analysis uses a paid API. Foldder reserves the estimated maximum and settles the real cost when it finishes.";
    case "/api/openai/enhance":
    case "/api/spaces/assistant":
    case "/api/spaces/cine/analyze":
    case "/api/spaces/guionista":
    case "/api/spaces/text-content":
      return es
        ? "Esta operación de texto usa un modelo de pago. El coste depende de la longitud de entrada y salida; la reserva evita saldo negativo."
        : "This text operation uses a paid model. Cost depends on input and output length; the reserve prevents negative balance.";
    case "/api/spaces/video-matte":
      return es
        ? "Esta operación usa un proveedor externo para procesar la imagen o el vídeo. Si falla, la reserva se libera."
        : "This operation uses an external provider to process the image or video. If it fails, the reserve is released.";
    default:
      return es
        ? "Esta acción usa una API de pago. Foldder reserva saldo antes de llamar al proveedor y lo ajusta al finalizar."
        : "This action uses a paid API. Foldder reserves balance before calling the provider and settles it when the request finishes.";
  }
}

export function WalletCostGuardDialog() {
  const { language } = useLanguage();
  const dialogLanguage: DialogLanguage = language === "en" ? "en" : "es";
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onDecision = (event: Event) => {
      const custom = event as CustomEvent<WalletCostDecisionEventDetail>;
      const detail = custom.detail;
      if (!detail?.request || typeof detail.resolve !== "function") return;
      detail.handled = true;
      setPending((current) => {
        if (current) {
          detail.resolve({ allowed: false, reason: "cancelled" });
          return current;
        }
        return { request: detail.request, resolve: detail.resolve };
      });
    };
    window.addEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);
    return () => window.removeEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => primaryButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPending(null);
      pending.resolve({ allowed: false, reason: "cancelled" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [pending]);

  if (!pending) return null;

  const { request, resolve } = pending;
  const account = request.wallet.account;
  const availableMicros = account?.availableMicros ?? 0;
  const insufficient = request.wallet.configured && availableMicros < request.reserveMicros;
  const blocked = account?.status === "blocked" || account?.billingReviewRequired === true;

  const close = (allowed: boolean, reason: Parameters<typeof resolve>[0]["reason"]) => {
    setPending(null);
    resolve({ allowed, reason });
  };

  const title = operationTitle(request, dialogLanguage);
  const description = operationDescription(request, dialogLanguage);
  const isSpanish = dialogLanguage === "es";

  const dialog = (
    <div
      className="fixed inset-0 z-[100700] flex items-center justify-center p-3 sm:p-4"
      data-foldder-i18n-ignore
      data-foldder-wallet-cost-guard
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={() => close(false, "cancelled")}
        aria-hidden
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-cost-title"
        aria-describedby="wallet-cost-description"
        data-foldder-wallet-cost-panel
        className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-none bg-[#0b0f14]/98 text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
      >
        <div className="flex h-10 items-stretch border-b border-white/8 bg-white/[0.08]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-white/10 bg-amber-500/10 text-amber-100">
            {categoryIcon(request.category)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center px-3">
            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-amber-200/65">
              {isSpanish ? "Operación de pago" : "Paid operation"}
            </p>
            <h2
              id="wallet-cost-title"
              className="truncate text-[10px] font-black uppercase tracking-[0.08em] text-white"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => close(false, "cancelled")}
            className="flex h-10 w-10 shrink-0 items-center justify-center border-l border-white/10 bg-white/[0.04] text-white/50 transition hover:bg-white/[0.12] hover:text-white"
            title={isSpanish ? "Cerrar" : "Close"}
            aria-label={isSpanish ? "Cerrar" : "Close"}
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-white/10 border-b border-white/8">
          <div className="px-3 py-2.5">
            <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/38">
              {isSpanish ? "Estimación" : "Estimate"}
            </p>
            <p className="mt-0.5 text-[15px] font-black tabular-nums text-white">
              {formatUsd(request.estimatedCostMicros, dialogLanguage)}
            </p>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/38">
              {isSpanish ? "Reserva máx." : "Max reserve"}
            </p>
            <p className="mt-0.5 text-[15px] font-black tabular-nums text-white">
              {formatUsd(request.reserveMicros, dialogLanguage)}
            </p>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/38">
              {isSpanish ? "Disponible" : "Available"}
            </p>
            <p
              className={`mt-0.5 text-[15px] font-black tabular-nums ${
                insufficient || blocked ? "text-rose-300" : "text-emerald-300"
              }`}
            >
              {formatUsd(availableMicros, dialogLanguage)}
            </p>
          </div>
        </div>

        {blocked ? (
          <div
            id="wallet-cost-description"
            className="flex gap-2 border-b border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[9px] font-semibold leading-snug text-rose-100"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>
              {isSpanish
                ? "Tu cuenta está en revisión de facturación. No se lanzarán operaciones con coste hasta resolverlo."
                : "Your account is under billing review. Paid operations will not run until this is resolved."}
            </span>
          </div>
        ) : null}

        {insufficient && !blocked ? (
          <div
            id="wallet-cost-description"
            className="flex gap-2 border-b border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[9px] font-semibold leading-snug text-amber-100"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>
              {isSpanish
                ? "Falta saldo para cubrir la reserva máxima. Recarga y vuelve a lanzar la operación."
                : "There is not enough balance to cover the maximum reserve. Top up and run the operation again."}
            </span>
          </div>
        ) : null}

        {!insufficient && !blocked ? (
          <p
            id="wallet-cost-description"
            className="border-b border-white/8 px-3 py-2 text-[9px] leading-snug text-white/42"
          >
            {description}
          </p>
        ) : null}

        <div className="grid grid-cols-2 divide-x divide-white/10">
          <button
            type="button"
            onClick={() => close(false, "cancelled")}
            className="flex h-10 items-center justify-center bg-white/[0.06] text-[10px] font-black uppercase tracking-[0.1em] text-white/55 transition hover:bg-white/[0.12] hover:text-white"
          >
            {isSpanish ? "Cancelar" : "Cancel"}
          </button>
          {insufficient || blocked ? (
            <button
              type="button"
              ref={primaryButtonRef}
              onClick={() => {
                dispatchWalletOpen("cost_guard");
                close(false, insufficient ? "insufficient_balance" : "cancelled");
              }}
              className="flex h-10 items-center justify-center gap-1.5 bg-blue-600 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500"
            >
              <CreditCard size={13} aria-hidden />
              {isSpanish ? "Recargar" : "Top up"}
            </button>
          ) : (
            <button
              type="button"
              ref={primaryButtonRef}
              onClick={() => close(true, "approved")}
              className="flex h-10 items-center justify-center gap-1.5 bg-blue-600 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-blue-500"
            >
              <Wallet size={13} aria-hidden />
              {isSpanish ? "Continuar" : "Continue"}
            </button>
          )}
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
