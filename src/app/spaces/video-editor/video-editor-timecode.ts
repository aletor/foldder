/** SMPTE timecode HH:MM:SS:FF from seconds and frame rate. */
export function formatTimecode(seconds: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(Number.isFinite(fps) ? fps : 25));
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalFrames = Math.round(safeSeconds * safeFps);
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function parseTimecodeToSeconds(timecode: string, fps: number): number | null {
  const match = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/.exec(timecode.trim());
  if (!match) return null;
  const safeFps = Math.max(1, Math.round(Number.isFinite(fps) ? fps : 25));
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  const secs = Number(match[3]);
  const frames = Number(match[4]);
  if ([hours, mins, secs, frames].some((n) => !Number.isFinite(n))) return null;
  return hours * 3600 + mins * 60 + secs + frames / safeFps;
}
