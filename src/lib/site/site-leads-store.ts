import fs from "fs/promises";
import path from "path";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbClient, isDynamoEnabled } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";
import { createSiteId } from "./site-defaults";
import type { SiteLeadRecord } from "./site-leads";

export const SITE_LEADS_DDB_TABLE_ENV = "FOLDDER_SITE_LEADS_DDB_TABLE";

const LOCAL_ROOT = path.join(process.cwd(), "data", "site-leads");

type LeadItem = SiteLeadRecord & {
  pk: string;
  sk: string;
  entityType: "site-lead";
  slug: string;
  nodeId?: string;
};

function leadsTable(): string | null {
  if (!isDynamoEnabled(SITE_LEADS_DDB_TABLE_ENV)) return null;
  return process.env[SITE_LEADS_DDB_TABLE_ENV]?.trim() || null;
}

function sitePk(slug: string): string {
  return `SITE_LEADS#${slug}`;
}

function localPath(slug: string): string {
  return path.join(LOCAL_ROOT, `${slug}.json`);
}

async function readLocalLeads(slug: string): Promise<SiteLeadRecord[]> {
  try {
    const raw = await fs.readFile(localPath(slug), "utf8");
    const parsed = JSON.parse(raw) as { items?: SiteLeadRecord[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalLeads(slug: string, items: SiteLeadRecord[]): Promise<void> {
  await fs.mkdir(LOCAL_ROOT, { recursive: true });
  await fs.writeFile(localPath(slug), JSON.stringify({ items }, null, 2), "utf8");
}

export async function listSiteLeads(slug: string, limit = 500): Promise<SiteLeadRecord[]> {
  const table = leadsTable();
  if (table) {
    const res = await withDynamoRetry(() =>
      ddbClient.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": sitePk(slug) },
          ScanIndexForward: false,
          Limit: limit,
        }),
      ),
    );
    return (res.Items ?? []).map((row) => {
      const item = row as LeadItem;
      const { pk: _pk, sk: _sk, entityType: _type, slug: _slug, nodeId: _nodeId, ...lead } = item;
      void _pk;
      void _sk;
      void _type;
      void _slug;
      void _nodeId;
      return lead;
    });
  }
  const items = await readLocalLeads(slug);
  return items.slice(-limit);
}

export async function appendSiteLead(args: {
  slug: string;
  nodeId?: string;
  lead: Omit<SiteLeadRecord, "id" | "submittedAt"> & Partial<Pick<SiteLeadRecord, "id" | "submittedAt">>;
}): Promise<SiteLeadRecord> {
  const record: SiteLeadRecord = {
    id: args.lead.id ?? createSiteId(),
    submittedAt: args.lead.submittedAt ?? new Date().toISOString(),
    name: args.lead.name?.trim() || undefined,
    email: args.lead.email?.trim() || undefined,
    message: args.lead.message?.trim() || undefined,
    pageId: args.lead.pageId,
    locale: args.lead.locale,
    metadata: args.lead.metadata,
  };

  const table = leadsTable();
  if (table) {
    const item: LeadItem = {
      ...record,
      pk: sitePk(args.slug),
      sk: `LEAD#${record.submittedAt}#${record.id}`,
      entityType: "site-lead",
      slug: args.slug,
      nodeId: args.nodeId,
    };
    await withDynamoRetry(() =>
      ddbClient.send(new PutCommand({ TableName: table, Item: item })),
    );
  } else {
    const items = await readLocalLeads(args.slug);
    items.push(record);
    await writeLocalLeads(args.slug, items);
  }

  return record;
}
