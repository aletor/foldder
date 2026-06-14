# Foldder — iPad / tablet touch roadmap

Modo **desktop** intacto; modo **touch** activo en `(pointer: coarse)` o preferencia manual.

## Estado de implementación

| Fase | Estado | Notas |
|------|--------|-------|
| 0 — Infra (`input-mode`, viewport, `touch-action`) | ✅ En progreso | `InputModeProvider`, CSS base |
| 1 — Grafo (pan 1 dedo, tap-to-add sidebar) | ✅ En progreso | React Flow props en touch |
| 2 — Nodos del grafo | ⏳ Pendiente | Handles, botones 44px |
| 3 — FreehandStudio / PhotoRoom | ⏳ Pendiente | Migración pointer events |
| 4 — Flujos secundarios | ⏳ Pendiente | Brain, wallet, assistant |
| 5 — Polish CSS coarse | ⏳ Pendiente | Safe areas, hover off |
| 6 — QA release | ⏳ Pendiente | Checklist iPad |

## Preferencia de input

```js
localStorage.setItem('foldder-input-mode-preference', 'auto' | 'desktop' | 'touch')
```

## Gestos (touch)

- **1 dedo en vacío (grafo):** pan
- **Pinch:** zoom
- **Tap en tile sidebar:** añadir nodo
- **Tap en franja sidebar:** expandir librería
- **Long-press (futuro):** menú contextual / colocación

Ver plan completo en conversación / tickets de fase 1–6.
