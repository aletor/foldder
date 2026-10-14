import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { spacesOwnerHash } from "@/lib/spaces-access-control";

export type VideoProviderJobStatus = "pending" | "finalizing" | "success" | "failed";

export type VideoProviderJob = {
  id: string;
  provider: "gemini" | "seedance";
  userEmail: string;
  status: VideoProviderJobStatus;
  error?: string;
  outputUrl?: string;
  outputKey?: string;
  createdAt: string;
  updatedAt: string;
  gemini?: {
    operation: unknown;
    modelId: string;
    durationSeconds: number;
    resolution: string;
    costUsd: number;
    usageUserEmail?: string;
    providerJobId: string;
  };
  seedance?: {
    taskId: string;
    base: string;
    model: string;
    durationSeconds: number;
    costUsd: number;
    usageUserEmail?: string;
    providerJobId: string;
  };
};

const memoryJobs = new Map<string, VideoProviderJob>();

export function isVideoProviderJobId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function videoProviderJobObjectKey(userEmail: string, jobId: string): string {
  if (!isVideoProviderJobId(jobId)) throw new Error("job id inválido");
  return `foldder-meta/video-jobs/${spacesOwnerHash(userEmail)}/${jobId}.json`;
}

export async function saveVideoProviderJob(job: VideoProviderJob): Promise<void> {
  const next = { ...job, updatedAt: new Date().toISOString() };
  const memoryKey = `${next.userEmail}\u0000${next.id}`;
  memoryJobs.set(memoryKey, next);
  try {
    await uploadBufferToS3Key(
      videoProviderJobObjectKey(next.userEmail, next.id),
      Buffer.from(JSON.stringify(next)),
      "application/json",
    );
  } catch (error) {
    if (process.env.NODE_ENV === "test") return;
    memoryJobs.delete(memoryKey);
    throw error;
  }
}

export async function readVideoProviderJob(userEmail: string, jobId: string): Promise<VideoProviderJob | null> {
  if (!isVideoProviderJobId(jobId)) return null;
  const cached = memoryJobs.get(`${userEmail}\u0000${jobId}`);
  if (cached) return cached;
  try {
    const raw = await getFromS3(videoProviderJobObjectKey(userEmail, jobId));
    const parsed = JSON.parse(raw.toString("utf8")) as VideoProviderJob;
    if (parsed.userEmail !== userEmail || parsed.id !== jobId) return null;
    memoryJobs.set(`${userEmail}\u0000${jobId}`, parsed);
    return parsed;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number }; name?: string })?.$metadata?.httpStatusCode;
    const name = (error as { name?: string }).name;
    if (status === 404 || name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}

/** Solo tests. */
export function resetVideoProviderJobsForTests(): void {
  memoryJobs.clear();
}
