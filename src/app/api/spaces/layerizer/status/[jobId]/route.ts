import { NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { getLayerizerJob } from "@/lib/layerizer/layerizer-job-store";

export const maxDuration = 30;

/**
 * Estado del job (fallback de reconexión si el stream NDJSON se corta).
 * Fuente de verdad: registro del job en DynamoDB. Si DDB no está configurado, 404.
 */
export async function GET(req: Request, props: { params: Promise<{ jobId: string }> }) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;

    const { jobId } = await props.params;
    if (!jobId) return NextResponse.json({ error: "Job ID is required" }, { status: 400 });

    const job = await getLayerizerJob(jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.ownerEmail && job.ownerEmail !== usageUserEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ job });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
