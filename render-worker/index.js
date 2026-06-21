import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { extname, join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  activeVisualClipForInterval,
  buildOverlayFiltersAtTime,
  mergeCompositionCutPoints,
  visualFilter,
  visualLayerIds,
} from "./composition-render.js";

const execFileAsync = promisify(execFile);

const region = process.env.AWS_REGION || "us-east-1";
const bucket = process.env.S3_BUCKET;
const renderId = process.env.RENDER_ID || randomUUID();
const manifestKey = process.env.RENDER_MANIFEST_S3_KEY;
const statusKey = process.env.RENDER_STATUS_S3_KEY;
const outputKey = process.env.RENDER_OUTPUT_S3_KEY;
const startedAt = process.env.RENDER_STARTED_AT || new Date().toISOString();
const usageUserEmail = process.env.RENDER_USAGE_USER_EMAIL || undefined;

const s3 = new S3Client({ region });

function requireEnv(value, name) {
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

async function getBuffer(key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error(`empty_s3_object:${key}`);
  return Buffer.from(bytes);
}

async function putJson(key, value) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(value, null, 2),
    ContentType: "application/json",
  }));
}

async function putStatus(status, extra = {}) {
  await putJson(statusKey, {
    renderId,
    status,
    progress: status === "rendering" ? 30 : status === "uploading" ? 85 : status === "ready" ? 100 : 0,
    startedAt,
    usageUserEmail,
    updatedAt: new Date().toISOString(),
    ...extra,
  });
  console.log(`[render-worker] ${status}`, extra);
}

function extractKnowledgeKey(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("knowledge-files/")) return trimmed;
  try {
    const url = new URL(trimmed, "http://foldder.local");
    const routeKey = url.pathname === "/api/spaces/s3-file" || url.pathname === "/api/spaces/s3-download"
      ? url.searchParams.get("key")?.trim()
      : "";
    if (routeKey?.startsWith("knowledge-files/")) return routeKey;
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const idx = path.indexOf("knowledge-files/");
    if (idx >= 0) return path.slice(idx);
  } catch {
    // fall through to repair heuristic
  }
  const repair = trimmed.match(/\/api\/spaces\/s3-fi-assets(?:%2F|\/)([^/%]+)(?:%2F|\/)(.+)$/i);
  if (repair) {
    const ownerHash = decodeURIComponent(repair[1] ?? "");
    const filename = decodeURIComponent((repair[2] ?? "").split("?")[0] ?? "");
    if (ownerHash && filename && !filename.includes("..")) {
      return `knowledge-files/user-assets/${ownerHash}/${filename}`;
    }
  }
  return null;
}

function safeExt(clip) {
  const source = clip.s3Key || clip.url || clip.assetId || "";
  const ext = extname(source.split("?")[0]).toLowerCase();
  if (ext && ext.length <= 6) return ext;
  if (clip.mediaType === "image") return ".png";
  if (clip.mediaType === "audio") return ".m4a";
  return ".mp4";
}

async function downloadClip(clip, dir) {
  const localPath = join(dir, `${String(clip.id).replace(/[^a-zA-Z0-9_-]/g, "_")}${safeExt(clip)}`);
  const key = clip.s3Key || extractKnowledgeKey(clip.assetId) || extractKnowledgeKey(clip.url);
  if (key) {
    await writeFile(localPath, await getBuffer(key));
    return { ...clip, localPath };
  }
  const direct = clip.url || clip.assetId;
  if (!direct || direct.startsWith("asset://")) throw new Error(`asset_not_resolvable:${clip.id}`);
  if (direct.startsWith("data:")) {
    await writeFile(localPath, Buffer.from(direct.split(",")[1] || "", "base64"));
    return { ...clip, localPath };
  }
  const response = await fetch(direct);
  if (!response.ok) throw new Error(`asset_fetch_failed:${clip.id}:${response.status}`);
  await writeFile(localPath, Buffer.from(await response.arrayBuffer()));
  return { ...clip, localPath };
}

function qualityArgs(manifest) {
  return manifest.settings.quality === "preview"
    ? ["-preset", "faster", "-crf", "23"]
    : ["-preset", "medium", "-crf", "19"];
}

async function renderBlack(manifest, duration, outputPath) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=black:s=${manifest.settings.width}x${manifest.settings.height}:r=${manifest.settings.fps}`,
    "-t", String(duration),
    "-an",
    "-c:v", "libx264",
    ...qualityArgs(manifest),
    "-pix_fmt", "yuv420p",
    outputPath,
  ]);
}

async function renderVisualClip(manifest, clip, outputPath, localCompositionTime = 0) {
  const duration = Math.max(0.1, clip.durationSeconds);
  const base = ["-y"];
  if (clip.mediaType === "video" && clip.trimStart) base.push("-ss", String(clip.trimStart));
  const hasImageMotion = !clip.composition && clip.mediaType === "image" && clip.motion && clip.motion !== "none";
  const input = clip.mediaType === "image"
    ? hasImageMotion
      ? ["-loop", "1", "-i", clip.localPath]
      : ["-loop", "1", "-t", String(duration), "-i", clip.localPath]
    : ["-i", clip.localPath, "-t", String(duration)];
  await execFileAsync("ffmpeg", [
    ...base,
    ...input,
    ...(hasImageMotion ? ["-t", String(duration)] : []),
    "-vf", visualFilter(manifest, clip, localCompositionTime),
    "-an",
    "-r", String(manifest.settings.fps),
    "-c:v", "libx264",
    ...qualityArgs(manifest),
    "-pix_fmt", "yuv420p",
    outputPath,
  ]);
}

async function applyOverlaysToSegment(manifest, segmentPath, globalSampleTime, dir, segmentIndex) {
  const overlayFilter = buildOverlayFiltersAtTime(
    manifest.overlayClips,
    globalSampleTime,
    manifest.settings.width,
    manifest.settings.height,
  );
  if (!overlayFilter) return segmentPath;
  const outputPath = join(dir, `segment_${String(segmentIndex).padStart(4, "0")}_overlays.mp4`);
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", segmentPath,
    "-vf", overlayFilter,
    "-an",
    "-c:v", "libx264",
    ...qualityArgs(manifest),
    "-pix_fmt", "yuv420p",
    outputPath,
  ]);
  return outputPath;
}

function concatEscape(path) {
  return path.replace(/'/g, "'\\''");
}

function assColor(hex, alpha = 0) {
  const clean = String(hex || "#ffffff").replace("#", "").padEnd(6, "f").slice(0, 6);
  const rr = clean.slice(0, 2);
  const gg = clean.slice(2, 4);
  const bb = clean.slice(4, 6);
  const aa = Math.max(0, Math.min(255, Math.round(alpha * 255))).toString(16).padStart(2, "0");
  return `&H${aa}${bb}${gg}${rr}`;
}

function assTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe - Math.floor(safe)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text) {
  return String(text || "").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");
}

function formatSrtTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function subtitleToSrt(document) {
  return (document.segments || [])
    .map((segment, index) => `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${String(segment.text || "").trim()}\n`)
    .join("\n");
}

function subtitleToVtt(document) {
  return `WEBVTT\n\n${(document.segments || [])
    .map((segment) => `${formatSrtTime(segment.start).replace(",", ".")} --> ${formatSrtTime(segment.end).replace(",", ".")}\n${String(segment.text || "").trim()}\n`)
    .join("\n")}`;
}

function subtitleToAss(document, width, height) {
  const style = document.style || {};
  const bg = style.background || {};
  const position = style.position || { y: 82 };
  const marginV = Math.max(20, Math.round((100 - (position.y || 82)) / 100 * height));
  const outline = bg.enabled ? 4 : 1;
  const shadow = bg.enabled ? 1 : 0;
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.fontFamily || "Arial"},${style.fontSize || 54},${assColor(style.color || "#ffffff")},${assColor(style.activeColor || "#ffe66d")},${assColor(bg.color || "#000000", 1 - (bg.opacity ?? 0.55))},&H00000000,${(style.fontWeight || 800) >= 700 ? -1 : 0},0,0,0,100,100,0,0,1,${outline},${shadow},2,80,80,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...(document.segments || []).map((segment) => `Dialogue: 0,${assTime(segment.start)},${assTime(segment.end)},Default,,0,0,0,,${escapeAssText(segment.text)}`),
    "",
  ].join("\n");
}

async function prepareSubtitleTrack(manifest, dir) {
  const track = (manifest.subtitleTracks || []).find((item) => item.enabled && item.burnIn && item.document);
  if (!track) return { assPath: null, exportKeys: [] };
  const document = { ...track.document, style: track.style || track.document.style };
  const ass = subtitleToAss(document, manifest.settings.width, manifest.settings.height);
  const assPath = join(dir, "subtitles.ass");
  await writeFile(assPath, ass, "utf8");
  const exportKeys = [];
  const baseKey = outputKey.replace(/\/output\.mp4$/, "");
  if (track.exportAss) {
    const key = `${baseKey}/subtitles.ass`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: ass, ContentType: "text/plain; charset=utf-8" }));
    exportKeys.push(key);
  }
  if (track.exportSrt) {
    const key = `${baseKey}/subtitles.srt`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: subtitleToSrt(document), ContentType: "text/plain; charset=utf-8" }));
    exportKeys.push(key);
  }
  if (track.exportVtt) {
    const key = `${baseKey}/subtitles.vtt`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: subtitleToVtt(document), ContentType: "text/vtt; charset=utf-8" }));
    exportKeys.push(key);
  }
  return { assPath, exportKeys };
}

function escapeSubtitleFilterPath(path) {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function burnSubtitles(manifest, visualPath, assPath, dir) {
  if (!assPath) return visualPath;
  const outputPath = join(dir, "visual_subtitled.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", visualPath,
    "-vf", `ass='${escapeSubtitleFilterPath(assPath)}'`,
    "-an",
    "-c:v", "libx264",
    ...qualityArgs(manifest),
    "-pix_fmt", "yuv420p",
    outputPath,
  ]);
  return outputPath;
}

async function renderVisualTrack(manifest, resolved, dir) {
  const visualClips = visualLayerIds(manifest)
    .flatMap((trackId) => resolved[trackId] ?? [])
    .filter((clip) => clip.mediaType === "image" || clip.mediaType === "video")
    .sort((a, b) => a.startTime - b.startTime);
  if (!visualClips.length) throw new Error("no_visual_clips");

  const cutPoints = Array.from(new Set([
    0,
    manifest.durationSeconds,
    ...visualClips.flatMap((clip) => mergeCompositionCutPoints(clip.startTime, clip.durationSeconds, clip.composition)),
    ...(manifest.overlayClips ?? []).flatMap((overlay) => mergeCompositionCutPoints(overlay.startTime, overlay.durationSeconds, overlay.composition)),
    ...visualClips.flatMap((clip) => [
      Math.max(0, clip.startTime),
      Math.min(manifest.durationSeconds, clip.startTime + Math.max(0.1, clip.durationSeconds)),
    ]),
    ...(manifest.overlayClips ?? []).flatMap((overlay) => [
      Math.max(0, overlay.startTime),
      Math.min(manifest.durationSeconds, overlay.startTime + Math.max(0.1, overlay.durationSeconds)),
    ]),
  ]))
    .filter((point) => point >= 0 && point <= manifest.durationSeconds)
    .sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < cutPoints.length - 1; i++) {
    const cursor = cutPoints[i] ?? 0;
    const nextCursor = cutPoints[i + 1] ?? cursor;
    const duration = Math.max(0, nextCursor - cursor);
    if (duration <= 0.02) continue;
    const clip = activeVisualClipForInterval(manifest, resolved, cursor);
    const sampleTime = cursor + duration / 2;
    let segmentPath;
    if (!clip) {
      segmentPath = join(dir, `segment_${String(segments.length).padStart(4, "0")}_black.mp4`);
      await renderBlack(manifest, duration, segmentPath);
    } else {
      const sourceOffset = Math.max(0, cursor - clip.startTime);
      const localCompositionTime = sourceOffset + duration / 2;
      segmentPath = join(dir, `segment_${String(segments.length).padStart(4, "0")}.mp4`);
      await renderVisualClip(manifest, {
        ...clip,
        durationSeconds: duration,
        trimStart: clip.mediaType === "video" ? Math.max(0, (clip.trimStart ?? 0) + sourceOffset) : clip.trimStart,
      }, segmentPath, localCompositionTime);
    }
    const withOverlays = await applyOverlaysToSegment(manifest, segmentPath, sampleTime, dir, segments.length);
    segments.push(withOverlays);
  }

  const list = join(dir, "segments.txt");
  await writeFile(list, segments.map((path) => `file '${concatEscape(path)}'`).join("\n"));
  const visualPath = join(dir, "visual.mp4");
  await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", visualPath]);
  return visualPath;
}

async function renderAudioTrack(manifest, resolved, dir) {
  const audio = Object.entries(resolved)
    .filter(([track]) => track !== "video")
    .flatMap(([, clips]) => clips)
    .filter((clip) => clip.mediaType === "audio" && (clip.volume ?? 1) > 0)
    .sort((a, b) => a.startTime - b.startTime);
  if (!audio.length) return null;
  const filters = [];
  audio.forEach((clip, index) => {
    const duration = Math.max(0.1, clip.durationSeconds);
    const fadeOutStart = Math.max(0, duration - Math.max(0, clip.fadeOutSeconds ?? 0));
    const chain = [
      `atrim=start=${Math.max(0, clip.trimStart ?? 0)}:duration=${duration}`,
      "asetpts=PTS-STARTPTS",
      `volume=${Math.max(0, Math.min(2, clip.volume ?? 1))}`,
      clip.fadeInSeconds ? `afade=t=in:st=0:d=${clip.fadeInSeconds}` : "",
      clip.fadeOutSeconds ? `afade=t=out:st=${fadeOutStart}:d=${clip.fadeOutSeconds}` : "",
      `adelay=${Math.round(clip.startTime * 1000)}:all=1`,
    ].filter(Boolean);
    filters.push(`[${index}:a]${chain.join(",")}[a${index}]`);
  });
  filters.push(`${audio.map((_, index) => `[a${index}]`).join("")}amix=inputs=${audio.length}:duration=longest:dropout_transition=0,atrim=start=0:duration=${manifest.durationSeconds},aformat=sample_rates=48000:channel_layouts=stereo[aout]`);
  const audioPath = join(dir, "audio.m4a");
  await execFileAsync("ffmpeg", [
    "-y",
    ...audio.flatMap((clip) => ["-i", clip.localPath]),
    "-filter_complex", filters.join(";"),
    "-map", "[aout]",
    "-c:a", "aac",
    "-b:a", manifest.settings.quality === "preview" ? "160k" : "320k",
    audioPath,
  ]);
  return audioPath;
}

async function main() {
  requireEnv(bucket, "S3_BUCKET");
  requireEnv(manifestKey, "RENDER_MANIFEST_S3_KEY");
  requireEnv(statusKey, "RENDER_STATUS_S3_KEY");
  requireEnv(outputKey, "RENDER_OUTPUT_S3_KEY");

  const dir = await mkdtemp(join(tmpdir(), `foldder-render-${renderId}-`));
  try {
    await putStatus("rendering", { progress: 15 });
    const manifest = JSON.parse((await getBuffer(manifestKey)).toString("utf8"));
    const resolvedEntries = await Promise.all(Object.entries(manifest.tracks).map(async ([track, clips]) => [
      track,
      await Promise.all(clips.map((clip) => downloadClip(clip, dir))),
    ]));
    const resolved = Object.fromEntries(resolvedEntries);
    await putStatus("rendering", { progress: 35 });
    const visualPathRaw = await renderVisualTrack(manifest, resolved, dir);
    const subtitleOutput = await prepareSubtitleTrack(manifest, dir);
    const visualPath = await burnSubtitles(manifest, visualPathRaw, subtitleOutput.assPath, dir);
    const audioPath = await renderAudioTrack(manifest, resolved, dir);
    const finalPath = join(dir, "output.mp4");
    const muxArgs = audioPath
      ? ["-y", "-i", visualPath, "-i", audioPath, "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", finalPath]
      : ["-y", "-i", visualPath, "-c", "copy", "-movflags", "+faststart", finalPath];
    await execFileAsync("ffmpeg", muxArgs);
    await putStatus("uploading", { progress: 85 });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: outputKey,
      Body: await readFile(finalPath),
      ContentType: "video/mp4",
      Metadata: {
        generatedFrom: "video-editor",
        renderId,
        durationSeconds: String(manifest.durationSeconds ?? ""),
        width: String(manifest.settings?.width ?? ""),
        height: String(manifest.settings?.height ?? ""),
        fps: String(manifest.settings?.fps ?? ""),
        createdAt: new Date().toISOString(),
      },
    }));
    await putStatus("ready", {
      progress: 100,
      outputAssetId: outputKey,
      s3Key: outputKey,
      subtitleExportKeys: subtitleOutput.exportKeys,
      finishedAt: new Date().toISOString(),
    });
    console.log(`[render-worker] complete ${renderId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "render_failed";
    await putStatus("error", { progress: 0, error: message, finishedAt: new Date().toISOString() });
    console.error("[render-worker] failed", error);
    process.exitCode = 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

void main();
