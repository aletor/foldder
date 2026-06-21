/** @typedef {{ x:number,y:number,width:number,height:number,opacity:number,crop:{x:number,y:number,width:number,height:number} }} CompositionTransform */
/** @typedef {{ id:string,time:number,transform:CompositionTransform,easing:string }} CompositionKeyframe */
/** @typedef {{ keyframes: CompositionKeyframe[] }} VideoEditorComposition */

const DEFAULT_TRANSFORM = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  opacity: 1,
  crop: { x: 0, y: 0, width: 1, height: 1 },
};

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function easeProgress(t, easing) {
  const x = clamp01(t);
  if (easing === "easeIn") return x * x;
  if (easing === "easeOut") return 1 - (1 - x) * (1 - x);
  if (easing === "easeInOut") return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  return x;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpTransform(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    width: lerp(a.width, b.width, t),
    height: lerp(a.height, b.height, t),
    opacity: lerp(a.opacity, b.opacity, t),
    crop: {
      x: lerp(a.crop.x, b.crop.x, t),
      y: lerp(a.crop.y, b.crop.y, t),
      width: lerp(a.crop.width, b.crop.width, t),
      height: lerp(a.crop.height, b.crop.height, t),
    },
  };
}

function cloneTransform(t) {
  return { ...t, crop: { ...t.crop } };
}

export function normalizeComposition(composition) {
  if (!composition?.keyframes?.length) {
    return { keyframes: [{ id: "kf-0", time: 0, transform: cloneTransform(DEFAULT_TRANSFORM), easing: "easeInOut" }] };
  }
  const keyframes = [...composition.keyframes]
    .filter((k) => k && Number.isFinite(k.time))
    .sort((a, b) => a.time - b.time);
  if (!keyframes.length) return normalizeComposition(null);
  return { keyframes };
}

export function resolveCompositionTransform(composition, localTimeSeconds) {
  const comp = normalizeComposition(composition);
  const keyframes = comp.keyframes;
  const t = Math.max(0, localTimeSeconds);
  if (t <= keyframes[0].time) return cloneTransform(keyframes[0].transform);
  const last = keyframes[keyframes.length - 1];
  if (t >= last.time) return cloneTransform(last.transform);
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t < a.time || t > b.time) continue;
    const span = b.time - a.time;
    const raw = span <= 1e-9 ? 1 : (t - a.time) / span;
    const eased = easeProgress(raw, a.easing);
    return lerpTransform(a.transform, b.transform, eased);
  }
  return cloneTransform(last.transform);
}

function isDefaultTransform(transform) {
  const d = DEFAULT_TRANSFORM;
  return (
    Math.abs(transform.x - d.x) < 0.001 &&
    Math.abs(transform.y - d.y) < 0.001 &&
    Math.abs(transform.width - d.width) < 0.001 &&
    Math.abs(transform.height - d.height) < 0.001 &&
    Math.abs(transform.crop.x - d.crop.x) < 0.001 &&
    Math.abs(transform.crop.y - d.crop.y) < 0.001 &&
    Math.abs(transform.crop.width - d.crop.width) < 0.001 &&
    Math.abs(transform.crop.height - d.crop.height) < 0.001
  );
}

export function buildCompositionFfmpegFilter(frameWidth, frameHeight, transform, cropPreset = "fill") {
  if (isDefaultTransform(transform)) {
    if (cropPreset === "fit") {
      return `scale=${frameWidth}:${frameHeight}:force_original_aspect_ratio=decrease,pad=${frameWidth}:${frameHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p`;
    }
    return `scale=${frameWidth}:${frameHeight}:force_original_aspect_ratio=increase,crop=${frameWidth}:${frameHeight},setsar=1,format=yuv420p`;
  }
  const crop = transform.crop;
  const boxW = Math.max(2, Math.round(transform.width * frameWidth));
  const boxH = Math.max(2, Math.round(transform.height * frameHeight));
  const boxX = Math.round(transform.x * frameWidth);
  const boxY = Math.round(transform.y * frameHeight);
  const aspect = cropPreset === "fit" ? "decrease" : "increase";
  return [
    `crop=iw*${crop.width.toFixed(6)}:ih*${crop.height.toFixed(6)}:iw*${crop.x.toFixed(6)}:ih*${crop.y.toFixed(6)}`,
    `scale=${boxW}:${boxH}:force_original_aspect_ratio=${aspect}`,
    aspect === "increase" ? `crop=${boxW}:${boxH}` : "",
    `pad=${frameWidth}:${frameHeight}:${boxX}:${boxY}:black`,
    "setsar=1,format=yuv420p",
  ].filter(Boolean).join(",");
}

function escapeDrawtext(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

function hexToFfmpegColor(hex, opacity = 1) {
  const clean = String(hex || "#ffffff").replace("#", "");
  if (clean.length !== 6) return `white@${opacity.toFixed(2)}`;
  return `0x${clean}@${Math.max(0, Math.min(1, opacity)).toFixed(2)}`;
}

function primaryFontFamily(fontFamily) {
  const primary = String(fontFamily || "Inter").split(",")[0].replace(/['"]/g, "").trim();
  return primary || "Inter";
}

function overlayObjectFilters(object, transform, frameWidth, frameHeight) {
  const x = Math.round(transform.x * frameWidth);
  const y = Math.round(transform.y * frameHeight);
  const w = Math.max(1, Math.round(transform.width * frameWidth));
  const h = Math.max(1, Math.round(transform.height * frameHeight));
  const opacity = Math.max(0, Math.min(1, transform.opacity * (object.opacity ?? 1)));

  if (object.type === "text") {
    const fontSize = Math.max(8, Math.round((object.fontSize ?? 48) * (h / Math.max(1, object.height))));
    const color = hexToFfmpegColor(object.fill?.color ?? "#ffffff", opacity);
    const text = escapeDrawtext(String(object.text || "").slice(0, 500));
    if (!text) return [];
    const align = object.textAlign === "right" ? "right" : object.textAlign === "left" ? "left" : "center";
    const xExpr = align === "center" ? x + Math.round(w / 2) : align === "right" ? x + w - 8 : x + 8;
    const lineSpacing = Math.round((object.lineHeight ?? 1.1) * fontSize);
    const font = primaryFontFamily(object.fontFamily);
    const parts = [
      `drawtext=font='${font}'`,
      `text='${text}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${color}`,
      `x=${xExpr}`,
      `y=${y + Math.round(h * 0.2)}`,
      `line_spacing=${lineSpacing}`,
      `text_align=${align}`,
      "fix_bounds=1",
    ];
    if ((object.fontWeight ?? 400) >= 700) parts.push("borderw=1", `bordercolor=${color}`);
    if (object.strokeWidth && object.stroke !== "none") {
      const strokeColor = typeof object.stroke === "object" ? object.stroke.color : "#000000";
      parts.push(`borderw=${Math.max(1, Math.round(object.strokeWidth))}`, `bordercolor=${hexToFfmpegColor(strokeColor ?? "#000000", opacity)}`);
    }
    return [parts.join(":")];
  }

  if (object.type === "rect") {
    const color = hexToFfmpegColor(object.fill?.color ?? "#3a8f96", opacity);
    const filters = [`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=fill`];
    if (object.strokeWidth && object.stroke !== "none") {
      const strokeColor = typeof object.stroke === "object" ? object.stroke.color : "#ffffff";
      filters.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${hexToFfmpegColor(strokeColor ?? "#ffffff", opacity)}:t=${Math.max(1, Math.round(object.strokeWidth))}`);
    }
    return filters;
  }

  return [];
}

export function buildOverlayFiltersAtTime(overlays, globalTimeSeconds, frameWidth, frameHeight) {
  const active = (overlays ?? []).filter(
    (overlay) => globalTimeSeconds >= overlay.startTime && globalTimeSeconds < overlay.startTime + overlay.durationSeconds,
  );
  const sorted = [...active].sort((a, b) => (a.layerOrder ?? 0) - (b.layerOrder ?? 0));
  const filters = sorted.flatMap((overlay) => {
    const local = Math.max(0, globalTimeSeconds - overlay.startTime);
    const transform = resolveCompositionTransform(overlay.composition, local);
    return overlayObjectFilters(overlay.object, transform, frameWidth, frameHeight);
  });
  return filters.join(",");
}

export function compositionKeyframeTimes(composition) {
  return normalizeComposition(composition).keyframes.map((kf) => Math.max(0, kf.time));
}

export function mergeCompositionCutPoints(clipStartTime, clipDuration, composition) {
  const end = clipStartTime + Math.max(0.1, clipDuration);
  const points = new Set([clipStartTime, end]);
  for (const time of compositionKeyframeTimes(composition)) {
    const absolute = clipStartTime + time;
    if (absolute > clipStartTime + 0.02 && absolute < end - 0.02) points.add(absolute);
  }
  return Array.from(points).sort((a, b) => a - b);
}

export function visualFilter(manifest, clip, localTimeSeconds = 0) {
  const { width, height, fps } = manifest.settings;
  if (clip.composition) {
    const transform = resolveCompositionTransform(clip.composition, localTimeSeconds);
    return `${buildCompositionFfmpegFilter(width, height, transform, clip.compositionCropPreset ?? "fill")},fps=${fps}`;
  }
  if (clip.mediaType === "image" && clip.motion && clip.motion !== "none") {
    const frameCount = Math.max(1, Math.round(Math.max(0.1, clip.durationSeconds) * fps));
    const denominator = Math.max(1, frameCount - 1);
    const progress = `on/${denominator}`;
    const zoom = clip.motion === "slow_zoom_out"
      ? `max(1,1.12-0.12*${progress})`
      : clip.motion === "pan_left" || clip.motion === "pan_right"
        ? "1.08"
        : `min(1.12,1+0.12*${progress})`;
    const panX = clip.motion === "pan_left"
      ? `(iw-iw/zoom)*(1-${progress})`
      : clip.motion === "pan_right"
        ? `(iw-iw/zoom)*${progress}`
        : "iw/2-(iw/zoom/2)";
    const panY = "ih/2-(ih/zoom/2)";
    return `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,zoompan=z='${zoom}':x='${panX}':y='${panY}':d=${frameCount}:s=${width}x${height}:fps=${fps},setsar=1,format=yuv420p`;
  }
  if (clip.fitMode === "fit") {
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps},format=yuv420p`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p`;
}

export function visualLayerIds(manifest) {
  const layers = manifest.layers?.filter((layer) => layer.kind === "visual" && !layer.hidden).sort((a, b) => a.order - b.order).map((layer) => layer.id);
  return layers?.length ? layers : ["video"];
}

export function activeVisualClipForInterval(manifest, resolved, startTime) {
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
