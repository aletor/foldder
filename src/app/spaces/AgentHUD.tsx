"use client";

import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

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
        <Sparkles size={12} className="text-white animate-pulse opacity-60 shrink-0" />
        <h3 className="text-[9px] font-black text-white/60 uppercase tracking-[2px]">Agent Assistant</h3>
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
        className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-[10px] text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/40 transition-all min-h-[88px] resize-none shadow-inner"
      />

      {isGenerating && (
        <div className="flex items-center justify-center gap-2 text-[9px] font-black text-cyan-400 uppercase tracking-widest animate-pulse py-0.5">
          <Loader2 size={12} className="animate-spin" />
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
      <div className="flex w-full min-w-0 items-center gap-2">
        <span className="hidden shrink-0 text-[8px] font-black uppercase tracking-widest text-white/55 sm:inline">
          Agent
        </span>
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
          placeholder="Describe workflow changes…"
          className="min-h-[30px] min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white placeholder:text-white/35 focus:border-cyan-500/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
          className="shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Run'}
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
