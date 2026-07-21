import { lazy, Suspense } from "react";
import { GameApp } from "./game-app";

// The testbed exists only in development builds: the DEV-guarded ternary lets the
// production bundle tree-shake the lazy chunk and the testbed-only harness UI.
const TestbedApp = import.meta.env.DEV
  ? lazy(() => import("./testbed-app").then((module) => ({ default: module.TestbedApp })))
  : undefined;

export function App() {
  if (TestbedApp && window.location.pathname === "/debug") {
    return (
      <Suspense fallback={null}>
        <TestbedApp />
      </Suspense>
    );
  }
  return <GameApp />;
}
