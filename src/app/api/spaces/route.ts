import path from "path";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { isDynamoEnabled } from "@/lib/dynamo-utils";
import { updateJsonStore, readJsonStore } from "@/lib/json-persistence";
import { collectS3KeysFromProjectSpaces } from "@/lib/s3-media-hydrate";
import { deleteFromS3 } from "@/lib/s3-utils";
import {
  deleteDdbProject as deleteDdbProjectStore,
  readAllDdbProjects as readAllDdbProjectsStore,
  readAllDdbProjectsMeta as readAllDdbProjectsMetaStore,
  readDdbProjectById as readDdbProjectByIdStore,
  upsertDdbProject as upsertDdbProjectStore,
  type ProjectListItem,
  type ProjectRecord,
} from "@/lib/spaces-dynamo-store";
import { runSpacesDbExclusive } from "@/lib/spaces-db-queue";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

type SpaceNodeGraph = {
  createdAt?: string;
  edges?: unknown[];
  id: string;
  name: string;
  nodes?: unknown[];
  updatedAt?: string;
  [key: string]: unknown;
};

type ProjectBody = {
  id?: string;
  metadata?: Record<string, unknown>;
  name?: string;
  rootSpaceId?: string;
  spaces?: Record<string, SpaceNodeGraph>;
};

type AuthUser = {
  email: string;
  name: string | null;
  image: string | null;
};

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";
const SPACES_GET_CACHE_TTL_MS = 1500;
const SPACES_META_EDGE_S_MAXAGE_SECONDS = 10;
const SPACES_META_EDGE_STALE_SECONDS = 60;
const SPACES_DETAIL_EDGE_S_MAXAGE_SECONDS = 5;
const SPACES_DETAIL_EDGE_STALE_SECONDS = 30;
let spacesGetCache: { expiresAt: number; rows: ProjectRecord[] } | null = null;
let spacesMetaGetCache: {
  expiresAt: number;
  rows: Array<ReturnType<typeof projectToMeta>>;
} | null = null;

function isSpacesDdbEnabled(): boolean {
  return isDynamoEnabled(SPACES_DDB_TABLE_ENV);
}

function spacesTableName(): string {
  return process.env[SPACES_DDB_TABLE_ENV]?.trim() || "";
}

async function scanDdbProjects(): Promise<ProjectRecord[]> {
  return readAllDdbProjectsStore(spacesTableName());
}

async function scanDdbProjectsMeta() {
  return readAllDdbProjectsMetaStore(spacesTableName());
}

async function readDdbProjectById(id: string): Promise<ProjectRecord | null> {
  return readDdbProjectByIdStore(spacesTableName(), id);
}

async function readProjectByIdResilient(id: string): Promise<ProjectRecord | null> {
  if (!isSpacesDdbEnabled()) {
    return (await readProjects()).find((row) => row.id === id) ?? null;
  }

  try {
    const direct = await readDdbProjectById(id);
    if (direct) return direct;
  } catch (error) {
    console.error(`[spaces] direct Dynamo read failed for project ${id}:`, error);
  }

  try {
    return (await readProjects()).find((row) => row.id === id) ?? null;
  } catch (error) {
    console.error(`[spaces] fallback scan read failed for project ${id}:`, error);
    return null;
  }
}

async function writeDdbProject(
  project: ProjectRecord,
  options?: { allowProjectIdMetaScan?: boolean },
): Promise<void> {
  await upsertDdbProjectStore(spacesTableName(), project, options);
}

async function deleteDdbProject(id: string): Promise<void> {
  await deleteDdbProjectStore(spacesTableName(), id);
}

async function readProjects(): Promise<ProjectRecord[]> {
  if (isSpacesDdbEnabled()) {
    const now = Date.now();
    if (spacesGetCache && spacesGetCache.expiresAt > now) {
      return spacesGetCache.rows;
    }
    const rows = await scanDdbProjects();
    spacesGetCache = { rows, expiresAt: now + SPACES_GET_CACHE_TTL_MS };
    return rows;
  }
  return readJsonStore(spacesStore);
}

async function readProjectsMeta(): Promise<Array<ReturnType<typeof projectToMeta>>> {
  if (isSpacesDdbEnabled()) {
    const now = Date.now();
    if (spacesMetaGetCache && spacesMetaGetCache.expiresAt > now) {
      return spacesMetaGetCache.rows;
    }
    const rows = (await scanDdbProjectsMeta()).map(projectToMeta);
    spacesMetaGetCache = { rows, expiresAt: now + SPACES_GET_CACHE_TTL_MS };
    return rows;
  }
  return (await readProjects()).map(projectToMeta);
}

function projectToMeta(project: ProjectRecord | ProjectListItem) {
  const spacesCount =
    "spaces" in project
      ? Object.keys(project.spaces || {}).length
      : Math.max(0, project.spacesCount ?? 0);
  return {
    id: project.id,
    name: project.name,
    rootSpaceId: project.rootSpaceId,
    metadata: project.metadata ?? {},
    ownerUserEmail: project.ownerUserEmail,
    ownerUserName: project.ownerUserName,
    ownerUserImage: project.ownerUserImage,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    spacesCount,
  };
}

async function writeProjects(
  updater: (projects: ProjectRecord[]) => Promise<ProjectRecord[]> | ProjectRecord[],
): Promise<ProjectRecord[]> {
  if (isSpacesDdbEnabled()) {
    throw new Error("writeProjects is not supported with DynamoDB enabled");
  }
  return updateJsonStore(spacesStore, updater);
}

function normalizeOwnerEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function projectBelongsToOwner(
  project: Pick<ProjectRecord, "ownerUserEmail">,
  ownerEmail: string,
): boolean {
  return normalizeOwnerEmail(project.ownerUserEmail) === ownerEmail;
}

function devBypassUserFromRequest(req: Request): AuthUser | null {
  if (process.env.NODE_ENV === "production") return null;
  const code = req.headers.get("x-foldder-dev-passcode");
  if (code !== "6666") return null;
  return {
    email: "dev-bypass@local.foldder",
    name: "Local Bypass",
    image: null,
  };
}

async function requireAuthUser(req: Request): Promise<
  { ok: true; user: AuthUser } | { ok: false; response: NextResponse }
> {
  const bypass = devBypassUserFromRequest(req);
  if (bypass) {
    return { ok: true, user: bypass };
  }
  const session = await auth();
  const email = normalizeOwnerEmail(session?.user?.email);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return {
    ok: true,
    user: {
      email,
      name: session?.user?.name ?? null,
      image: session?.user?.image ?? null,
    },
  };
}

export async function GET(req: Request) {
  try {
    const authState = await requireAuthUser(req);
    if (!authState.ok) return authState.response;
    const ownerEmail = authState.user.email;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const wantsFull = searchParams.get("full") === "1";
    const wantsMeta = searchParams.get("meta") === "1";
    const limitRaw = Number(searchParams.get("limit") ?? "");
    const cursor = searchParams.get("cursor");

    if (id && id.length > 0) {
      const project = await readProjectByIdResilient(id);
      if (!project || !projectBelongsToOwner(project, ownerEmail)) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      return NextResponse.json(project, {
        headers: {
          "Cache-Control": `public, s-maxage=${SPACES_DETAIL_EDGE_S_MAXAGE_SECONDS}, stale-while-revalidate=${SPACES_DETAIL_EDGE_STALE_SECONDS}`,
        },
      });
    }

    if (wantsFull && !wantsMeta) {
      const rows = (await readProjects()).filter((p) =>
        projectBelongsToOwner(p, ownerEmail),
      );
      return NextResponse.json(rows);
    }

    const meta = (await readProjectsMeta())
      .filter((p) => projectBelongsToOwner(p, ownerEmail))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (Number.isFinite(limitRaw) && limitRaw > 0) {
      const cursorIdx = cursor ? meta.findIndex((row) => row.id === cursor) : -1;
      const start = cursorIdx >= 0 ? cursorIdx + 1 : 0;
      const items = meta.slice(start, start + limitRaw);
      const nextCursor = items.length === limitRaw ? items[items.length - 1]?.id ?? null : null;
      return NextResponse.json(
        { items, nextCursor },
        {
          headers: {
            "Cache-Control": `public, s-maxage=${SPACES_META_EDGE_S_MAXAGE_SECONDS}, stale-while-revalidate=${SPACES_META_EDGE_STALE_SECONDS}`,
          },
        },
      );
    }
    return NextResponse.json(meta, {
      headers: {
        "Cache-Control": `public, s-maxage=${SPACES_META_EDGE_S_MAXAGE_SECONDS}, stale-while-revalidate=${SPACES_META_EDGE_STALE_SECONDS}`,
      },
    });
  } catch (error) {
    console.error("[spaces][GET] failed:", error);
    return NextResponse.json({ error: "Failed to read projects" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authState = await requireAuthUser(req);
    if (!authState.ok) return authState.response;
    const ownerEmail = authState.user.email;
    const ownerName = authState.user.name;
    const ownerImage = authState.user.image;

    const body = (await req.json()) as ProjectBody;

    if (isSpacesDdbEnabled()) {
      const { id, name, rootSpaceId, spaces, metadata } = body;
      if (id) {
        const existing = await readProjectByIdResilient(id);
        if (!existing || !projectBelongsToOwner(existing, ownerEmail)) {
          return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const savedProject: ProjectRecord = {
          ...existing,
          name: name || existing.name,
          rootSpaceId: rootSpaceId || existing.rootSpaceId,
          spaces: spaces || existing.spaces,
          metadata: metadata || existing.metadata,
          ownerUserEmail: existing.ownerUserEmail || ownerEmail,
          ownerUserName: ownerName,
          ownerUserImage: ownerImage,
          updatedAt: new Date().toISOString(),
        };
        await writeDdbProject(savedProject);
        spacesGetCache = null;
        spacesMetaGetCache = null;
        return NextResponse.json(savedProject);
      }

      const projectId = uuidv4();
      const initialSpaceId = uuidv4();
      const resolvedRoot =
        rootSpaceId != null && rootSpaceId !== ""
          ? rootSpaceId
          : spaces && typeof spaces === "object" && "root" in spaces
            ? "root"
            : initialSpaceId;

      const timestamp = new Date().toISOString();
      const newProject: ProjectRecord = {
        id: projectId,
        name: name || "New Project",
        rootSpaceId: resolvedRoot,
        spaces:
          spaces || {
            [initialSpaceId]: {
              id: initialSpaceId,
              name: "Main Space",
              nodes: [],
              edges: [],
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          },
        metadata: metadata ?? {},
        ownerUserEmail: ownerEmail,
        ownerUserName: ownerName,
        ownerUserImage: ownerImage,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await writeDdbProject(newProject, { allowProjectIdMetaScan: false });
      spacesGetCache = null;
      spacesMetaGetCache = null;
      return NextResponse.json(newProject);
    }

    return await runSpacesDbExclusive(async () => {
      let projectFound = true;
      let savedProject: ProjectRecord | null = null;
      const projects = await writeProjects((currentProjects) => {
        const projectsCopy = [...currentProjects];
        const { id, name, rootSpaceId, spaces, metadata } = body;

        if (id) {
          const index = projectsCopy.findIndex((project) => project.id === id);
          if (index === -1 || !projectBelongsToOwner(projectsCopy[index], ownerEmail)) {
            projectFound = false;
            return projectsCopy;
          }

          projectsCopy[index] = {
            ...projectsCopy[index],
            name: name || projectsCopy[index].name,
            rootSpaceId: rootSpaceId || projectsCopy[index].rootSpaceId,
            spaces: spaces || projectsCopy[index].spaces,
            metadata: metadata || projectsCopy[index].metadata,
            ownerUserEmail: projectsCopy[index].ownerUserEmail || ownerEmail,
            ownerUserName: ownerName,
            ownerUserImage: ownerImage,
            updatedAt: new Date().toISOString(),
          };
          savedProject = projectsCopy[index];
          return projectsCopy;
        }

        const projectId = uuidv4();
        const initialSpaceId = uuidv4();
        const resolvedRoot =
          rootSpaceId != null && rootSpaceId !== ""
            ? rootSpaceId
            : spaces && typeof spaces === "object" && "root" in spaces
              ? "root"
              : initialSpaceId;

        const timestamp = new Date().toISOString();
        const myProjectsCount = projectsCopy.filter((p) =>
          projectBelongsToOwner(p, ownerEmail),
        ).length;
        const newProject: ProjectRecord = {
          id: projectId,
          name: name || `New Project ${myProjectsCount + 1}`,
          rootSpaceId: resolvedRoot,
          spaces:
            spaces || {
              [initialSpaceId]: {
                id: initialSpaceId,
                name: "Main Space",
                nodes: [],
                edges: [],
                createdAt: timestamp,
                updatedAt: timestamp,
              },
          },
          metadata: metadata ?? {},
          ownerUserEmail: ownerEmail,
          ownerUserName: ownerName,
          ownerUserImage: ownerImage,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        projectsCopy.push(newProject);
        savedProject = newProject;
        return projectsCopy;
      });

      if (!projectFound) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

    spacesGetCache = null;
    spacesMetaGetCache = null;
      const fallback = projects[projects.length - 1] ?? null;
      return NextResponse.json(savedProject ?? fallback);
    });
  } catch (error) {
    console.error("Save error:", error);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const authState = await requireAuthUser(req);
    if (!authState.ok) return authState.response;
    const ownerEmail = authState.user.email;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id || id.length === 0) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (isSpacesDdbEnabled()) {
      const projectToDelete = await readProjectByIdResilient(id);
      if (!projectToDelete || !projectBelongsToOwner(projectToDelete, ownerEmail)) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      if (projectToDelete) {
        const s3Keys = collectS3KeysFromProjectSpaces(
          (projectToDelete.spaces || {}) as Record<string, unknown>,
        );
        for (const key of s3Keys) {
          try {
            await deleteFromS3(key);
          } catch (error) {
            console.error(`[Cleanup] Failed to remove ${key}:`, error);
          }
        }
      }

      await deleteDdbProject(id);
      spacesGetCache = null;
      spacesMetaGetCache = null;
      return NextResponse.json({ ok: true, id });
    }

    return await runSpacesDbExclusive(async () => {
      const projects = await readProjects();
      const projectToDelete = projects.find((project) => project.id === id);

      if (!projectToDelete || !projectBelongsToOwner(projectToDelete, ownerEmail)) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      if (projectToDelete) {
        console.log(`[Cleanup] Deleting project "${projectToDelete.name}"...`);

        const s3Keys = collectS3KeysFromProjectSpaces(
          (projectToDelete.spaces || {}) as Record<string, unknown>,
        );

        if (s3Keys.length > 0) {
          console.log(`[Cleanup] Found ${s3Keys.length} assets across all spaces to remove from S3.`);
          for (const key of s3Keys) {
            try {
              await deleteFromS3(key);
              console.log(`[Cleanup] Successfully removed: ${key}`);
            } catch (error) {
              console.error(`[Cleanup] Failed to remove ${key}:`, error);
            }
          }
        }
      }

      const filtered = await writeProjects((currentProjects) =>
        currentProjects.filter((project) => project.id !== id),
      );
      spacesGetCache = null;
      return NextResponse.json({ ok: true, id, remaining: filtered.length });
    });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
