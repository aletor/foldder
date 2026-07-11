/**
 * Site publish — metadata en DynamoDB (HTML sigue en local/S3).
 * Degradación elegante si `FOLDDER_SITE_PUBLISH_DDB_TABLE` no está configurada.
 */

import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbClient, isDynamoEnabled } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";
import type { PublishedSiteRecord } from "./site-publish-store";

export const SITE_PUBLISH_DDB_TABLE_ENV = "FOLDDER_SITE_PUBLISH_DDB_TABLE";
export const SITE_PUBLISH_DOMAIN_GSI = "domain-index";

type SiteMetaItem = PublishedSiteRecord & {
  pk: string;
  sk: "META";
  entityType: "site-publish";
  customDomain?: string;
  cdnHostname?: string;
};

type SiteDomainItem = {
  pk: string;
  sk: "DOMAIN";
  entityType: "site-domain";
  slug: string;
  customDomain: string;
  ownerEmail: string;
  domainIndex: string;
};

function tableName(): string | null {
  if (!isDynamoEnabled(SITE_PUBLISH_DDB_TABLE_ENV)) return null;
  return process.env[SITE_PUBLISH_DDB_TABLE_ENV]?.trim() || null;
}

function sitePk(slug: string): string {
  return `SITE#${slug}`;
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export async function ddbPutPublishedSiteRecord(record: PublishedSiteRecord): Promise<void> {
  const table = tableName();
  if (!table) return;

  const customDomain = record.customDomain?.trim()
    ? normalizeDomain(record.customDomain)
    : undefined;
  const cdnHostname = record.cdnHostname?.trim()?.toLowerCase();

  const item: SiteMetaItem = {
    ...record,
    customDomain,
    cdnHostname,
    pk: sitePk(record.slug),
    sk: "META",
    entityType: "site-publish",
  };

  await withDynamoRetry(() =>
    ddbClient.send(new PutCommand({ TableName: table, Item: item })),
  );

  if (customDomain) {
    const domainItem: SiteDomainItem = {
      pk: sitePk(record.slug),
      sk: "DOMAIN",
      entityType: "site-domain",
      slug: record.slug,
      customDomain,
      ownerEmail: record.ownerEmail,
      domainIndex: customDomain,
    };
    await withDynamoRetry(() =>
      ddbClient.send(new PutCommand({ TableName: table, Item: domainItem })),
    );
  }
}

export async function ddbGetPublishedSiteRecord(slug: string): Promise<PublishedSiteRecord | null> {
  const table = tableName();
  if (!table) return null;
  const res = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({ TableName: table, Key: { pk: sitePk(slug), sk: "META" } }),
    ),
  );
  if (!res.Item) return null;
  const { pk: _pk, sk: _sk, entityType: _entityType, ...record } = res.Item as SiteMetaItem;
  void _pk;
  void _sk;
  void _entityType;
  return record;
}

export async function ddbResolveSlugByDomain(host: string): Promise<string | null> {
  const table = tableName();
  if (!table) return null;
  const domain = normalizeDomain(host);
  if (!domain) return null;

  try {
    const res = await withDynamoRetry(() =>
      ddbClient.send(
        new QueryCommand({
          TableName: table,
          IndexName: SITE_PUBLISH_DOMAIN_GSI,
          KeyConditionExpression: "domainIndex = :domain",
          ExpressionAttributeValues: { ":domain": domain },
          Limit: 1,
        }),
      ),
    );
    const item = res.Items?.[0] as SiteDomainItem | undefined;
    return item?.slug ?? null;
  } catch {
    return null;
  }
}
