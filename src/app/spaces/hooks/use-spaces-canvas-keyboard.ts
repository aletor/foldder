"use client";

import { useEffect, type MutableRefObject } from "react";
import type { Edge, FitViewOptions, Node } from "@xyflow/react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { orderedSourcesForSharedTarget, planDuplicateBelowMultiInput } from "../connection-utils";
import { FIT_VIEW_PADDING, fitAnim } from "../spaces-view-constants";

export type SpacesCanvasKeyboardShortcutsRef = {
  addNodeAtCenter: (type: string, extraData?: Record<string, unknown>) => void;
  undo: () => void;
  redo: () => void;
  fitView: (opts?: FitViewOptions<Node>) => Promise<boolean> | void;
  autoLayout: (opts: { horizontalIsolates: boolean }) => void;
  setNodes: import("react").Dispatch<import("react").SetStateAction<Node[]>>;
  setEdges: import("react").Dispatch<import("react").SetStateAction<Edge[]>>;
  takeSnapshot: () => void;
  fitViewToNodeIds: (ids: string[], duration?: number, opts?: { padding?: number }) => void;
  handleEscape: () => boolean;
  setCardsFocusIndex: (updater: (f: number) => number) => void;
  canvasViewModeRef: MutableRefObject<"free" | "cards">;
};

/** Atajos del lienzo (deps []: el ref lleva las callbacks actuales). */
export function useSpacesCanvasKeyboard(
  liveNodesRef: MutableRefObject<Node[]>, 
  liveEdgesRef: MutableRefObject<Edge[]>, 
  keyboardShortcutsRef: MutableRefObject<SpacesCanvasKeyboardShortcutsRef>, 
  autoLayoutKeyParityRef: MutableRefObject<number>, 
  groupSelectedToSpaceRef: MutableRefObject<() => void>, 
  groupSelectedToCanvasGroupRef: MutableRefObject<() => void>, 
  ungroupSelectedCanvasGroupRef: MutableRefObject<() => void>, 
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const {
        addNodeAtCenter: addNode,
        undo: doUndo,
        redo: doRedo,
        fitView: doFitView,
        autoLayout: doAutoLayout,
        setNodes: doSetNodes,
        setEdges: doSetEdges,
        takeSnapshot: doTakeSnapshot,
        fitViewToNodeIds: doFitViewToNodeIds,
      } = keyboardShortcutsRef.current;

      // When any Studio mode is open (fullscreen overlay), all canvas shortcuts are disabled
      if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;

      const target = e.target as HTMLElement;
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;
      if (typing) return;

      /** Misma lógica que Tab / Shift+Tab: siguiente o anterior por aristas con wrap en el componente conexo. */
      const tryNavigateConnectedNodes = (forward: boolean): boolean => {
        const nds = liveNodesRef.current;
        const es = liveEdgesRef.current;
        const selected = nds.filter((n) => n.selected);
        if (selected.length !== 1) return false;
        const fromId = selected[0].id;
        const idSet = new Set(nds.map((n) => n.id));
        if (!idSet.has(fromId)) return false;

        const adj = new Map<string, string[]>();
        const link = (a: string, b: string) => {
          if (!idSet.has(a) || !idSet.has(b)) return;
          if (!adj.has(a)) adj.set(a, []);
          if (!adj.has(b)) adj.set(b, []);
          adj.get(a)!.push(b);
          adj.get(b)!.push(a);
        };
        for (const edge of es) link(edge.source, edge.target);

        const component = new Set<string>();
        const stack = [fromId];
        while (stack.length) {
          const id = stack.pop()!;
          if (!idSet.has(id) || component.has(id)) continue;
          component.add(id);
          for (const n of adj.get(id) || []) {
            if (!component.has(n)) stack.push(n);
          }
        }
        const sortedComponent = [...component].sort((a, b) => a.localeCompare(b));
        const wrapPool = sortedComponent.sort((a, b) => a.localeCompare(b));
        const sourcesInComponent = wrapPool.filter(
          (id) => !es.some((edge) => edge.target === id && component.has(edge.source))
        );
        const firstInLoop =
          [...sourcesInComponent].sort((a, b) => a.localeCompare(b))[0] ??
          wrapPool[0] ??
          sortedComponent[0];
        const sinksInComponent = wrapPool.filter(
          (id) => !es.some((edge) => edge.source === id && component.has(edge.target))
        );
        const lastInLoop =
          [...sinksInComponent].sort((a, b) => a.localeCompare(b)).slice(-1)[0] ??
          wrapPool[wrapPool.length - 1] ??
          sortedComponent[sortedComponent.length - 1];

        let nextId: string | null = null;
        if (forward) {
          const outs = es
            .filter((edge) => edge.source === fromId && idSet.has(edge.target))
            .sort((a, b) => String(a.target).localeCompare(String(b.target)));
          nextId = outs[0]?.target ?? firstInLoop ?? null;
        } else {
          const ins = es
            .filter((edge) => edge.target === fromId && idSet.has(edge.source))
            .sort((a, b) => String(a.source).localeCompare(String(b.source)));
          nextId = ins[0]?.source ?? lastInLoop ?? null;
        }
        if (!nextId) return false;
        doSetNodes((nds2) => nds2.map((n) => ({ ...n, selected: n.id === nextId })));
        doFitViewToNodeIds([nextId], 600);
        return true;
      };

      /** Varios nodos → mismo target: ↑/↓ ciclan entre fuentes que comparten ese destino (orden estable). */
      const tryNavigateSharedTargetPeers = (forward: boolean): boolean => {
        const nds = liveNodesRef.current;
        const es = liveEdgesRef.current;
        const selected = nds.filter((n) => n.selected);
        if (selected.length !== 1) return false;
        const fromId = selected[0].id;
        const idSet = new Set(nds.map((n) => n.id));
        if (!idSet.has(fromId)) return false;

        const outgoingTargets = [
          ...new Set(es.filter((edge) => edge.source === fromId).map((edge) => edge.target)),
        ].sort((a, b) => a.localeCompare(b));

        for (const targetId of outgoingTargets) {
          if (!idSet.has(targetId)) continue;
          const targetNode = nds.find((n) => n.id === targetId);
          const tgtType = targetNode?.type;
          if (!tgtType) continue;
          const sourcesToTarget = orderedSourcesForSharedTarget(tgtType, targetId, es, nds);
          if (sourcesToTarget.length <= 1) continue;

          const idx = sourcesToTarget.indexOf(fromId);
          if (idx === -1) continue;

          const n = sourcesToTarget.length;
          const nextIdx = forward ? (idx + 1) % n : (idx - 1 + n) % n;
          const nextId = sourcesToTarget[nextIdx];
          if (nextId === fromId) return false;

          doSetNodes((nds2) => nds2.map((node) => ({ ...node, selected: node.id === nextId })));
          doFitViewToNodeIds([nextId], 600);
          return true;
        }
        return false;
      };

      // Escape: cerrar menú contextual; si estamos en un space anidado, volver al lienzo root + fit
      if (e.key === 'Escape') {
        if (keyboardShortcutsRef.current.handleEscape?.()) {
          e.preventDefault();
        }
        return;
      }

      // Modo cartas: Tab y ← / → ciclan el nodo al frente (baraja)
      if (keyboardShortcutsRef.current.canvasViewModeRef.current === 'cards') {
        const nDeck = liveNodesRef.current.length;
        if (nDeck > 0) {
          if (e.key === 'Tab') {
            e.preventDefault();
            const dir = e.shiftKey ? -1 : 1;
            keyboardShortcutsRef.current.setCardsFocusIndex((f: number) => (f + dir + nDeck) % nDeck);
            return;
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;
            e.preventDefault();
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            keyboardShortcutsRef.current.setCardsFocusIndex((f: number) => (f + dir + nDeck) % nDeck);
            return;
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;
            e.preventDefault();
            return;
          }
        }
      }

      // Tab / Shift+Tab — mismo grafo que flechas ← / →
      if (e.key === 'Tab') {
        if (!tryNavigateConnectedNodes(!e.shiftKey)) return;
        e.preventDefault();
        return;
      }

      // Flechas ← / → — igual que Tab; no en vistas studio (data-foldder-studio-canvas), p. ej. Composer
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;
        if (!tryNavigateConnectedNodes(e.key === 'ArrowRight')) return;
        e.preventDefault();
        return;
      }

      // Flechas ↑ / ↓ — otras fuentes que entran en el mismo nodo destino (p. ej. varios prompts → concatenator)
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (typeof document !== 'undefined' && document.querySelector('[data-foldder-studio-canvas]')) return;
        if (!tryNavigateSharedTargetPeers(e.key === 'ArrowDown')) return;
        e.preventDefault();
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      // Ctrl+D — duplicate selected nodes (ranuras múltiples: clon debajo + arista al siguiente handle libre)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const nds = liveNodesRef.current;
        const es = liveEdgesRef.current;
        const selected = nds.filter((n) => n.selected);
        if (selected.length === 0) return;

        if (selected.length === 1) {
          const src = selected[0];
          const plan = planDuplicateBelowMultiInput(src, es, nds);
          if (plan) {
            const newId = `${src.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const clone = {
              ...src,
              id: newId,
              position: plan.position,
              selected: true,
              data: { ...src.data },
            };
            const newEdge = {
              id: `dup-${newId}-${plan.targetId}-${Date.now()}`,
              source: newId,
              sourceHandle: plan.sourceHandle,
              target: plan.targetId,
              targetHandle: plan.targetHandle,
              type: 'buttonEdge',
              animated: true,
            };
            doTakeSnapshot();
            doSetNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), clone]);
            doSetEdges((prev) => [...prev, newEdge]);
            return;
          }
        }

        doTakeSnapshot();
        doSetNodes((prev) => {
          const sel = prev.filter((n) => n.selected);
          if (sel.length === 0) return prev;
          const clones = sel.map((n) => ({
            ...n,
            id: `${n.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            position: { x: n.position.x + 30, y: n.position.y + 30 },
            selected: true,
            data: { ...n.data },
          }));
          return [...prev.map((n) => ({ ...n, selected: false })), ...clones];
        });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // G = agrupar en el lienzo (2+ nodos); Mayús+G = desagrupar (nodo canvasGroup seleccionado)
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          ungroupSelectedCanvasGroupRef.current();
        } else {
          groupSelectedToCanvasGroupRef.current();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        // ── Ingesta ──────────────────────────────────────────────────────
        case 'p': addNode('promptInput'); break;
        case 'm': addNode('mediaInput'); break;
        case 'b': addNode('background'); break;
        case 'u': addNode('urlImage'); break;
        case '2': addNode('projectBrain'); break;
        case '3': addNode('projectAssets'); break;
        // ── Inteligencia ─────────────────────────────────────────────────
        case 'n': addNode('nanoBanana'); break;
        case 'd': addNode('mediaDescriber'); break;
        case 'h': addNode('enhancer'); break;
        case 'k': addNode('grokProcessor'); break;
        case 'r': addNode('backgroundRemover'); break;
        case 'v': addNode('geminiVideo'); break;
        case 'y': addNode('vfxGenerator'); break;
        // ── Lógica ───────────────────────────────────────────────────────
        case 'q': addNode('concatenator'); break;
        case 'j': addNode('listado'); break;
        case 's': {
          const sel = liveNodesRef.current.filter(
            (n) => n.selected
          );
          if (sel.length > 1) {
            groupSelectedToSpaceRef.current();
          } else {
            addNode('space', { label: 'Space', hasInput: true, hasOutput: true });
          }
          break;
        }
        case 'i': addNode('spaceInput'); break;
        case 'o': addNode('spaceOutput'); break;
        // ── Composición ──────────────────────────────────────────────────
        case 'c': addNode('imageComposer'); break;
        case 'l': addNode('designer'); break;
        case 'e': addNode('imageExport'); break;
        case 't': addNode('textOverlay'); break;
        case 'w': addNode('painter'); break;

        case 'x': addNode('crop'); break;
        case 'z': addNode('bezierMask'); break;
        /** Presenter — `;` (g ya reservada para agrupar en el lienzo). */
        case ';': addNode('presenter'); break;
        // ── Canvas actions ───────────────────────────────────────────────
        // F = Designer; Mayús+F = encuadrar todo el grafo. Listado = J.
        case 'f':
          if (e.shiftKey) {
            doFitView({ padding: FIT_VIEW_PADDING, duration: fitAnim(800), ...FOLDDER_FIT_VIEW_EASE });
          } else {
            addNode('designer');
          }
          break;
        case 'a': {
          const horizontalIsolates = autoLayoutKeyParityRef.current % 2 === 1;
          doAutoLayout({ horizontalIsolates });
          autoLayoutKeyParityRef.current++;
          break;
        }
        default: break;
      }

    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs estables; shortcuts vía ref
  }, []);
}

