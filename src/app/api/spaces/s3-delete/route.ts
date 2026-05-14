import { NextRequest, NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

/**
 * Direct S3 deletion is intentionally disabled for regular project routes.
 *
 * Product policy:
 * - user-owned media is physically deleted when the whole project is deleted
 *   through DELETE /api/spaces;
 * - manual object deletion is only available through the admin manager.
 */
export async function POST(req: NextRequest) {
  const authState = await requireSpacesAuthUser(req);
  if (!authState.ok) return authState.response;

  return NextResponse.json(
    {
      deleted: 0,
      disabled: true,
      error:
        "Direct S3 deletion is disabled. Delete the project or use the admin manager.",
    },
    { status: 410 },
  );
}
