"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageVisionPassRunAudit } from "@/lib/brandkit/ingest/page-vision-pass-runner";
import type { PageVisionLogoInstance } from "@/lib/brandkit/ingest/page-vision-pass-schema";
import type { LogoLabFixtureId } from "@/lib/brandkit/logo-lab/fixtures";
import { LogoLabNav } from "./LogoLabNav";
import {
  bboxXYXYToCssPercent,
  logoLabBboxColor,
  logoLabBboxInterpretation,
  resolveLogoLabBbox,
} from "@/lib/brandkit/logo-lab/bbox-overlay";
import { auditPageNumbers } from "@/lib/brandkit/logo-lab/upload-store";
import {
  logoLabRefineKey,
  type LogoLabDocumentHarvest,
} from "@/lib/brandkit/logo-lab/harvest-types";
import type { LogoLabDocumentCandidate, LogoLabRefinePayload } from "@/lib/brandkit/logo-lab/pick-best-logo";
import type { LogoLabFixturesResponse } from "@/app/api/logo-lab/fixtures/route";
import "./logo-lab.css";

type AuditPayload = {
  fixtureId?: LogoLabFixtureId;
  uploadId?: string;
  label: string;
  fileName: string;
  audit: PageVisionPassRunAudit;
  harvest: LogoLabDocumentHarvest | null;
};

type PageSource =
  | { kind: "fixture"; id: LogoLabFixtureId }
  | { kind: "upload"; uploadId: string };

type UploadedPdfTab = {
  uploadId: string;
  fileName: string;
  file: File;
  audit: PageVisionPassRunAudit;
  harvest: LogoLabDocumentHarvest | null;
  logoInstanceCount: number;
};

function shortFileName(name: string): string {
  return name.length > 28 ? `${name.slice(0, 25)}…` : name;
}

function formatBbox(bbox: readonly [number, number, number, number]): string {
  return bbox.map((v) => v.toFixed(3)).join(", ");
}

function buildPageSrc(source: PageSource, pageNumber: number): string {
  const q = new URLSearchParams({ page: String(pageNumber) });
  if (source.kind === "upload") q.set("uploadId", source.uploadId);
  else q.set("id", source.id);
  return `/api/logo-lab/page?${q.toString()}`;
}

function resolveBestDocumentLogo(
  allInstances: { pageNumber: number; index: number; instance: PageVisionLogoInstance }[],
  harvest: LogoLabDocumentHarvest | null,
): LogoLabDocumentCandidate | null {
  if (!harvest?.best) return null;
  const match = allInstances.find(
    (entry) => entry.pageNumber === harvest.best!.pageNumber && entry.index === harvest.best!.index,
  );
  if (!match) return null;
  return {
    ...match,
    refine: harvest.refines[logoLabRefineKey(match.pageNumber, match.index)] ?? null,
  };
}

function LogoInstanceRow({
  pageNumber,
  index,
  instance,
  active,
  isBest,
  onSelect,
}: {
  pageNumber: number;
  index: number;
  instance: PageVisionLogoInstance;
  active: boolean;
  isBest?: boolean;
  onSelect: () => void;
}) {
  const color = logoLabBboxColor(index);
  const interpretation = logoLabBboxInterpretation(instance.bbox);
  const resolved = resolveLogoLabBbox(instance.bbox);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`logo-lab-instance${active ? " logo-lab-instance--active" : ""}`}
      style={{ borderLeftColor: color }}
    >
      <span className="logo-lab-instance__meta">
        pág. {pageNumber} · #{index + 1} · {instance.variant} · {(instance.confidence * 100).toFixed(0)}%
        {isBest ? " · mejor doc" : ""}
      </span>
      <span className="logo-lab-instance__bbox">raw [{formatBbox(instance.bbox)}]</span>
      <span className="logo-lab-instance__detail">
        {interpretation === "xywh_legacy" ? "xywh→xyxy" : interpretation} · [{formatBbox(resolved)}]
      </span>
    </button>
  );
}

type RefinePayload = LogoLabRefinePayload;

function BestLogoPreview({
  candidate,
  score,
  pending,
  onSelect,
}: {
  candidate: LogoLabDocumentCandidate | null;
  score: number | null;
  pending: boolean;
  onSelect: () => void;
}) {
  if (!candidate?.refine?.logoCropBase64 && !pending) return null;

  const methodLabel =
    candidate?.refine?.method === "pdf_object"
      ? "snap PDF"
      : candidate?.refine?.method === "contrast"
        ? "snap contraste"
        : candidate?.refine
          ? "semilla"
          : null;

  return (
    <aside className="logo-lab-best-logo" aria-label="mejor logo del documento">
      <p className="logo-lab-best-logo__label">mejor logo del documento</p>
      {candidate?.refine?.logoCropBase64 ? (
        <button type="button" className="logo-lab-best-logo__card" onClick={onSelect}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${candidate.refine.logoCropBase64}`}
            alt="mejor logo del documento"
            className="logo-lab-best-logo__img"
          />
          <span className="logo-lab-best-logo__meta">
            pág. {candidate.pageNumber} · {(candidate.instance.confidence * 100).toFixed(0)}%
            {methodLabel ? ` · ${methodLabel}` : ""}
            {score !== null ? ` · score ${score.toFixed(0)}` : ""}
          </span>
        </button>
      ) : (
        <p className="logo-lab-best-logo__pending">{pending ? "rescatando logos…" : "sin crop"}</p>
      )}
    </aside>
  );
}

function PageViewer({
  source,
  uploadFile,
  pageNumber,
  instances,
  activeIndex,
  refines,
}: {
  source: PageSource;
  uploadFile?: File | null;
  pageNumber: number;
  instances: PageVisionLogoInstance[];
  activeIndex: number | null;
  refines: (RefinePayload | null)[];
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      setPageError(null);
      if (source.kind === "fixture") {
        setImageUrl(buildPageSrc(source, pageNumber));
        return;
      }
      if (!uploadFile) {
        setImageUrl(null);
        setPageError("pdf no disponible en el navegador");
        return;
      }
      setImageUrl(null);
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("page", String(pageNumber));
      const res = await fetch("/api/logo-lab/page", { method: "POST", body: form });
      if (cancelled) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setPageError(body.error ?? "render_failed");
        return;
      }
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, pageNumber, uploadFile]);

  return (
    <div className="logo-lab-viewer">
      <p className="logo-lab-viewer__title">frame batch · jpeg del modelo (96 dpi · 640px · tag)</p>
      <div className="logo-lab-viewer__stage">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt={`pág. ${pageNumber}`} className="logo-lab-viewer__page" />
        ) : (
          <p className="logo-lab-loading">{pageError ?? "renderizando página…"}</p>
        )}
        <div className="logo-lab-viewer__overlay" aria-hidden>
          {imageUrl
            ? instances.map((instance, index) => {
                const refine = refines[index];
                const seedRect = bboxXYXYToCssPercent(
                  refine?.seedBbox ?? resolveLogoLabBbox(instance.bbox),
                );
                const refinedRect = refine ? bboxXYXYToCssPercent(refine.refinedBbox) : null;
                const color = logoLabBboxColor(index);
                const active = activeIndex === index;
                return (
                  <div key={`${pageNumber}-${index}`}>
                    <div
                      className={`logo-lab-bbox logo-lab-bbox--seed${active ? " logo-lab-bbox--active" : ""}`}
                      style={{
                        left: seedRect.left,
                        top: seedRect.top,
                        width: seedRect.width,
                        height: seedRect.height,
                        outlineColor: color,
                        backgroundColor: active ? `${color}18` : `${color}0a`,
                      }}
                    />
                    {refinedRect ? (
                      <div
                        className={`logo-lab-bbox logo-lab-bbox--refined${active ? " logo-lab-bbox--active" : ""}`}
                        style={{
                          left: refinedRect.left,
                          top: refinedRect.top,
                          width: refinedRect.width,
                          height: refinedRect.height,
                        }}
                      >
                        <span className="logo-lab-bbox__label logo-lab-bbox__label--refined">
                          {index + 1}
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`logo-lab-bbox${active ? " logo-lab-bbox--active" : ""}`}
                        style={{
                          left: seedRect.left,
                          top: seedRect.top,
                          width: seedRect.width,
                          height: seedRect.height,
                          outlineColor: color,
                          backgroundColor: active ? `${color}22` : `${color}11`,
                        }}
                      >
                        <span className="logo-lab-bbox__label" style={{ backgroundColor: color }}>
                          {index + 1}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            : null}
        </div>
      </div>
      <p className="logo-lab-viewer__caption">
        pág. {pageNumber} · {instances.length ? `${instances.length} logo` : "sin logoInstances"}
        {instances.length
          ? " · verde=afinado · ámbar=semilla Gemini"
          : ""}
      </p>
    </div>
  );
}

export function LogoLabView() {
  const [fixtures, setFixtures] = useState<LogoLabFixturesResponse["fixtures"]>([]);
  const [uploads, setUploads] = useState<UploadedPdfTab[]>([]);
  const [source, setSource] = useState<PageSource>({ kind: "fixture", id: "catalogo26" });
  const [auditPayload, setAuditPayload] = useState<AuditPayload | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [activeInstanceIndex, setActiveInstanceIndex] = useState<number | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const auditRequestGenRef = useRef(0);

  const selectUpload = useCallback((entry: UploadedPdfTab) => {
    setError(null);
    setAuditLoading(false);
    setSource({ kind: "upload", uploadId: entry.uploadId });
    setAuditPayload({
      uploadId: entry.uploadId,
      label: entry.fileName,
      fileName: entry.fileName,
      audit: entry.audit,
      harvest: entry.harvest,
    });
    setPageNumber(auditPageNumbers(entry.audit)[0] ?? 1);
    setActiveInstanceIndex(null);
  }, []);

  useEffect(() => {
    void fetch("/api/logo-lab/fixtures")
      .then((r) => r.json())
      .then((data: LogoLabFixturesResponse) => setFixtures(data.fixtures))
      .catch(() => setError("no se pudieron cargar los fixtures"));
  }, []);

  const loadAudit = useCallback(async (id: LogoLabFixtureId) => {
    const requestGen = ++auditRequestGenRef.current;
    setAuditLoading(true);
    setError(null);
    setSource((prev) =>
      prev.kind === "fixture" && prev.id === id ? prev : { kind: "fixture", id },
    );
    try {
      const res = await fetch(`/api/logo-lab/audit?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "audit_load_failed");
      }
      const data = (await res.json()) as AuditPayload;
      if (requestGen !== auditRequestGenRef.current) return;
      setAuditPayload({
        ...data,
        harvest: data.harvest ?? null,
      });
      setPageNumber(auditPageNumbers(data.audit)[0] ?? 1);
      setActiveInstanceIndex(null);
    } catch (e) {
      if (requestGen !== auditRequestGenRef.current) return;
      setAuditPayload(null);
      setError(e instanceof Error ? e.message : "audit_load_failed");
    } finally {
      if (requestGen === auditRequestGenRef.current) setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit("catalogo26");
  }, [loadAudit]);

  const analyzeUpload = useCallback(async (file: File) => {
    setAnalyzing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/logo-lab/analyze", { method: "POST", body: form });
      const body = (await res.json()) as {
        error?: string;
        uploadId?: string;
        fileName?: string;
        audit: PageVisionPassRunAudit;
        harvest?: LogoLabDocumentHarvest | null;
        logoInstanceCount?: number;
      };
      if (!res.ok) throw new Error(body.error ?? "analyze_failed");
      const uploadId = body.uploadId!;
      const logoInstanceCount =
        body.logoInstanceCount ??
        body.audit.pages.reduce((sum, p) => sum + (p.result?.logoInstances?.length ?? 0), 0);
      const entry: UploadedPdfTab = {
        uploadId,
        fileName: body.fileName ?? file.name,
        file,
        audit: body.audit,
        harvest: body.harvest ?? null,
        logoInstanceCount,
      };
      setUploads((prev) => [...prev.filter((u) => u.uploadId !== uploadId), entry]);
      selectUpload(entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "analyze_failed");
    } finally {
      setAnalyzing(false);
    }
  }, [selectUpload]);

  const pageAudit = useMemo(
    () => auditPayload?.audit.pages.find((p) => p.pageNumber === pageNumber),
    [auditPayload, pageNumber],
  );

  const pageInstances = pageAudit?.result?.logoInstances ?? [];

  const activeUploadFile = useMemo(() => {
    if (source.kind !== "upload") return null;
    return uploads.find((u) => u.uploadId === source.uploadId)?.file ?? null;
  }, [source, uploads]);

  const allInstances = useMemo(() => {
    if (!auditPayload) return [];
    return auditPayload.audit.pages.flatMap((p) =>
      (p.result?.logoInstances ?? []).map((instance, index) => ({
        pageNumber: p.pageNumber,
        index,
        instance,
      })),
    );
  }, [auditPayload]);

  const documentHarvest = auditPayload?.harvest ?? null;

  const bestDocumentLogo = useMemo(
    () => resolveBestDocumentLogo(allInstances, documentHarvest),
    [allInstances, documentHarvest],
  );

  const pageRefines = useMemo(
    () =>
      pageInstances.map(
        (_, index) => documentHarvest?.refines[logoLabRefineKey(pageNumber, index)] ?? null,
      ),
    [pageInstances, pageNumber, documentHarvest],
  );

  const visiblePages = auditPayload ? auditPageNumbers(auditPayload.audit) : [];

  const activeFixture =
    source.kind === "fixture" ? fixtures.find((f) => f.id === source.id) : undefined;

  return (
    <div className="logo-lab">
      {auditPayload ? (
        <BestLogoPreview
          candidate={bestDocumentLogo}
          score={documentHarvest?.best?.score ?? null}
          pending={auditLoading || analyzing}
          onSelect={() => {
            if (!bestDocumentLogo) return;
            setPageNumber(bestDocumentLogo.pageNumber);
            setActiveInstanceIndex(bestDocumentLogo.index);
          }}
        />
      ) : null}
      <header className="logo-lab-header">
        <div>
          <p className="logo-lab-kicker">brandKit · laboratorio</p>
          <h1 className="logo-lab-title">logo-lab</h1>
          <p className="logo-lab-subtitle">
            Gemini localiza la zona (semilla ámbar). El código afina a bordes exactos: snap PDF (Nivel 2) o
            contraste (Nivel 1). El mejor logo se fija al analizar — preview arriba a la derecha.
          </p>
        </div>
        <div className="logo-lab-header__actions">
          <LogoLabNav />
          <div className="logo-lab-fixtures" role="tablist" aria-label="pdfs">
            {fixtures.map((fixture) => (
              <button
                key={fixture.id}
                type="button"
                role="tab"
                aria-selected={source.kind === "fixture" && source.id === fixture.id}
                disabled={!fixture.auditAvailable || !fixture.pdfAvailable}
                onClick={() => {
                  void loadAudit(fixture.id);
                }}
                className={`logo-lab-fixture${
                  source.kind === "fixture" && source.id === fixture.id ? " logo-lab-fixture--active" : ""
                }`}
              >
                {fixture.label}
              </button>
            ))}
            {uploads.map((upload) => (
              <button
                key={upload.uploadId}
                type="button"
                role="tab"
                aria-selected={source.kind === "upload" && source.uploadId === upload.uploadId}
                onClick={() => selectUpload(upload)}
                className={`logo-lab-fixture logo-lab-fixture--upload${
                  source.kind === "upload" && source.uploadId === upload.uploadId
                    ? " logo-lab-fixture--active"
                    : ""
                }`}
                title={upload.fileName}
              >
                {shortFileName(upload.fileName)}
              </button>
            ))}
          </div>
          <div className="logo-lab-upload">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void analyzeUpload(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="logo-lab-upload__btn"
              disabled={analyzing}
              onClick={() => fileInputRef.current?.click()}
            >
              {analyzing ? "analizando…" : "subir pdf"}
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="logo-lab-error">{error}</p> : null}

      <div className="logo-lab-body">
        <aside className="logo-lab-sidebar">
          <p className="logo-lab-section-label">fuente activa</p>
          <p className="logo-lab-active-source">{auditPayload?.fileName ?? "—"}</p>

          <p className="logo-lab-section-label logo-lab-section-label--spaced">páginas auditadas</p>
          <ul className="logo-lab-pages">
            {visiblePages.map((page) => {
              const count =
                auditPayload?.audit.pages.find((p) => p.pageNumber === page)?.result?.logoInstances?.length ?? 0;
              return (
                <li key={page}>
                  <button
                    type="button"
                    onClick={() => {
                      setPageNumber(page);
                      setActiveInstanceIndex(null);
                    }}
                    className={`logo-lab-page${pageNumber === page ? " logo-lab-page--active" : ""}`}
                  >
                    <span>pág. {page}</span>
                    <span className="logo-lab-page__count">{count ? `${count} logo` : "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="logo-lab-section-label logo-lab-section-label--spaced">instancias del modelo</p>
          <div className="logo-lab-instances">
            {allInstances.length === 0 && !auditLoading && !analyzing && auditPayload ? (
              <p className="logo-lab-empty">sin logoInstances</p>
            ) : null}
            {allInstances.map(({ pageNumber: p, index, instance }) => (
              <LogoInstanceRow
                key={`${p}-${index}`}
                pageNumber={p}
                index={index}
                instance={instance}
                active={pageNumber === p && activeInstanceIndex === index}
                isBest={
                  bestDocumentLogo?.pageNumber === p && bestDocumentLogo.index === index
                }
                onSelect={() => {
                  setPageNumber(p);
                  setActiveInstanceIndex(index);
                }}
              />
            ))}
          </div>

          {auditPayload ? (
            <dl className="logo-lab-meta">
              <div>
                <dt>audit</dt>
                <dd>{activeFixture?.auditFile ?? (source.kind === "upload" ? "sesión upload" : "—")}</dd>
              </div>
              <div>
                <dt>frame</dt>
                <dd>96 dpi · max 640px · tag · jpeg</dd>
              </div>
              <div>
                <dt>páginas</dt>
                <dd>{visiblePages.join(", ")}</dd>
              </div>
            </dl>
          ) : null}
        </aside>

        <main className="logo-lab-main">
          {analyzing ? (
            <p className="logo-lab-loading">corriendo Fase A batch + rescatando logos…</p>
          ) : null}
          {!auditPayload && auditLoading ? (
            <p className="logo-lab-loading">cargando audit + rescatando logos…</p>
          ) : null}
          {auditPayload && !analyzing ? (
            <>
              {auditLoading ? (
                <p className="logo-lab-loading logo-lab-loading--inline">actualizando audit…</p>
              ) : null}
              <PageViewer
                source={source}
                uploadFile={activeUploadFile}
                pageNumber={pageNumber}
                instances={pageInstances}
                activeIndex={activeInstanceIndex}
                refines={pageRefines}
              />
              {pageAudit && !pageAudit.ok ? (
                <p className="logo-lab-warn">página con errores de parse: {pageAudit.rootError ?? "ok=false"}</p>
              ) : null}
              {pageAudit?.rejected?.length ? (
                <p className="logo-lab-warn">
                  rejected: {pageAudit.rejected.map((r) => r.reason).join(", ")}
                </p>
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
