import { describe, expect, it, vi } from "vitest";
import { createFramePlaybackTimeline } from "@presentation/timelines/frame-playback";

describe("frame playback timeline", () => {
  it("applies every authored frame in order and honors loop mode", () => {
    const applyFrame = vi.fn();
    const frames = [
      { row: 0, holdSec: 0.01 },
      { row: 1, holdSec: 0.02 },
      { row: 2, holdSec: 0.03 },
    ];
    const timeline = createFramePlaybackTimeline(frames, applyFrame, true);

    expect(timeline.repeat()).toBe(-1);
    timeline.totalTime(timeline.duration());
    expect(applyFrame.mock.calls.map(([frame]) => frame.row)).toEqual([0, 1, 2]);
    timeline.kill();
  });

  it("rejects an empty frame sequence", () => {
    expect(() => createFramePlaybackTimeline([], vi.fn())).toThrow("Frame playback requires at least one frame.");
  });
});
