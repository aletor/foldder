"use client";

import { USAGE_PERIOD_START_ISO } from "@/lib/usage-constants";
import { useCallback, useEffect, useState } from "react";

type ServiceAgg = {
  id: string;
  label: string;
  calls: number;
  totalTokens: number;
  costUsd: number;
};

type S3DocRow = { typeLabel: string; count: number; bytes: number };

type S3DocumentsPayload =
  | {
      prefix: string;
      bucket: string;
      totalObjects: number;
      totalBytes: number;
      byType: S3DocRow[];
    }
  | { error: string };

type UsagePayload = {
  since: string;
  services: ServiceAgg[];
  totalCostUsd: number;
  totalTokens: number;
  s3Documents?: S3DocumentsPayload;
};

function formatSinceLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

function fmtUsd(n: number): string {
  if (n < 0.0001 && n > 0) return "<0.0001";
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtTokens(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("es-ES");
}

function fmtBytes(n: number): string {
  if (n === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  const d = i === 0 ? 0 : i === 1 ? 1 : 2;
  return `${v.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: 0 })} ${u[i]}`;
}

const REFRESH_MS = 15_000;

export function ApiUsageHud() {
  const [data, setData] = useState<UsagePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/usage?since=${encodeURIComponent(USAGE_PERIOD_START_ISO)}`);
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as UsagePayload;
      setData(j);
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div
      id="foldder-api-usage-panel"
      className="pointer-events-auto max-h-[min(70vh,420px)] max-w-[min(96vw,340px)] overflow-y-auto rounded-md border border-white/25 bg-neutral-950 px-2.5 py-2 shadow-xl ring-1 ring-white/10"
      aria-label="Consumo de APIs"
    >
      <p className="mb-1.5 border-b border-white/20 pb-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-zinc-300">
        APIs integradas · desde {formatSinceLabel(USAGE_PERIOD_START_ISO)} (UTC)
      </p>
      {err && (
        <p className="font-mono text-[10px] text-rose-400" title={err}>
          No se pudo cargar el uso
        </p>
      )}
      {!err && data && (
        <>
          <div className="space-y-0 font-mono text-[10px] leading-tight text-zinc-100">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 gap-y-0.5 border-b border-white/15 pb-1 text-[8px] uppercase text-zinc-500">
              <span className="min-w-0">Servicio</span>
              <span className="w-7 shrink-0 text-center">Nº</span>
              <span className="w-[3.25rem] shrink-0 text-right">Tokens</span>
              <span className="w-[3.5rem] shrink-0 text-right">USD ~</span>
            </div>
            {data.services.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 border-t border-white/10 py-1 first:border-t-0"
              >
                <span className="min-w-0 break-words pr-1 normal-case leading-snug text-zinc-200" title={p.label}>
                  {p.label}
                </span>
                <span className="w-7 shrink-0 text-center tabular-nums text-zinc-400">{p.calls}</span>
                <span className="w-[3.25rem] shrink-0 text-right tabular-nums text-zinc-300">{fmtTokens(p.totalTokens)}</span>
                <span className="w-[3.5rem] shrink-0 text-right tabular-nums text-zinc-100">${fmtUsd(p.costUsd)}</span>
              </div>
            ))}
            <div className="mt-1 grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 border-t border-white/25 pt-1.5 font-semibold text-white">
              <span className="normal-case">Total</span>
              <span className="w-7 shrink-0 text-center">—</span>
              <span className="w-[3.25rem] shrink-0 text-right tabular-nums">{fmtTokens(data.totalTokens)}</span>
              <span className="w-[3.5rem] shrink-0 text-right tabular-nums">${fmtUsd(data.totalCostUsd)}</span>
            </div>
          </div>

          {data.s3Documents && "error" in data.s3Documents && (
            <p className="mt-2 font-mono text-[9px] text-rose-400/90" title={data.s3Documents.error}>
              S3: no se pudo listar documentos ({data.s3Documents.error.slice(0, 80)}
              {data.s3Documents.error.length > 80 ? "…" : ""})
            </p>
          )}

          {data.s3Documents && !("error" in data.s3Documents) && (
            <div className="mt-2 border-t border-white/20 pt-2">
              <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-zinc-300">
                Documentos en S3 · <span className="normal-case text-zinc-400">{data.s3Documents.prefix}</span>
              </p>
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0 font-mono text-[10px] text-zinc-200">
                <span>
                  Total:{" "}
                  <strong className="text-white">{data.s3Documents.totalObjects}</strong> archivo
                  {data.s3Documents.totalObjects === 1 ? "" : "s"}
                </span>
                <span className="text-zinc-500">·</span>
                <span>
                  Peso: <strong className="text-white">{fmtBytes(data.s3Documents.totalBytes)}</strong>
                </span>
              </div>
              {data.s3Documents.byType.length === 0 ? (
                <p className="font-mono text-[9px] text-zinc-500">Ningún objeto bajo este prefijo.</p>
              ) : (
                <div className="space-y-0 font-mono text-[10px] leading-tight text-zinc-100">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-1.5 border-b border-white/15 pb-1 text-[8px] uppercase text-zinc-500">
                    <span>Tipo</span>
                    <span className="w-7 shrink-0 text-center">Nº</span>
                    <span className="w-[4.5rem] shrink-0 text-right">Peso</span>
                  </div>
                  {data.s3Documents.byType.map((row) => (
                    <div
                      key={row.typeLabel}
                      className="grid grid-cols-[1fr_auto_auto] gap-x-1.5 border-t border-white/10 py-1 first:border-t-0"
                    >
                      <span className="min-w-0 break-words pr-1 text-zinc-200">{row.typeLabel}</span>
                      <span className="w-7 shrink-0 text-center tabular-nums text-zinc-400">{row.count}</span>
                      <span className="w-[4.5rem] shrink-0 text-right tabular-nums text-zinc-300">
                        {fmtBytes(row.bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-1 font-mono text-[7px] leading-snug text-zinc-600">
                Bucket <code className="text-zinc-500">{data.s3Documents.bucket}</code>. Listado cacheado ~60 s.
              </p>
            </div>
          )}

          <p className="mt-1.5 font-mono text-[8px] leading-snug text-zinc-500">
            Actualización cada {REFRESH_MS / 1000} s. Los eventos se guardan en S3 (
            <code className="text-zinc-400">foldder-meta/api-usage.jsonl</code>) y copia local si existe disco.
          </p>
        </>
      )}
    </div>
  );
}
