import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join, extname } from "path";
import { tmpdir } from "os";
import { promisify } from "util";

import { getFromS3, getPresignedUrl, uploadBufferToS3Key } from "@/lib/s3-utils";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import type { VideoEditorRenderClip, VideoEditorRenderManifest } from "@/app/spaces/video-editor/video-editor-render-types";
import { exportSubtitleDocumentToAss } from "@/app/spaces/video-editor/subtitle-utils";

const execFileAsync = promisify(execFile);

type ResolvedRenderClip = VideoEditorRenderClip & {
  localPath: string;
};

export type VideoEditorRenderResult = {
  renderId: string;
  status: "ready" | "error";
  outputAssetId?: string;
  outputUrl?: string;
  s3Key?: string;
  error?: string;
};

export function resolveFfmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

export async function assertFfmpegAvailable(ffmpegPath = resolveFfmpegPath()): Promise<void> {
  try {
    await execFileAsync(ffmpegPath, ["-version"]);
  } catch {
    throw new Error("ffmpeg_missing");
  }
}

function safeExtForClip(clip: VideoEditorRenderClip): string {
  const source = clip.s3Key || clip.url || clip.assetId;
  const ext = extname(source.split("?")[0] || "").toLowerCase();
  if (ext && ext.length <= 6) return ext;
  if (clip.mediaType === "image") return ".png";
  if (clip.mediaType === "audio") return ".m4a";
  return ".mp4";
}

function resolveClipS3Key(clip: VideoEditorRenderClip): string | null {
  if (clip.s3Key?.startsWith("knowledge-files/")) return clip.s3Key;
  if (clip.assetId?.startsWith("knowledge-files/")) return clip.assetId;
  if (clip.url) return tryExtractKnowledgeFilesKeyFromUrl(clip.url);
  if (clip.assetId) return tryExtractKnowledgeFilesKeyFromUrl(clip.assetId);
  return null;
}

async function downloadClipToFile(clip: VideoEditorRenderClip, dir: string): Promise<ResolvedRenderClip> {
  const outputPath = join(dir, `${clip.id.replace(/[^a-zA-Z0-9_-]/g, "_")}${safeExtForClip(clip)}`);
  const s3Key = resolveClipS3Key(clip);
  if (s3Key) {
    await writeFile(outputPath, await getFromS3(s3Key));
    return { ...clip, localPath: outputPath };
  }
  const direct = clip.url || clip.assetId;
  if (!direct || direct.startsWith("asset://")) {
    throw new Error(`asset_not_resolvable:${clip.id}`);
  }
  if (direct.startsWith("data:")) {
    const [, payload = ""] = direct.split(",");
    await writeFile(outputPath, Buffer.from(payload, "base64"));
    return { ...clip, localPath: outputPath };
  }
  if (!direct.startsWith("http")) {
    throw new Error(`asset_not_resolvable:${clip.id}`);
  }
  const response = await fetch(direct);
  if (!response.ok) {
    throw new Error(`asset_fetch_failed:${clip.id}:${response.status}`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return { ...clip, localPath: outputPath };
}

export async function resolveRenderAssets(manifest: VideoEditorRenderManifest, dir: string): Promise<Record<string, ResolvedRenderClip[]>> {
  const entries = await Promise.all(
    Object.entries(manifest.tracks).map(async ([track, clips]) => [
      track,
      await Promise.all(clips.map((clip) => downloadClipToFile(clip, dir))),
    ]),
  );
  return Object.fromEntries(entries) as Record<string, ResolvedRenderClip[]>;
}

function visualFilter(manifest: VideoEditorRenderManifest, clip: VideoEditorRenderClip): string {
  const { width, height, fps } = manifest.settings;
  if (clip.mediaType === "image" && clip.motion && clip.motion !== "none") {
    const frameCount = Math.max(1, Math.round(Math.max(0.1, clip.durationSeconds) * fps));
    const denominator = Math.max(1, frameCount - 1);
    const progress = `on/${denominator}`;
    const zoom = clip.motion === "slow_zoom_out"
      ? `max(1,1.12-0.12*${progress})`
      : clip.motion === "pan_left" || clip.motion === "pan_right"
        ? "1.08"
        : `min(1.12,1+0.12*${progress})`;
    const x = clip.motion === "pan_left"
      ? `(iw-iw/zoom)*(1-${progress})`
      : clip.motion === "pan_right"
        ? `(iw-iw/zoom)*${progress}`
        : "iw/2-(iw/zoom/2)";
    const y = "ih/2-(ih/zoom/2)";
    return `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,zoompan=z='${zoom}':x='${x}':y='${y}':d=${frameCount}:s=${width}x${height}:fps=${fps},setsar=1,format=yuv420p`;
  }
  if (clip.fitMode === "fit") {
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps},format=yuv420p`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p`;
}

function ffmpegQualityArgs(manifest: VideoEditorRenderManifest): string[] {
  return manifest.settings.quality === "preview"
    ? ["-preset", "faster", "-crf", "23"]
    : ["-preset", "medium", "-crf", "19"];
}

async function renderBlackSegment(manifest: VideoEditorRenderManifest, duration: number, outputPath: string): Promise<void> {
  const ffmpeg = resolveFfmpegPath();
  await execFileAsync(ffmpeg, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${manifest.settings.width}x${manifest.settings.height}:r=${manifest.settings.fps}`,
    "-t",
    String(duration),
    "-an",
    "-c:v",
    "libx264",
    ...ffmpegQualityArgs(manifest),
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}

async function renderVisualClipSegment(manifest: VideoEditorRenderManifest, clip: ResolvedRenderClip, outputPath: string): Promise<void> {
  const ffmpeg = resolveFfmpegPath();
  const duration = Math.max(0.1, clip.durationSeconds);
  const baseArgs = ["-y"];
  if (clip.mediaType === "video" && clip.trimStart) baseArgs.push("-ss", String(clip.trimStart));
  const hasImageMotion = clip.mediaType === "image" && Boolean(clip.motion && clip.motion !== "none");
  const inputArgs = clip.mediaType === "image"
    ? hasImageMotion
      ? ["-loop", "1", "-i", clip.localPath]
      : ["-loop", "1", "-t", String(duration), "-i", clip.localPath]
    : ["-i", clip.localPath, "-t", String(duration)];
  await execFileAsync(ffmpeg, [
    ...baseArgs,
    ...inputArgs,
    ...(hasImageMotion ? ["-t", String(duration)] : []),
    "-vf",
    visualFilter(manifest, clip),
    "-an",
    "-r",
    String(manifest.settings.fps),
    "-c:v",
    "libx264",
    ...ffmpegQualityArgs(manifest),
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}

function escapeConcatPath(path: string): string {
  return path.replace(/'/g, "'\\''");
}

function visualLayerIds(manifest: VideoEditorRenderManifest): string[] {
  const layers = manifest.layers?.filter((layer) => layer.kind === "visual" && !layer.hidden).sort((a, b) => a.order - b.order).map((layer) => layer.id);
  return layers?.length ? layers : ["video"];
}

function activeVisualClipForInterval(manifest: VideoEditorRenderManifest, resolved: Record<string, ResolvedRenderClip[]>, startTime: number): ResolvedRenderClip | undefined {
  const lookupTime = startTime + 0.001;
  for (const trackId of visualLayerIds(manifest)) {
    const clip = (resolved[trackId] ?? [])
      .filter((item) => item.mediaType === "image" || item.mediaType === "video")
      .sort((a, b) => a.startTime - b.startTime)
      .find((item) => item.startTime <= lookupTime && lookupTime < item.startTime + Math.max(0.01, item.durationSeconds));
    if (clip) return clip;
  }
  return undefined;
}

async function renderVisualTrack(manifest: VideoEditorRenderManifest, resolved: Record<string, ResolvedRenderClip[]>, dir: string): Promise<string> {
  const visualClips = visualLayerIds(manifest)
    .flatMap((trackId) => resolved[trackId] ?? [])
    .filter((clip) => clip.mediaType === "image" || clip.mediaType === "video")
    .sort((a, b) => a.startTime - b.startTime);
  if (!visualClips.length) throw new Error("no_visual_clips");
  const cutPoints = Array.from(new Set([
    0,
    manifest.durationSeconds,
    ...visualClips.flatMap((clip) => [
      Math.max(0, clip.startTime),
      Math.min(manifest.durationSeconds, clip.startTime + Math.max(0.1, clip.durationSeconds)),
    ]),
  ]))
    .filter((point) => point >= 0 && point <= manifest.durationSeconds)
    .sort((a, b) => a - b);
  const segmentPaths: string[] = [];
  for (let i = 0; i < cutPoints.length - 1; i++) {
    const cursor = cutPoints[i] ?? 0;
    const nextCursor = cutPoints[i + 1] ?? cursor;
    const duration = Math.max(0, nextCursor - cursor);
    if (duration <= 0.02) continue;
    const clip = activeVisualClipForInterval(manifest, resolved, cursor);
    if (!clip) {
      const gapPath = join(dir, `segment_${String(segmentPaths.length).padStart(4, "0")}_black.mp4`);
      await renderBlackSegment(manifest, duration, gapPath);
      segmentPaths.push(gapPath);
      continue;
    }
    const sourceOffset = Math.max(0, cursor - clip.startTime);
    const segmentPath = join(dir, `segment_${String(segmentPaths.length).padStart(4, "0")}.mp4`);
    await renderVisualClipSegment(manifest, {
      ...clip,
      durationSeconds: duration,
      trimStart: clip.mediaType === "video" ? Math.max(0, (clip.trimStart ?? 0) + sourceOffset) : clip.trimStart,
    }, segmentPath);
    segmentPaths.push(segmentPath);
  }
  const listPath = join(dir, "segments.txt");
  await writeFile(listPath, segmentPaths.map((path) => `file '${escapeConcatPath(path)}'`).join("\n"));
  const visualPath = join(dir, "visual.mp4");
  await execFileAsync(resolveFfmpegPath(), ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", visualPath]);
  return visualPath;
}

async function renderAudioTrack(manifest: VideoEditorRenderManifest, resolved: Record<string, ResolvedRenderClip[]>, dir: string): Promise<string | null> {
  const audioClips = Object.entries(resolved)
    .filter(([track]) => track !== "video")
    .flatMap(([, clips]) => clips)
    .filter((clip) => clip.mediaType === "audio" && (clip.volume ?? 1) > 0)
    .sort((a, b) => a.startTime - b.startTime);
  if (!audioClips.length) return null;
  const filterParts: string[] = [];
  audioClips.forEach((clip, index) => {
    const duration = Math.max(0.1, clip.durationSeconds);
    const fadeOutStart = Math.max(0, duration - Math.max(0, clip.fadeOutSeconds ?? 0));
    const filters = [
      `atrim=start=${Math.max(0, clip.trimStart ?? 0)}:duration=${duration}`,
      "asetpts=PTS-STARTPTS",
      `volume=${Math.max(0, Math.min(2, clip.volume ?? 1))}`,
      clip.fadeInSeconds ? `afade=t=in:st=0:d=${clip.fadeInSeconds}` : "",
      clip.fadeOutSeconds ? `afade=t=out:st=${fadeOutStart}:d=${clip.fadeOutSeconds}` : "",
      `adelay=${Math.round(clip.startTime * 1000)}:all=1`,
    ].filter(Boolean);
    filterParts.push(`[${index}:a]${filters.join(",")}[a${index}]`);
  });
  filterParts.push(`${audioClips.map((_, index) => `[a${index}]`).join("")}amix=inputs=${audioClips.length}:duration=longest:dropout_transition=0,atrim=start=0:duration=${manifest.durationSeconds},aformat=sample_rates=48000:channel_layouts=stereo[aout]`);
  const audioPath = join(dir, "audio.m4a");
  await execFileAsync(resolveFfmpegPath(), [
    "-y",
    ...audioClips.flatMap((clip) => ["-i", clip.localPath]),
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[aout]",
    "-c:a",
    "aac",
    "-b:a",
    manifest.settings.quality === "preview" ? "160k" : "320k",
    audioPath,
  ]);
  return audioPath;
}

async function muxFinalVideo(visualPath: string, audioPath: string | null, outputPath: string): Promise<void> {
  const args = audioPath
    ? ["-y", "-i", visualPath, "-i", audioPath, "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", outputPath]
    : ["-y", "-i", visualPath, "-c", "copy", "-movflags", "+faststart", outputPath];
  await execFileAsync(resolveFfmpegPath(), args);
}

function burnInSubtitleTrack(manifest: VideoEditorRenderManifest) {
  return manifest.subtitleTracks?.find((track) => track.enabled && track.burnIn && track.document?.segments?.length);
}

function escapeFfmpegFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function burnSubtitlesIntoVideo(manifest: VideoEditorRenderManifest, visualPath: string, dir: string): Promise<string> {
  const subtitleTrack = burnInSubtitleTrack(manifest);
  if (!subtitleTrack?.document) return visualPath;
  const assPath = join(dir, "subtitles.ass");
  const outputPath = join(dir, "visual_subtitled.mp4");
  const document = {
    ...subtitleTrack.document,
    mode: subtitleTrack.mode,
    style: subtitleTrack.style || subtitleTrack.document.style,
  };
  await writeFile(assPath, exportSubtitleDocumentToAss(document, manifest.settings.width, manifest.settings.height));
  await execFileAsync(resolveFfmpegPath(), [
    "-y",
    "-i",
    visualPath,
    "-vf",
    `subtitles='${escapeFfmpegFilterPath(assPath)}'`,
    "-an",
    "-c:v",
    "libx264",
    ...ffmpegQualityArgs(manifest),
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
  return outputPath;
}

export async function uploadRenderedVideoToS3(filePath: string, manifest: VideoEditorRenderManifest, renderId: string): Promise<{ s3Key: string; outputUrl: string }> {
  const buffer = await readFile(filePath);
  const key = `knowledge-files/renders/video-editor/${manifest.editorNodeId}/${renderId}.mp4`;
  await uploadBufferToS3Key(key, buffer, "video/mp4");
  return {
    s3Key: key,
    outputUrl: await getPresignedUrl(key),
  };
}

export async function renderVideoEditorTimeline(manifest: VideoEditorRenderManifest): Promise<VideoEditorRenderResult> {
  const renderId = randomUUID();
  const dir = await mkdtemp(join(tmpdir(), `foldder-video-editor-${renderId}-`));
  try {
    await assertFfmpegAvailable();
    if (!visualLayerIds(manifest).some((trackId) => (manifest.tracks[trackId] ?? []).some((clip) => clip.mediaType === "image" || clip.mediaType === "video"))) {
      throw new Error("no_visual_clips");
    }
    const resolved = await resolveRenderAssets(manifest, dir);
    const visualPath = await renderVisualTrack(manifest, resolved, dir);
    const finalVisualPath = await burnSubtitlesIntoVideo(manifest, visualPath, dir);
    const audioPath = await renderAudioTrack(manifest, resolved, dir);
    const finalPath = join(dir, "final.mp4");
    await muxFinalVideo(finalVisualPath, audioPath, finalPath);
    const uploaded = await uploadRenderedVideoToS3(finalPath, manifest, renderId);
    return {
      renderId,
      status: "ready",
      outputAssetId: uploaded.s3Key,
      outputUrl: uploaded.outputUrl,
      s3Key: uploaded.s3Key,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "render_failed";
    return {
      renderId,
      status: "error",
      error: message,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
