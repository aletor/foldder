const SNIPPET_LIMIT = 700;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .slice(0, limit);
}

function slotValue(doc: Record<string, unknown>, id: string): Record<string, unknown> | null {
  const slots = record(doc.slots);
  const slot = record(slots?.[id]);
  return record(slot?.value);
}

export function writerBrandSnippet(data: unknown): string {
  const row = record(data);
  const doc = record(row?.brandKit) ?? row;
  if (!doc) return "";
  const lines: string[] = [];
  const brandName = record(doc.brandName);
  if (typeof brandName?.value === "string" && brandName.value.trim()) lines.push(brandName.value.trim());
  const voice = slotValue(doc, "voice");
  if (typeof voice?.summary === "string" && voice.summary.trim()) lines.push(voice.summary.trim());
  const rules = textList(voice?.rules, 2);
  if (rules.length) lines.push(rules.join(". "));
  const avoid = textList(voice?.avoid, 2);
  if (avoid.length) lines.push(`Evitar: ${avoid.join(". ")}`);
  const essence = slotValue(doc, "essence");
  if (typeof essence?.summary === "string" && essence.summary.trim()) lines.push(essence.summary.trim());
  return lines.join("\n").slice(0, SNIPPET_LIMIT);
}
