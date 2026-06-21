import { describe, expect, it } from "vitest";

import { formatTimecode, parseTimecodeToSeconds } from "./video-editor-timecode";

describe("video editor timecode", () => {
  it("formats seconds into SMPTE HH:MM:SS:FF", () => {
    expect(formatTimecode(0, 25)).toBe("00:00:00:00");
    expect(formatTimecode(1.04, 25)).toBe("00:00:01:01");
    expect(formatTimecode(3661.5, 25)).toBe("01:01:01:13");
  });

  it("parses SMPTE timecode back to seconds", () => {
    expect(parseTimecodeToSeconds("00:00:01:01", 25)).toBeCloseTo(1.04, 2);
    expect(parseTimecodeToSeconds("01:01:01:12", 25)).toBeCloseTo(3661.48, 1);
  });
});
