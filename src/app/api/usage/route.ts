import { NextRequest, NextResponse } from "next/server";
import { aggregateUsageSince, DEFAULT_USAGE_SINCE_ISO } from "@/lib/api-usage";
import { listKnowledgeFilesStatsCached } from "@/lib/s3-knowledge-stats";

export async function GET(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam || DEFAULT_USAGE_SINCE_ISO;
  try {
    const [data, s3Documents] = await Promise.all([
      aggregateUsageSince(since),
      listKnowledgeFilesStatsCached().catch((err: unknown) => ({
        error: err instanceof Error ? err.message : "S3 list failed",
        prefix: "knowledge-files/",
        bucket: "",
        totalObjects: 0,
        totalBytes: 0,
        byType: [] as { typeLabel: string; count: number; bytes: number }[],
      })),
    ]);
    return NextResponse.json({
      ...data,
      s3Documents,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to read usage" }, { status: 500 });
  }
}
