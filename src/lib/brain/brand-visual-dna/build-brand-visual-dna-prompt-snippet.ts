import type { BrandVisualDnaStoredBundle } from "./types";

/**
 * Fragmento seguro para inyectar en contexto de Brain / nodos creativos.
 * No incluye URLs ni IDs de referencia; solo reglas abstractas reutilizables.
 */
export function buildBrandVisualDnaPromptSnippet(bundle: BrandVisualDnaStoredBundle | undefined): string {
  if (!bundle?.brand_visual_dna) return "";
  const d = bundle.brand_visual_dna;
  const g = d.global_visual_rules;
  const lines: string[] = [];
  lines.push("CAPA — Brand Visual DNA (abstracto, sin recrear imágenes concretas):");
  lines.push(`Estilo núcleo: ${d.core_style}`);
  if (d.secondary_styles.length) lines.push(`Estilos secundarios: ${d.secondary_styles.slice(0, 8).join(", ")}`);
  if (g.dominant_colors.length) lines.push(`Paleta dominante (lectura): ${g.dominant_colors.slice(0, 10).join("; ")}`);
  if (g.dominant_mood.length) lines.push(`Mood dominante: ${g.dominant_mood.slice(0, 8).join(", ")}`);
  if (g.dominant_lighting.length) lines.push(`Luz: ${g.dominant_lighting.slice(0, 6).join(", ")}`);
  if (g.dominant_composition.length) lines.push(`Composición recurrente: ${g.dominant_composition.slice(0, 6).join(", ")}`);
  if (g.dominant_people_strategy.trim()) lines.push(`Personas (estrategia): ${g.dominant_people_strategy.trim().slice(0, 400)}`);
  if (g.dominant_product_strategy.trim()) lines.push(`Producto (estrategia): ${g.dominant_product_strategy.trim().slice(0, 400)}`);
  if (g.safe_generation_rules.length) {
    lines.push(`Reglas seguras: ${g.safe_generation_rules.slice(0, 12).join(" | ")}`);
  }
  if (g.avoid.length) {
    lines.push(`Evitar (DNA): ${g.avoid.slice(0, 14).join(" | ")}`);
  }
  const clusters = d.style_clusters.slice(0, 5);
  for (const c of clusters) {
    const avoid = c.visual_rules.avoid.slice(0, 4).join(", ");
    lines.push(
      `· Cluster «${c.style_name}» (~${c.weight_percentage}%): ${c.description.slice(0, 220)}${avoid ? ` | Evitar: ${avoid}` : ""}`,
    );
  }
  lines.push(
    "No uses este bloque para pedir clonar referencias ni campañas; solo coherencia de estilo abstracta.",
  );
  return lines.join("\n");
}
