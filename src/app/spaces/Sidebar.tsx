"use client";

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { NODE_REGISTRY } from './nodeRegistry';
import { NodeIcon, NodeIconMono } from './foldder-icons';
import { AgentHUD } from './AgentHUD';

/** Icon-only mark from /public/foldder-logo.svg — shown when sidebar is collapsed */
function FoldderLogoFMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-lg"
      aria-hidden
    >
      <path
        d="M4 8 Q4 4 8 4 L48 4 L56 12 L56 52 Q56 56 52 56 L8 56 Q4 56 4 52 Z"
        fill="#6C5CE7"
      />
      <path d="M48 4 L56 12 L48 12 Z" fill="rgba(0,0,0,0.25)" />
      <rect x="17" y="18" width="5" height="24" rx="2" fill="white" />
      <rect x="17" y="18" width="20" height="5" rx="2" fill="white" />
      <rect x="17" y="28" width="15" height="5" rx="2" fill="white" />
    </svg>
  );
}

// ── Key map: nodeType → shortcut key shown in the badge ──────────────────────
const NODE_KEYS: Record<string, string> = {
  mediaInput:        'm',
  promptInput:       'p',
  background:        'b',
  urlImage:          'u',
  backgroundRemover: 'r',
  mediaDescriber:    'd',
  enhancer:          'h',
  grokProcessor:     'g',
  nanoBanana:        'n',
  geminiVideo:       'v',
  concatenator:      'q',
  space:             's',
  spaceInput:        'i',
  spaceOutput:       'o',
  imageComposer:     'c',
  imageExport:       'e',
  painter:           'w',
  textOverlay:       't',
  crop:              'x',
  bezierMask:        'z',
};


type SidebarProps = {
  windowMode?: boolean;
  onLibraryDragStart?: (nodeType: string) => void;
  onLibraryDragEnd?: () => void;
  onAgentGenerate?: (prompt: string) => Promise<void>;
  isAgentGenerating?: boolean;
  /** Si true, el panel no se abre por hover hasta que el ratón entre en la franja izquierda */
  sidebarLockedCollapsed?: boolean;
  onSidebarStripMouseEnter?: () => void;
};

const Sidebar = ({
  windowMode = false,
  onLibraryDragStart,
  onLibraryDragEnd,
  onAgentGenerate,
  isAgentGenerating = false,
  sidebarLockedCollapsed = false,
  onSidebarStripMouseEnter,
}: SidebarProps) => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    onLibraryDragStart?.(nodeType);
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const TypeIndicators = ({ nodeType }: { nodeType: string }) => {
    const meta = NODE_REGISTRY[nodeType];
    if (!meta) return <div className="type-indicator-container"><div className="type-dot" /><div className="type-dot" /></div>;

    return (
      <div className="type-indicator-container">
        <div className="type-group items-start">
          {meta.inputs.length > 0 ? (
            meta.inputs.map((input, idx) => (
              <div key={idx} className={`type-dot ${input.type} active`} title={`Input: ${input.label} (${input.type})`} />
            ))
          ) : (
            <div className="type-dot" />
          )}
        </div>
        <div className="type-group items-end">
          {meta.outputs.length > 0 ? (
            meta.outputs.map((output, idx) => (
              <div key={idx} className={`type-dot ${output.type} active`} title={`Output: ${output.label} (${output.type})`} />
            ))
          ) : (
            <div className="type-dot" />
          )}
        </div>
      </div>
    );
  };

  // Small key badge shown top-left of each node button
  const KeyBadge = ({ nodeType }: { nodeType: string }) => {
    const key = NODE_KEYS[nodeType];
    if (!key) return null;
    return (
      <span
        style={{
          position: 'absolute',
          top: '5px',
          left: '6px',
          fontSize: '7px',
          fontWeight: 900,
          color: '#94a3b8',
          lineHeight: 1,
          letterSpacing: '0.05em',
          fontFamily: 'monospace',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {key}
      </span>
    );
  };

  // ── WINDOW MODE: compact horizontal icon bar ───────────────────────────
  if (windowMode) {
    const allNodes: ({ type: string; label: string } | null)[] = [
      { type: 'mediaInput',        label: 'Asset' },
      { type: 'promptInput',       label: 'Prompt' },
      { type: 'background',        label: 'Canvas' },
      { type: 'urlImage',          label: 'Web' },
      null,
      { type: 'backgroundRemover', label: 'Matting' },
      { type: 'mediaDescriber',    label: 'Eye' },
      { type: 'enhancer',          label: 'Enhance' },
      { type: 'grokProcessor',     label: 'Grok' },
      { type: 'nanoBanana',        label: 'Nano' },
      { type: 'geminiVideo',       label: 'Veo' },
      null,
      { type: 'concatenator',      label: 'Concat' },
      { type: 'space',             label: 'Space' },
      null,
      { type: 'imageComposer',     label: 'Layout' },
      { type: 'imageExport',       label: 'Export' },
      { type: 'painter',           label: 'Painter' },
      { type: 'textOverlay',       label: 'Text' },
      { type: 'crop',              label: 'Crop' },
    ];

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          overflowX: 'auto',
          padding: '0 8px',
          height: '100%',
          scrollbarWidth: 'none',
        }}
        className="[&::-webkit-scrollbar]:hidden"
      >
        {allNodes.map((item, idx) =>
          item === null ? (
            <div key={`sep-${idx}`} style={{ width: 1, height: 24, flexShrink: 0, background: 'rgba(255,255,255,0.12)', marginInline: 4 }} />
          ) : (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              onDragEnd={() => onLibraryDragEnd?.()}
              title={`${item.label} · ${NODE_KEYS[item.type] || ''}`}
              style={{
                flexShrink: 0,
                width: 40,
                height: 36,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.04)',
                cursor: 'grab',
                transition: 'all 0.15s',
              }}
              className="hover:bg-white/10 hover:border-white/20 active:scale-95"
            >
              <NodeIcon type={item.type} size={28} />
              <span style={{ fontSize: 9.8, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', lineHeight: 1 }}>
                {item.label}
              </span>
            </div>
          )
        )}
      </div>
    );
  }

  // ── NORMAL MODE: vertical sidebar panel ──────────────────────────────────
  return (
    <div className="group/sidebar absolute left-0 top-0 h-screen z-[1000]">
      {/* Collapsed: solo la «F» del logo — misma zona que el antiguo HUD flotante */}
      {onAgentGenerate && (
        <div
          className="pointer-events-none fixed left-6 top-6 z-[10004] transition-opacity duration-300 opacity-100 group-hover/sidebar:opacity-0"
          title="Foldder"
        >
          <FoldderLogoFMark size={40} />
        </div>
      )}

      {/* Transparent hover trigger zone - wider than the pill */}
      <div
        className="absolute inset-0 w-12 h-full pointer-events-auto"
        onMouseEnter={() => onSidebarStripMouseEnter?.()}
      />

      {/* Collapsed pill — the visible strip when not hovering */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-20 bg-white/10 backdrop-blur-2xl border border-white/10 rounded-full flex items-center justify-center text-slate-400 group-hover/sidebar:opacity-0 transition-opacity duration-300 shadow-lg pointer-events-none">
        <ChevronRight size={14} />
      </div>

      {/* Expanded panel — uses exact same glass as AgentHUD */}
      <aside
        className={
          sidebarLockedCollapsed
            ? 'absolute left-0 top-0 h-full w-0 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
            : 'absolute left-0 top-0 h-full w-0 overflow-hidden group-hover/sidebar:w-[200px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
        }
        style={{ willChange: 'width' }}
      >
        <div className="h-full w-[200px] bg-white/5 backdrop-blur-2xl border-r border-white/8 flex flex-col min-h-0 shadow-[4px_0_40px_rgba(0,0,0,0.4)]">
          {onAgentGenerate && (
            <div className="shrink-0 px-3 pt-4 pb-3 border-b border-white/10">
              <AgentHUD
                variant="sidebar"
                onGenerate={onAgentGenerate}
                isGenerating={isAgentGenerating}
              />
            </div>
          )}
          <div className="px-3 mb-4 pt-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[3px] mb-5 flex items-center gap-2 px-1">
              <NodeIconMono iconKey="layout" size={13} className="shrink-0 text-slate-400" /> <span>Node Library</span>
            </div>

            {/* 📥 INGESTA */}
            <div className="mb-6">
              <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                <NodeIconMono iconKey="asset" size={10} className="shrink-0" /> <span>Ingesta</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'mediaInput',  label: 'Asset',  color: 'text-emerald-400' },
                  { type: 'promptInput', label: 'Prompt', color: 'text-emerald-400' },
                  { type: 'background',  label: 'Canvas', color: 'text-emerald-400' },
                  { type: 'urlImage',    label: 'Web',    color: 'text-emerald-400' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-emerald-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    title={`${item.label} · ${NODE_KEYS[item.type]}`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <span className={item.color}><NodeIcon type={item.type} size={25} /></span>
                    <span className="text-[9.8px] font-black text-slate-700">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🧠 INTELIGENCIA */}
            <div className="mb-6">
              <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <NodeIconMono iconKey="grok" size={10} className="shrink-0" /> <span>Inteligencia</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'backgroundRemover', label: 'Matting', color: 'text-cyan-400' },
                  { type: 'mediaDescriber',    label: 'Eye',     color: 'text-cyan-400' },
                  { type: 'enhancer',          label: 'Enhance', color: 'text-cyan-400' },
                  { type: 'grokProcessor',     label: 'Grok',    color: 'text-cyan-400' },
                  { type: 'nanoBanana',        label: 'Nano',    color: 'text-cyan-400' },
                  { type: 'geminiVideo',       label: 'Veo 3.1', color: 'text-cyan-400' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-cyan-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    title={`${item.label} · ${NODE_KEYS[item.type]}`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <span className={item.color}><NodeIcon type={item.type} size={25} /></span>
                    <span className="text-[9.8px] font-black text-slate-700">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🧩 LÓGICA */}
            <div className="mb-6">
              <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <NodeIconMono iconKey="concat" size={10} className="shrink-0" /> <span>Lógica</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'concatenator', label: 'Concat', color: 'text-blue-400' },
                  { type: 'space',        label: 'Space',  color: 'text-blue-400' },
                  { type: 'spaceInput',   label: 'Entry', color: 'text-blue-400' },
                  { type: 'spaceOutput',  label: 'Exit',  color: 'text-blue-400' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-blue-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    title={`${item.label} · ${NODE_KEYS[item.type]}`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <span className={item.color}><NodeIcon type={item.type} size={25} /></span>
                    <span className="text-[9.8px] font-black text-slate-700">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🎨 COMPOSICIÓN */}
            <div className="mb-3">
              <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <NodeIconMono iconKey="canvas" size={10} className="shrink-0" /> <span>Composición</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'imageComposer', label: 'Layout',  color: 'text-amber-400' },
                  { type: 'imageExport',   label: 'Export',  color: 'text-amber-400' },
                  { type: 'painter',       label: 'Painter', color: 'text-amber-400' },
                  { type: 'textOverlay',   label: 'Text',    color: 'text-amber-400' },
                  { type: 'crop',          label: 'Crop',    color: 'text-amber-400' },
                  { type: 'bezierMask',    label: 'Bezier',  color: 'text-amber-400' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-amber-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    title={`${item.label} · ${NODE_KEYS[item.type]}`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <span className={item.color}><NodeIcon type={item.type} size={25} /></span>
                    <span className="text-[9.8px] font-black text-slate-700">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Sidebar;
