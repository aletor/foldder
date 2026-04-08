"use client";

import React, { useState } from 'react';
import { Sparkles, Loader2, Star } from 'lucide-react';

interface AgentHUDProps {
  onGenerate: (prompt: string) => Promise<void>;
  isGenerating?: boolean;
  windowMode?: boolean;
  /** floating = esquina; sidebar = columna (legacy); topbar = una línea junto al topbar de pins */
  variant?: 'floating' | 'sidebar' | 'topbar';
}

export const AgentHUD = ({
  onGenerate,
  isGenerating = false,
  windowMode = false,
  variant = 'floating',
}: AgentHUDProps) => {
  const [prompt, setPrompt] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    await onGenerate(prompt);
    setPrompt('');
  };

  const renderBranding = (mode: 'sidebar' | 'floating') => (
    <div
      className={
        mode === 'sidebar'
          ? 'px-1 pt-0.5 pb-0.5'
          : 'pointer-events-auto px-2.5 pt-1 pb-0.5'
      }
    >
      <img
        src="/foldder-logo.svg"
        alt="Foldder"
        width={200}
        height={60}
        className={
          mode === 'sidebar'
            ? 'h-7 w-auto max-w-full object-left object-contain sm:h-8'
            : 'h-8 w-auto max-w-[min(220px,calc(100vw-48px))] object-left object-contain'
        }
      />
      <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.2em] text-white/45">
        Media Composer
      </p>
    </div>
  );

  const assistantCard = (
    <div className="bg-white/5 backdrop-blur-2xl border border-white/5 p-3 rounded-2xl shadow-xl shadow-black/10 flex flex-col gap-2.5 w-full">
      <div className="flex items-center gap-2 px-0.5">
        <Sparkles size={17} className="text-white animate-pulse opacity-60 shrink-0" />
        <h3 className="text-[13px] font-black text-white/60 uppercase tracking-[2px]">Agent Assistant</h3>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleGenerate();
          }
        }}
        placeholder="Describe workflow modifications..."
        className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-[14px] text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/40 transition-all min-h-[124px] resize-none shadow-inner"
      />

      {isGenerating && (
        <div className="flex items-center justify-center gap-2 text-[13px] font-black text-cyan-400 uppercase tracking-widest animate-pulse py-0.5">
          <Loader2 size={17} className="animate-spin" />
          <span>Processing changes...</span>
        </div>
      )}
    </div>
  );

  if (variant === 'sidebar') {
    return (
      <div className="w-full pointer-events-auto flex flex-col gap-3">
        {renderBranding('sidebar')}
        {assistantCard}
      </div>
    );
  }

  if (variant === 'topbar') {
    return (
      <div className="flex w-full min-w-0 items-center gap-2.5">
        <Star
          size={15}
          strokeWidth={2.25}
          className="shrink-0 text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
          aria-hidden
        />
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleGenerate();
            }
          }}
          placeholder="Ej.: borra todo, nuevo espacio, vacía el lienzo, Nano Banana + export…"
          className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-white/35 bg-white/[0.10] px-3 py-2 text-[15px] leading-snug text-white placeholder:text-white/45 shadow-inner backdrop-blur-md focus:border-white/55 focus:outline-none focus:ring-1 focus:ring-white/25"
        />
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
          className="shrink-0 rounded-lg border border-white/35 bg-white/[0.10] px-3 py-2 text-[14px] font-black uppercase tracking-wider text-white shadow-sm backdrop-blur-md transition hover:bg-white/[0.22] hover:text-white disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="h-[18px] w-[18px] animate-spin text-white" /> : 'Run'}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 w-[240px] pointer-events-none"
      style={windowMode
        ? { position: 'fixed', top: 8, left: 8, zIndex: 10002 }
        : { position: 'absolute', top: 24, left: 24, zIndex: 100 }}
    >
      {renderBranding('floating')}
      <div className="pointer-events-auto">{assistantCard}</div>
    </div>
  );
};
