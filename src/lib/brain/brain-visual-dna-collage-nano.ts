import type { AggregatedVisualPatterns } from "@/app/spaces/project-assets-metadata";
import { getEffectiveClassification } from "@/lib/brain/brain-visual-analysis";
import {
  buildBrainVisualDnaCollageModel,
  type BrainVisualCollageInventoryRow,
} from "@/lib/brain/brain-visual-dna-collage";

/** Bump when cambia la plantilla de coordenadas para forzar regeneración. */
export const BRAIN_VISUAL_DNA_COLLAGE_LAYOUT_VERSION = "nb-dna-v2";

/**
 * Huella estable del estudio visual: al cambiar referencias o análisis, el tablero Nano Banana debe poder regenerarse.
 */
export function computeBrainVisualDnaCollageFingerprint(rows: BrainVisualCollageInventoryRow[]): string {
  const s = rows
    .filter((r) => r.analysis?.analysisStatus === "analyzed")
    .map((r) => {
      const a = r.analysis!;
      return `${r.ref.id}:${a.analyzedAt ?? ""}:${a.visionProviderId ?? ""}:${a.fallbackUsed ? 1 : 0}:${a.userVisualOverride ?? ""}:${getEffectiveClassification(a)}`;
    })
    .sort()
    .join("|");
  return `${BRAIN_VISUAL_DNA_COLLAGE_LAYOUT_VERSION}:${s.length}:${s.slice(0, 3800)}`;
}

const W = 1024;
const H = 1024;
const G = 8;

/**
 * Prompt para Nano Banana (Gemini imagen): una sola salida 1024×1024 con celdas en coordenadas px.
 * Las imágenes de referencia (máx. 4) se enumeran al inicio del prompt.
 */
export function buildNanoBananaBrainVisualDnaCollagePayload(params: {
  rows: BrainVisualCollageInventoryRow[];
  aggregated: AggregatedVisualPatterns | null;
}): { prompt: string; images: string[] } {
  const { rows, aggregated } = params;
  const model = buildBrainVisualDnaCollageModel(rows, aggregated);

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const slot of model.slots) {
    const u = slot.imageUrl?.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    urls.push(u);
    if (urls.length >= 4) break;
  }

  const agg = aggregated;
  const textBlock = [
    agg?.recurringStyles?.length ? `Estilos recurrentes: ${agg.recurringStyles.join(", ")}.` : "",
    agg?.dominantMoods?.length ? `Mood dominante: ${agg.dominantMoods.join(", ")}.` : "",
    agg?.frequentSubjects?.length ? `Sujetos frecuentes: ${agg.frequentSubjects.join(", ")}.` : "",
    agg?.compositionNotes?.length ? `Composición: ${agg.compositionNotes.join(" · ")}.` : "",
    agg?.peopleClothingNotes?.length ? `Personas / vestuario: ${agg.peopleClothingNotes.join(" · ")}.` : "",
    agg?.graphicStyleNotes?.length ? `Estilo gráfico: ${agg.graphicStyleNotes.join(" · ")}.` : "",
    agg?.implicitBrandMessages?.length ? `Lectura de marca: ${agg.implicitBrandMessages.join(" · ")}.` : "",
    agg?.narrativeSummary ? `Resumen narrativo: ${agg.narrativeSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const paletteLine =
    model.palette.length > 0
      ? `Paleta hex (6 muestras en la celda «paleta»): ${model.palette.slice(0, 6).join(", ")}.`
      : "Paleta: si no hay hex, elige tonos neutros cálidos coherentes con las referencias.";

  const refLegend =
    urls.length > 0
      ? `Referencias de imagen adjuntas (en este orden, REF1–REF${urls.length}): úsalas como material fotorrealista para rellenar las celdas; no copies marcas de agua ni texto superpuesto.`
      : "No hay referencias binarias adjuntas: inventa escenas fotorrealistas coherentes con el texto de marca.";

  const layout = `
LIENZO ÚNICO ${W}×${H} px, fondo blanco (#ffffff), calidad editorial / mood board de marca.
Gutter uniforme entre celdas: ${G} px. Cada celda con esquinas internas redondeadas 5 px (excepto el borde exterior del lienzo).
No dibujes rejillas negras gruesas: solo separación limpia tipo collage.
Evita texto legible en la imagen (logotipos de terceros, captions largos).

Coordenadas (x,y) esquina superior izquierda; (w,h) tamaño en px:

1) PALETA — x=${G}, y=${G}, w=120, h=200
   Sube 2 columnas × 3 filas de rectángulos de color sólido (relleno plano) usando la paleta indicada abajo.

2) HÉROE / CONCLUSIÓN GENERAL — x=136, y=${G}, w=420, h=600
   Una escena fotorrealista idílica que sintetice la marca (personas + entorno + luz) coherente con REF.

3) PERSONAS / INTERACCIÓN (4 celdas, columna derecha):
   - Celda A: x=564, y=${G}, w=220, h=188
   - Celda B: x=792, y=${G}, w=220, h=188
   - Celda C: x=564, y=204, w=220, h=188
   - Celda D: x=792, y=204, w=220, h=188

4) ENTORNOS (2 bandas anchas):
   - Entorno 1: x=${G}, y=616, w=500, h=180
   - Entorno 2: x=516, y=616, w=500, h=180

5) TEXTURAS (2 celdas):
   - Textura 1: x=${G}, y=804, w=248, h=212
   - Textura 2: x=264, y=804, w=248, h=212

6) OBJETOS (2 celdas):
   - Objeto 1: x=520, y=804, w=248, h=212
   - Objeto 2: x=776, y=804, w=240, h=212

Si alguna referencia no encaja con una celda, reinterpreta el contenido manteniendo la intención (textura abstracta, bodegón, etc.).
`.trim();

  const prompt = [
    "TAREA: generar exactamente UNA imagen cuadrada que sea un mood board de ADN visual de marca.",
    refLegend,
    layout,
    "",
    paletteLine,
    "",
    "CONTEXTO SEMÁNTICO (mezcla coherente en todo el tablero):",
    textBlock || "Sin agregado textual; infiere de las referencias.",
  ].join("\n");

  return { prompt, images: urls };
}
