"use client";

/**
 * Previsualización de la cara de Genoma con fixtures (punto 3, estático).
 * Cambia entre vacío / propuestas / coronado y permite coronar en vivo para ver
 * la transición proposed → crowned. No toca disco ni red: solo estado local.
 */

import { useMemo, useState, useEffect } from "react";
import { GenomaFace } from "@/app/spaces/genoma/GenomaFace";
import { cx } from "@/app/spaces/genoma/face-utils";
import { GENOMA_FIXTURES, type GenomaFixtureName } from "@/lib/genoma/fixtures";
import { crown, emptyGenome, normalizeGenome, upsertTrait, type Genome } from "@/lib/genoma/model/trait";
import { useGenomaIngest } from "@/app/spaces/genoma/use-genoma-ingest";
import type { TraitId } from "@/lib/genoma/model/trait-ids";
import { buildBookView } from "@/lib/genoma/projection/book-view";
import { downloadGenomaStyleGuideHtml } from "@/lib/genoma/projection/style-guide-render";

const CATALOGO26_INGEST_GENOME = "/fixtures/page-vision-pass/runs/catalogo26-ingest-genome.json";

const STATES: Array<{ id: GenomaFixtureName | "catalogo26"; label: string }> = [
  { id: "ghost", label: "vacío" },
  { id: "proposed", label: "propuestas" },
  { id: "crowned", label: "coronado" },
  { id: "catalogo26", label: "catalogo26" },
];

export default function GenomaPreviewPage() {
  const [active, setActive] = useState<GenomaFixtureName | "catalogo26">("proposed");
  const [genome, setGenome] = useState<Genome>(() => GENOMA_FIXTURES.proposed());
  const view = useMemo(() => buildBookView(genome), [genome]);

  useEffect(() => {
    if (active !== "catalogo26") return;
    let cancelled = false;
    void fetch(CATALOGO26_INGEST_GENOME)
      .then((r) => r.json())
      .then((raw) => {
        if (!cancelled) setGenome(normalizeGenome(raw));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active]);

  const load = (name: GenomaFixtureName | "catalogo26") => {
    setActive(name);
    if (name === "catalogo26") return;
    setGenome(GENOMA_FIXTURES[name]());
  };

  const onCrown = (traitId: TraitId, candidateId: string) => {
    setGenome((g) => {
      const trait = g.traits[traitId];
      if (!trait) return g;
      return upsertTrait(g, crown(trait, candidateId));
    });
  };

  const { feedback, ingestFiles, ingestUrl, retryLastFiles, activePrompt, resolveActivePrompt } = useGenomaIngest({
    genome,
    onGenomeChange: setGenome,
  });

  return (
    <>
      <GenomaFace
        projectId="genoma-preview"
        view={view}
        genome={genome}
        onGenomeChange={setGenome}
        onCrown={onCrown}
        onAddSource={(url) => void ingestUrl(url)}
        onDrop={(files) => void ingestFiles(files)}
        ingestFeedback={feedback}
        onIngestRetry={() => void retryLastFiles()}
        onDownload={() => void downloadGenomaStyleGuideHtml(genome, "Genoma preview")}
        activePrompt={activePrompt}
        onResolvePrompt={resolveActivePrompt}
      />
      <div className="fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 gap-1 rounded-full bg-[var(--primary)] p-1 text-sm text-white shadow-[var(--shadow-lg)]">
        {STATES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => load(s.id)}
            className={cx(
              "rounded-full px-4 py-1.5 transition",
              active === s.id ? "bg-white text-[var(--primary)]" : "hover:bg-white/10",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </>
  );
}
