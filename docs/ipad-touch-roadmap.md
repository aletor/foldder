# Foldder — iPad / tablet touch roadmap

Modo **desktop** intacto; modo **touch** activo en `(pointer: coarse)` o preferencia manual.

## Estado de implementación

| Fase | Estado | Notas |
|------|--------|-------|
| 0 — Infra (`input-mode`, viewport, `touch-action`) | ✅ En progreso | `InputModeProvider`, CSS base |
| 1 — Grafo (pan 1 dedo, tap-to-add sidebar) | ✅ En progreso | React Flow props en touch |
| 2 — Nodos del grafo | ✅ En progreso | Multi-select touch (Pan/Select + tap acumulativo); barra eliminar |
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
- **Modo Pan (default):** 1 dedo mueve el lienzo; tap selecciona 1 nodo; con nodos ya seleccionados, tap suma/quita
- **Modo Seleccionar:** 1 dedo en vacío = caja de selección; tap toggle por nodo
- **Barra inferior:** Pan / Select + Eliminar / Deseleccionar
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
| JS | Grafo oculto con studio abierto en touch | Menos GPU/RAM mientras editas PhotoRoom/Designer |
| JS | Previews de nodos: margen viewport 360px en touch (antes 900) | Menos decodificación de imágenes fuera de pantalla |
| JS | FreehandStudio touch: sin anillos de preview del pincel | Menos rAF y repaints al pintar en iPad |

### Pendiente / recomendaciones

- Memoizar nodos pesados (PhotoRoom preview, Designer) con comparación shallow de `data`
- Virtualizar previews de imagen en nodos fuera de viewport
- Reducir `fitView` animado tras borrar en touch (opcional, UX vs perf)

Ver plan completo en conversación / tickets de fase 1–6.
