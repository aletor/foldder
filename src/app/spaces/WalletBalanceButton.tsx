"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  FileText,
  History,
  Image as ImageIcon,
  LockKeyhole,
  LogOut,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  UnlockKeyhole,
  Video,
  X,
} from "lucide-react";
import {
  FOLDDER_WALLET_OPEN_EVENT,
  FOLDDER_WALLET_REFRESH_EVENT,
  type WalletStatusResponse,
} from "@/lib/wallet-client-events";
import { useLanguage } from "@/components/LanguageProvider";
import {
  describeWalletLedgerEntry,
  groupWalletActivityRows,
  visibleSpentMicros,
} from "@/lib/wallet-display";

type WalletBalanceButtonProps = {
  onBeforeCheckout?: () =>
    | Promise<{ ok: boolean; projectId?: string | null; error?: string }>
    | { ok: boolean; projectId?: string | null; error?: string };
  onSignOut?: () => void;
  projectId?: string | null;
  user?: {
    email?: string | null;
    image?: string | null;
    name?: string | null;
  } | null;
};

type LoadState =
  | { status: "idle"; data: WalletStatusResponse | null; error: null }
  | { status: "loading"; data: WalletStatusResponse | null; error: null }
  | { status: "ready"; data: WalletStatusResponse; error: null }
  | { status: "error"; data: WalletStatusResponse | null; error: string };

type BillingView = "overview" | "activity";
type CheckoutNotice = "success" | "cancelled" | null;
type CheckoutSuccessPopup = {
  amountCents: number;
  currency: string;
  equivalentImages: number;
} | null;

const AI_IMAGE_EQUIVALENT_USD = 0.101;

const DISPLAY_TONE_CLASS = {
  positive: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  pending: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  neutral: "border-white/10 bg-white/[0.06] text-white/65",
  warning: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  danger: "border-rose-300/25 bg-rose-500/10 text-rose-100",
} as const;

function microsToUsd(micros: number): number {
  if (!Number.isFinite(micros)) return 0;
  return micros / 1_000_000;
}

function formatUsd(micros: number, options?: { signed?: boolean; compact?: boolean }): string {
  const usd = microsToUsd(micros);
  const absUsd = Math.abs(usd);
  const fractionDigits = options?.compact && absUsd >= 100 ? 0 : 2;
  const sign = options?.signed && usd > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(usd)}`;
}

function formatTinyUsd(micros: number): string {
  const usd = Math.abs(microsToUsd(micros));
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return formatUsd(Math.abs(micros), { compact: true });
}

function formatCurrencyFromCents(amountCents: number, currency: string, language: "es" | "en"): string {
  const amount = Math.max(0, amountCents) / 100;
  return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function equivalentAiImages(amountCents: number): number {
  return Math.max(1, Math.floor((amountCents / 100) / AI_IMAGE_EQUIVALENT_USD));
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function userInitial(user: WalletBalanceButtonProps["user"]): string {
  return (user?.name || user?.email || "U").trim().charAt(0).toUpperCase() || "U";
}

function userDisplayName(user: WalletBalanceButtonProps["user"]): string {
  return user?.name?.trim() || user?.email?.split("@")[0]?.trim() || "Usuario";
}

function AccountAvatar({
  className,
  user,
}: {
  className: string;
  user: WalletBalanceButtonProps["user"];
}) {
  return (
    <span className={`block overflow-hidden rounded-full border border-white/25 bg-white/10 shadow-sm ${className}`}>
      {user?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.image}
          alt={user.name || user.email || "Perfil"}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-white/[0.08] text-xs font-black text-white/82">
          {userInitial(user)}
        </span>
      )}
    </span>
  );
}

function walletIcon(icon: ReturnType<typeof describeWalletLedgerEntry>["icon"]) {
  if (icon === "credit") return <CreditCard size={15} />;
  if (icon === "reserve") return <LockKeyhole size={15} />;
  if (icon === "release") return <UnlockKeyhole size={15} />;
  if (icon === "image") return <ImageIcon size={15} />;
  if (icon === "video") return <Video size={15} />;
  if (icon === "text") return <FileText size={15} />;
  if (icon === "search") return <Search size={15} />;
  if (icon === "storage") return <Package size={15} />;
  return <Sparkles size={15} />;
}

function recommendedPackageCents(packages: WalletStatusResponse["topupPackages"]): number | null {
  if (packages.length === 0) return null;
  return packages.find((pkg) => pkg.amountCents >= 5000)?.amountCents ?? packages[Math.floor(packages.length / 2)]?.amountCents ?? null;
}

export function WalletBalanceButton({ onBeforeCheckout, onSignOut, projectId = null, user = null }: WalletBalanceButtonProps) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<BillingView>("overview");
  const [state, setState] = useState<LoadState>({ status: "idle", data: null, error: null });
  const [checkoutAmount, setCheckoutAmount] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<CheckoutNotice>(null);
  const [checkoutSuccessPopup, setCheckoutSuccessPopup] = useState<CheckoutSuccessPopup>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const data = state.data;
  const account = data?.account ?? null;
  const walletConfigured = data?.configured === true;
  const walletUnavailable = data?.configured === false;
  const recentEntries = useMemo(() => data?.recentEntries ?? [], [data?.recentEntries]);
  const activityRows = useMemo(() => groupWalletActivityRows(recentEntries), [recentEntries]);
  const visibleSpendLabel = formatUsd(visibleSpentMicros(recentEntries));
  const availableLabel = account ? formatUsd(account.availableMicros, { compact: true }) : "$0.00";
  const compactAvailableLabel = account ? formatUsd(account.availableMicros, { compact: true }) : state.status === "loading" ? "..." : "$0";
  const displayName = userDisplayName(user);
  const displayEmail = user?.email?.trim() || "";
  const hasBillingRisk = account?.status === "blocked" || account?.billingReviewRequired === true;
  const canCheckout = walletConfigured && checkoutAmount == null;
  const statusLabel = !data
    ? "Cargando"
    : walletUnavailable
      ? "No disponible"
      : hasBillingRisk
        ? "Revisión"
        : account?.lowBalance
          ? "Saldo bajo"
          : "Activo";
  const statusTone = walletUnavailable || !data
    ? "border-white/10 bg-white/[0.08] text-white/68"
    : hasBillingRisk
      ? "border-rose-300/25 bg-rose-500/12 text-rose-100"
      : account?.lowBalance
        ? "border-amber-300/25 bg-amber-400/12 text-amber-100"
        : "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
  const buttonTone = walletUnavailable
    ? "border-amber-300/55 bg-amber-500/18 text-amber-50"
    : hasBillingRisk
    ? "border-rose-300/50 bg-rose-500/18 text-rose-50"
    : account?.lowBalance
      ? "border-amber-300/55 bg-amber-500/18 text-amber-50"
      : "border-white/25 bg-white/[0.08] text-white/78";

  const loadWallet = useCallback(async () => {
    setState((prev) => ({ status: "loading", data: prev.data, error: null }));
    try {
      const response = await fetch("/api/billing/wallet?limit=50", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = (await response.json().catch(() => null)) as WalletStatusResponse | { error?: string } | null;
      if (!response.ok || !json) {
        const message = json && "error" in json && json.error ? json.error : "No se pudo cargar el saldo.";
        throw new Error(message);
      }
      setState({ status: "ready", data: json as WalletStatusResponse, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el saldo.";
      setState((prev) => ({ status: "error", data: prev.data, error: message }));
    }
  }, []);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const billing = url.searchParams.get("billing");
    if (billing !== "success" && billing !== "cancelled") return;
    setOpen(true);
    setCheckoutNotice(billing);
    setView(billing === "success" ? "activity" : "overview");
    if (billing === "success") {
      const amountCents = Number(url.searchParams.get("topupCents") || "");
      const currency = (url.searchParams.get("topupCurrency") || "usd").trim().toLowerCase();
      if (Number.isSafeInteger(amountCents) && amountCents > 0 && /^[a-z]{3}$/.test(currency)) {
        setCheckoutSuccessPopup({
          amountCents,
          currency,
          equivalentImages: equivalentAiImages(amountCents),
        });
      }
    }
    void loadWallet();
    url.searchParams.delete("billing");
    url.searchParams.delete("topupCents");
    url.searchParams.delete("topupCurrency");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [loadWallet]);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setView("overview");
      void loadWallet();
    };
    const onRefresh = () => {
      void loadWallet();
    };
    window.addEventListener(FOLDDER_WALLET_OPEN_EVENT, onOpen);
    window.addEventListener(FOLDDER_WALLET_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(FOLDDER_WALLET_OPEN_EVENT, onOpen);
      window.removeEventListener(FOLDDER_WALLET_REFRESH_EVENT, onRefresh);
    };
  }, [loadWallet]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current) return;
      if (event.target instanceof Node && panelRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (checkoutSuccessPopup) {
          setCheckoutSuccessPopup(null);
          return;
        }
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [checkoutSuccessPopup, open]);

  const sortedPackages = useMemo(() => {
    return [...(data?.topupPackages ?? [])].sort((a, b) => a.amountCents - b.amountCents);
  }, [data?.topupPackages]);
  const recommendedCents = walletConfigured ? recommendedPackageCents(sortedPackages) : null;

  const startCheckout = useCallback(async (amountCents: number) => {
    if (!data?.configured) {
      setCheckoutError("Recarga no disponible: el wallet no está configurado en este entorno.");
      return;
    }
    setCheckoutAmount(amountCents);
    setCheckoutError(null);
    setCheckoutNotice(null);
    try {
      let checkoutProjectId = projectId;
      if (onBeforeCheckout) {
        const beforeCheckout = await onBeforeCheckout();
        if (!beforeCheckout.ok) {
          throw new Error(beforeCheckout.error || "No se pudo guardar el proyecto antes de abrir Stripe.");
        }
        if ("projectId" in beforeCheckout) {
          checkoutProjectId = beforeCheckout.projectId ?? null;
        }
      }
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountCents,
          ...(checkoutProjectId ? { projectId: checkoutProjectId } : {}),
        }),
      });
      const json = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !json?.url) {
        throw new Error(json?.error || "No se pudo iniciar Stripe Checkout.");
      }
      window.location.assign(json.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "No se pudo iniciar Stripe Checkout.");
      setCheckoutAmount(null);
    }
  }, [data?.configured, onBeforeCheckout, projectId]);

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-none border border-white/10 bg-white/[0.045] px-3 py-3">
          <p className="text-[11px] font-semibold text-white/46">Disponible</p>
          <p className="mt-1 text-lg font-black tabular-nums text-white">{formatUsd(account?.availableMicros ?? 0)}</p>
        </div>
        <div className="rounded-none border border-white/10 bg-white/[0.045] px-3 py-3">
          <p className="text-[11px] font-semibold text-white/46">Reservado</p>
          <p className="mt-1 text-lg font-black tabular-nums text-white">{formatUsd(account?.reservedMicros ?? 0)}</p>
        </div>
        <div className="rounded-none border border-white/10 bg-white/[0.045] px-3 py-3">
          <p className="text-[11px] font-semibold text-white/46">Últimos usos</p>
          <p className="mt-1 text-lg font-black tabular-nums text-white">{visibleSpendLabel}</p>
        </div>
      </div>

      <div className="rounded-none border border-white/10 bg-white/[0.035] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[12px] font-semibold text-white/72">Cómo se consume</p>
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold text-white/42">
            Reserva antes de llamar a la API
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-none border border-emerald-300/18 bg-emerald-400/[0.075] px-3 py-2.5">
            <div className="flex items-center gap-2 text-emerald-100">
              <FileText size={14} />
              <p className="text-[12px] font-black">Texto</p>
            </div>
            <p className="mt-1 text-[11px] font-medium leading-snug text-emerald-50/62">Coste bajo y directo</p>
          </div>
          <div className="rounded-none border border-sky-300/18 bg-sky-400/[0.075] px-3 py-2.5">
            <div className="flex items-center gap-2 text-sky-100">
              <ImageIcon size={14} />
              <p className="text-[12px] font-black">Imagen</p>
            </div>
            <p className="mt-1 text-[11px] font-medium leading-snug text-sky-50/62">Reserva visible</p>
          </div>
          <div className="rounded-none border border-amber-300/22 bg-amber-400/[0.08] px-3 py-2.5">
            <div className="flex items-center gap-2 text-amber-100">
              <Video size={14} />
              <p className="text-[12px] font-black">Vídeo</p>
            </div>
            <p className="mt-1 text-[11px] font-medium leading-snug text-amber-50/66">Siempre con confirmación</p>
          </div>
        </div>
      </div>

      <div className="rounded-none border border-white/10 bg-white/[0.035] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-white/58" />
            <div>
              <p className="text-[12px] font-semibold text-white/78">Recargar saldo</p>
              <p className="text-[11px] text-white/40">
                {walletConfigured ? "Elige un paquete y Foldder abrirá Stripe Checkout." : "Se activará cuando el wallet esté configurado en servidor."}
              </p>
            </div>
          </div>
          {checkoutAmount != null && <span className="text-[11px] font-semibold text-white/42">Redirigiendo a Stripe</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-5">
          {sortedPackages.map((pkg) => {
            const active = checkoutAmount === pkg.amountCents;
            const recommended = pkg.amountCents === recommendedCents;
            const packageTone = !walletConfigured
              ? "border-white/8 bg-white/[0.025] text-white/34"
              : recommended
                ? "border-emerald-300/35 bg-emerald-400/14 text-emerald-50 shadow-emerald-950/20"
                : "border-white/10 bg-white/[0.055] text-white hover:border-white/22 hover:bg-white/[0.09]";
            return (
              <button
                key={pkg.amountCents}
                type="button"
                onClick={() => void startCheckout(pkg.amountCents)}
                disabled={!canCheckout}
                className={`relative flex min-h-[60px] flex-col items-center justify-center rounded-none border px-2 text-center shadow-sm transition disabled:pointer-events-none disabled:shadow-none ${packageTone}`}
              >
                {recommended && walletConfigured && (
                  <span className="absolute -top-2 rounded-full border border-emerald-200/30 bg-emerald-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-white shadow-sm">
                    recomendado
                  </span>
                )}
                {active ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>
                    <span className="text-sm font-black tabular-nums">{formatUsd(pkg.creditMicros)}</span>
                    <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/36">
                      {walletConfigured ? "crédito" : "no disponible"}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {checkoutError && (
          <p className="mt-2 rounded-none border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-100">
            {checkoutError}
          </p>
        )}
      </div>
    </div>
  );

  const renderActivity = () => (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History size={16} className="text-white/58" />
          <div>
            <p className="text-[12px] font-semibold text-white/78">Movimientos</p>
            <p className="text-[10px] font-medium text-white/34">Agrupado por llamada y nodo</p>
          </div>
        </div>
        {data?.recentEntriesTruncated && (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-white/42">últimos 50</span>
        )}
      </div>
      <div className="space-y-1.5">
        {activityRows.length === 0 ? (
          <div className="rounded-none border border-dashed border-white/12 bg-white/[0.035] px-3 py-8 text-center text-[12px] font-medium text-white/45">
            Aún no hay movimientos.
          </div>
        ) : (
          activityRows.map((row) => {
            const amount = row.status === "reserved" ? -row.reserveMicros : row.netMicros;
            const amountTone =
              row.status === "reserved"
                ? "text-amber-100"
                : amount < 0
                  ? "text-rose-200"
                  : amount > 0
                    ? "text-emerald-200"
                    : "text-white/52";
            const statusLabel =
              row.status === "credited"
                ? "Crédito"
                : row.status === "reserved"
                  ? "En curso"
                  : row.status === "released"
                    ? "Liberado"
                    : row.status === "adjustment"
                      ? "Revisión"
                      : "Liquidado";
            return (
              <div
                key={row.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-none border border-white/10 bg-white/[0.04] px-2.5 py-2 transition hover:border-white/16 hover:bg-white/[0.06] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-none border ${DISPLAY_TONE_CLASS[row.tone]}`}>
                  {walletIcon(row.icon)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-[12px] font-black text-white">{row.title}</p>
                    {row.entryCount > 1 && (
                      <span className="hidden shrink-0 rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[8px] font-black tabular-nums text-white/38 sm:inline">
                        {row.entryCount} pasos
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-semibold text-white/38">
                    <span className="truncate text-white/58">{row.nodeLabel}</span>
                    <span className="text-white/18">·</span>
                    <span>{row.providerLabel}</span>
                    <span className="text-white/18">·</span>
                    <span>{formatDateTime(row.latestAt)}</span>
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                    {row.reserveMicros > 0 && (
                      <span className="rounded-none border border-amber-200/14 bg-amber-300/8 px-1.5 py-0.5 text-[9px] font-bold text-amber-100/70">
                        reserva {formatTinyUsd(row.reserveMicros)}
                      </span>
                    )}
                    {row.captureMicros > 0 && (
                      <span className="rounded-none border border-rose-200/12 bg-rose-300/8 px-1.5 py-0.5 text-[9px] font-bold text-rose-100/72">
                        consumo {formatTinyUsd(row.captureMicros)}
                      </span>
                    )}
                    {row.releaseMicros > 0 && (
                      <span className="rounded-none border border-emerald-200/12 bg-emerald-300/8 px-1.5 py-0.5 text-[9px] font-bold text-emerald-100/72">
                        devuelto {formatTinyUsd(row.releaseMicros)}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`hidden rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] sm:inline ${
                    row.status === "reserved"
                      ? "border-amber-200/20 bg-amber-300/8 text-amber-100/72"
                      : row.status === "credited"
                        ? "border-emerald-200/20 bg-emerald-300/8 text-emerald-100/72"
                        : row.status === "adjustment"
                          ? "border-rose-200/20 bg-rose-300/8 text-rose-100/72"
                          : "border-white/10 bg-white/[0.04] text-white/44"
                  }`}
                >
                  {statusLabel}
                </span>
                <p className={`shrink-0 text-right text-[12px] font-black tabular-nums ${amountTone}`}>
                  {row.status === "reserved" ? `-${formatTinyUsd(row.reserveMicros)}` : formatUsd(amount, { signed: true })}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="relative" ref={panelRef} data-foldder-canvas-chrome>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void loadWallet();
        }}
        title="Cuenta y saldo Foldder"
        aria-label="Abrir cuenta y saldo Foldder"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`group relative flex h-11 w-11 items-center justify-center rounded-full p-0.5 backdrop-blur-xl transition-all hover:scale-105 hover:bg-white/[0.15] hover:text-white ${buttonTone}`}
      >
        <AccountAvatar user={user} className="h-full w-full" />
        {state.status === "loading" && !data ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/42 text-white">
            <Loader2 size={15} className="animate-spin" aria-hidden />
          </span>
        ) : null}
        <span
          className={`absolute -bottom-1.5 left-1/2 max-w-[4.7rem] -translate-x-1/2 truncate rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none tabular-nums ${
            walletUnavailable
              ? "bg-amber-500 text-amber-950"
              : !data
                ? "bg-white text-slate-950"
                : hasBillingRisk
                ? "bg-rose-500 text-white"
                : account?.lowBalance
                  ? "bg-amber-400 text-amber-950"
                  : "bg-emerald-400 text-emerald-950"
          }`}
        >
          {compactAvailableLabel}
        </span>
      </button>

      {checkoutSuccessPopup && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={language === "es" ? "Recarga confirmada" : "Top-up confirmed"}
          data-foldder-i18n-ignore
        >
          <div className="w-full max-w-sm rounded-none border border-emerald-200/18 bg-[#10171f] p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none border border-emerald-300/25 bg-emerald-400/14 text-emerald-100">
                <CheckCircle2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-200/80">
                  {language === "es" ? "Recarga completada" : "Top-up complete"}
                </p>
                <p className="mt-2 text-[15px] font-semibold leading-snug text-white">
                  {language === "es"
                    ? `Acabas de recargar ${formatCurrencyFromCents(
                        checkoutSuccessPopup.amountCents,
                        checkoutSuccessPopup.currency,
                        language,
                      )}, equivalente a aprox. ${checkoutSuccessPopup.equivalentImages.toLocaleString("es-ES")} imágenes AI.`
                    : `You just topped up ${formatCurrencyFromCents(
                        checkoutSuccessPopup.amountCents,
                        checkoutSuccessPopup.currency,
                        language,
                      )}, equivalent to about ${checkoutSuccessPopup.equivalentImages.toLocaleString("en-US")} AI images.`}
                </p>
                <p className="mt-2 text-[12px] leading-snug text-white/50">
                  {language === "es"
                    ? "El saldo se actualizará cuando Stripe confirme el pago."
                    : "Your balance will update when Stripe confirms the payment."}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setCheckoutSuccessPopup(null)}
                className="rounded-none border border-white/12 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-950 shadow-sm transition hover:bg-white/90"
              >
                {language === "es" ? "Entendido" : "Got it"}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed right-3 top-16 z-[260] w-[calc(100vw-1.5rem)] max-w-[560px] overflow-hidden rounded-none border border-white/14 bg-[#0d1117]/98 text-white shadow-[0_30px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl sm:absolute sm:right-0 sm:top-[calc(100%+12px)] sm:w-[min(92vw,560px)]"
          role="dialog"
          aria-label="Centro de consumo"
        >
          <div className="border-b border-white/10 bg-white/[0.045] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <AccountAvatar user={user} className="h-12 w-12 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/38">Cuenta Foldder</p>
                  <h2 className="mt-0.5 truncate text-lg font-black tracking-tight text-white">{displayName}</h2>
                  <p className="truncate text-[11px] font-semibold text-white/38">
                    {displayEmail || "Centro de consumo"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => void loadWallet()}
                  className="flex h-8 w-8 items-center justify-center rounded-none border border-white/10 bg-white/[0.04] text-white/58 transition hover:bg-white/[0.1] hover:text-white"
                  title="Actualizar saldo"
                >
                  {state.status === "loading" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-none border border-white/10 bg-white/[0.04] text-white/58 transition hover:bg-white/[0.1] hover:text-white"
                  title="Cerrar"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3 rounded-none border border-white/10 bg-black/18 px-3 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-white/42">Disponible ahora</p>
                <p className="mt-0.5 text-3xl font-black tracking-tight text-white tabular-nums">{availableLabel}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold ${statusTone}`}>
                  {!data ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : walletUnavailable || hasBillingRisk ? (
                    <AlertCircle size={13} />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  {statusLabel}
                </span>
                {onSignOut && (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex items-center gap-1.5 rounded-none border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/54 transition hover:bg-white/[0.1] hover:text-white"
                  >
                    <LogOut size={12} />
                    Salir
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="max-h-[min(76vh,680px)] overflow-y-auto px-4 py-4">
            {checkoutNotice === "success" && (
              <div className="mb-3 flex items-start gap-2 rounded-none border border-emerald-300/25 bg-emerald-400/10 px-3 py-2.5 text-[12px] font-semibold text-emerald-100">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                <span>Recarga recibida. El saldo se actualiza cuando Stripe confirma el pago.</span>
              </div>
            )}

            {checkoutNotice === "cancelled" && (
              <div className="mb-3 flex items-start gap-2 rounded-none border border-white/10 bg-white/[0.045] px-3 py-2.5 text-[12px] font-semibold text-white/68">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>Recarga cancelada. No se ha añadido saldo.</span>
              </div>
            )}

            {state.status === "error" && (
              <div className="mb-3 flex items-start gap-2 rounded-none border border-rose-300/25 bg-rose-500/10 px-3 py-2.5 text-[12px] font-semibold text-rose-100">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{state.error}</span>
              </div>
            )}

            {state.status !== "loading" && walletUnavailable && (
              <div className="mb-3 flex items-start gap-2 rounded-none border border-amber-300/25 bg-amber-400/10 px-3 py-2.5 text-[12px] font-semibold text-amber-100">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>Wallet no conectado en este entorno. Las recargas quedan desactivadas hasta configurar el ledger en servidor.</span>
              </div>
            )}

            {account?.billingReviewRequired && (
              <div className="mb-3 flex items-start gap-2 rounded-none border border-rose-300/25 bg-rose-500/10 px-3 py-2.5 text-[12px] font-semibold text-rose-100">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>Cuenta en revisión por facturación. Las operaciones con coste quedan protegidas.</span>
              </div>
            )}

            {account?.lowBalance && account.status === "active" && (
              <div className="mb-3 flex items-start gap-2 rounded-none border border-amber-300/25 bg-amber-400/10 px-3 py-2.5 text-[12px] font-semibold text-amber-100">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>Saldo bajo. Conviene recargar antes de lanzar imagen pesada o vídeo.</span>
              </div>
            )}

            <div className="mb-3 grid grid-cols-2 gap-1 rounded-none border border-white/10 bg-black/22 p-1">
              <button
                type="button"
                onClick={() => setView("overview")}
                className={`rounded-none px-3 py-2 text-[11px] font-bold transition ${
                  view === "overview" ? "bg-white text-slate-950 shadow-sm" : "text-white/46 hover:bg-white/[0.055] hover:text-white"
                }`}
              >
                Resumen
              </button>
              <button
                type="button"
                onClick={() => setView("activity")}
                className={`rounded-none px-3 py-2 text-[11px] font-bold transition ${
                  view === "activity" ? "bg-white text-slate-950 shadow-sm" : "text-white/46 hover:bg-white/[0.055] hover:text-white"
                }`}
              >
                Movimientos
              </button>
            </div>

            {view === "overview" ? renderOverview() : renderActivity()}
          </div>
        </div>
      )}
    </div>
  );
}
