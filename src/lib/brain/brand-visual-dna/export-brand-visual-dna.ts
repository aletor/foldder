import type { BrandVisualDnaDocument, BrandVisualDnaStoredBundle, BrandVisualDnaStyleCluster } from "./types";

export function exportBrandVisualDnaJson(bundle: BrandVisualDnaStoredBundle): string {
  const doc: BrandVisualDnaDocument = { brand_visual_dna: bundle.brand_visual_dna };
  return JSON.stringify(doc, null, 2);
}

function bulletList(title: string, items: string[]): string {
  if (!items.length) return "";
  return `### ${title}\n${items.map((x) => `- ${x}`).join("\n")}\n\n`;
}

function clusterMarkdown(c: BrandVisualDnaStyleCluster): string {
  const vr = c.visual_rules;
  return `## ${c.style_name} (${c.weight_percentage}% · ${c.cluster_id})

${c.description}

**Confianza:** ${Math.round(c.confidence * 100)}%

### Visual rules
${bulletList("Colores", vr.colors)}${bulletList("Luz", vr.lighting)}${bulletList("Composición", vr.composition)}
${bulletList("Texturas", vr.textures)}${bulletList("Materiales", vr.materials)}
**Tipografía:** ${vr.typography_presence} · **Densidad:** ${vr.content_density} · **Premium:** ${vr.premium_level} · **Energía:** ${vr.energy_level}
${bulletList("Evitar", vr.avoid)}
### Personas (abstracto)
- Presencia: ${c.people_language.presence_level}
${bulletList("Roles", c.people_language.role_of_people as unknown as string[])}
### Producto (abstracto)
- Presencia: ${c.product_language.product_presence}
${bulletList("Categorías", c.product_language.product_category as unknown as string[])}
### Lectura estratégica
${c.strategic_reading.combined_effect}

`;
}

export function exportBrandVisualDnaMarkdown(bundle: BrandVisualDnaStoredBundle): string {
  const d = bundle.brand_visual_dna;
  const g = d.global_visual_rules;
  const parts: string[] = [];
  parts.push(`# Brand Visual DNA — ${d.brand_name}`);
  parts.push(`Versión análisis: ${d.analysis_version} · Imágenes fuente: ${d.source_image_count} · Pipeline: ${bundle.pipeline_version}`);
  parts.push(`Analizado: ${bundle.analyzed_at}`);
  if (bundle.warnings.length) {
    parts.push("## Advertencias\n" + bundle.warnings.map((w) => `- ${w}`).join("\n"));
  }
  if (bundle.failedImages.length) {
    parts.push("## Imágenes con error\n" + bundle.failedImages.map((f) => `- \`${f.image_id}\`: ${f.error}`).join("\n"));
  }
  parts.push(`## Resumen global
**Estilo principal:** ${d.core_style}

**Estilos secundarios:** ${d.secondary_styles.join(", ") || "—"}

${bulletList("Colores dominantes (lectura)", g.dominant_colors)}
${bulletList("Mood", g.dominant_mood)}
${bulletList("Luz", g.dominant_lighting)}
${bulletList("Composición", g.dominant_composition)}
**Estrategia personas (dominante):** ${g.dominant_people_strategy || "—"}
**Estrategia producto (dominante):** ${g.dominant_product_strategy || "—"}
${bulletList("Sensación de marca", g.brand_feeling)}
${bulletList("Reglas seguras de generación", g.safe_generation_rules)}
${bulletList("Evitar (global)", g.avoid)}
`);
  parts.push(`## Clusters (${d.style_clusters.length})\n`);
  for (const c of d.style_clusters) {
    parts.push(clusterMarkdown(c));
  }
  parts.push(`
---
*Documento generado automáticamente. Uso interno: abstracciones visuales, sin recreación de piezas concretas.*
`);
  return parts.join("\n");
}
