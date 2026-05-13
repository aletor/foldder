import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { requireSpacesAuthUser, spacesOwnerHash } from "@/lib/spaces-access-control";
import { getPresignedUrl, uploadBufferToS3Key } from "@/lib/s3-utils";

export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

const MAX_UPLOAD_BYTES = 450 * 1024 * 1024;

/**
 * Usa `FFMPEG_PATH` si está definida; si no, `ffmpeg` del PATH.
 * No usamos @ffmpeg-installer: rompe el bundle de Next/Turbopack (imports anidados por SO).
 * En local: `brew install ffmpeg`. En producción: imagen Docker o runtime con ffmpeg instalado.
 */
function resolveFfmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

/**
 * Full HD máx., H.264 ~calidad media (~CRF 28 ≈ “60%” vs máxima calidad),
 * audio AAC. Salida MP4 faststart para streaming.
 */
async function transcodeToPresenterSpec(inputPath: string, outputPath: string): Promise<void> {
  const ffmpeg = resolveFfmpegPath();
  await execFileAsync(ffmpeg, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    "scale=w=1920:h=1080:force_original_aspect_ratio=decrease",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

export async function POST(req: Request) {
  let tmpIn: string | null = null;
  let tmpOut: string | null = null;
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    const id = randomUUID();
    tmpIn = join(tmpdir(), `pv-in-${id}`);
    tmpOut = join(tmpdir(), `pv-out-${id}.mp4`);
    await writeFile(tmpIn, buf);

    let outBuf: Buffer;
    let contentType = "video/mp4";
    let ext = "mp4";
    try {
      await transcodeToPresenterSpec(tmpIn, tmpOut);
      outBuf = await readFile(tmpOut);
    } catch (e) {
      console.error("[presenter-video-upload] transcode failed, uploading original bytes if possible", e);
      /** Sin ffmpeg: subir el archivo tal cual (p. ej. MP4 ya compatible) para no bloquear el flujo. */
      const mime = file.type || "";
      if (mime.includes("webm")) {
        ext = "webm";
        contentType = "video/webm";
      } else if (mime.includes("quicktime") || file.name?.toLowerCase().endsWith(".mov")) {
        ext = "mov";
        contentType = "video/quicktime";
      }
      outBuf = buf;
    }

    const key = `spaces/presenter-videos/${spacesOwnerHash(authState.user.email)}/${id}.${ext}`;
    await uploadBufferToS3Key(key, outBuf, contentType);
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-assets",
      route: "/api/spaces/presenter-video-upload",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: outBuf.length,
      metadata: { key, contentType },
    });
    const url = await getPresignedUrl(key);

    return NextResponse.json({ url, s3Key: key });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upload failed";
    console.error("[presenter-video-upload]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await Promise.all(
      [tmpIn, tmpOut].filter(Boolean).map(async (p) => {
        try {
          await unlink(p!);
        } catch {
          /* noop */
        }
      }),
    );
  }
}
