"use client";

import React from "react";
import type {
  BrandSummaryDiagnostics,
  BrandSummarySection,
} from "@/lib/brain/brain-brand-summary";
import type { BrainFieldSourceInfo, BrainStrategyFieldProvenance } from "@/lib/brain/brain-field-provenance";

/** Misma unión que `BrainMainSection` en `ProjectBrainFullscreen` (evita import circular). */
export type BrandSummaryNavTab =
  | "overview"
  | "dna"
  | "visual_refs"
  | "brand_visual_dna"
  | "knowledge"
  | "connected_nodes"
  | "review"
  | "voice"
  | "personas"
  | "messages"
  | "facts";

function providerLabel(id: string | undefined): string {
  if (id === "gemini-vision") return "Gemini";
  if (id === "openai-vision") return "OpenAI";
  if (id === "mock") return "Mock";
  if (!id) return "—";
  return id;
}

function badgeToProvenanceEs(badge: BrandSummarySection["badge"]): string {
  switch (badge) {
    case "Confirmado":
      return "Confirmado (datos guardados que pasan el filtro de este bloque).";
    case "Visual real":
      return "Visión remota real (Gemini/OpenAI) sin fallback en las filas usadas.";
    case "Fallback":
      return "Mock, fallback o heurística: el texto del resumen no es visión remota fiable.";
    case "Legacy":
      return "Legacy / demo detectado: el resumen advierte o filtra copy semilla.";
    case "Mezcla":
      return "Mezcla: parte confirmada y parte filtrada o débil.";
    case "Inferido":
      return "Inferido desde metadatos (p. ej. slots) sin capa de visión remota.";
    case "Pendiente":
      return "Pendiente de datos suficientes o de revisión.";
    default:
      return "Sin datos suficientes o estado neutro.";
  }
}

function mockLegacyFromBadge(badge: BrandSummarySection["badge"]): string {
  if (badge === "Legacy" || badge === "Fallback") return "Sí (legacy o mock/heurística en este bloque).";
  if (badge === "Mezcla") return "Parcial (mezcla de señales limpias y legacy/mock).";
  return "No como estado principal del bloque.";
}

function provenanceKeyForSection(sectionKey: BrandSummarySection["key"]): string | null {
  if (sectionKey === "identityNarrative") return "identityNarrative";
  if (sectionKey === "tone") return "tone";
  if (sectionKey === "messages") return "messages";
  if (sectionKey === "visualDirection") return "visualDirection";
  return null;
}

function formatProvenanceRow(info: BrainFieldSourceInfo): string {
  const bits = [
    `tier=${info.sourceTier}`,
    `conf=${info.sourceConfidence}`,
    info.updatedAt ? `updatedAt=${info.updatedAt}` : "",
    info.learningIds?.length ? `learningIds=${info.learningIds.join(",")}` : "",
    info.changedPath ? `changedPath=${info.changedPath}` : "",
    info.provider ? `provider=${info.provider}` : "",
    info.analyzerVersion ? `analyzerVersion=${info.analyzerVersion}` : "",
    info.fallbackUsed ? "fallbackUsed=true" : "",
    info.documentIds?.length ? `docs=${info.documentIds.length}` : "",
    info.imageIds?.length ? `images=${info.imageIds.length}` : "",
    info.assetIds?.length ? `assets=${info.assetIds.length}` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}

export type BrandSummarySourcesPanelProps = {
  section: BrandSummarySection;
  diagnostics: BrandSummaryDiagnostics;
  /** Procedencia persistida en `metadata.assets.strategy.fieldProvenance` (si existe). */
  fieldProvenance?: BrainStrategyFieldProvenance;
  pendingLearningsCount: number;
  /** ISO; último re-estudio completado en esta sesión (cliente). */
  lastRestudyCompletedIso: string | null;
  onNavigate: (tab: BrandSummaryNavTab) => void;
  onStripLegacyDemo: () => void;
};

export function BrandSummarySourcesPanel({
  section,
  diagnostics,
  fieldProvenance,
  pendingLearningsCount,
  lastRestudyCompletedIso,
  onNavigate,
  onStripLegacyDemo,
}: BrandSummarySourcesPanelProps) {
  const { inventory, documents, funnel, toneTraits, identity, visualRows, visualLastAnalyzedAt } = diagnostics;
  const fpPrimaryKey = provenanceKeyForSection(section.key);
  const fpPrimary = fpPrimaryKey && fieldProvenance ? fieldProvenance[fpPrimaryKey] : undefined;
  const fpAllEntries =
    fieldProvenance && Object.keys(fieldProvenance).length > 0
      ? Object.entries(fieldProvenance).filter(([, v]) => v && typeof v === "object")
      : [];
  const secMeta = diagnostics.sections[section.key] as
    | {
        inputs?: string[];
        usesPendingLearnings?: boolean;
        usesMockFallback?: boolean;
        prioritizesRealVision?: boolean;
        sources?: Array<{ path?: string; kind?: string; note?: string; provider?: string | null }>;
      }
    | undefined;

  const fieldsUsed = secMeta?.inputs?.length ? secMeta.inputs.join(", ") : section.sources.map((s) => s.path ?? s.kind).join(", ");

  const docLines =
    section.key === "identityNarrative"
      ? [
          ...documents.coreAnalyzed.map((d) => `CORE · ${d.name} (${d.id})`),
          ...documents.contextAnalyzed.map((d) => `Contexto · ${d.name} (${d.id})`),
        ]
      : section.key === "messages" || section.key === "tone"
        ? documents.coreAnalyzed.map((d) => `CORE analizado · ${d.name} (${d.id})`)
        : [];

  const imageBlock =
    section.key === "visualDirection" ? (
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Imágenes / capa visual</p>
        <p className="text-[11px] text-zinc-800">
          Filas en <code className="rounded bg-zinc-100 px-1">visualReferenceAnalysis.analyses</code>:{" "}
          <span className="font-bold">{inventory.visualAnalysesTotal}</span>
        </p>
        <ul className="mt-1 max-h-36 space-y-0.5 overflow-y-auto text-[10px] text-zinc-700">
          {visualRows.slice(0, 24).map((r) => (
            <li key={r.sourceAssetId} className="truncate">
              · {r.sourceLabel?.trim() || r.sourceAssetId}{" "}
              <span className="text-zinc-500">
                ({providerLabel(r.visionProviderId)} · {r.analysisStatus ?? "—"}
                {r.fallbackUsed ? " · fallback" : ""}
                {r.analysisQuality ? ` · ${r.analysisQuality}` : ""})
              </span>
            </li>
          ))}
          {visualRows.length > 24 ? (
            <li className="text-zinc-500">… y {visualRows.length - 24} más (recorta en UI).</li>
          ) : null}
        </ul>
        <p className="text-[11px] text-zinc-800">
          Análisis remoto real (sin fallback):{" "}
          <span className="font-bold text-emerald-800">{inventory.visualTrustedRemote}</span> · Fallback/mock
          analizado: <span className="font-bold text-amber-900">{inventory.visualMockOrFallback}</span> · Fallidas:{" "}
          <span className="font-bold text-rose-800">{inventory.visualFailed}</span> · Demasiado genéricas (trusted):{" "}
          <span className="font-bold text-amber-900">{inventory.visualTrustedTooGeneric}</span>
        </p>
        {visualLastAnalyzedAt ? (
          <p className="text-[11px] text-zinc-600">
            Último lote visual (metadatos):{" "}
            <span className="font-semibold text-zinc-800">{new Date(visualLastAnalyzedAt).toLocaleString()}</span>
          </p>
        ) : (
          <p className="text-[11px] text-zinc-500">Sin fecha de último análisis visual en metadatos.</p>
        )}
        {lastRestudyCompletedIso ? (
          <p className="text-[11px] text-zinc-600">
            Último re-estudio en esta sesión:{" "}
            <span className="font-semibold text-zinc-800">{new Date(lastRestudyCompletedIso).toLocaleString()}</span>
          </p>
        ) : null}
        <p className="text-[11px] text-zinc-800">
          Confianza (heurística según filas trusted):{" "}
          <span className="font-bold">
            {inventory.visualTrustedRemote >= 6
              ? "Alta"
              : inventory.visualTrustedRemote >= 2
                ? "Media"
                : inventory.visualTrustedRemote > 0
                  ? "Baja"
                  : "— (sin visión remota fiable)"}
          </span>
        </p>
      </div>
    ) : null;

  const messagesBlock =
    section.key === "messages" ? (
      <div className="space-y-1 border-t border-zinc-100 pt-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Mensajes (embudo)</p>
        <p className="text-[11px] text-zinc-800">
          Fuente: <code className="rounded bg-zinc-100 px-1">strategy.funnelMessages</code> · En estrategia:{" "}
          <span className="font-bold">{funnel.totalInStrategy}</span> · Excluidos del resumen (legacy demo):{" "}
          <span className="font-bold text-amber-900">{funnel.legacyExcludedFromSummary}</span> · Resto no legacy:{" "}
          <span className="font-bold text-emerald-900">{funnel.cleanRemainingCount}</span>
        </p>
        <p className="text-[11px] text-zinc-600">
          Origen típico del texto en estrategia: <span className="font-semibold">knowledge/analyze</span> (autofill) o
          edición manual en «Mensajes».
        </p>
      </div>
    ) : null;

  const toneBlock =
    section.key === "tone" ? (
      <div className="space-y-1 border-t border-zinc-100 pt-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Rasgos de tono</p>
        <p className="text-[11px] text-zinc-800">
          Fuente: <code className="rounded bg-zinc-100 px-1">strategy.languageTraits</code> · En estrategia:{" "}
          <span className="font-bold">{toneTraits.totalInStrategy}</span> · Excluidos del resumen (legacy EN demo):{" "}
          <span className="font-bold text-amber-900">{toneTraits.legacyExcludedFromSummary}</span> · Resto:{" "}
          <span className="font-bold text-emerald-900">{toneTraits.cleanRemainingCount}</span>
        </p>
        <p className="text-[11px] text-zinc-600">
          Origen típico: <span className="font-semibold">knowledge/analyze</span> o edición manual en «Voz y tono».
        </p>
      </div>
    ) : null;

  const identityBlock =
    section.key === "identityNarrative" ? (
      <div className="space-y-1 border-t border-zinc-100 pt-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Contexto / identidad</p>
        <p className="text-[11px] text-zinc-800">
          Usa <code className="rounded bg-zinc-100 px-1">knowledge.corporateContext</code>:{" "}
          {identity.usesCorporateContext ? (
            <span className="font-semibold text-emerald-900">Sí ({identity.corporateContextChars} caracteres)</span>
          ) : (
            <span className="font-semibold text-amber-900">Vacío</span>
          )}{" "}
          · Respaldo con <code className="rounded bg-zinc-100 px-1">strategy.approvedPatterns</code>:{" "}
          {identity.usesApprovedPatternsFallback ? "Sí" : "No"}
        </p>
        <p className="text-[11px] text-zinc-800">
          Documentos CORE en proyecto: <span className="font-bold">{documents.coreTotal}</span> · Analizados:{" "}
          <span className="font-bold text-emerald-800">{documents.coreAnalyzed.length}</span> · Subidos sin analizar:{" "}
          <span className="font-bold text-amber-900">{documents.coreUploadedNotAnalyzed}</span>
        </p>
        {documents.coreAnalyzed.length > 0 ? (
          <ul className="max-h-28 space-y-0.5 overflow-y-auto text-[10px] text-zinc-700">
            {documents.coreAnalyzed.map((d) => (
              <li key={d.id} className="truncate">
                · {d.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-zinc-500">Ningún documento CORE con estado «Analizado».</p>
        )}
      </div>
    ) : null;

  const learningsNote =
    secMeta?.usesPendingLearnings === true ? (
      <p className="text-[11px] text-zinc-800">Aprendizajes pendientes: usados en la lógica de este bloque.</p>
    ) : (
      <p className="text-[11px] text-zinc-600">
        Aprendizajes pendientes (global): <span className="font-bold text-zinc-900">{pendingLearningsCount}</span> — no
        se mezclan en el texto de este párrafo del resumen; revisa en «Por revisar».
      </p>
    );

  const actions = (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
      {section.key === "identityNarrative" ? (
        <button
          type="button"
          className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-900 hover:bg-violet-100"
          onClick={() => onNavigate("knowledge")}
        >
          Ir a Conocimiento
        </button>
      ) : null}
      {section.key === "tone" ? (
        <>
          <button
            type="button"
            className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-900 hover:bg-violet-100"
            onClick={() => onNavigate("voice")}
          >
            Ir a Voz y tono
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-900 hover:bg-rose-100"
            onClick={() => onStripLegacyDemo()}
          >
            Quitar copy demo (embudo + tono EN)
          </button>
        </>
      ) : null}
      {section.key === "messages" ? (
        <>
          <button
            type="button"
            className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-900 hover:bg-violet-100"
            onClick={() => onNavigate("messages")}
          >
            Ir a Mensajes
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-900 hover:bg-rose-100"
            onClick={() => onStripLegacyDemo()}
          >
            Quitar copy demo (embudo + tono EN)
          </button>
        </>
      ) : null}
      {section.key === "visualDirection" ? (
        <>
          <button
            type="button"
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-indigo-900 hover:bg-indigo-100"
            onClick={() => onNavigate("visual_refs")}
          >
            Ir a Referencias visuales
          </button>
          <button
            type="button"
            className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-900 hover:bg-violet-100"
            onClick={() => onNavigate("brand_visual_dna")}
          >
            Ir a ADN visual (clusters)
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">¿De dónde sale esto?</p>
      <p className="mt-1 text-[11px] font-semibold text-zinc-900">{section.labelEs}</p>

      <dl className="mt-2 space-y-1.5 text-[11px] text-zinc-800">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-zinc-500">Campos</dt>
          <dd className="min-w-0 break-words font-mono text-[10px] text-zinc-900">{fieldsUsed}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-zinc-500">Estado resumen</dt>
          <dd className="min-w-0">
            <span className="font-bold">{section.badge}</span> — {badgeToProvenanceEs(section.badge)}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-zinc-500">Default / legacy / mock</dt>
          <dd>{mockLegacyFromBadge(section.badge)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-zinc-500">Gemini / OpenAI real</dt>
          <dd>
            {section.key === "visualDirection" ? (
              <>
                Remotas fiables en lote: <span className="font-bold">{inventory.visualTrustedRemote}</span> (
                {inventory.visualTrustedRemote > 0 ? "sí hay filas trusted" : "no hay filas trusted"})
              </>
            ) : (
              <>No aplica a este bloque (no usa visión de imagen en el resumen).</>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-zinc-500">Recalculado</dt>
          <dd className="text-zinc-700">
            Este panel refleja el último cálculo del resumen en cliente:{" "}
            <span className="font-semibold text-zinc-900">{new Date(diagnostics.generatedAt).toLocaleString()}</span>
            <span className="block text-[10px] text-zinc-500">
              (Se actualiza al cambiar documentos, estrategia o análisis visuales guardados en el proyecto.)
            </span>
          </dd>
        </div>
      </dl>

      {fpPrimary ? (
        <div className="mt-2 border-t border-violet-100 bg-violet-50/40 px-2 py-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-violet-800">Procedencia del bloque (fieldProvenance)</p>
          <dl className="mt-1 space-y-1 text-[10px] text-zinc-800">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-zinc-500">Clave</dt>
              <dd className="font-mono text-zinc-900">{fpPrimaryKey}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-zinc-500">Etiqueta</dt>
              <dd>{fpPrimary.label}</dd>
            </div>
            {fpPrimary.value ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-zinc-500">Valor</dt>
                <dd className="min-w-0 break-words">{fpPrimary.value}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-zinc-500">Tier / conf.</dt>
              <dd>
                <span className="font-semibold">{fpPrimary.sourceTier}</span> · {fpPrimary.sourceConfidence}
                {fpPrimary.badge ? (
                  <>
                    {" "}
                    · <span className="rounded border border-zinc-200 bg-white px-1">{fpPrimary.badge}</span>
                  </>
                ) : null}
              </dd>
            </div>
            {fpPrimary.changedPath ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-zinc-500">Ruta</dt>
                <dd className="font-mono text-[9px] text-zinc-700">{fpPrimary.changedPath}</dd>
              </div>
            ) : null}
            {fpPrimary.learningIds?.length ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-zinc-500">Learning IDs</dt>
                <dd className="font-mono text-[9px] break-all">{fpPrimary.learningIds.join(", ")}</dd>
              </div>
            ) : null}
            {fpPrimary.updatedAt ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-zinc-500">updatedAt</dt>
                <dd>{new Date(fpPrimary.updatedAt).toLocaleString()}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-zinc-500">Proveedor</dt>
              <dd className="font-mono text-[9px]">{fpPrimary.provider ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-zinc-500">Analyzer</dt>
              <dd className="font-mono text-[9px]">{fpPrimary.analyzerVersion ?? "—"}</dd>
            </div>
            {fpPrimary.fallbackUsed ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-amber-800">Fallback</dt>
                <dd className="text-amber-900">Sí (mock o fallback en esta fuente)</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {fpAllEntries.length > 0 ? (
        <div className="mt-2 border-t border-zinc-100 pt-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Todas las claves fieldProvenance</p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-[9px] text-zinc-700">
            {fpAllEntries.map(([k, info]) => {
              if (!info) return null;
              return (
                <li key={k} className="truncate font-mono" title={formatProvenanceRow(info)}>
                  <span className="font-semibold text-zinc-900">{k}</span>: {info.label} ({info.sourceTier})
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {section.sources.length > 0 ? (
        <div className="mt-2 border-t border-zinc-100 pt-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Registros de fuente</p>
          <ul className="mt-1 space-y-1 text-[10px] text-zinc-700">
            {section.sources.map((s, i) => (
              <li key={`${s.kind}-${i}`}>
                <span className="font-semibold text-zinc-900">{s.kind}</span>
                {s.path ? <span className="font-mono text-zinc-600"> · {s.path}</span> : null}
                {s.provider ? <span> · proveedor: {providerLabel(s.provider)}</span> : null}
                {s.note ? <span className="block text-zinc-500">{s.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {docLines.length > 0 ? (
        <div className="mt-2 border-t border-zinc-100 pt-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Documentos relacionados</p>
          <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[10px] text-zinc-700">
            {docLines.map((line, i) => (
              <li key={i} className="truncate">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {identityBlock}
      {toneBlock}
      {messagesBlock}
      {imageBlock}

      <div className="mt-2 border-t border-zinc-100 pt-2">{learningsNote}</div>

      {section.warnings.length > 0 ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-1.5">
          <p className="text-[10px] font-black uppercase text-amber-900">Warnings ({section.warnings.length})</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-amber-950/90">
            {section.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-2 text-[10px] leading-snug text-zinc-500">
        Los aprendizajes aprobados vía API no reescriben automáticamente este párrafo: consolidan en otros almacenes de
        servicio según tu flujo de producto.
      </p>

      {actions}
    </div>
  );
}
