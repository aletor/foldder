import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export type AdminAuthState =
  | { ok: true; email: string }
  | { ok: false; response: NextResponse };

export function normalizeAdminEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

export function isFoldderAdminEmail(email: string): boolean {
  const configured = (
    process.env.FOLDDER_ADMIN_EMAILS ||
    process.env.ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((value) => normalizeAdminEmail(value))
    .filter(Boolean);

  return configured.length > 0 && configured.includes(normalizeAdminEmail(email));
}

export async function requireFoldderAdmin(): Promise<AdminAuthState> {
  const session = await auth();
  const email = normalizeAdminEmail(session?.user?.email);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isFoldderAdminEmail(email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, email };
}
