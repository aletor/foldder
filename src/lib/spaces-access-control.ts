import path from "path";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDynamoEnabled } from "@/lib/dynamo-utils";
import { readJsonStore } from "@/lib/json-persistence";
import {
  collectS3KeysFromProjectSpaces,
  collectS3KeysFromValue,
} from "@/lib/s3-media-hydrate";
import {
  readAllDdbProjects as readAllDdbProjectsStore,
  readDdbProjectById as readDdbProjectByIdStore,
  type ProjectRecord,
} from "@/lib/spaces-dynamo-store";

export type SpacesAuthUser = {
  email: string;
  image: string | null;
  name: string | null;
};

const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";
const KNOWLEDGE_FILES_PREFIX = "knowledge-files/";
const PROJECT_MEDIA_PREFIX = "knowledge-files/project-media/";
const USER_PROJECT_MEDIA_PREFIX = "knowledge-files/project-media/user/";
const USER_ASSETS_PREFIX = "knowledge-files/user-assets/";
const ACCESS_CACHE_TTL_MS = 60_000;

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

const keyAccessCache = new Map<string, { allowed: boolean; expiresAt: number }>();

export function normalizeOwnerEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

export function spacesOwnerHash(email: string): string {
  return createHash("sha256").update(normalizeOwnerEmail(email)).digest("hex").slice(0, 20);
}

export function isSafeKnowledgeFilesKey(key: string): boolean {
  return Boolean(
    key &&
      key.startsWith(KNOWLEDGE_FILES_PREFIX) &&
      !key.includes("..") &&
      !key.includes("\0"),
  );
}

export function stableKnowledgeFileUrlFromKey(key: string): string {
  return `/api/spaces/s3-file?key=${encodeURIComponent(key)}`;
}

export function buildProjectMediaObjectKey(args: {
  contentExt: string;
  mediaId: string;
  projectId: string;
  userEmail: string;
}): string {
  const owner = spacesOwnerHash(args.userEmail);
  const project = safeSegment(args.projectId, "unsaved");
  const media = safeSegment(args.mediaId, "media");
  const ext = args.contentExt.replace(/^\./, "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `${USER_PROJECT_MEDIA_PREFIX}${owner}/${project}/${media}.${ext}`;
}

export function buildUserDesignerAssetObjectKey(args: {
  assetId: string;
  contentExt: string;
  spaceId: string | null | undefined;
  userEmail: string;
  variant: "HR" | "OPT";
}): string {
  const owner = spacesOwnerHash(args.userEmail);
  const space = safeSegment(!args.spaceId || args.spaceId === "root" ? "orphan" : args.spaceId, "orphan");
  const asset = safeSegment(args.assetId, "asset");
  const ext = args.contentExt.replace(/^\./, "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `${USER_ASSETS_PREFIX}${owner}/spaces/${space}/designer/${asset}_${args.variant}.${ext}`;
}

export function projectBelongsToOwnerEmail(
  project: Pick<ProjectRecord, "ownerUserEmail">,
  ownerEmail: string,
): boolean {
  return normalizeOwnerEmail(project.ownerUserEmail) === normalizeOwnerEmail(ownerEmail);
}

function safeSegment(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned || fallback;
}

function isSpacesDdbEnabled(): boolean {
  return isDynamoEnabled(SPACES_DDB_TABLE_ENV);
}

function spacesTableName(): string {
  return process.env[SPACES_DDB_TABLE_ENV]?.trim() || "";
}

function devBypassUserFromRequest(req: Request): SpacesAuthUser | null {
  if (process.env.NODE_ENV === "production") return null;
  const code = req.headers.get("x-foldder-dev-passcode");
  if (code !== "6666") return null;
  return {
    email: "dev-bypass@local.foldder",
    image: null,
    name: "Local Bypass",
  };
}

export async function requireSpacesAuthUser(req: Request): Promise<
  { ok: true; user: SpacesAuthUser } | { ok: false; response: NextResponse }
> {
  const bypass = devBypassUserFromRequest(req);
  if (bypass) return { ok: true, user: bypass };

  if (process.env.NODE_ENV !== "production") {
    const session = await auth().catch(() => null);
    const devEmail = normalizeOwnerEmail(session?.user?.email);
    return {
      ok: true,
      user: {
        email: devEmail || "dev-local@local.foldder",
        image: session?.user?.image ?? null,
        name: session?.user?.name ?? "Local Dev",
      },
    };
  }

  const session = await auth();
  const email = normalizeOwnerEmail(session?.user?.email);
  if (!email) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return {
    ok: true,
    user: {
      email,
      image: session?.user?.image ?? null,
      name: session?.user?.name ?? null,
    },
  };
}

async function readProjectByIdForAccess(projectId: string): Promise<ProjectRecord | null> {
  if (!projectId || projectId === "unsaved") return null;
  if (isSpacesDdbEnabled()) {
    return readDdbProjectByIdStore(spacesTableName(), projectId);
  }
  const rows = await readJsonStore(spacesStore);
  return rows.find((row) => row.id === projectId) ?? null;
}

async function readProjectsForAccess(): Promise<ProjectRecord[]> {
  if (isSpacesDdbEnabled()) {
    return readAllDdbProjectsStore(spacesTableName());
  }
  return readJsonStore(spacesStore);
}

function ownerHashFromUserScopedKey(key: string): string | null {
  if (key.startsWith(USER_PROJECT_MEDIA_PREFIX)) {
    return key.slice(USER_PROJECT_MEDIA_PREFIX.length).split("/")[0] || null;
  }
  if (key.startsWith(USER_ASSETS_PREFIX)) {
    return key.slice(USER_ASSETS_PREFIX.length).split("/")[0] || null;
  }
  return null;
}

function legacyProjectIdFromProjectMediaKey(key: string): string | null {
  if (!key.startsWith(PROJECT_MEDIA_PREFIX) || key.startsWith(USER_PROJECT_MEDIA_PREFIX)) return null;
  return key.slice(PROJECT_MEDIA_PREFIX.length).split("/")[0] || null;
}

async function userProjectReferencesKey(ownerEmail: string, key: string): Promise<boolean> {
  const rows = await readProjectsForAccess();
  for (const project of rows) {
    if (!projectBelongsToOwnerEmail(project, ownerEmail)) continue;
    const keys = new Set([
      ...collectS3KeysFromProjectSpaces(project.spaces || {}),
      ...collectS3KeysFromValue(project.metadata || {}),
    ]);
    if (keys.has(key)) return true;
  }
  return false;
}

export async function canUserAccessKnowledgeFileKey(
  ownerEmail: string,
  key: string,
): Promise<boolean> {
  const normalizedEmail = normalizeOwnerEmail(ownerEmail);
  if (!normalizedEmail || !isSafeKnowledgeFilesKey(key)) return false;

  const cacheKey = `${normalizedEmail}\u0000${key}`;
  const cached = keyAccessCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.allowed;

  let allowed = false;
  const ownerHash = ownerHashFromUserScopedKey(key);
  if (ownerHash) {
    allowed = ownerHash === spacesOwnerHash(normalizedEmail);
  } else {
    const projectId = legacyProjectIdFromProjectMediaKey(key);
    if (projectId) {
      const project = await readProjectByIdForAccess(projectId);
      allowed = project ? projectBelongsToOwnerEmail(project, normalizedEmail) : false;
    }
    if (!allowed) {
      allowed = await userProjectReferencesKey(normalizedEmail, key);
    }
  }

  keyAccessCache.set(cacheKey, { allowed, expiresAt: now + ACCESS_CACHE_TTL_MS });
  return allowed;
}
