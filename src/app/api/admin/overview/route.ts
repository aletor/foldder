import path from "path";
import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { isDynamoEnabled } from "@/lib/dynamo-utils";
import { readJsonStore } from "@/lib/json-persistence";
import { getUsageDeepReportSince } from "@/lib/api-usage";
import { getApiServiceControls } from "@/lib/api-usage-controls";
import { USAGE_PERIOD_START_ISO } from "@/lib/usage-constants";
import {
  AWS_CLOUDWATCH_LOGS_INGEST_USD_PER_GB,
  AWS_CLOUDWATCH_LOGS_STORAGE_USD_PER_GB_MONTH,
  AWS_CODEBUILD_GENERAL1_SMALL_USD_PER_MINUTE,
  AWS_ECR_PRIVATE_STORAGE_USD_PER_GB_MONTH,
  AWS_FARGATE_US_EAST_1_GB_SECOND,
  AWS_FARGATE_US_EAST_1_VCPU_SECOND,
  AWS_S3_STANDARD_USD_PER_GB_MONTH,
} from "@/lib/pricing-config";
import {
  collectS3KeysFromProjectSpaces,
  collectS3KeysFromValue,
} from "@/lib/s3-media-hydrate";
import {
  readAllDdbProjects as readAllDdbProjectsStore,
  type ProjectRecord,
} from "@/lib/spaces-dynamo-store";
import { readAllSpacesV2Projects } from "@/lib/spaces-v2-store";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";

export const runtime = "nodejs";

const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";
const SPACES_V2_DDB_TABLE_ENV = "FOLDDER_SPACES_V2_DDB_TABLE";
const KNOWLEDGE_PREFIX = "knowledge-files/";
const LIST_MAX_KEYS = 1000;
const SESSION_GAP_MS = 45 * 60 * 1000;
const SESSION_BASE_MINUTES = 5;
const SESSION_GAP_CAP_MINUTES = 90;
const ONLINE_WINDOW_MS = 10 * 60 * 1000;
const CALENDAR_DAYS = 42;

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

type AdminUser = {
  email: string;
  name: string | null;
  image: string | null;
  projectCount: number;
  fileCount: number;
  totalBytes: number;
  nodeCount: number;
  lastActiveAt: string | null;
  sessionCount: number;
  estimatedMinutes: number;
};

type AdminProject = {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string | null;
  ownerImage: string | null;
  createdAt: string;
  updatedAt: string;
  spacesCount: number;
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  totalBytes: number;
  topNodeTypes: Array<{ type: string; count: number }>;
};

type AdminNodeUsage = {
  type: string;
  count: number;
  projectCount: number;
  userCount: number;
};

type AdminFlowUsage = {
  from: string;
  to: string;
  count: number;
};

type AdminFile = {
  key: string;
  name: string;
  folder: string;
  type: string;
  size: number;
  lastModified: string | null;
  spaceId: string | null;
  projectIds: string[];
  projectNames: string[];
  ownerEmails: string[];
  orphan: boolean;
};

type AdminCalendarDay = {
  day: string;
  activeUsers: number;
  events: number;
  sessions: number;
};

type AdminCostComponent = {
  id: string;
  label: string;
  category: "measured" | "estimated" | "check";
  status: "measured" | "estimated" | "configured" | "not_tracked";
  usage: string;
  costUsd: number;
  period: "period" | "monthly" | "per_build" | "variable";
  note: string;
};

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function isSpacesDdbEnabled(): boolean {
  return isDynamoEnabled(SPACES_DDB_TABLE_ENV);
}

function isSpacesV2Enabled(): boolean {
  return isDynamoEnabled(SPACES_V2_DDB_TABLE_ENV);
}

function spacesTableName(): string {
  return process.env[SPACES_DDB_TABLE_ENV]?.trim() || "";
}

function spacesV2TableName(): string {
  return process.env[SPACES_V2_DDB_TABLE_ENV]?.trim() || "";
}

function isAdminUser(email: string): boolean {
  const configured = (
    process.env.FOLDDER_ADMIN_EMAILS ||
    process.env.ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((s) => normalizeEmail(s))
    .filter(Boolean);

  if (configured.length === 0) return false;
  return configured.includes(email);
}

async function ensureAdmin(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isAdminUser(email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}

async function readProjects(): Promise<ProjectRecord[]> {
  if (isSpacesV2Enabled()) {
    return readAllSpacesV2Projects(spacesV2TableName());
  }
  if (isSpacesDdbEnabled()) {
    return readAllDdbProjectsStore(spacesTableName());
  }
  return readJsonStore(spacesStore);
}

async function listAllKnowledgeObjects(): Promise<
  Array<{ key: string; size: number; lastModified: string | null }>
> {
  const out: Array<{ key: string; size: number; lastModified: string | null }> =
    [];
  let token: string | undefined;

  do {
    const res = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: KNOWLEDGE_PREFIX,
        ContinuationToken: token,
        MaxKeys: LIST_MAX_KEYS,
      }),
    );
    for (const row of res.Contents ?? []) {
      if (!row.Key) continue;
      out.push({
        key: row.Key,
        size: Number(row.Size ?? 0),
        lastModified: row.LastModified ? row.LastModified.toISOString() : null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out;
}

function getTypeFromKey(key: string): string {
  const filename = key.split("/").pop() || key;
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) return "unknown";
  return filename.slice(idx + 1).toLowerCase();
}

function getSpaceIdFromKey(key: string): string | null {
  const m = key.match(/^knowledge-files\/spaces\/([^/]+)\//);
  return m?.[1] ?? null;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function bytesToGb(bytes: number): number {
  return Math.max(0, bytes) / 1024 / 1024 / 1024;
}

function estimateSessionsAndMinutes(isoDates: string[]): {
  sessionCount: number;
  estimatedMinutes: number;
} {
  const sorted = isoDates
    .map((v) => new Date(v).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (sorted.length === 0) return { sessionCount: 0, estimatedMinutes: 0 };

  let sessions = 1;
  let minutes = SESSION_BASE_MINUTES;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > SESSION_GAP_MS) {
      sessions += 1;
      minutes += SESSION_BASE_MINUTES;
    } else {
      minutes += Math.min(
        SESSION_GAP_CAP_MINUTES,
        Math.max(1, Math.round(gap / 60000)),
      );
    }
  }
  return { sessionCount: sessions, estimatedMinutes: minutes };
}

export async function GET() {
  try {
    const guard = await ensureAdmin();
    if (!guard.ok) return guard.response;

    const [projects, s3Objects, apiUsage, apiControls] = await Promise.all([
      readProjects(),
      listAllKnowledgeObjects(),
      getUsageDeepReportSince(USAGE_PERIOD_START_ISO),
      getApiServiceControls(),
    ]);

    const projectNameById = new Map<string, string>();
    const projectOwnerById = new Map<string, string>();
    const projectIdsBySpaceId = new Map<string, Set<string>>();
    const projectIdsByReferencedKey = new Map<string, Set<string>>();

    const projectNodeCountById = new Map<string, number>();
    const projectEdgeCountById = new Map<string, number>();
    const projectNodeTypeCountById = new Map<string, Map<string, number>>();
    const nodeUsageByType = new Map<
      string,
      { count: number; projects: Set<string>; users: Set<string> }
    >();
    const flowUsage = new Map<string, number>();

    for (const project of projects) {
      const ownerEmail = normalizeEmail(project.ownerUserEmail) || "unknown@local";
      projectNameById.set(project.id, project.name);
      projectOwnerById.set(project.id, ownerEmail);

      const nodeTypeMap = new Map<string, number>();
      let nodesTotal = 0;
      let edgesTotal = 0;

      for (const [spaceId, space] of Object.entries(project.spaces || {})) {
        if (spaceId && spaceId !== "root") {
          const bucket = projectIdsBySpaceId.get(spaceId) ?? new Set<string>();
          bucket.add(project.id);
          projectIdsBySpaceId.set(spaceId, bucket);
        }

        const nodes = Array.isArray(space.nodes) ? space.nodes : [];
        const edges = Array.isArray(space.edges) ? space.edges : [];

        nodesTotal += nodes.length;
        edgesTotal += edges.length;

        const typeByNodeId = new Map<string, string>();
        for (const node of nodes as Array<{ id?: string; type?: string }>) {
          const type = node.type || "unknown";
          const id = node.id || "";
          if (id) typeByNodeId.set(id, type);
          nodeTypeMap.set(type, (nodeTypeMap.get(type) ?? 0) + 1);
          const usage = nodeUsageByType.get(type) ?? {
            count: 0,
            projects: new Set<string>(),
            users: new Set<string>(),
          };
          usage.count += 1;
          usage.projects.add(project.id);
          usage.users.add(ownerEmail);
          nodeUsageByType.set(type, usage);
        }

        for (const edge of edges as Array<{ source?: string; target?: string }>) {
          const from = edge.source ? typeByNodeId.get(edge.source) || "unknown" : "unknown";
          const to = edge.target ? typeByNodeId.get(edge.target) || "unknown" : "unknown";
          const key = `${from}=>${to}`;
          flowUsage.set(key, (flowUsage.get(key) ?? 0) + 1);
        }
      }

      projectNodeCountById.set(project.id, nodesTotal);
      projectEdgeCountById.set(project.id, edgesTotal);
      projectNodeTypeCountById.set(project.id, nodeTypeMap);

      const projectS3Keys = new Set([
        ...collectS3KeysFromProjectSpaces(project.spaces || {}),
        ...collectS3KeysFromValue(project.metadata || {}),
      ]);
      for (const key of projectS3Keys) {
        const bucket = projectIdsByReferencedKey.get(key) ?? new Set<string>();
        bucket.add(project.id);
        projectIdsByReferencedKey.set(key, bucket);
      }
    }

    const files: AdminFile[] = s3Objects.map((row) => {
      const ids = new Set<string>(projectIdsByReferencedKey.get(row.key) ?? []);
      const spaceId = getSpaceIdFromKey(row.key);
      if (spaceId && spaceId !== "orphan") {
        for (const pid of projectIdsBySpaceId.get(spaceId) ?? []) ids.add(pid);
      }
      const projectIds = [...ids];
      const ownerEmails = [...new Set(projectIds.map((pid) => projectOwnerById.get(pid) || "unknown@local"))];
      return {
        key: row.key,
        name: row.key.split("/").pop() || row.key,
        folder: row.key.includes("/") ? row.key.slice(0, row.key.lastIndexOf("/")) : "(raíz)",
        type: getTypeFromKey(row.key),
        size: row.size,
        lastModified: row.lastModified,
        spaceId,
        projectIds,
        projectNames: projectIds.map((pid) => projectNameById.get(pid) || pid),
        ownerEmails,
        orphan: projectIds.length === 0,
      };
    });

    const fileBytesByProjectId = new Map<string, number>();
    const fileCountByProjectId = new Map<string, number>();
    for (const file of files) {
      for (const pid of file.projectIds) {
        fileBytesByProjectId.set(pid, (fileBytesByProjectId.get(pid) ?? 0) + file.size);
        fileCountByProjectId.set(pid, (fileCountByProjectId.get(pid) ?? 0) + 1);
      }
    }

    const adminProjects: AdminProject[] = projects
      .map((p) => {
        const typeMap = projectNodeTypeCountById.get(p.id) ?? new Map<string, number>();
        const topNodeTypes = [...typeMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([type, count]) => ({ type, count }));
        return {
          id: p.id,
          name: p.name,
          ownerEmail: normalizeEmail(p.ownerUserEmail) || "unknown@local",
          ownerName: p.ownerUserName ?? null,
          ownerImage: p.ownerUserImage ?? null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          spacesCount: Object.keys(p.spaces || {}).length,
          nodeCount: projectNodeCountById.get(p.id) ?? 0,
          edgeCount: projectEdgeCountById.get(p.id) ?? 0,
          fileCount: fileCountByProjectId.get(p.id) ?? 0,
          totalBytes: fileBytesByProjectId.get(p.id) ?? 0,
          topNodeTypes,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const usersMap = new Map<
      string,
      {
        name: string | null;
        image: string | null;
        projects: AdminProject[];
        updatedAtList: string[];
        activityEvents: string[];
      }
    >();

    for (const p of adminProjects) {
      const row = usersMap.get(p.ownerEmail) ?? {
        name: p.ownerName,
        image: p.ownerImage,
        projects: [],
        updatedAtList: [],
        activityEvents: [],
      };
      row.projects.push(p);
      row.updatedAtList.push(p.updatedAt);
      row.activityEvents.push(p.updatedAt);
      row.activityEvents.push(p.createdAt);
      usersMap.set(p.ownerEmail, row);
    }

    const userFileStats = new Map<string, { count: number; bytes: number }>();
    for (const f of files) {
      for (const email of f.ownerEmails) {
        const row = userFileStats.get(email) ?? { count: 0, bytes: 0 };
        row.count += 1;
        row.bytes += f.size;
        userFileStats.set(email, row);
      }
    }

    const users: AdminUser[] = [...usersMap.entries()]
      .map(([email, row]) => {
        const sessions = estimateSessionsAndMinutes(row.activityEvents);
        const projectNodeCount = row.projects.reduce((acc, p) => acc + p.nodeCount, 0);
        const fs = userFileStats.get(email) ?? { count: 0, bytes: 0 };
        return {
          email,
          name: row.name,
          image: row.image,
          projectCount: row.projects.length,
          fileCount: fs.count,
          totalBytes: fs.bytes,
          nodeCount: projectNodeCount,
          lastActiveAt: row.activityEvents.sort((a, b) => b.localeCompare(a))[0] ?? null,
          sessionCount: sessions.sessionCount,
          estimatedMinutes: sessions.estimatedMinutes,
        };
      })
      .sort((a, b) => (b.lastActiveAt || "").localeCompare(a.lastActiveAt || ""));

    const nowTs = Date.now();
    const onlineUsers = users.filter((u) => {
      if (!u.lastActiveAt) return false;
      const ts = new Date(u.lastActiveAt).getTime();
      if (!Number.isFinite(ts)) return false;
      return nowTs - ts <= ONLINE_WINDOW_MS;
    });

    const dayMap = new Map<string, { users: Set<string>; events: number; sessions: number }>();
    for (let i = CALENDAR_DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { users: new Set<string>(), events: 0, sessions: 0 });
    }

    for (const [email, row] of usersMap.entries()) {
      const dayEvents = new Map<string, string[]>();
      for (const iso of row.activityEvents) {
        const ts = new Date(iso).getTime();
        if (!Number.isFinite(ts)) continue;
        const key = new Date(ts).toISOString().slice(0, 10);
        if (!dayMap.has(key)) continue;
        const list = dayEvents.get(key) ?? [];
        list.push(iso);
        dayEvents.set(key, list);
        const slot = dayMap.get(key)!;
        slot.events += 1;
        slot.users.add(email);
      }
      for (const [key, dates] of dayEvents.entries()) {
        const sess = estimateSessionsAndMinutes(dates).sessionCount;
        const slot = dayMap.get(key);
        if (slot) slot.sessions += sess;
      }
    }

    const calendar: AdminCalendarDay[] = [...dayMap.entries()].map(([day, row]) => ({
      day,
      activeUsers: row.users.size,
      events: row.events,
      sessions: row.sessions,
    }));

    const nodeUsage: AdminNodeUsage[] = [...nodeUsageByType.entries()]
      .map(([type, row]) => ({
        type,
        count: row.count,
        projectCount: row.projects.size,
        userCount: row.users.size,
      }))
      .sort((a, b) => b.count - a.count);

    const flow: AdminFlowUsage[] = [...flowUsage.entries()]
      .map(([key, count]) => {
        const [from, to] = key.split("=>");
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 120);

    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    const renderFiles = files.filter((f) => f.key.includes("/renders/video-editor/"));
    const renderBytes = renderFiles.reduce((acc, f) => acc + f.size, 0);
    const orphanFiles = files.filter((f) => f.orphan);
    const orphanBytes = orphanFiles.reduce((acc, f) => acc + f.size, 0);
    const estimatedMinutes = users.reduce((acc, u) => acc + u.estimatedMinutes, 0);
    const sessions = users.reduce((acc, u) => acc + u.sessionCount, 0);
    const serviceCost = new Map(apiUsage.byService.map((row) => [row.serviceId, row]));
    const fargateUsage = serviceCost.get("aws-fargate-render");
    const infraServiceIds = [
      "aws-fargate-render",
      "aws-codebuild-render-worker",
      "aws-ecr-render-worker",
      "aws-cloudwatch-logs",
      "s3-assets",
      "s3-knowledge",
      "s3-render-storage",
    ] as const;
    const infraRows = infraServiceIds.map((id) => serviceCost.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row));
    const knownInfraUsd = roundUsd(infraRows.reduce((acc, row) => acc + row.costUsd, 0));
    const s3StorageMonthlyUsd = roundUsd(bytesToGb(totalBytes) * AWS_S3_STANDARD_USD_PER_GB_MONTH);
    const s3RenderStorageMonthlyUsd = roundUsd(bytesToGb(renderBytes) * AWS_S3_STANDARD_USD_PER_GB_MONTH);
    const operationalCosts = {
      generatedAt: new Date().toISOString(),
      pricingRegion: process.env.AWS_REGION?.trim() || "us-east-1",
      fargate: {
        configured: Boolean(process.env.AWS_ECS_CLUSTER && process.env.AWS_ECS_TASK_DEFINITION),
        cluster: process.env.AWS_ECS_CLUSTER || "",
        taskDefinition: process.env.AWS_ECS_TASK_DEFINITION || "",
        vcpu: 2,
        memoryGb: 4,
        minimumBilledSeconds: 60,
        vcpuSecondUsd: AWS_FARGATE_US_EAST_1_VCPU_SECOND,
        gbSecondUsd: AWS_FARGATE_US_EAST_1_GB_SECOND,
        renders: fargateUsage?.calls ?? 0,
        costUsd: fargateUsage?.costUsd ?? 0,
      },
      storage: {
        bucket: BUCKET_NAME,
        totalBytes,
        renderBytes,
        s3StandardUsdPerGbMonth: AWS_S3_STANDARD_USD_PER_GB_MONTH,
        estimatedMonthlyUsd: s3StorageMonthlyUsd,
        estimatedRenderMonthlyUsd: s3RenderStorageMonthlyUsd,
      },
      totals: {
        knownInfrastructureUsd: knownInfraUsd,
        estimatedMonthlyStorageUsd: s3StorageMonthlyUsd,
        estimatedKnownPlusMonthlyStorageUsd: roundUsd(knownInfraUsd + s3StorageMonthlyUsd),
      },
      components: [
        {
          id: "aws-fargate-render",
          label: "AWS Fargate · Render Video Editor",
          category: "measured",
          status: fargateUsage?.calls ? "measured" : "configured",
          usage: `${fargateUsage?.calls ?? 0} render(s) registrados`,
          costUsd: fargateUsage?.costUsd ?? 0,
          period: "period",
          note: "Se registra al terminar el job: 2 vCPU + 4 GB, Linux/x86, mínimo 60s.",
        },
        {
          id: "s3-storage",
          label: "AWS S3 · Storage total",
          category: "estimated",
          status: "estimated",
          usage: `${files.length} objeto(s) · ${Math.round(bytesToGb(totalBytes) * 1000) / 1000} GB`,
          costUsd: s3StorageMonthlyUsd,
          period: "monthly",
          note: "Estimación S3 Standard. No incluye requests ni transferencia.",
        },
        {
          id: "s3-render-storage",
          label: "AWS S3 · Renders Video Editor",
          category: "estimated",
          status: "estimated",
          usage: `${renderFiles.length} render object(s) · ${Math.round(bytesToGb(renderBytes) * 1000) / 1000} GB`,
          costUsd: s3RenderStorageMonthlyUsd,
          period: "monthly",
          note: "Subconjunto de S3 dedicado a outputs MP4, manifests y status de render.",
        },
        {
          id: "aws-ecr-render-worker",
          label: "AWS ECR · Imagen Docker render-worker",
          category: "check",
          status: "not_tracked",
          usage: "1 repositorio ECR esperado",
          costUsd: 0,
          period: "monthly",
          note: `No medido por la app todavía. Referencia: storage aprox. $${AWS_ECR_PRIVATE_STORAGE_USD_PER_GB_MONTH}/GB-mes.`,
        },
        {
          id: "aws-codebuild-render-worker",
          label: "AWS CodeBuild · Builds worker",
          category: "check",
          status: "not_tracked",
          usage: "Solo cuando reconstruyes/provisionas el worker",
          costUsd: 0,
          period: "per_build",
          note: `No medido por la app todavía. Referencia small Linux aprox. $${AWS_CODEBUILD_GENERAL1_SMALL_USD_PER_MINUTE}/min.`,
        },
        {
          id: "aws-cloudwatch-logs",
          label: "AWS CloudWatch · Logs Fargate/CodeBuild",
          category: "check",
          status: "not_tracked",
          usage: "Logs de worker y builds",
          costUsd: 0,
          period: "variable",
          note: `No medido por la app todavía. Referencia: ingest aprox. $${AWS_CLOUDWATCH_LOGS_INGEST_USD_PER_GB}/GB y storage $${AWS_CLOUDWATCH_LOGS_STORAGE_USD_PER_GB_MONTH}/GB-mes.`,
        },
        {
          id: "aws-data-transfer",
          label: "AWS Data transfer / descargas",
          category: "check",
          status: "not_tracked",
          usage: "Descargas de MP4 y assets desde S3",
          costUsd: 0,
          period: "variable",
          note: "No medido por la app todavía. Depende de tráfico saliente y región.",
        },
      ] satisfies AdminCostComponent[],
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      apiUsage,
      apiControls: Object.values(apiControls),
      operationalCosts,
      summary: {
        users: users.length,
        usersOnlineNow: onlineUsers.length,
        projects: adminProjects.length,
        files: files.length,
        orphanFiles: orphanFiles.length,
        totalBytes,
        orphanBytes,
        nodeInstances: nodeUsage.reduce((acc, n) => acc + n.count, 0),
        estimatedMinutes,
        sessions,
        apiCalls: apiUsage.totals.calls,
        apiCostUsd: apiUsage.totals.costUsd,
        apiTokens: apiUsage.totals.totalTokens,
        operationalCostUsd: operationalCosts.totals.estimatedKnownPlusMonthlyStorageUsd,
      },
      onlineUsers,
      calendar,
      users,
      projects: adminProjects,
      nodeUsage,
      flow,
      files,
    });
  } catch (error) {
    console.error("[admin][overview] failed:", error);
    return NextResponse.json({ error: "Failed to build admin overview" }, { status: 500 });
  }
}
