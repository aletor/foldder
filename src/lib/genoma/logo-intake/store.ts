import fs from "node:fs";
import path from "node:path";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbClient, isDynamoEnabled } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";
import type { BrandLogoState } from "@/lib/genoma/logo-intake/types";

export const GENOMA_BRAND_LOGO_DDB_TABLE_ENV = "FOLDDER_GENOMA_BRAND_LOGO_DDB_TABLE";
const FILE_STORE_DIR = path.join(process.cwd(), "data/genoma-brand-logo");

export interface BrandLogoStore {
  get(projectId: string): Promise<BrandLogoState | null>;
  set(state: BrandLogoState): Promise<void>;
}

function defaultState(projectId: string): BrandLogoState {
  return { projectId, status: "none", sightings: [] };
}

function safeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function projectDir(projectId: string): string {
  return path.join(FILE_STORE_DIR, safeProjectId(projectId));
}

function statePath(projectId: string): string {
  return path.join(projectDir(projectId), "state.json");
}

export function assetPngPath(projectId: string): string {
  return path.join(projectDir(projectId), "asset.png");
}

export function assetSvgPath(projectId: string): string {
  return path.join(projectDir(projectId), "asset.svg");
}

export function writeBrandLogoAsset(projectId: string, png: Buffer, meta: { widthPx: number; heightPx: number }): void {
  fs.mkdirSync(projectDir(projectId), { recursive: true });
  fs.writeFileSync(assetPngPath(projectId), png);
  void meta;
}

export function writeBrandLogoSvg(projectId: string, svg: string): void {
  fs.mkdirSync(projectDir(projectId), { recursive: true });
  fs.writeFileSync(assetSvgPath(projectId), svg, "utf8");
}

export function readBrandLogoAssetPng(projectId: string): Buffer | null {
  const file = assetPngPath(projectId);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

export function readBrandLogoAssetSvg(projectId: string): string | null {
  const file = assetSvgPath(projectId);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

function stripLegacyState(raw: BrandLogoState): BrandLogoState {
  const next = { ...raw } as BrandLogoState & { lastProposal?: unknown; asset?: BrandLogoState["asset"] & { pngBase64?: string; svg?: string } };
  delete next.lastProposal;
  if (next.asset && ("pngBase64" in next.asset || "svg" in next.asset)) {
    next.asset = {
      widthPx: next.asset.widthPx,
      heightPx: next.asset.heightPx,
      hasSvg: Boolean(next.asset.svg) || fs.existsSync(assetSvgPath(raw.projectId)),
    };
  }
  return next;
}

function tableName(): string | null {
  if (!isDynamoEnabled(GENOMA_BRAND_LOGO_DDB_TABLE_ENV)) return null;
  return process.env[GENOMA_BRAND_LOGO_DDB_TABLE_ENV]?.trim() || null;
}

function pk(projectId: string): string {
  return `GENOMA_BRAND_LOGO#${projectId}`;
}

type StoreItem = BrandLogoState & { pk: string; sk: "STATE"; entityType: "genoma-brand-logo" };

class DynamoBrandLogoStore implements BrandLogoStore {
  async get(projectId: string): Promise<BrandLogoState | null> {
    const table = tableName();
    if (!table) return null;
    const res = await withDynamoRetry(() =>
      ddbClient.send(new GetCommand({ TableName: table, Key: { pk: pk(projectId), sk: "STATE" } })),
    );
    if (!res.Item) return null;
    const { pk: _pk, sk: _sk, entityType: _t, ...state } = res.Item as StoreItem;
    return stripLegacyState(state);
  }

  async set(state: BrandLogoState): Promise<void> {
    const table = tableName();
    if (!table) return;
    const item: StoreItem = {
      ...state,
      pk: pk(state.projectId),
      sk: "STATE",
      entityType: "genoma-brand-logo",
    };
    await withDynamoRetry(() => ddbClient.send(new PutCommand({ TableName: table, Item: item })));
  }
}

class FileBrandLogoStore implements BrandLogoStore {
  async get(projectId: string): Promise<BrandLogoState | null> {
    const file = statePath(projectId);
    const legacy = path.join(FILE_STORE_DIR, `${safeProjectId(projectId)}.json`);
    if (!fs.existsSync(file) && fs.existsSync(legacy)) {
      const legacyState = JSON.parse(fs.readFileSync(legacy, "utf8")) as BrandLogoState & {
        asset?: { pngBase64?: string; svg?: string; widthPx: number; heightPx: number };
      };
      if (legacyState.asset?.pngBase64) {
        writeBrandLogoAsset(projectId, Buffer.from(legacyState.asset.pngBase64, "base64"), {
          widthPx: legacyState.asset.widthPx,
          heightPx: legacyState.asset.heightPx,
        });
        if (legacyState.asset.svg) writeBrandLogoSvg(projectId, legacyState.asset.svg);
      }
      const migrated = stripLegacyState(legacyState);
      await this.set(migrated);
      return migrated;
    }
    if (!fs.existsSync(file)) return null;
    return stripLegacyState(JSON.parse(fs.readFileSync(file, "utf8")) as BrandLogoState);
  }

  async set(state: BrandLogoState): Promise<void> {
    fs.mkdirSync(projectDir(state.projectId), { recursive: true });
    fs.writeFileSync(statePath(state.projectId), `${JSON.stringify(stripLegacyState(state), null, 2)}\n`, "utf8");
  }
}

const dynamo = new DynamoBrandLogoStore();
const file = new FileBrandLogoStore();

export const brandLogoStore: BrandLogoStore = {
  async get(projectId) {
    const fromDynamo = await dynamo.get(projectId);
    if (fromDynamo) return fromDynamo;
    return file.get(projectId);
  },
  async set(state) {
    await dynamo.set(state);
    await file.set(state);
  },
};

export async function getOrCreateBrandLogoState(projectId: string): Promise<BrandLogoState> {
  return (await brandLogoStore.get(projectId)) ?? defaultState(projectId);
}
