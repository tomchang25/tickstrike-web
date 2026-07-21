import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("a combat event plays an audio cue after the first gesture", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  // No audio has played before any user gesture.
  expect(await page.evaluate(() => window.__TICKSTRIKE__!.getAudioPlayCount())).toBe(0);

  // A canvas click is the user gesture that unlocks the audio context and starts the cue load.
  await page.getByTestId("game-canvas-host").click();

  // Each poll drives an attack (always emits player_attacked -> action_whoosh); once the cue buffers
  // finish decoding, the mixer's play count rises above zero.
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          await window.__TICKSTRIKE__!.execute({ type: "attack", actorId: "player", direction: { x: 1, y: 0 } });
          return window.__TICKSTRIKE__!.getAudioPlayCount();
        }),
      { timeout: 10000 },
    )
    .toBeGreaterThan(0);
});
