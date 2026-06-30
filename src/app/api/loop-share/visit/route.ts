import { NextResponse } from "next/server";
import { incrementLoopShareVisits } from "@/lib/loop-share-db";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { token?: string };
    const token = body.token?.trim();
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    const visits = await incrementLoopShareVisits(token);
    if (visits == null) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ visits });
  } catch (error) {
    console.error("[loop-share/visit] failed:", error);
    return NextResponse.json({ error: "visit failed" }, { status: 500 });
  }
}
