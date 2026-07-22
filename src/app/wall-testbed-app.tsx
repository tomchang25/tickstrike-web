import { useEffect, useRef } from "react";
import { mountWallTestbedScene } from "@presentation/pixi/wall-testbed-scene";

/** Dev-only host page for the walled-contour terrain testbed at /debug/wall. */
export function WallTestbedApp() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void mountWallTestbedScene(host).then((teardown) => {
      if (cancelled) {
        teardown();
      } else {
        dispose = teardown;
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <main className="app-shell">
      <header>
        <div>
          <p className="eyebrow">Terrain rework testbed</p>
          <h1>Walled Arena Contour</h1>
        </div>
        <p>14×8 island · 3×3 and 1×1 water openings · Cainos wall contour over tiled water</p>
      </header>
      <div ref={hostRef} data-testid="wall-testbed-canvas-host" />
    </main>
  );
}
