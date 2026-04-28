"use client";

import React, { useCallback, useMemo, useState } from "react";
import { ClipboardCopy, Download, Layers, Loader2, Palette, Send } from "lucide-react";
import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import type { BrandVisualDnaStoredBundle, BrandVisualDnaStyleCluster } from "@/lib/brain/brand-visual-dna/types";
import { exportBrandVisualDnaJson, exportBrandVisualDnaMarkdown } from "@/lib/brain/brand-visual-dna/export-brand-visual-dna";
import { buildBrandVisualDnaPromptSnippet } from "@/lib/brain/brand-visual-dna/build-brand-visual-dna-prompt-snippet";
import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import { readJsonWithHttpError } from "@/lib/read-response-json";

type Props = {
  assets: ProjectAssetsMetadata;
  projectId: string | null;
  savedBundle: BrandVisualDnaStoredBundle | undefined;
  brandName?: string;
  onSaveBundleToBrain: (bundle: BrandVisualDnaStoredBundle) => void;
  onDirty: () => void;
};

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BrandVisualDnaPanel({
  assets,
  projectId,
  savedBundle,
  brandName = "Marca",
  onSaveBundleToBrain,
  onDirty,
}: Props) {
  const [previewBundle, setPreviewBundle] = useState<BrandVisualDnaStoredBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  const bundle = previewBundle ?? savedBundle;
  const d = bundle?.brand_visual_dna;

  const refUrlById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of collectVisualImageAssetRefs(assets)) {
      const u = r.imageUrlForVision?.trim();
      if (u) m.set(r.id, u);
    }
    return m;
  }, [assets]);

  const selectedCluster: BrandVisualDnaStyleCluster | null = useMemo(() => {
    if (!d?.style_clusters?.length) return null;
    if (selectedClusterId) {
      const hit = d.style_clusters.find((c) => c.cluster_id === selectedClusterId);
      if (hit) return hit;
    }
    return d.style_clusters[0] ?? null;
  }, [d, selectedClusterId]);

  const runAnalysis = useCallback(async () => {
    const pid = projectId?.trim();
    if (!pid) {
      setErr("Falta projectId para ejecutar el análisis en servidor.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/spaces/brain/brand-visual-dna/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, assets, brandName }),
      });
      const json = await readJsonWithHttpError<{
        bundle?: BrandVisualDnaStoredBundle;
        error?: string;
      }>(res, "brand-visual-dna/analyze");
      if (!json.bundle) throw new Error("Respuesta sin bundle");
      setPreviewBundle(json.bundle);
      setSelectedClusterId(json.bundle.brand_visual_dna.style_clusters[0]?.cluster_id ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [assets, brandName, projectId]);

  const saveToBrain = useCallback(() => {
    if (!previewBundle && !savedBundle) return;
    const b = previewBundle ?? savedBundle;
    if (!b) return;
    onSaveBundleToBrain(b);
    setPreviewBundle(null);
    onDirty();
  }, [onSaveBundleToBrain, onDirty, previewBundle, savedBundle]);

  const copyJson = useCallback(async () => {
    if (!bundle) return;
    await navigator.clipboard.writeText(exportBrandVisualDnaJson(bundle));
  }, [bundle]);

  const copyMd = useCallback(async () => {
    if (!bundle) return;
    await navigator.clipboard.writeText(exportBrandVisualDnaMarkdown(bundle));
  }, [bundle]);

  const copySafeSnippet = useCallback(async () => {
    if (!bundle) return;
    await navigator.clipboard.writeText(buildBrandVisualDnaPromptSnippet(bundle));
  }, [bundle]);

  const globalConfidence = useMemo(() => {
    if (!d?.style_clusters?.length) return 0;
    const w = d.style_clusters.reduce((s, c) => s + c.weight_percentage, 0) || 1;
    return d.style_clusters.reduce((s, c) => s + c.confidence * (c.weight_percentage / w), 0);
  }, [d]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-zinc-900">
            <Palette className="h-4 w-4 text-violet-600" aria-hidden />
            Brand Visual DNA
          </h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-snug text-zinc-600">
            Clasificación por <span className="font-semibold text-zinc-800">señales técnicas</span> y, si hay API,
            interpretación <span className="font-semibold text-zinc-800">solo por clusters</span> (sin describir imagen
            a imagen). Salida abstracta para Designer, guionista, vídeo, artículos y generadores — sin prompts de
            clonación.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !projectId?.trim()}
            onClick={() => void runAnalysis()}
            className="inline-flex items-center gap-2 rounded-[5px] border border-violet-600 bg-violet-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Layers className="h-3.5 w-3.5" aria-hidden />}
            Analizar set
          </button>
          <button
            type="button"
            disabled={!previewBundle && !savedBundle}
            onClick={() => saveToBrain()}
            className="inline-flex items-center gap-2 rounded-[5px] border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            Enviar a Brain
          </button>
        </div>
      </div>

      {previewBundle ? (
        <p className="rounded-[5px] border border-sky-300 bg-sky-50 px-3 py-2 text-[10px] text-sky-950">
          Hay un resultado nuevo en vista previa. Pulsa <span className="font-bold">Enviar a Brain</span> para persistirlo
          en el proyecto (o vuelve a analizar).
        </p>
      ) : null}

      {err ? (
        <p className="rounded-[5px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-900">{err}</p>
      ) : null}

      {!bundle ? (
        <p className="rounded-[5px] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-[11px] text-zinc-600">
          Aún no hay ADN visual por clusters. Sube imágenes en conocimiento o slots, luego pulsa{" "}
          <span className="font-semibold">Analizar set</span>.
        </p>
      ) : (
        <>
          <section className="rounded-[5px] border border-zinc-200/90 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Resumen global</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-[9px] font-bold uppercase text-zinc-400">Estilo principal</p>
                <p className="text-[13px] font-semibold text-zinc-900">{d?.core_style}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-zinc-400">Secundarios</p>
                <p className="text-[12px] text-zinc-700">{(d?.secondary_styles ?? []).join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-zinc-400">Imágenes / confianza</p>
                <p className="text-[12px] text-zinc-700">
                  {d?.source_image_count ?? 0} fuente · global ~{Math.round(globalConfidence * 100)}%
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-zinc-400">Colores dominantes</p>
                <p className="text-[11px] leading-snug text-zinc-700">
                  {(d?.global_visual_rules.dominant_colors ?? []).slice(0, 8).join(" · ") || "—"}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-zinc-400">Mood</p>
                <p className="text-[11px] text-zinc-700">{(d?.global_visual_rules.dominant_mood ?? []).join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-zinc-400">Personas / producto</p>
                <p className="text-[11px] leading-snug text-zinc-700">
                  {(d?.global_visual_rules.dominant_people_strategy || "—").slice(0, 160)}
                  <br />
                  <span className="text-zinc-500">
                    {(d?.global_visual_rules.dominant_product_strategy || "—").slice(0, 160)}
                  </span>
                </p>
              </div>
            </div>
            {bundle.warnings.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-4 text-[10px] text-amber-900">
                {bundle.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Clusters</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(d?.style_clusters ?? []).map((c) => (
                <button
                  key={c.cluster_id}
                  type="button"
                  onClick={() => setSelectedClusterId(c.cluster_id)}
                  className={`rounded-[5px] border p-3 text-left transition-colors ${
                    selectedCluster?.cluster_id === c.cluster_id
                      ? "border-violet-500 bg-violet-50/80"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <p className="text-[11px] font-bold text-zinc-900">{c.style_name}</p>
                  <p className="text-[10px] text-violet-700">{c.weight_percentage}% del set</p>
                  <div className="mt-2 flex gap-1">
                    {c.representative_image_ids.slice(0, 4).map((id) => {
                      const url = refUrlById.get(id);
                      return url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data URL o https de refs
                        <img key={id} src={url} alt="" className="h-10 w-10 rounded object-cover ring-1 ring-zinc-200" />
                      ) : (
                        <div key={id} className="h-10 w-10 rounded bg-zinc-100 ring-1 ring-zinc-200" title={id} />
                      );
                    })}
                  </div>
                  <p className="mt-2 line-clamp-3 text-[10px] leading-snug text-zinc-600">{c.description}</p>
                  <p className="mt-1 text-[9px] font-semibold text-rose-700">
                    Evitar: {c.visual_rules.avoid.slice(0, 2).join(" · ") || "—"}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {selectedCluster ? (
            <section className="rounded-[5px] border border-zinc-200 bg-zinc-50/40 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Detalle — {selectedCluster.style_name}</p>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div className="space-y-2 text-[11px] text-zinc-800">
                  <p className="font-bold text-zinc-600">Visual rules</p>
                  <p className="text-zinc-700">Colores: {selectedCluster.visual_rules.colors.join("; ") || "—"}</p>
                  <p>Luz: {selectedCluster.visual_rules.lighting.join("; ") || "—"}</p>
                  <p>Composición: {selectedCluster.visual_rules.composition.join("; ") || "—"}</p>
                  <p>Reglas seguras (global Brain):</p>
                  <ul className="list-disc pl-4 text-[10px] text-zinc-600">
                    {(d?.global_visual_rules.safe_generation_rules ?? []).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2 text-[11px] text-zinc-800">
                  <p className="font-bold text-zinc-600">People / Product / Estrategia</p>
                  <p>Personas — presencia: {selectedCluster.people_language.presence_level}</p>
                  <p>Producto — presencia: {selectedCluster.product_language.product_presence}</p>
                  <p className="text-[10px] leading-relaxed text-zinc-600">{selectedCluster.strategic_reading.combined_effect}</p>
                </div>
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadText("brand-visual-dna.json", exportBrandVisualDnaJson(bundle), "application/json")}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-zinc-300 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
            >
              <Download className="h-3 w-3" aria-hidden />
              JSON
            </button>
            <button
              type="button"
              onClick={() => downloadText("brand-visual-dna.md", exportBrandVisualDnaMarkdown(bundle), "text/markdown")}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-zinc-300 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
            >
              <Download className="h-3 w-3" aria-hidden />
              Markdown
            </button>
            <button
              type="button"
              onClick={() => void copyJson()}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-zinc-300 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
            >
              <ClipboardCopy className="h-3 w-3" aria-hidden />
              Copiar JSON
            </button>
            <button
              type="button"
              onClick={() => void copyMd()}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-zinc-300 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
            >
              <ClipboardCopy className="h-3 w-3" aria-hidden />
              Copiar MD
            </button>
            <button
              type="button"
              onClick={() => void copySafeSnippet()}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-emerald-600 bg-emerald-600 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-white hover:bg-emerald-700"
            >
              Usar en otros nodos
            </button>
          </div>
          <p className="text-[9px] leading-snug text-zinc-500">
            PDF: no hay exportación PDF integrada para este módulo; usa JSON o Markdown. «Usar en otros nodos» copia
            solo reglas abstractas seguras (sin URLs de referencia).
          </p>
        </>
      )}
    </div>
  );
}
