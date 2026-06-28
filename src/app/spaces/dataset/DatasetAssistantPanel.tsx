"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Check, Globe, Loader2, Search, Send, Sparkles, X } from "lucide-react";
import type { Dataset } from "./dataset-types";
import { fieldValueAsText, normalizeDataset } from "./dataset-logic";
import {
  applyAssistantPlan,
  coerceAssistantPlan,
  computeAssistantPreview,
  type AssistantPreview,
} from "./dataset-assistant-apply";
import {
  ASSISTANT_CAPS,
  type AssistantCitation,
  type AssistantPlan,
  type AssistantRowDraft,
  type AssistantTargetChoice,
  type AssistantWebPlan,
} from "./dataset-assistant-types";

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string };

type Proposal = {
  id: string;
  plan: AssistantPlan;
  choice: AssistantTargetChoice;
  excludedDeleteIds: Set<string>;
  excludedAddIndices: Set<number>;
  citations?: AssistantCitation[];
};

type WebProposal = {
  id: string;
  web: AssistantWebPlan;
  summary: string;
  question: string;
  warnings?: string[];
};

type EnrichProgress = { phase: string; message: string; current?: number; total?: number };

type EnrichDoneEvent = {
  type: "done";
  rows: AssistantRowDraft[];
  citations?: AssistantCitation[];
  warnings?: string[];
};

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildSampleRows(dataset: Dataset, listId: string | null) {
  const ds = normalizeDataset(dataset);
  const list = listId ? ds.lists.find((l) => l.id === listId) ?? null : null;
  if (!list) return { name: "", schema: [], rowCount: 0, sampleRows: [] as Array<Record<string, string>> };
  const sampleRows = list.cards.slice(0, ASSISTANT_CAPS.maxSampleRowsToModel).map((card) => {
    const row: Record<string, string> = {};
    for (const field of list.schema) {
      row[field.label] = fieldValueAsText(card.values[field.id]);
    }
    return row;
  });
  return {
    name: list.name,
    schema: list.schema.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
    rowCount: list.cards.length,
    sampleRows,
  };
}

const EXAMPLE_PROMPTS = [
  "Elimina las filas con más de 25 años",
  "Añade una columna Goles (número)",
  "Quita las filas duplicadas por Nombre",
];

export function DatasetAssistantPanel({
  dataset,
  activeListId,
  projectId,
  workspaceId,
  onApply,
  onClose,
}: {
  dataset: Dataset;
  activeListId: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  onApply: (next: Dataset, summary: string, snapshot: Dataset, targetListId: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [webProposal, setWebProposal] = useState<WebProposal | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<EnrichProgress | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const preview: AssistantPreview | null = useMemo(() => {
    if (!proposal) return null;
    return computeAssistantPreview(dataset, activeListId, proposal.plan, proposal.choice);
  }, [proposal, dataset, activeListId]);

  const netDeletes = useMemo(() => {
    if (!proposal || !preview) return 0;
    return preview.deleteMatches.filter((m) => !proposal.excludedDeleteIds.has(m.id)).length;
  }, [proposal, preview]);

  const netAdds = useMemo(() => {
    if (!proposal || !preview) return 0;
    return preview.addDrafts.filter((d) => !proposal.excludedAddIndices.has(d.index)).length;
  }, [proposal, preview]);

  const send = useCallback(
    async (raw?: string) => {
      const query = (raw ?? input).trim();
      if (!query || loading || enriching) return;
      setError(null);
      setProposal(null);
      setWebProposal(null);
      setMessages((prev) => [...prev, { id: genId(), role: "user", text: query }]);
      setInput("");
      setLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const payload = {
          query,
          list: buildSampleRows(dataset, activeListId),
          otherLists: normalizeDataset(dataset)
            .lists.filter((l) => l.id !== activeListId)
            .map((l) => ({ name: l.name })),
          projectId: projectId ?? undefined,
          workspaceId: workspaceId ?? undefined,
        };
        const res = await fetch("/api/spaces/datasets/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Error ${res.status}`);
        }
        const data = (await res.json()) as { plan?: unknown };
        const plan = coerceAssistantPlan(data.plan);

        if (plan.web) {
          setWebProposal({
            id: genId(),
            web: plan.web,
            summary: plan.summary,
            question: plan.question,
            warnings: plan.warnings,
          });
        } else if (plan.intent === "qa" || plan.ops.length === 0) {
          const answer = plan.answer || plan.summary || "No tengo una acción concreta para esa petición.";
          const extra = plan.warnings?.length ? `\n\n${plan.warnings.join("\n")}` : "";
          setMessages((prev) => [...prev, { id: genId(), role: "assistant", text: `${answer}${extra}` }]);
        } else {
          setProposal({
            id: genId(),
            plan,
            choice: plan.target.mode === "new" ? "new" : "append_active",
            excludedDeleteIds: new Set(),
            excludedAddIndices: new Set(),
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "No se pudo generar el plan.");
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [activeListId, dataset, input, loading, enriching, projectId, workspaceId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setEnriching(false);
    setEnrichProgress(null);
  }, []);

  const runEnrich = useCallback(
    async (web: AssistantWebPlan) => {
      if (enriching || loading) return;
      setError(null);
      setEnriching(true);
      setEnrichProgress({ phase: "search", message: "Buscando en la web…" });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/spaces/datasets/assistant/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: web.query,
            columns: web.columns,
            imageColumn: web.imageColumn,
            maxRows: web.maxRows,
            projectId: projectId ?? undefined,
            workspaceId: workspaceId ?? undefined,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Error ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done: EnrichDoneEvent | null = null;
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const evt = JSON.parse(line) as
              | { type: "phase"; phase: string; message: string; current?: number; total?: number }
              | { type: "error"; message: string }
              | EnrichDoneEvent;
            if (evt.type === "phase") {
              setEnrichProgress({ phase: evt.phase, message: evt.message, current: evt.current, total: evt.total });
            } else if (evt.type === "error") {
              throw new Error(evt.message);
            } else if (evt.type === "done") {
              done = evt;
            }
          }
        }
        if (!done) throw new Error("La búsqueda no devolvió respuesta.");
        const rows = Array.isArray(done.rows) ? done.rows : [];
        const extraWarnings = done.warnings ?? [];
        if (rows.length === 0) {
          const msg = `No encontré resultados que añadir.${extraWarnings.length ? ` ${extraWarnings.join(" ")}` : ""}`;
          setMessages((prev) => [...prev, { id: genId(), role: "assistant", text: msg }]);
        } else {
          const synth: AssistantPlan = {
            intent: "create",
            summary: `He encontrado ${rows.length} resultado${rows.length === 1 ? "" : "s"} en la web.`,
            question: `¿Los añado a «${web.targetName}»?`,
            target: { mode: "new", suggestedName: web.targetName },
            ops: [{ kind: "create_table", name: web.targetName, columns: web.columns, rows }],
            warnings: extraWarnings,
            needsConfirmation: true,
          };
          setProposal({
            id: genId(),
            plan: synth,
            choice: "new",
            excludedDeleteIds: new Set(),
            excludedAddIndices: new Set(),
            citations: done.citations,
          });
        }
        setWebProposal(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "No se pudo completar la búsqueda.");
      } finally {
        setEnriching(false);
        setEnrichProgress(null);
        abortRef.current = null;
      }
    },
    [enriching, loading, projectId, workspaceId],
  );

  const cancelWeb = useCallback(() => {
    setWebProposal(null);
    setMessages((prev) => [...prev, { id: genId(), role: "assistant", text: "Búsqueda cancelada." }]);
  }, []);

  const confirm = useCallback(() => {
    if (!proposal) return;
    const snapshot = normalizeDataset(dataset);
    const result = applyAssistantPlan(dataset, activeListId, proposal.plan, {
      targetChoice: proposal.choice,
      excludedDeleteIds: Array.from(proposal.excludedDeleteIds),
      excludedAddIndices: Array.from(proposal.excludedAddIndices),
    });
    onApply(result.dataset, result.summary, snapshot, result.targetListId);
    setMessages((prev) => [...prev, { id: genId(), role: "assistant", text: `✓ ${result.summary}` }]);
    setProposal(null);
  }, [proposal, dataset, activeListId, onApply]);

  const cancel = useCallback(() => {
    setProposal(null);
    setMessages((prev) => [...prev, { id: genId(), role: "assistant", text: "Cancelado. No he cambiado nada." }]);
  }, []);

  const setChoice = useCallback((choice: AssistantTargetChoice) => {
    setProposal((p) => (p ? { ...p, choice } : p));
  }, []);

  const toggleDelete = useCallback((id: string) => {
    setProposal((p) => {
      if (!p) return p;
      const next = new Set(p.excludedDeleteIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...p, excludedDeleteIds: next };
    });
  }, []);

  const toggleAdd = useCallback((index: number) => {
    setProposal((p) => {
      if (!p) return p;
      const next = new Set(p.excludedAddIndices);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...p, excludedAddIndices: next };
    });
  }, []);

  const isEmpty = messages.length === 0 && !proposal && !webProposal && !loading && !enriching;

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-white/10 bg-black/30">
      <div className="flex h-10 items-stretch justify-between border-b border-white/10">
        <h2 className="flex flex-1 items-center gap-1.5 px-4 text-[9px] font-black uppercase tracking-[0.08em] text-white/72">
          <Sparkles size={12} strokeWidth={2.5} className="text-[var(--foldder-studio-accent,#14b8a6)]" />
          Copilot
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex w-10 shrink-0 items-center justify-center border-l border-white/10 text-white/45 hover:bg-white/[0.06] hover:text-white"
        >
          <X size={14} strokeWidth={2.25} />
        </button>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {isEmpty ? (
          <div className="space-y-3">
            <p className="text-[11px] leading-relaxed text-white/50">
              Opera sobre <strong className="text-white/75">{activeListId ? "la pestaña activa" : "el Dataset"}</strong> en
              lenguaje natural. Propongo los cambios y tú confirmas — nunca toco la tabla sola.
            </p>
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="block w-full border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left text-[11px] text-white/70 transition hover:border-[var(--foldder-studio-accent,#14b8a6)]/40 hover:text-white"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-6 border border-white/10 bg-white/[0.06] px-2.5 py-2"
                  : "mr-6 border border-white/10 bg-black/40 px-2.5 py-2"
              }
            >
              <span className="mb-0.5 block text-[8px] font-black uppercase tracking-[0.12em] text-white/35">
                {m.role === "user" ? "Tú" : "Copilot"}
              </span>
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-white/80">{m.text}</p>
            </div>
          ))}

          {loading ? (
            <div className="mr-6 flex items-center gap-2 border border-white/10 bg-black/40 px-2.5 py-2 text-[11px] text-white/55">
              <Loader2 size={13} className="animate-spin text-[var(--foldder-studio-accent,#14b8a6)]" />
              Pensando…
            </div>
          ) : null}

          {error ? (
            <div className="mr-6 border border-rose-400/30 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-200/90">
              {error}
            </div>
          ) : null}

          {webProposal ? (
            <WebProposalCard
              webProposal={webProposal}
              enriching={enriching}
              progress={enrichProgress}
              onSearch={() => void runEnrich(webProposal.web)}
              onCancel={cancelWeb}
            />
          ) : null}

          {proposal && preview ? (
            <ProposalCard
              proposal={proposal}
              preview={preview}
              netDeletes={netDeletes}
              netAdds={netAdds}
              hasActiveList={Boolean(activeListId)}
              onSetChoice={setChoice}
              onToggleDelete={toggleDelete}
              onToggleAdd={toggleAdd}
              onConfirm={confirm}
              onCancel={cancel}
            />
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 p-2.5">
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Pide un cambio sobre la tabla…"
            className="custom-scrollbar min-h-[40px] w-full resize-none border border-white/10 bg-black/30 px-2.5 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/30 focus:border-[var(--foldder-studio-accent,#14b8a6)]/50"
          />
          {loading ? (
            <button
              type="button"
              onClick={stop}
              className="flex h-10 shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-white/70 hover:bg-white/[0.08]"
            >
              Detener
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!input.trim()}
              className="flex h-10 shrink-0 items-center justify-center bg-[var(--foldder-studio-accent,#14b8a6)] px-3 text-slate-950 transition hover:brightness-110 disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function WebProposalCard({
  webProposal,
  enriching,
  progress,
  onSearch,
  onCancel,
}: {
  webProposal: WebProposal;
  enriching: boolean;
  progress: EnrichProgress | null;
  onSearch: () => void;
  onCancel: () => void;
}) {
  const { web } = webProposal;
  return (
    <div className="mr-2 border border-sky-400/30 bg-sky-400/[0.05]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2.5 py-2">
        <Globe size={12} strokeWidth={2.5} className="text-sky-300" />
        <span className="text-[8px] font-black uppercase tracking-[0.12em] text-sky-300">Búsqueda web</span>
      </div>
      <div className="space-y-2 px-2.5 py-2.5">
        {webProposal.summary ? <p className="text-[11px] leading-relaxed text-white/85">{webProposal.summary}</p> : null}
        <p className="text-[10px] text-white/45">
          Consulta: <span className="text-white/70">{web.query}</span>
        </p>
        <div className="flex flex-wrap gap-1">
          {web.columns.map((c) => (
            <span
              key={c.label}
              className="border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-white/65"
            >
              {c.label}
              {c.label === web.imageColumn ? " 📷" : ""}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-white/40">
          Hasta {web.maxRows} filas → «{web.targetName}». No se añade nada hasta que confirmes.
        </p>

        {enriching && progress ? (
          <div className="flex items-center gap-2 border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white/70">
            <Loader2 size={13} className="animate-spin text-sky-300" />
            <span className="min-w-0 flex-1 truncate">{progress.message}</span>
            {progress.total ? (
              <span className="shrink-0 tabular-nums text-white/45">
                {progress.current ?? 0}/{progress.total}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-stretch border-t border-white/10">
        <button
          type="button"
          onClick={onCancel}
          disabled={enriching}
          className="flex h-9 flex-1 items-center justify-center border-r border-white/10 text-[10px] font-black uppercase tracking-[0.08em] text-white/55 hover:bg-white/[0.04] disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSearch}
          disabled={enriching}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 bg-sky-500 text-[10px] font-black uppercase tracking-[0.08em] text-slate-950 hover:brightness-110 disabled:opacity-50"
        >
          <Search size={12} strokeWidth={2.5} />
          {enriching ? "Buscando…" : "Buscar"}
        </button>
      </div>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "add" | "del" | "edit" | "neutral" }) {
  const cls =
    tone === "add"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200/90"
      : tone === "del"
        ? "border-rose-400/30 bg-rose-500/10 text-rose-200/90"
        : tone === "edit"
          ? "border-amber-400/30 bg-amber-400/10 text-amber-100/90"
          : "border-white/15 bg-white/[0.04] text-white/65";
  return (
    <span className={`border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] ${cls}`}>{children}</span>
  );
}

function ProposalCard({
  proposal,
  preview,
  netDeletes,
  netAdds,
  hasActiveList,
  onSetChoice,
  onToggleDelete,
  onToggleAdd,
  onConfirm,
  onCancel,
}: {
  proposal: Proposal;
  preview: AssistantPreview;
  netDeletes: number;
  netAdds: number;
  hasActiveList: boolean;
  onSetChoice: (choice: AssistantTargetChoice) => void;
  onToggleDelete: (id: string) => void;
  onToggleAdd: (index: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { plan } = proposal;
  const showChooser = plan.target.mode === "new" && hasActiveList;
  const nothingToDo =
    netDeletes === 0 &&
    netAdds === 0 &&
    preview.columnsAdded.length === 0 &&
    preview.columnsRemoved.length === 0 &&
    preview.columnsRenamed.length === 0 &&
    preview.cellsChanged === 0 &&
    preview.dedupeRemovals === 0 &&
    preview.overwriteClears === 0;

  return (
    <div className="mr-2 border border-[var(--foldder-studio-accent,#14b8a6)]/30 bg-[var(--foldder-studio-accent,#14b8a6)]/[0.05]">
      <div className="border-b border-white/10 px-2.5 py-2">
        <span className="mb-0.5 block text-[8px] font-black uppercase tracking-[0.12em] text-[var(--foldder-studio-accent,#14b8a6)]">
          Propuesta
        </span>
        {plan.summary ? <p className="text-[11px] leading-relaxed text-white/85">{plan.summary}</p> : null}
      </div>

      <div className="space-y-2.5 px-2.5 py-2.5">
        <div className="flex flex-wrap gap-1">
          {preview.overwriteClears > 0 ? <Chip tone="del">vacía {preview.overwriteClears}</Chip> : null}
          {netAdds > 0 ? <Chip tone="add">+{netAdds} fila{netAdds === 1 ? "" : "s"}</Chip> : null}
          {netDeletes > 0 ? <Chip tone="del">−{netDeletes} fila{netDeletes === 1 ? "" : "s"}</Chip> : null}
          {preview.dedupeRemovals > 0 ? <Chip tone="del">−{preview.dedupeRemovals} dup.</Chip> : null}
          {preview.cellsChanged > 0 ? <Chip tone="edit">{preview.cellsChanged} celdas</Chip> : null}
          {preview.columnsAdded.map((c) => (
            <Chip key={`ca-${c.label}`} tone="add">
              +col {c.label}
            </Chip>
          ))}
          {preview.columnsRemoved.map((c) => (
            <Chip key={`cr-${c}`} tone="del">
              −col {c}
            </Chip>
          ))}
          {preview.columnsRenamed.map((c) => (
            <Chip key={`rn-${c.from}`} tone="neutral">
              {c.from} → {c.to}
            </Chip>
          ))}
        </div>

        <p className="text-[10px] text-white/45">
          Destino: <strong className="text-white/70">{preview.targetName}</strong>
        </p>

        {showChooser ? (
          <div className="flex flex-col gap-1">
            {(
              [
                ["new", `Crear tabla nueva «${plan.target.suggestedName || "Tabla"}»`],
                ["append_active", "Añadir a la pestaña activa"],
                ["overwrite_active", "Sobrescribir la pestaña activa"],
              ] as Array<[AssistantTargetChoice, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onSetChoice(value)}
                className={`flex items-center gap-1.5 border px-2 py-1.5 text-left text-[10px] font-medium transition ${
                  proposal.choice === value
                    ? "border-[var(--foldder-studio-accent,#14b8a6)]/60 bg-[var(--foldder-studio-accent,#14b8a6)]/10 text-white"
                    : "border-white/10 bg-white/[0.02] text-white/55 hover:text-white/80"
                }`}
              >
                <span
                  className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full border ${
                    proposal.choice === value
                      ? "border-[var(--foldder-studio-accent,#14b8a6)] bg-[var(--foldder-studio-accent,#14b8a6)]"
                      : "border-white/30"
                  }`}
                >
                  {proposal.choice === value ? <Check size={8} strokeWidth={3} className="text-slate-950" /> : null}
                </span>
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {preview.deleteMatches.length > 0 ? (
          <div>
            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.08em] text-white/40">
              Filas a eliminar ({netDeletes}/{preview.deleteMatches.length})
            </p>
            <ul className="custom-scrollbar max-h-[160px] space-y-0.5 overflow-y-auto">
              {preview.deleteMatches.map((m) => {
                const excluded = proposal.excludedDeleteIds.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onToggleDelete(m.id)}
                      className="flex w-full items-center gap-1.5 px-1 py-0.5 text-left text-[11px] hover:bg-white/[0.04]"
                    >
                      <span
                        className={`flex h-3 w-3 shrink-0 items-center justify-center border ${
                          excluded ? "border-white/25" : "border-rose-400/60 bg-rose-500/30"
                        }`}
                      >
                        {!excluded ? <Check size={8} strokeWidth={3} className="text-rose-100" /> : null}
                      </span>
                      <span className={excluded ? "text-white/35 line-through" : "text-white/75"}>{m.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {preview.addDrafts.length > 0 ? (
          <div>
            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.08em] text-white/40">
              Filas a añadir ({netAdds}/{preview.addDrafts.length})
            </p>
            <ul className="custom-scrollbar max-h-[160px] space-y-0.5 overflow-y-auto">
              {preview.addDrafts.map((d) => {
                const excluded = proposal.excludedAddIndices.has(d.index);
                return (
                  <li key={d.index}>
                    <button
                      type="button"
                      onClick={() => onToggleAdd(d.index)}
                      className="flex w-full items-center gap-1.5 px-1 py-0.5 text-left text-[11px] hover:bg-white/[0.04]"
                    >
                      <span
                        className={`flex h-3 w-3 shrink-0 items-center justify-center border ${
                          excluded ? "border-white/25" : "border-emerald-400/60 bg-emerald-400/30"
                        }`}
                      >
                        {!excluded ? <Check size={8} strokeWidth={3} className="text-emerald-100" /> : null}
                      </span>
                      <span className={excluded ? "text-white/35 line-through" : "text-white/75"}>{d.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {preview.warnings.length > 0 ? (
          <ul className="space-y-0.5 border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1.5">
            {preview.warnings.map((w, i) => (
              <li key={i} className="text-[10px] leading-snug text-amber-100/85">
                {w}
              </li>
            ))}
          </ul>
        ) : null}

        {proposal.citations && proposal.citations.length > 0 ? (
          <details className="group">
            <summary className="cursor-pointer text-[9px] font-black uppercase tracking-[0.08em] text-white/40 hover:text-white/70">
              Fuentes ({proposal.citations.length})
            </summary>
            <ul className="mt-1 space-y-0.5">
              {proposal.citations.slice(0, 8).map((c, i) => (
                <li key={i} className="truncate">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[var(--foldder-studio-accent,#14b8a6)] underline-offset-2 hover:underline"
                    title={c.url}
                  >
                    {c.title || c.url}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {plan.question ? <p className="text-[11px] font-medium text-white/85">{plan.question}</p> : null}
      </div>

      <div className="flex items-stretch border-t border-white/10">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 flex-1 items-center justify-center border-r border-white/10 text-[10px] font-black uppercase tracking-[0.08em] text-white/55 hover:bg-white/[0.04]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={nothingToDo}
          className="flex h-9 flex-1 items-center justify-center bg-[var(--foldder-studio-accent,#14b8a6)] text-[10px] font-black uppercase tracking-[0.08em] text-slate-950 hover:brightness-110 disabled:opacity-40"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
