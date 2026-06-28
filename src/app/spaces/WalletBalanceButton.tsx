"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  LogOut,
  Loader2,
  Package,
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
  getPaymentWarningsEnabledSnapshot,
  subscribePaymentWarningsPreference,
  writePaymentWarningsEnabled,
} from "@/lib/wallet-payment-warnings-preference";
import {
  getCanvasAnimatedEdgesEnabledSnapshot,
  subscribeCanvasAnimatedEdgesPreference,
  writeCanvasAnimatedEdgesEnabled,
} from "./canvas-animated-edges-preference";
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
  triggerLayout?: "circle" | "topbar";
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
  shape = "circle",
  user,
}: {
  className: string;
  shape?: "circle" | "square";
  user: WalletBalanceButtonProps["user"];
}) {
  const radiusClass = shape === "square" ? "rounded-none" : "rounded-full";
  return (
    <span className={`block overflow-hidden ${radiusClass} border border-white/25 bg-white/10 shadow-sm ${className}`}>
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

export function WalletBalanceButton({
  onBeforeCheckout,
  onSignOut,
  projectId = null,
  triggerLayout = "circle",
  user = null,
}: WalletBalanceButtonProps) {
  const { language } = useLanguage();
  const paymentWarningsEnabled = useSyncExternalStore(
    subscribePaymentWarningsPreference,
    getPaymentWarningsEnabledSnapshot,
    () => true,
  );
  const animatedEdgesEnabled = useSyncExternalStore(
    subscribeCanvasAnimatedEdgesPreference,
    getCanvasAnimatedEdgesEnabledSnapshot,
    () => true,
  );
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
  const compactAvailableLabel = account ? formatUsd(account.availableMicros, { compact: true }) : state.status === "loading" ? "..." : "$0";
  const displayName = userDisplayName(user);
  const displayEmail = user?.email?.trim() || "";
  const hasBillingRisk = account?.status === "blocked" || account?.billingReviewRequired === true;
  const canCheckout = walletConfigured && checkoutAmount == null;
  const buttonTone = walletUnavailable
    ? "border-amber-300/55 bg-amber-500/18 text-amber-50"
    : hasBillingRisk
    ? "border-rose-300/50 bg-rose-500/18 text-rose-50"
    : account?.lowBalance
      ? "border-amber-300/55 bg-amber-500/18 text-amber-50"
      : "border-white/25 bg-white/[0.08] text-white/78";
  const creditBadgeTone = walletUnavailable
    ? "bg-amber-500 text-amber-950"
    : !data
      ? "bg-white text-slate-950"
      : hasBillingRisk
        ? "bg-rose-500 text-white"
        : account?.lowBalance
          ? "bg-amber-400 text-amber-950"
          : "bg-emerald-400 text-emerald-950";

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
    <div className="space-y-3">
      <div className="grid grid-cols-2 divide-x divide-white/10 bg-white/[0.06]">
        <div className="px-2.5 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-200/70">Reservado</p>
          <p className="mt-0.5 text-[15px] font-black tabular-nums text-white">{formatUsd(account?.reservedMicros ?? 0)}</p>
        </div>
        <div className="px-2.5 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-200/70">Últimos usos</p>
          <p className="mt-0.5 text-[15px] font-black tabular-nums text-white">{visibleSpendLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/10">
        <div className="bg-emerald-500/20 px-2 py-2">
          <div className="flex items-center gap-1.5 text-emerald-100">
            <FileText size={12} />
            <p className="text-[10px] font-black uppercase tracking-[0.08em]">Texto</p>
          </div>
          <p className="mt-0.5 text-[9px] font-medium leading-snug text-emerald-50/55">Coste bajo</p>
        </div>
        <div className="bg-sky-500/20 px-2 py-2">
          <div className="flex items-center gap-1.5 text-sky-100">
            <ImageIcon size={12} />
            <p className="text-[10px] font-black uppercase tracking-[0.08em]">Imagen</p>
          </div>
          <p className="mt-0.5 text-[9px] font-medium leading-snug text-sky-50/55">Con reserva</p>
        </div>
        <div className="bg-amber-500/20 px-2 py-2">
          <div className="flex items-center gap-1.5 text-amber-100">
            <Video size={12} />
            <p className="text-[10px] font-black uppercase tracking-[0.08em]">Vídeo</p>
          </div>
          <p className="mt-0.5 text-[9px] font-medium leading-snug text-amber-50/55">Confirmación</p>
        </div>
      </div>

      <div className="flex h-10 items-stretch divide-x divide-white/10 bg-white/[0.06]">
        <div className="flex min-w-0 flex-1 flex-col justify-center px-2.5">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/55">
            {language === "es" ? "Aviso de pago" : "Payment notice"}
          </p>
          <p className="text-[9px] font-medium leading-snug text-white/38">
            {language === "es"
              ? "Modal antes de operaciones de coste"
              : "Modal before paid operations"}
          </p>
        </div>
        <div className="flex shrink-0 items-stretch">
          <button
            type="button"
            aria-pressed={paymentWarningsEnabled}
            onClick={() => writePaymentWarningsEnabled(true)}
            className={`min-w-[3rem] px-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition ${
              paymentWarningsEnabled
                ? "bg-white text-slate-950"
                : "bg-transparent text-white/45 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {language === "es" ? "Sí" : "Yes"}
          </button>
          <button
            type="button"
            aria-pressed={!paymentWarningsEnabled}
            onClick={() => writePaymentWarningsEnabled(false)}
            className={`min-w-[3rem] border-l border-white/10 px-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition ${
              !paymentWarningsEnabled
                ? "bg-white text-slate-950"
                : "bg-transparent text-white/45 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {language === "es" ? "No" : "No"}
          </button>
        </div>
      </div>

      <div className="flex h-10 items-stretch divide-x divide-white/10 bg-white/[0.06]">
        <div className="flex min-w-0 flex-1 flex-col justify-center px-2.5">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/55">
            {language === "es" ? "Líneas animadas" : "Animated lines"}
          </p>
          <p className="text-[9px] font-medium leading-snug text-white/38">
            {language === "es"
              ? "Puntos animados en las conexiones"
              : "Animated dots on connections"}
          </p>
        </div>
        <div className="flex shrink-0 items-stretch">
          <button
            type="button"
            aria-pressed={animatedEdgesEnabled}
            onClick={() => writeCanvasAnimatedEdgesEnabled(true)}
            className={`min-w-[3rem] px-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition ${
              animatedEdgesEnabled
                ? "bg-white text-slate-950"
                : "bg-transparent text-white/45 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {language === "es" ? "Sí" : "Yes"}
          </button>
          <button
            type="button"
            aria-pressed={!animatedEdgesEnabled}
            onClick={() => writeCanvasAnimatedEdgesEnabled(false)}
            className={`min-w-[3rem] border-l border-white/10 px-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition ${
              !animatedEdgesEnabled
                ? "bg-white text-slate-950"
                : "bg-transparent text-white/45 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {language === "es" ? "No" : "No"}
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-1.5">
            <CreditCard size={13} className="text-white/55" />
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/72">Recargar</p>
          </div>
          {checkoutAmount != null && (
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/40">Stripe…</span>
          )}
        </div>
        <div className="grid grid-cols-5 divide-x divide-white/10 bg-white/[0.06]">
          {sortedPackages.map((pkg) => {
            const active = checkoutAmount === pkg.amountCents;
            const recommended = pkg.amountCents === recommendedCents;
            const packageTone = !walletConfigured
              ? "bg-white/[0.03] text-white/30"
              : recommended
                ? "bg-emerald-400 text-emerald-950"
                : "bg-white/[0.06] text-white hover:bg-white/[0.12]";
            return (
              <button
                key={pkg.amountCents}
                type="button"
                onClick={() => void startCheckout(pkg.amountCents)}
                disabled={!canCheckout}
                title={recommended && walletConfigured ? "Recomendado" : undefined}
                className={`relative flex min-h-[52px] flex-col items-center justify-center px-1 py-2 text-center transition disabled:pointer-events-none disabled:opacity-40 ${packageTone}`}
              >
                {active ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <span className="text-[13px] font-black tabular-nums leading-none">{formatUsd(pkg.creditMicros)}</span>
                    {recommended && walletConfigured ? (
                      <span className="mt-1 text-[7px] font-black uppercase tracking-[0.14em] opacity-80">Top</span>
                    ) : (
                      <span className="mt-1 text-[7px] font-bold uppercase tracking-[0.1em] text-white/30">
                        {walletConfigured ? "USD" : "—"}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
        {!walletConfigured && (
          <p className="mt-1.5 px-0.5 text-[9px] font-medium text-white/38">
            Recargas desactivadas hasta configurar wallet en servidor.
          </p>
        )}
        {checkoutError && (
          <p className="mt-2 bg-rose-500/15 px-2.5 py-1.5 text-[10px] font-semibold text-rose-100">
            {checkoutError}
          </p>
        )}
      </div>
    </div>
  );

  const renderActivity = () => (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">Movimientos</p>
        {data?.recentEntriesTruncated && (
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/35">últimos 50</span>
        )}
      </div>
      <div className="divide-y divide-white/8 bg-white/[0.04]">
        {activityRows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] font-medium text-white/40">
            Aún no hay movimientos.
          </div>
        ) : (
          activityRows.map((row) => {
            const amount = row.status === "reserved" ? -row.reserveMicros : row.netMicros;
            const amountTone =
              row.status === "reserved"
                ? "text-amber-200"
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
            const statusBg =
              row.status === "reserved"
                ? "bg-amber-400/20 text-amber-100"
                : row.status === "credited"
                  ? "bg-emerald-400/20 text-emerald-100"
                  : row.status === "adjustment"
                    ? "bg-rose-400/20 text-rose-100"
                    : "bg-white/10 text-white/50";
            return (
              <div
                key={row.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 transition hover:bg-white/[0.06] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center ${DISPLAY_TONE_CLASS[row.tone]}`}>
                  {walletIcon(row.icon)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-[11px] font-black text-white">{row.title}</p>
                    {row.entryCount > 1 && (
                      <span className="hidden shrink-0 bg-white/10 px-1 py-0.5 text-[7px] font-black tabular-nums text-white/38 sm:inline">
                        ×{row.entryCount}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0 text-[9px] font-semibold text-white/35">
                    <span className="truncate text-white/52">{row.nodeLabel}</span>
                    <span>·</span>
                    <span>{formatDateTime(row.latestAt)}</span>
                  </div>
                </div>
                <span className={`hidden px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] sm:inline ${statusBg}`}>
                  {statusLabel}
                </span>
                <p className={`shrink-0 text-right text-[11px] font-black tabular-nums ${amountTone}`}>
                  {row.status === "reserved" ? `-${formatTinyUsd(row.reserveMicros)}` : formatUsd(amount, { signed: true })}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const openWallet = () => {
    setOpen((value) => !value);
    if (!open) void loadWallet();
  };

  return (
    <div
      className="relative"
      ref={panelRef}
      data-foldder-canvas-chrome
      data-foldder-wallet-trigger={triggerLayout === "topbar" ? "topbar" : undefined}
    >
      {triggerLayout === "topbar" ? (
        <button
          type="button"
          onClick={openWallet}
          title="Cuenta y saldo Foldder"
          aria-label="Abrir cuenta y saldo Foldder"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="group relative flex h-10 items-stretch overflow-hidden rounded-none bg-white/[0.08] text-white/78 backdrop-blur-xl transition-all hover:bg-white/[0.15] hover:text-white"
        >
          <AccountAvatar
            user={user}
            shape="square"
            className="h-10 w-10 shrink-0 border-0 shadow-none"
          />
          <span
            className={`flex h-10 min-w-[3.25rem] shrink-0 items-center justify-center border-l border-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] tabular-nums ${creditBadgeTone}`}
          >
            {compactAvailableLabel}
          </span>
          {state.status === "loading" && !data ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/42 text-white">
              <Loader2 size={15} className="animate-spin" aria-hidden />
            </span>
          ) : null}
        </button>
      ) : (
        <button
          type="button"
          onClick={openWallet}
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
            className={`absolute -bottom-1.5 left-1/2 max-w-[4.7rem] -translate-x-1/2 truncate rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none tabular-nums ${creditBadgeTone}`}
          >
            {compactAvailableLabel}
          </span>
        </button>
      )}

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
          className="fixed right-3 top-[4.25rem] z-[260] w-[calc(100vw-1.5rem)] max-w-[400px] overflow-hidden rounded-none bg-[#0b0f14]/98 text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:absolute sm:right-0 sm:top-[calc(100%+8px)] sm:w-[min(92vw,400px)]"
          role="dialog"
          aria-label="Centro de consumo"
          data-foldder-wallet-panel
        >
          <div className="flex h-10 items-stretch bg-white/[0.08]">
            <div className="flex min-w-0 flex-1 flex-col justify-center px-3">
              <p className="truncate text-[11px] font-black leading-tight text-white">{displayName}</p>
              {displayEmail ? (
                <p className="truncate text-[9px] font-semibold text-white/38">{displayEmail}</p>
              ) : null}
            </div>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                title="Salir"
                className="flex h-10 w-10 shrink-0 items-center justify-center border-l border-white/10 bg-white/[0.04] text-white/50 transition hover:bg-white/[0.12] hover:text-white"
              >
                <LogOut size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Cerrar"
              className="flex h-10 w-10 shrink-0 items-center justify-center border-l border-white/10 bg-white/[0.04] text-white/50 transition hover:bg-white/[0.12] hover:text-white"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex h-10 divide-x divide-white/10 bg-white/[0.06]">
            <button
              type="button"
              onClick={() => setView("overview")}
              className={`flex-1 text-[10px] font-black uppercase tracking-[0.1em] transition ${
                view === "overview" ? "bg-white text-slate-950" : "text-white/45 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              Resumen
            </button>
            <button
              type="button"
              onClick={() => setView("activity")}
              className={`flex-1 text-[10px] font-black uppercase tracking-[0.1em] transition ${
                view === "activity" ? "bg-white text-slate-950" : "text-white/45 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              Movimientos
            </button>
          </div>

          <div className="max-h-[min(72vh,560px)] overflow-y-auto px-3 py-2.5">
            {checkoutNotice === "success" && (
              <div className="mb-2 flex items-center gap-2 bg-emerald-400/15 px-2 py-1.5 text-[10px] font-semibold text-emerald-100">
                <CheckCircle2 size={12} className="shrink-0" />
                <span>Recarga recibida. Se actualiza al confirmar Stripe.</span>
              </div>
            )}

            {checkoutNotice === "cancelled" && (
              <div className="mb-2 flex items-center gap-2 bg-white/[0.06] px-2 py-1.5 text-[10px] font-semibold text-white/60">
                <AlertCircle size={12} className="shrink-0" />
                <span>Recarga cancelada.</span>
              </div>
            )}

            {state.status === "error" && (
              <div className="mb-2 flex items-center gap-2 bg-rose-500/15 px-2 py-1.5 text-[10px] font-semibold text-rose-100">
                <AlertCircle size={12} className="shrink-0" />
                <span>{state.error}</span>
              </div>
            )}

            {state.status !== "loading" && walletUnavailable && (
              <div className="mb-2 flex items-center gap-2 bg-amber-400/15 px-2 py-1.5 text-[10px] font-semibold text-amber-100">
                <AlertCircle size={12} className="shrink-0" />
                <span>Wallet no conectado. Recargas desactivadas.</span>
              </div>
            )}

            {account?.billingReviewRequired && (
              <div className="mb-2 flex items-center gap-2 bg-rose-500/15 px-2 py-1.5 text-[10px] font-semibold text-rose-100">
                <AlertCircle size={12} className="shrink-0" />
                <span>Cuenta en revisión. Operaciones con coste protegidas.</span>
              </div>
            )}

            {account?.lowBalance && account.status === "active" && (
              <div className="mb-2 flex items-center gap-2 bg-amber-400/15 px-2 py-1.5 text-[10px] font-semibold text-amber-100">
                <AlertCircle size={12} className="shrink-0" />
                <span>Saldo bajo. Recarga antes de imagen o vídeo.</span>
              </div>
            )}

            {view === "overview" ? renderOverview() : renderActivity()}
          </div>
        </div>
      )}
    </div>
  );
}
