import { lazy, Suspense } from "react";
import { GameApp } from "./game-app";

// The testbed exists only in development builds: the DEV-guarded ternary lets the
// production bundle tree-shake the lazy chunk and the testbed-only harness UI.
const TestbedApp = import.meta.env.DEV
  ? lazy(() => import("./testbed-app").then((module) => ({ default: module.TestbedApp })))
  : undefined;

const WallTestbedApp = import.meta.env.DEV
  ? lazy(() => import("./wall-testbed-app").then((module) => ({ default: module.WallTestbedApp })))
  : undefined;

const EntityPresentationLabApp = import.meta.env.DEV
  ? lazy(() => import("./entity-presentation-lab-app").then((module) => ({ default: module.EntityPresentationLabApp })))
  : undefined;

export function App() {
  if (EntityPresentationLabApp && window.location.pathname === "/debug/entity") {
    return (
      <Suspense fallback={null}>
        <EntityPresentationLabApp />
      </Suspense>
    );
  }
  if (WallTestbedApp && window.location.pathname === "/debug/wall") {
    return (
      <Suspense fallback={null}>
        <WallTestbedApp />
      </Suspense>
    );
  }
  if (TestbedApp && window.location.pathname === "/debug") {
    return (
      <Suspense fallback={null}>
        <TestbedApp />
      </Suspense>
    );
  }
  return <GameApp />;
}
