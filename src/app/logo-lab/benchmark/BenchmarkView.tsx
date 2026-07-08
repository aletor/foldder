"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LogoLabNav } from "../LogoLabNav";
import type { BenchmarkResult } from "@/lib/genoma/logo-lab/golden/types";
import "../logo-lab.css";

export function BenchmarkView() {
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/logo-lab/benchmark?runId=latest");
    if (!res.ok) {
      setResult(null);
      setError("sin runs — ejecuta npm run benchmark:logos");
      return;
    }
    const data = (await res.json()) as BenchmarkResult;
    setResult(data);
    setRunId(data.runId);
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  return (
    <div className="logo-lab">
      <header className="logo-lab-header">
        <div>
          <p className="logo-lab-kicker">genoma · evaluación</p>
          <h1 className="logo-lab-title">benchmark logos</h1>
          <p className="logo-lab-subtitle">
            Baseline del pipeline actual vs golden set. Click en fila para inspección visual.
          </p>
        </div>
        <LogoLabNav />
      </header>

      {error ? <p className="logo-lab-error">{error}</p> : null}

      {result ? (
        <div className="logo-lab-benchmark">
          <section className="logo-lab-benchmark__summary">
            <div>
              <span className="logo-lab-benchmark__metric-label">usableRate</span>
              <strong>{(result.summary.usableRate * 100).toFixed(1)}%</strong>
              <span className="logo-lab-benchmark__metric-sub">
                {result.summary.docsWithUsablePrimary}/{result.summary.docsTotal}
              </span>
            </div>
            <div>
              <span className="logo-lab-benchmark__metric-label">meanBestIoU</span>
              <strong>{result.summary.meanBestIoU.toFixed(3)}</strong>
            </div>
            <div>
              <span className="logo-lab-benchmark__metric-label">instanceRecall@50 (detección)</span>
              <strong>{(result.summary.instanceRecallAt50 * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span className="logo-lab-benchmark__metric-label">pipeline</span>
              <code className="logo-lab-benchmark__sha">{result.pipelineVersion.slice(0, 12)}</code>
            </div>
            <div>
              <span className="logo-lab-benchmark__metric-label">run</span>
              <code className="logo-lab-benchmark__sha">{result.runId}</code>
            </div>
          </section>

          <table className="logo-lab-benchmark__table">
            <thead>
              <tr>
                <th>doc</th>
                <th>usable</th>
                <th>sel IoU</th>
                <th>det</th>
                <th>crop</th>
                <th>failure</th>
                <th>pred p</th>
                <th>cache</th>
              </tr>
            </thead>
            <tbody>
              {result.perDocument.map((row) => (
                <tr key={row.docId} className={row.usable ? "logo-lab-benchmark__row--ok" : "logo-lab-benchmark__row--fail"}>
                  <td>
                    <Link
                      href={`/logo-lab/annotate?doc=${encodeURIComponent(row.docId)}&inspect=1&run=${encodeURIComponent(runId ?? result.runId)}`}
                      className="logo-lab-benchmark__link"
                    >
                      {row.docId}
                    </Link>
                  </td>
                  <td>{row.usable ? "yes" : "no"}</td>
                  <td>{row.bestIoU.toFixed(3)}</td>
                  <td>
                    {row.detectionHits != null && row.detectionTotal != null
                      ? `${row.detectionHits}/${row.detectionTotal}`
                      : "—"}
                  </td>
                  <td>{row.cropPass ? "ok" : "fail"}</td>
                  <td>{row.failureClass ?? "—"}</td>
                  <td>{row.predictedPage ?? "—"}</td>
                  <td>{row.visionCacheSource ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
