import { randomUUID } from "crypto";
import { PutObjectCommand, GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";

import type { VideoEditorRenderManifest } from "@/app/spaces/video-editor/video-editor-render-types";
import { recordApiUsage } from "@/lib/api-usage";
import { estimateAwsFargateUsd } from "@/lib/pricing-config";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";
import { spacesOwnerHash, stableKnowledgeFileUrlFromKey } from "@/lib/spaces-access-control";

export type VideoEditorRenderJobStatus = {
  renderId: string;
  status: "idle" | "preparing" | "rendering" | "uploading" | "ready" | "error";
  progress?: number;
  manifestS3Key?: string;
  outputAssetId?: string;
  outputUrl?: string;
  s3Key?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  usageUserEmail?: string;
  usageRecordedAt?: string;
  usageEstimatedCostUsd?: number;
  usageBilledSeconds?: number;
};

type FargateConfig = {
  region: string;
  cluster: string;
  taskDefinition: string;
  containerName: string;
  subnets: string[];
  securityGroups: string[];
  assignPublicIp: "ENABLED" | "DISABLED";
  bucket: string;
};

function splitEnvList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function getVideoRenderBucket(): string {
  return process.env.S3_BUCKET_RENDERS?.trim() || process.env.AWS_S3_BUCKET_NAME?.trim() || BUCKET_NAME;
}

function getFargateConfig(): FargateConfig {
  const region = process.env.AWS_REGION?.trim() || "us-east-1";
  const cluster = process.env.AWS_ECS_CLUSTER?.trim() || "";
  const taskDefinition = process.env.AWS_ECS_TASK_DEFINITION?.trim() || "";
  const containerName = process.env.AWS_ECS_CONTAINER_NAME?.trim() || "render-worker";
  const subnets = splitEnvList(process.env.AWS_ECS_SUBNETS);
  const securityGroups = splitEnvList(process.env.AWS_ECS_SECURITY_GROUPS);
  const assignPublicIp = process.env.AWS_ECS_ASSIGN_PUBLIC_IP?.trim() === "DISABLED" ? "DISABLED" : "ENABLED";
  const bucket = getVideoRenderBucket();
  const missing: string[] = [];
  if (!cluster) missing.push("AWS_ECS_CLUSTER");
  if (!taskDefinition) missing.push("AWS_ECS_TASK_DEFINITION");
  if (!subnets.length) missing.push("AWS_ECS_SUBNETS");
  if (!securityGroups.length) missing.push("AWS_ECS_SECURITY_GROUPS");
  if (!bucket) missing.push("S3_BUCKET_RENDERS/AWS_S3_BUCKET_NAME");
  if (missing.length) {
    throw new Error(`fargate_not_configured:${missing.join(",")}`);
  }
  return { region, cluster, taskDefinition, containerName, subnets, securityGroups, assignPublicIp, bucket };
}

async function putRenderJson(bucket: string, key: string, value: unknown): Promise<void> {
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(value, null, 2),
    ContentType: "application/json",
  }));
}

async function readRenderJson<T>(bucket: string, key: string): Promise<T | null> {
  try {
    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) return null;
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
  } catch (error) {
    if (error instanceof NoSuchKey || (error as { name?: string })?.name === "NoSuchKey") return null;
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

export function renderJobKeys(renderId: string, userEmail?: string) {
  const ownerHash = userEmail ? spacesOwnerHash(userEmail) : "";
  const base = ownerHash
    ? `knowledge-files/user-assets/${ownerHash}/video-editor/renders/${renderId}`
    : `knowledge-files/renders/video-editor/${renderId}`;
  return {
    manifestS3Key: `${base}/manifest.json`,
    statusS3Key: `${base}/status.json`,
    outputS3Key: `${base}/output.mp4`,
  };
}

export async function createVideoEditorFargateRenderJob(
  manifest: VideoEditorRenderManifest,
  options: { userEmail?: string } = {},
): Promise<VideoEditorRenderJobStatus> {
  const config = getFargateConfig();
  const renderId = randomUUID();
  const keys = renderJobKeys(renderId, options.userEmail);
  const now = new Date().toISOString();
  const status: VideoEditorRenderJobStatus = {
    renderId,
    status: "preparing",
    progress: 5,
    manifestS3Key: keys.manifestS3Key,
    startedAt: now,
    updatedAt: now,
    usageUserEmail: options.userEmail,
  };
  await putRenderJson(config.bucket, keys.manifestS3Key, { ...manifest, renderId, outputS3Key: keys.outputS3Key });
  await putRenderJson(config.bucket, keys.statusS3Key, status);

  const ecs = new ECSClient({ region: config.region });
  const task = await ecs.send(new RunTaskCommand({
    cluster: config.cluster,
    taskDefinition: config.taskDefinition,
    launchType: "FARGATE",
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: config.subnets,
        securityGroups: config.securityGroups,
        assignPublicIp: config.assignPublicIp,
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: config.containerName,
          environment: [
            { name: "RENDER_ID", value: renderId },
            { name: "RENDER_MANIFEST_S3_KEY", value: keys.manifestS3Key },
            { name: "RENDER_STATUS_S3_KEY", value: keys.statusS3Key },
            { name: "RENDER_OUTPUT_S3_KEY", value: keys.outputS3Key },
            { name: "S3_BUCKET", value: config.bucket },
            { name: "AWS_REGION", value: config.region },
            { name: "RENDER_STARTED_AT", value: now },
            ...(options.userEmail ? [{ name: "RENDER_USAGE_USER_EMAIL", value: options.userEmail }] : []),
          ],
        },
      ],
    },
  }));
  const failure = task.failures?.[0];
  if (failure) {
    const errorStatus: VideoEditorRenderJobStatus = {
      ...status,
      status: "error",
      progress: 0,
      error: `${failure.arn || "ecs_failure"} ${failure.reason || ""}`.trim(),
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    await putRenderJson(config.bucket, keys.statusS3Key, errorStatus);
    throw new Error(errorStatus.error || "ecs_run_task_failed");
  }
  const renderingStatus: VideoEditorRenderJobStatus = {
    ...status,
    status: "rendering",
    progress: 10,
    updatedAt: new Date().toISOString(),
  };
  await putRenderJson(config.bucket, keys.statusS3Key, renderingStatus);
  return renderingStatus;
}

export async function getVideoEditorRenderStatus(renderId: string, userEmail?: string): Promise<VideoEditorRenderJobStatus | null> {
  const bucket = getVideoRenderBucket();
  const { statusS3Key } = renderJobKeys(renderId, userEmail);
  const status = await readRenderJson<VideoEditorRenderJobStatus>(bucket, statusS3Key);
  if (!status) return null;
  if (status.status === "ready" && status.s3Key) {
    return { ...status, outputUrl: stableKnowledgeFileUrlFromKey(status.s3Key) };
  }
  return status;
}

export async function markVideoEditorRenderUsageRecorded(status: VideoEditorRenderJobStatus): Promise<VideoEditorRenderJobStatus> {
  if (status.usageRecordedAt || !status.startedAt || !status.finishedAt) return status;
  if (status.status !== "ready" && status.status !== "error") return status;
  const started = new Date(status.startedAt).getTime();
  const finished = new Date(status.finishedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished <= started) return status;

  const runtimeSeconds = Math.max(1, (finished - started) / 1000);
  const billedSeconds = Math.max(60, Math.ceil(runtimeSeconds));
  const costUsd = estimateAwsFargateUsd({ runtimeSeconds, vcpu: 2, memoryGb: 4 });
  await recordApiUsage({
    provider: "aws",
    serviceId: "aws-fargate-render",
    route: "/api/video-editor/render",
    model: "fargate-linux-x86-2vcpu-4gb",
    operation: status.status === "ready" ? "render_complete" : "render_failed",
    userEmail: status.usageUserEmail,
    costUsd,
    metadata: {
      renderId: status.renderId,
      runtimeSeconds: Math.round(runtimeSeconds),
      billedSeconds,
      vcpu: 2,
      memoryGb: 4,
      status: status.status,
      s3Key: status.s3Key,
    },
    note: "Fargate render Video Editor: 2 vCPU + 4 GB, Linux/x86 us-east-1, mínimo 60s.",
  });

  const bucket = getVideoRenderBucket();
  const { statusS3Key } = renderJobKeys(status.renderId, status.usageUserEmail);
  const next: VideoEditorRenderJobStatus = {
    ...status,
    usageRecordedAt: new Date().toISOString(),
    usageEstimatedCostUsd: costUsd,
    usageBilledSeconds: billedSeconds,
  };
  await putRenderJson(bucket, statusS3Key, next);
  return next;
}
