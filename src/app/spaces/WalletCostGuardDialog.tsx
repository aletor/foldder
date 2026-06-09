"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CreditCard, ShieldCheck, Video, Wallet, X } from "lucide-react";
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

function formatUsd(micros: number): string {
  const usd = (Number.isFinite(micros) ? micros : 0) / 1_000_000;
  const absUsd = Math.abs(usd);
  const fractionDigits = absUsd > 0 && absUsd < 0.01 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(usd);
}

function categoryIcon(category: WalletCostDecisionRequest["category"]) {
  if (category === "video") return <Video size={18} className="text-violet-100" />;
  if (category === "text") return <ShieldCheck size={18} className="text-violet-100" />;
  return <Wallet size={18} className="text-violet-100" />;
}

export function WalletCostGuardDialog() {
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
  const isVideo = request.category === "video";

  const close = (allowed: boolean, reason: Parameters<typeof resolve>[0]["reason"]) => {
    setPending(null);
    resolve({ allowed, reason });
  };

  return (
    <div className="fixed inset-0 z-[100090] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/72 backdrop-blur-[6px]"
        onClick={() => close(false, "cancelled")}
        aria-hidden
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-cost-title"
        aria-describedby="wallet-cost-description"
        className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-2xl border border-white/15 bg-[#10131a] text-white shadow-[0_30px_100px_rgba(0,0,0,0.55)]"
      >
        <div className="border-b border-white/10 bg-white/[0.04] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500 shadow-lg shadow-violet-950/40">
                {categoryIcon(request.category)}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200/80">
                  {isVideo ? "Confirmación de coste" : "Reserva de saldo"}
                </p>
                <h2 id="wallet-cost-title" className="mt-1 text-lg font-black tracking-tight text-white">
                  {request.label}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => close(false, "cancelled")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55 transition hover:bg-white/[0.1] hover:text-white"
              title="Cerrar"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/42">Reserva máxima</p>
              <p className="mt-1 text-xl font-black text-white">Hasta {formatUsd(request.reserveMicros)}</p>
              <p className="mt-1 text-[10px] font-semibold leading-snug text-white/42">
                Estimado {formatUsd(request.estimatedCostMicros)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/42">Disponible</p>
              <p className={`mt-1 text-xl font-black ${insufficient || blocked ? "text-rose-200" : "text-emerald-200"}`}>
                {formatUsd(availableMicros)}
              </p>
              <p className="mt-1 text-[10px] font-semibold leading-snug text-white/42">
                Saldo actual de tu wallet.
              </p>
            </div>
          </div>

          {blocked && (
            <div
              id="wallet-cost-description"
              className="flex gap-2 rounded-xl border border-rose-300/25 bg-rose-500/12 px-3 py-2.5 text-[12px] font-semibold leading-relaxed text-rose-100"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>Tu cuenta está en revisión de facturación. No se lanzarán operaciones con coste hasta resolverlo.</span>
            </div>
          )}

          {insufficient && !blocked && (
            <div
              id="wallet-cost-description"
              className="flex gap-2 rounded-xl border border-amber-300/25 bg-amber-400/12 px-3 py-2.5 text-[12px] font-semibold leading-relaxed text-amber-100"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>Falta saldo para cubrir la reserva máxima. Recarga y vuelve a lanzar la operación.</span>
            </div>
          )}

          {!insufficient && !blocked && (
            <div
              id="wallet-cost-description"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[12px] font-medium leading-relaxed text-white/64"
            >
              {isVideo
                ? "Vídeo consume más saldo y puede tardar varios minutos. Foldder bloquea el máximo antes de empezar y libera el sobrante si el coste real baja o falla el proveedor."
                : "Foldder bloquea el máximo antes de llamar al proveedor y ajusta el saldo al coste real cuando termina."}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 bg-white/[0.03] px-5 py-4">
          <button
            type="button"
            onClick={() => close(false, "cancelled")}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/[0.1] hover:text-white"
          >
            Cancelar
          </button>
          {insufficient || blocked ? (
            <button
              type="button"
              ref={primaryButtonRef}
              onClick={() => {
                dispatchWalletOpen("cost_guard");
                close(false, insufficient ? "insufficient_balance" : "cancelled");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-400"
            >
              <CreditCard size={14} />
              Recargar saldo
            </button>
          ) : (
            <button
              type="button"
              ref={primaryButtonRef}
              onClick={() => close(true, "approved")}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-violet-950/25 transition hover:bg-violet-400"
            >
              {request.tone === "strong" ? "Confirmar y generar" : "Generar"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
