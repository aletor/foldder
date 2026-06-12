# Foldder Flush Chrome — Guía de diseño

> **Propósito:** documentar el sistema visual aplicado al top HUD, sidebar, modales y paneles de Spaces para poder replicarlo de forma consistente en **todas las versiones Studio** (Designer, PhotoRoom, Cine, Guionista, Presenter, Brain, etc.) sin desvirtuar el patrón.

**Nombre interno:** *Flush Chrome* (cristal plano, rectangular, sin cajas flotantes).

**Última referencia de implementación:** junio 2026 — `spaces.css`, `SpacesContent.tsx`, `WalletBalanceButton.tsx`.

---

## 1. Filosofía

| Principio | Qué significa | Qué evitar |
|-----------|---------------|------------|
| **Flush** | Controles pegados entre sí: `gap-0`, filas continuas, divisores internos (`divide-x`, `divide-y`) | Tarjetas sueltas con `gap-2`, `rounded-xl`, sombras por elemento |
| **Rectangular** | `rounded-none` en todo; esquinas a 0° | `rounded-full`, `rounded-lg`, pills flotantes |
| **Compacto** | Alturas fijas (`h-10` = 40px), tipografía pequeña en mayúsculas para chrome | Padding generoso (`p-6`), títulos grandes dentro de modales |
| **Color semántico** | Bloques de color plano (verde saldo, azul acción, rosa error…) | Grises neutros tipo “glass light” (`bg-white/20` sobre fondo claro) |
| **Una fila = una unidad** | Cabecera, tabs, acciones primarias ocupan exactamente `--foldder-top-hud-h` | Alturas mixtas (`h-8` dentro de `h-10`, avatares más altos que botones) |
| **Sin duplicar** | Si un dato ya está en el trigger del menú (avatar, saldo), no repetirlo en el panel | Cabeceras de modal que repiten lo mismo que el botón que las abre |

---

## 2. Tokens de diseño

### 2.1 Colores de superficie

```css
/* Fondo principal de paneles / modales */
--foldder-panel-bg: #0b0f14;           /* bg-[#0b0f14]/98 */
--foldder-panel-overlay: rgba(0,0,0,.45); /* backdrop click-outside */

/* Capas de chrome (de más sutil a más visible) */
--foldder-chrome-1: rgba(255,255,255,.04);  /* bg-white/[0.04] — botones icono reposo */
--foldder-chrome-2: rgba(255,255,255,.06);  /* bg-white/[0.06] — filas stats, tabs inactivos */
--foldder-chrome-3: rgba(255,255,255,.08);  /* bg-white/[0.08] — barra HUD, cabeceras panel */
--foldder-chrome-4: rgba(255,255,255,.12);  /* hover secundario */
--foldder-chrome-5: rgba(255,255,255,.15);  /* hover HUD */

/* Divisores (preferir divide-* sobre border suelto) */
--foldder-divider: rgba(255,255,255,.10);   /* divide-white/10, border-white/10 */
--foldder-divider-subtle: rgba(255,255,255,.08);
```

### 2.2 Colores semánticos (bloques planos)

Usar **fondos sólidos o /15–/30**, no bordes gruesos + fondo claro.

| Rol | Tailwind típico | Uso |
|-----|-----------------|-----|
| **Saldo / OK** | `bg-emerald-400 text-emerald-950` | Badge crédito, paquete recomendado, estado activo |
| **Acción primaria** | `bg-blue-600 hover:bg-blue-500 text-white` | Nuevo proyecto, Crear, CTA principal |
| **Info / carga** | `bg-sky-500/15 text-sky-100` | Loading proyecto, icono fila |
| **Advertencia** | `bg-amber-400/15 text-amber-100` | Saldo bajo, reservado |
| **Error / peligro** | `bg-rose-500/15 text-rose-100` | Errores, eliminar, revisión billing |
| **Destacado UI** | `bg-violet-300` (iconos), `bg-sky-500/18` (filas) | Iconos cabecera panel fondo |
| **Selección** | `ring-2 ring-inset ring-emerald-400` o `ring-white` | Thumbnail fondo, color sólido activo |
| **Tab activo** | `bg-white text-slate-950` | Pestañas Resumen/Movimientos, ES/EN, Estándar/Pro |

### 2.3 Tipografía del chrome

| Elemento | Clases | Ejemplo |
|----------|--------|---------|
| Título panel / sección | `text-[10px] font-black uppercase tracking-[0.12em] text-white/85` | `TUS PROYECTOS` |
| Etiqueta stat | `text-[9px] font-black uppercase tracking-[0.12em] text-*-200/70` | `RESERVADO` |
| Valor numérico | `text-[15px] font-black tabular-nums text-white` | `$116.58` |
| Cuerpo compacto | `text-[10px] font-semibold text-white/45` | Hint bajo cabecera |
| Micro | `text-[8px] font-bold uppercase tracking-[0.08em] text-white/35` | Metadata fecha |
| Botón chrome | `text-[10px] font-black uppercase tracking-[0.1em]` | `ABRIR`, `CREAR` |
| Input panel | `text-[13px] font-bold text-white`, fondo `bg-white/[0.10]` | Nombre proyecto |

**Regla:** títulos de chrome en MAYÚSCULAS con tracking amplio; contenido editable en sentence case.

### 2.4 Espaciado y geometría

```css
--foldder-top-hud-h: 40px;      /* h-10 — altura universal de fila */
--foldder-top-hud-offset: 8px;  /* separación del borde superior viewport */
--foldder-panel-gap: 8px;       /* distancia panel respecto a su trigger */
--foldder-panel-max-w: 400px;   /* modales laterales (wallet, proyectos, fondo) */
```

| Medida | Valor | Uso |
|--------|-------|-----|
| Fila estándar | `h-10` (40px) | Botones HUD, cabecera modal, tabs, filas acción |
| Icono en fila | `w-10 h-10` | Botones cuadrados, avatar topbar |
| Avatar / logo en HUD | `h-10 w-10`, contenido interno ~`h-7 w-7` | Logo Foldder |
| Cabecera panel (compacta) | `h-10` | Tras eliminar duplicados; antes se usaba `h-12` |
| Ancho modal | `max-w-[400px]` | Wallet, proyectos; fondo lienzo `320px` |
| Padding contenido | `px-3 py-2.5` | Cuerpo scrollable |
| Separación secciones | `space-y-3` | Entre bloques dentro del panel |

### 2.5 Efectos prohibidos en chrome

En elementos con `data-foldder-*-panel`, `[data-foldder-top-hud]` y equivalentes studio:

- ❌ `box-shadow` (excepto sombra única del contenedor panel si hace falta profundidad)
- ❌ `rounded-*` (forzar `rounded-none` vía CSS hook)
- ❌ `ring-offset-*` (usar `ring-inset`)
- ❌ Cristal claro `bg-white/90` sobre canvas
- ❌ Bordes externos gruesos en cada ítem de lista (`border border-white/25` por fila)
- ❌ `hover:scale-105` en paneles (sí permitido en iconos HUD sueltos si ya existía)

**Backdrop panel:** `backdrop-blur-2xl` solo en el contenedor raíz; hijos sin blur individual.

**Sombra contenedor (única permitida):**
`shadow-[0_24px_70px_rgba(0,0,0,0.55)]`

---

## 3. Patrones de layout

### 3.1 Fila flush (building block)

Una fila es un `flex items-stretch` sin gap; los hijos se separan con `border-l border-white/10` o contenedor con `divide-x divide-white/10`.

```tsx
<div className="flex h-10 items-stretch bg-white/[0.08]">
  <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
    {/* icono + título */}
  </div>
  <button className="flex h-10 w-10 shrink-0 items-center justify-center border-l border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/[0.12] hover:text-white">
    {/* icono acción */}
  </button>
</div>
```

### 3.2 Grid de stats (2–3 columnas)

Sin cajas individuales: un solo bloque con divisores.

```tsx
<div className="grid grid-cols-2 divide-x divide-white/10 bg-white/[0.06]">
  <div className="px-2.5 py-2">
    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-200/70">Reservado</p>
    <p className="mt-0.5 text-[15px] font-black tabular-nums text-white">$0.00</p>
  </div>
  {/* … */}
</div>
```

### 3.3 Bloques de color (tipo sidebar)

Tres columnas pegadas, fondo semántico, sin borde exterior.

```tsx
<div className="grid grid-cols-3 divide-x divide-white/10">
  <div className="bg-emerald-500/20 px-2 py-2">{/* Texto */}</div>
  <div className="bg-sky-500/20 px-2 py-2">{/* Imagen */}</div>
  <div className="bg-amber-500/20 px-2 py-2">{/* Vídeo */}</div>
</div>
```

### 3.4 Tabs / segment control

Altura `h-10`, activo blanco sólido, inactivo transparente.

```tsx
<div className="flex h-10 divide-x divide-white/10 bg-white/[0.06]">
  <button className={`flex-1 text-[10px] font-black uppercase tracking-[0.1em] ${active ? "bg-white text-slate-950" : "text-white/45 hover:bg-white/[0.08]"}`}>
    Resumen
  </button>
  <button className="flex-1 …">Movimientos</button>
</div>
```

### 3.5 Lista compacta

Contenedor `divide-y divide-white/8 bg-white/[0.04]`; filas sin border propio.

```tsx
<div className="divide-y divide-white/8">
  <div className="flex min-h-12 items-stretch hover:bg-white/[0.05]">
    <div className="flex w-10 items-center justify-center bg-sky-500/18 text-sky-200">{icon}</div>
    <div className="min-w-0 flex-1 border-l border-white/10 px-2.5 py-1.5">{/* texto */}</div>
    <div className="flex shrink-0 divide-x divide-white/10 border-l border-white/10">
      {/* acciones w-10 + botón primario */}
    </div>
  </div>
</div>
```

### 3.6 Alertas inline

Una línea, fondo de color, sin marco.

```tsx
<div className="mb-2 flex items-center gap-2 bg-rose-500/15 px-2 py-1.5 text-[10px] font-semibold text-rose-100">
  <AlertCircle size={12} className="shrink-0" />
  <span>Mensaje corto.</span>
</div>
```

### 3.7 Botones de acción en fila (footer modal)

```tsx
<div className="grid grid-cols-2 divide-x divide-white/10">
  <button className="h-10 bg-white/[0.06] text-[10px] font-black uppercase …">Cancelar</button>
  <button className="h-10 bg-blue-600 text-[10px] font-black uppercase …">Crear</button>
</div>
```

### 3.8 Trigger compuesto (topbar wallet)

Avatar cuadrado + badge rectangular en la **misma** fila `h-10`, sin badge flotante.

```tsx
<button className="flex h-10 items-stretch overflow-hidden bg-white/[0.08] …">
  <AccountAvatar shape="square" className="h-10 w-10 shrink-0 border-0" />
  <span className="flex h-10 items-center border-l border-white/10 px-2.5 text-[9px] font-black tabular-nums bg-emerald-400 text-emerald-950">
    $117
  </span>
</button>
```

---

## 4. Anatomía de un panel / modal

Plantilla mínima reutilizable:

```tsx
<div
  role="dialog"
  aria-label="…"
  data-foldder-{nombre}-panel   {/* hook CSS obligatorio */}
  className="overflow-hidden rounded-none bg-[#0b0f14]/98 text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
  style={{ maxWidth: "400px" }}  {/* o w-[min(94vw,320px)] para dropdowns */}
>
  {/* 1. Cabecera h-10 — solo lo que NO está en el trigger */}
  <div className="flex h-10 items-stretch bg-white/[0.08]">…</div>

  {/* 2. CTA opcional full-bleed (h-10, bg-blue-600) */}
  <button className="flex h-10 w-full items-center justify-center gap-2 bg-blue-600 …">…</button>

  {/* 3. Hint opcional — una línea, border-b */}
  <p className="border-b border-white/8 px-3 py-1.5 text-[9px] text-white/38">…</p>

  {/* 4. Alertas (condicionales) */}

  {/* 5. Tabs opcionales h-10 */}

  {/* 6. Cuerpo scrollable */}
  <div className="custom-scrollbar max-h-[min(72vh,560px)] overflow-y-auto px-3 py-2.5">
    …
  </div>
</div>
```

**Posicionamiento dropdown** (desde botón HUD):

```tsx
className="absolute right-0 top-[calc(100%+8px)] z-[220] …"
```

**Posicionamiento modal centrado:**

```tsx
<div className="fixed inset-0 z-[10004] flex items-start justify-center p-3 pt-[4.5rem] sm:items-center sm:p-4">
  <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
  {/* panel relativo z-10 */}
</div>
```

---

## 5. Hooks CSS (`data-foldder-*`)

Registrar **un hook por superficie** en `spaces.css` (o futuro `foldder-chrome.css` compartido con studios).

| Hook | Ubicación | Estado |
|------|-----------|--------|
| `data-foldder-top-hud` | Barra superior Spaces | ✅ |
| `data-foldder-wallet-panel` | Modal cuenta/saldo | ✅ |
| `data-foldder-wallet-trigger="topbar"` | Botón wallet en HUD | ✅ |
| `data-foldder-projects-panel` | Modales proyectos | ✅ |
| `data-foldder-canvas-bg-panel` | Dropdown fondo + idioma | ✅ |
| `data-foldder-canvas-modals` | Contenedor overlay modales | ✅ (legacy wrapper) |
| `data-foldder-sidebar` | Sidebar librería | ✅ parcial |
| **`data-foldder-studio-panel`** | **Paneles dentro de studios** | ⬜ pendiente |
| **`data-foldder-studio-header`** | **Cabecera StandardStudioShell** | ⬜ pendiente |

### Bloque CSS mínimo para un panel nuevo

Copiar y adaptar en `spaces.css`:

```css
[data-foldder-{nombre}-panel] {
  border-radius: 0 !important;
  box-shadow: none !important; /* hijos; el root puede llevar sombra externa */
}

[data-foldder-{nombre}-panel] :is(
  button, span, div, input, label, h2, h4
):not([class*="rounded-full"]) {
  border-radius: 0 !important;
}

[data-foldder-{nombre}-panel] [class*="rounded-full"] {
  border-radius: 0 !important;
}

[data-foldder-{nombre}-panel] button {
  box-shadow: none !important;
}
```

---

## 6. Referencias implementadas (fuente de verdad)

| Superficie | Archivo | Líneas aprox. |
|------------|---------|---------------|
| Top HUD | `SpacesContent.tsx` | ~6214–6510 |
| Wallet trigger + panel | `WalletBalanceButton.tsx` | trigger ~540–620, panel ~642–750 |
| Proyectos / nuevo / borrar | `SpacesContent.tsx` | ~6734–7070 |
| Fondo lienzo + idioma | `SpacesContent.tsx` | ~6349–6440 |
| CSS global chrome | `spaces.css` | ~4175–4391 |
| Sidebar tiles | `spaces.css` | ~2721–2950 |
| Sidebar componente | `Sidebar.tsx` | tiles + tooltips |

---

## 7. Migración de Studios — checklist

### 7.1 Archivos Studio actuales (prioridad)

| Archivo | Problema actual | Acción |
|---------|-----------------|--------|
| `StandardStudioShell.tsx` | `rounded-xl`, `h-12`, bordes suaves, botones pill | Rehacer header como fila `h-10` flush; `data-foldder-studio-header` |
| `DesignerStudioPageBar.tsx` | `rounded-md`, anillos violeta | Grid flush bottom bar, tab activo `bg-white text-slate-950` |
| `DesignerFormatModal.tsx` | Probable modal legacy | Aplicar plantilla panel §4 |
| `GuionistaStudio.tsx`, `CineStudio.tsx`, `PhotoRoomStudio.tsx`, etc. | Revisar modales internos | Buscar `rounded-`, `bg-white/9`, `border border-` |
| `WalletCostGuardDialog.tsx` | Dialog billing | Unificar con panel oscuro |

### 7.2 Pasos por componente Studio

1. **Identificar** modales, barras, rails, popovers.
2. **Añadir** `data-foldder-studio-panel` (o sub-hook específico) al root.
3. **Sustituir** fondo claro → `bg-[#0b0f14]/98`.
4. **Unificar** alturas a `h-10` en chrome (contenido de canvas puede ser distinto).
5. **Eliminar** cajas anidadas → `divide-y` / `divide-x`.
6. **Mover** CTAs primarios a filas full-bleed (`bg-blue-600`).
7. **Quitar** duplicación entre toolbar y panel.
8. **Registrar** reglas CSS si el studio carga hoja distinta (importar bloque de `spaces.css` o extraer a `foldder-chrome.css`).
9. **Probar** con `body.nb-studio-open` (HUD/sidebar ocultos; solo chrome del studio visible).

### 7.3 Cabecera Studio unificada — `FoldderStudioHeader`

Implementación: `FoldderStudioHeader.tsx` + `studio-node/foldder-studio-node-backgrounds.ts`.

- Fondo de cabecera = imagen **empty-state** del nodo en canvas (misma que el tile externo).
- Izquierda: miniatura cuadrada `40×40` de esa imagen + nombre del nodo (`nodeLabel`).
- Derecha: acciones flush (`actions`) + cerrar.
- `titleSlot` opcional para inputs de título (Guionista, VFX).
- `StandardStudioShellHeader` es un wrapper que usa este componente (Nano Banana, Designer/Freehand, etc.).

```tsx
<FoldderStudioHeader
  nodeType="inspiration"
  nodeLabel="Inspiration"
  subtitle="Opcional"
  onClose={onClose}
  actions={/* botones h-10 */}
/>
```

### 7.4 Fullscreen studio

Cuando un studio ocupa pantalla completa (`body.nb-studio-open`):

- El chrome del studio **es** la barra principal; debe seguir tokens §2.
- No reintroducir sombras/bordes del canvas principal.
- Z-index studio header: mantener > canvas (`z-[100020]` ok).

---

## 8. Iconografía

| Contexto | Tamaño | Color |
|----------|--------|-------|
| Botón HUD | 16px | `text-current` / `text-white/70` |
| Cabecera panel | 14px | Semántico (`text-sky-300`, `text-violet-300`) |
| Fila lista | 13–14px | Hereda del bloque |
| Alerta | 12px | Mismo tono que texto alerta |
| Acción icon-only | Botón `w-10 h-10`, icon 14px | `text-white/45` → hover color semántico |

**Lucide:** `strokeWidth={2}` en HUD; `2.5` solo en CTAs azules si se necesita más peso.

---

## 9. Accesibilidad

- `role="dialog"` + `aria-label` en modales.
- Botones icon-only: `title` + `aria-label`.
- Tabs: `aria-pressed` en toggles (idioma, vista wallet).
- Focus visible en HUD: `outline: 2px solid rgba(255,255,255,.38)` (ya en CSS).
- Contraste: texto principal `text-white`; secundario mínimo `text-white/38` (no bajar de ~38% opacidad para copy importante).

---

## 10. Anti-patrones (no usar)

```tsx
// ❌ Modal cristal claro
className="bg-white/20 border border-white/25 backdrop-blur-xl p-5"

// ❌ Item de lista como tarjeta
className="rounded-none border border-white/25 bg-white/15 px-2.5 py-2 shadow-sm"

// ❌ Badge flotante
className="absolute -bottom-1.5 rounded-full …"

// ❌ Tab con padding box externo
className="rounded-none border p-1 bg-black/22"

// ❌ Header studio redondeado
className="rounded-xl border border-white/10 h-8 px-3"

// ❌ Mezclar alturas en la misma fila
className="h-11" // logo junto a h-10 buttons
```

---

## 11. i18n

- Contenedores fijos en español/inglés manual: envolver con `data-foldder-i18n-ignore` (selector idioma, badges técnicos).
- Claves UI traducibles vía `useLanguage` / `i18n.ts` — mantener **misma longitud visual** (uppercase corto).

---

## 12. Evolución recomendada del código

Para no duplicar documentación y CSS:

1. **Extraer** tokens + hooks a `src/app/spaces/foldder-chrome.css`.
2. **Crear** componentes React reutilizables:
   - `FoldderPanel` (root + hook)
   - `FoldderPanelHeader` (fila h-10)
   - `FoldderPanelTabs`
   - `FoldderPanelRow` (lista)
   - `FoldderChromeButton` (icon / text / primary)
3. **Refactor** `StandardStudioShell` como primer consumidor.
4. **Regla Cursor** (`.cursor/rules/foldder-flush-chrome.mdc`) que apunte a este documento.

---

## 13. Resumen visual ASCII

```
┌────────────────────────────────────────────────────────────── TOP HUD (h=40, offset 8px)
│ [logo][💬][──── proyecto ────][Std|Pro][▦][⛶][📁][+ NUEVO][avatar|$117] │
└────────────────────────────────────────────────────────────── gap:0 entre celdas

Dropdown / modal (max-w 400):
┌─ HEADER h=10 ─────────────────────────────── [×] ─┐
├─ CTA h=10 (bg-blue-600) full width ─────────────────┤
├─ hint border-b ─────────────────────────────────────┤
├─ TABS h=10 │ Resumen │ Movimientos │ ────────────────┤
├─ stats │ A │ B │  (divide-x, bg-white/6) ───────────┤
├─ color blocks │ green │ blue │ amber │ ─────────────┤
├─ list divide-y ─────────────────────────────────────┤
│  [icon][ title + meta    ][dup][del][OPEN]           │
└─────────────────────────────────────────────────────┘
```

---

## 14. Contacto con el producto

Este sistema prioriza **densidad y coherencia** sobre decoración. Cuando dudes:

1. ¿Puede ser una sola fila de 40px? → Sí, hazlo.
2. ¿Necesita caja propia o un divisor basta? → Divisor.
3. ¿El usuario ya vio este dato en el botón? → No repetir.
4. ¿Es acción principal? → Azul sólido, fila completa.
5. ¿Es estado? → Bloque de color semántico, sin pill redonda.

---

*Documento vivo — actualizar al migrar cada Studio y al extraer componentes compartidos.*
