# Foldder — iPad / tablet touch roadmap

Modo **desktop** intacto; modo **touch** activo en `(pointer: coarse)` o preferencia manual.

## Estado de implementación

| Fase | Estado | Notas |
|------|--------|-------|
| 0 — Infra (`input-mode`, viewport, `touch-action`) | ✅ Hecho | `InputModeProvider`, CSS base |
| 1 — Grafo (pan 1 dedo, tap-to-add sidebar) | ✅ Hecho | React Flow props en touch |
| 2 — Nodos del grafo | ✅ Hecho | Pan/Select/Connect + tap acumulativo; barra inferior |
| 3 — FreehandStudio / PhotoRoom | ✅ Hecho | Pointer events; pinch/pan 2 dedos |
| 4 — Flujos secundarios | ⏳ Parcial | Brain/wallet/assistant pendientes |
| 5 — Polish CSS coarse | ✅ Hecho | Safe areas top/bottom, hover off, perf CSS |
| 6 — QA release | ⏳ Pendiente | Checklist iPad |

## Preferencia de input

```js
localStorage.setItem('foldder-input-mode-preference', 'auto' | 'desktop' | 'touch')
```

## Gestos (touch)

- **1 dedo en vacío (modo Pan):** pan del lienzo
- **Pinch:** zoom
- **Tap en nodo (Pan):** seleccionar; con selección previa, tap suma/quita
- **Modo Seleccionar:** caja de selección en vacío; tap toggle por nodo; arrastrar nodos
- **Modo Conectar:** tap origen → tap destino (conexión automática de handles compatibles)
- **Long-press en nodo:** menú contextual (eliminar, duplicar nota, agrupar, conectar)
- **Tap en tile sidebar:** añadir nodo
- **Tap fuera sidebar:** cerrar librería
- **1 dedo en studio (PhotoRoom/Designer/Nano):** dibujar / seleccionar / mover
- **2 dedos en studio:** pan + pinch zoom del viewport
- **Barra inferior:** Pan / Select / Connect + Eliminar / Deseleccionar

## Rendimiento (touch / iPad)

| Área | Cambio | Impacto |
|------|--------|---------|
| React Flow | `onlyRenderVisibleElements` en touch | Menos nodos fuera de viewport |
| React Flow | `elevateNodesOnSelect` / `elevateEdgesOnSelect` off | Menos re-mounts |
| React Flow | `nodesDraggable` solo en modo Select | Pan sin arrastres accidentales |
| React Flow | `nodesConnectable` off; modo Connect | Sin handles difíciles de tocar |
| CSS touch | Sin blur HUD/toolbar; safe-area top/bottom | Menos GPU en Safari iPad |
| JS | Grafo suspendido con studio abierto | Menos RAM/GPU en edición |
| JS | Margen viewport previews 360px | Menos decodificación de imágenes |
| JS | `fitView` instantáneo al borrar en touch | Menos jank post-delete |
| JS | Autosave diferido durante pan/zoom | Menos I/O en gestos |

### Pendiente

- Apple Pencil pressure/tilt en FreehandStudio
- Touch básico en Video Editor viewer (pinch/pan timeline preview)
- QA checklist iPad Safari / PWA
