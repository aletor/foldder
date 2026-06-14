# Foldder — iPad / tablet touch roadmap

Modo **desktop** intacto; modo **touch** activo en `(pointer: coarse)` o preferencia manual.

## Estado de implementación

| Fase | Estado | Notas |
|------|--------|-------|
| 0 — Infra (`input-mode`, viewport, `touch-action`) | ✅ En progreso | `InputModeProvider`, CSS base |
| 1 — Grafo (pan 1 dedo, tap-to-add sidebar) | ✅ En progreso | React Flow props en touch |
| 2 — Nodos del grafo | ✅ En progreso | Barra de selección touch + eliminar; handles 44px |
| 3 — FreehandStudio / PhotoRoom | ✅ En progreso | Pointer events en canvas; pinch/pan 2 dedos |
| 4 — Flujos secundarios | ⏳ Pendiente | Brain, wallet, assistant |
| 5 — Polish CSS coarse | ✅ En progreso | Safe areas, hover off, perf CSS |
| 6 — QA release | ⏳ Pendiente | Checklist iPad |

## Preferencia de input

```js
localStorage.setItem('foldder-input-mode-preference', 'auto' | 'desktop' | 'touch')
```

## Gestos (touch)

- **1 dedo en vacío (grafo):** pan
- **Pinch:** zoom
- **Tap en nodo:** seleccionar
- **Tap en tile sidebar:** añadir nodo
- **Tap en franja sidebar:** expandir librería
- **1 dedo en studio (PhotoRoom/Designer):** dibujar / seleccionar / mover (delegado a handlers existentes)
- **2 dedos en studio:** pan + pinch zoom del viewport
- **Barra inferior (selección grafo):** Eliminar / Deseleccionar
- **Long-press (futuro):** menú contextual / colocación

## Rendimiento (touch / iPad)

Análisis e intervenciones aplicadas en el lienzo Spaces:

| Área | Cambio | Impacto esperado |
|------|--------|------------------|
| React Flow | `onlyRenderVisibleElements` en touch | Menos nodos/aristas pintados fuera de viewport |
| React Flow | `elevateNodesOnSelect` / `elevateEdgesOnSelect` off en touch | Menos re-mounts al seleccionar |
| CSS `[data-foldder-touch-ui]` | Sin blur en HUD/topbar y toolbar de selección | Menos capas GPU en Safari iPad |
| CSS touch | Sombras y animaciones de intro/drop simplificadas | Menos repaints durante pan |
| CSS `.spaces-canvas--performance` | Sin transiciones/filtros durante pan/zoom | Compositor más estable al mover el grafo |
| JS | Sin listeners `pointermove`/`mousemove` globales en touch | Menos trabajo por frame (overview es desktop) |

### Pendiente / recomendaciones

- Memoizar nodos pesados (PhotoRoom preview, Designer) con comparación shallow de `data`
- Virtualizar previews de imagen en nodos fuera de viewport
- Reducir `fitView` animado tras borrar en touch (opcional, UX vs perf)
- Multi-selección touch (tap con toggle o lasso dedicado)

Ver plan completo en conversación / tickets de fase 1–6.
