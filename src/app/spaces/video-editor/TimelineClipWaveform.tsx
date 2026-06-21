"use client";

import React, { useEffect, useRef } from "react";

function pseudoWaveformBarHeight(seed: string, index: number, barCount: number): number {
  let hash = 0;
  for (let charIndex = 0; charIndex < seed.length; charIndex++) {
    hash = (hash * 31 + seed.charCodeAt(charIndex) + index * 17) % 997;
  }
  const centerBoost = 1 - Math.abs(index - barCount / 2) / (barCount / 2);
  return 0.15 + ((hash % 85) / 100) * (0.55 + centerBoost * 0.45);
}

async function decodeWaveformPeaks(url: string, barCount: number): Promise<number[] | null> {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    await audioContext.close();
    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / barCount));
    const peaks: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = start; j < start + blockSize && j < channel.length; j++) {
        max = Math.max(max, Math.abs(channel[j] ?? 0));
      }
      peaks.push(max);
    }
    const peakMax = Math.max(...peaks, 0.001);
    return peaks.map((v) => 0.12 + (v / peakMax) * 0.88);
  } catch {
    return null;
  }
}

export function TimelineClipWaveform({
  clipId,
  seed,
  url,
  className,
}: {
  clipId: string;
  seed: string;
  url?: string | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barCount = 48;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const parent = canvas.parentElement;
    if (!parent) return undefined;

    let cancelled = false;
    const draw = (heights: number[]) => {
      if (cancelled) return;
      const width = Math.max(28, parent.clientWidth);
      const height = Math.max(12, parent.clientHeight - 8);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const gap = 1;
      const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
      ctx.fillStyle = "rgba(167, 243, 208, 0.55)";
      heights.forEach((h, index) => {
        const barHeight = Math.max(2, h * height);
        const x = index * (barWidth + gap);
        const y = (height - barHeight) / 2;
        ctx.fillRect(x, y, barWidth, barHeight);
      });
    };

    const fallback = Array.from({ length: barCount }, (_, index) => pseudoWaveformBarHeight(seed, index, barCount));
    draw(fallback);

    if (!url) return () => { cancelled = true; };

    void decodeWaveformPeaks(url, barCount).then((peaks) => {
      if (peaks?.length) draw(peaks);
    });

    const observer = new ResizeObserver(() => {
      void decodeWaveformPeaks(url, barCount).then((peaks) => draw(peaks ?? fallback));
    });
    observer.observe(parent);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [clipId, seed, url]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className ?? "pointer-events-none absolute inset-x-1 bottom-1 top-4 opacity-80"}
    />
  );
}
