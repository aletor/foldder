export type SiteLeadRecord = {
  id: string;
  submittedAt: string;
  name?: string;
  email?: string;
  message?: string;
  pageId?: string;
  locale?: string;
  metadata?: Record<string, string>;
};

export type SiteLeadsOutput = {
  kind: "site_leads";
  sourceNodeId: string;
  slug: string;
  totalCount: number;
  items: SiteLeadRecord[];
  updatedAt: string;
};

export type SiteLeadFormConfig = {
  enabled: boolean;
  title?: string;
  submitLabel?: string;
  successMessage?: string;
  fields: Array<"name" | "email" | "message">;
};

export const DEFAULT_SITE_LEAD_FORM: SiteLeadFormConfig = {
  enabled: false,
  title: "Contacto",
  submitLabel: "Enviar",
  successMessage: "Gracias — te responderemos pronto.",
  fields: ["name", "email", "message"],
};

export function isSiteLeadsOutput(value: unknown): value is SiteLeadsOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as SiteLeadsOutput;
  return candidate.kind === "site_leads" && Array.isArray(candidate.items);
}

export function buildSiteLeadsOutput(args: {
  sourceNodeId: string;
  slug: string;
  items: SiteLeadRecord[];
}): SiteLeadsOutput {
  return {
    kind: "site_leads",
    sourceNodeId: args.sourceNodeId,
    slug: args.slug,
    totalCount: args.items.length,
    items: args.items,
    updatedAt: new Date().toISOString(),
  };
}

export function readSiteLeadsFromNodeData(data: unknown): SiteLeadsOutput | null {
  if (!data || typeof data !== "object") return null;
  const direct = (data as { leadsOutput?: unknown }).leadsOutput;
  if (isSiteLeadsOutput(direct)) return direct;
  return null;
}

export function leadsOutputToCsv(output: SiteLeadsOutput): string {
  const header = ["id", "submittedAt", "name", "email", "message", "pageId", "locale"];
  const rows = output.items.map((item) =>
    header
      .map((key) => {
        const raw = item[key as keyof SiteLeadRecord];
        const value = typeof raw === "string" ? raw : "";
        return `"${value.replace(/"/g, '""')}"`;
      })
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
