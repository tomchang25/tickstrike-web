import { gsap } from "gsap";

export interface TimedPresentationFrame {
  readonly holdSec: number;
}

export function createFramePlaybackTimeline<TFrame extends TimedPresentationFrame>(
  frames: readonly TFrame[],
  applyFrame: (frame: TFrame) => void,
  loop = false,
): gsap.core.Timeline {
  if (frames.length === 0) {
    throw new Error("Frame playback requires at least one frame.");
  }
  const timeline = gsap.timeline({ repeat: loop ? -1 : 0 });
  for (const frame of frames) {
    timeline.call(() => applyFrame(frame));
    timeline.to({}, { duration: Math.max(0.01, frame.holdSec) });
  }
  return timeline;
}
