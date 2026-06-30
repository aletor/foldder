import { NextResponse } from "next/server";
import { findPopulateShareByToken, incrementPopulateShareVisits } from "@/lib/populate-share-db";
import { populateShareAccessError } from "@/lib/populate-share-access";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { token?: string };
    if (!body.token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const row = await findPopulateShareByToken(body.token);
    const access = populateShareAccessError(row);
    if (access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const visits = await incrementPopulateShareVisits(body.token);
    return NextResponse.json({ ok: true, visits });
  } catch (e) {
    console.error("[populate-share/visit] failed:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
