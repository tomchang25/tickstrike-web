import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTION_DIRECTIONS,
  ACTION_STATE_KEYS,
  actionPresentationCatalog,
  parseActionPresentationCatalog,
  type ActionDirection,
  type ActionPresentation,
  type ActionPresentationCatalog,
  type ActionStateKey,
} from "@presentation/actions/action-presentation-catalog";
import { ACTION_LAB_PREVIEW_ACTIONS } from "@presentation/actions/action-lab-preview-actions";
import { mountActionLabScene, type ActionLabScene } from "@presentation/pixi/action-lab-scene";

const CATALOG_ENDPOINT = "/__debug/action-presentation-catalog";
type OffsetLayer = "body" | "weapon";

interface RangeProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly disabled?: boolean;
  onChange(value: number): void;
}

function Range({ label, value, min, max, step, disabled = false, onChange }: RangeProps) {
  return (
    <label className="action-lab-range">
      <span>
        {label}: <output>{value}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function catalogJson(catalog: ActionPresentationCatalog): string {
  return JSON.stringify(catalog, null, 2);
}

function mergeAction(
  catalog: ActionPresentationCatalog,
  actionId: string,
  action: ActionPresentation,
): ActionPresentationCatalog {
  return { ...catalog, actions: { ...catalog.actions, [actionId]: action } };
}

async function requestCatalog(method: "GET" | "PUT", catalog?: ActionPresentationCatalog) {
  const response = await fetch(CATALOG_ENDPOINT, {
    method,
    headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined,
    body: catalog ? JSON.stringify(catalog) : undefined,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Action catalog request failed (${response.status}).`;
    throw new Error(message);
  }
  return parseActionPresentationCatalog(payload);
}

export function ActionLabApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ActionLabScene | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<ActionPresentationCatalog>(actionPresentationCatalog);
  const [actionId, setActionId] = useState<string>(Object.keys(actionPresentationCatalog.actions)[0] ?? "");
  const [draft, setDraft] = useState<ActionPresentation | undefined>(actionPresentationCatalog.actions[actionId]);
  const [inspect, setInspect] = useState(true);
  const [inspectState, setInspectState] = useState<ActionStateKey>("end");
  const [inspectDirection, setInspectDirection] = useState<ActionDirection>("down");
  const [inspectLayer, setInspectLayer] = useState<OffsetLayer>("weapon");
  const [autoLoop, setAutoLoop] = useState(false);
  const [altMode, setAltMode] = useState(false);
  const [configText, setConfigText] = useState("");
  const [status, setStatus] = useState("");

  const actionIds = useMemo(
    () => [...Object.keys(catalog.actions), ...Object.keys(ACTION_LAB_PREVIEW_ACTIONS)],
    [catalog],
  );
  const previewOnly = Boolean(ACTION_LAB_PREVIEW_ACTIONS[actionId]);
  const presentStates = useMemo(() => ACTION_STATE_KEYS.filter((key) => Boolean(draft?.[key])), [draft]);
  const activeState = draft?.[inspectState];
  const weaponAvailable = Boolean(activeState?.weapon);
  const layer: OffsetLayer = weaponAvailable ? inspectLayer : "body";
  const activeOffset =
    layer === "weapon" ? activeState?.weapon?.offset[inspectDirection] : activeState?.bodyOffset[inspectDirection];
  const attackFrames = activeState?.bodyFrames;
  const motion = activeState?.motion;
  const afterimage = activeState?.afterimage;

  useEffect(() => {
    const host = hostRef.current;
    const initialAction = actionPresentationCatalog.actions[actionId];
    if (!host || !initialAction) {
      return;
    }
    let scene: ActionLabScene | undefined;
    let cancelled = false;
    void mountActionLabScene(host, {
      catalog: actionPresentationCatalog,
      actionId,
      inspect: { stateKey: "end", direction: "down" },
      autoLoop: false,
      altMode: false,
    }).then((mounted) => {
      if (cancelled) {
        mounted.destroy();
        return;
      }
      scene = mounted;
      sceneRef.current = mounted;
      setReady(true);
    });
    void requestCatalog("GET")
      .then((disk) => {
        setCatalog(disk);
        setDraft(disk.actions[actionId]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      scene?.destroy();
      sceneRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the scene and the live config panel in sync with every draft/mode change.
  useEffect(() => {
    if (!draft) {
      return;
    }
    const sceneCatalog = previewOnly ? catalog : mergeAction(catalog, actionId, draft);
    setConfigText(
      previewOnly
        ? JSON.stringify({ id: actionId, previewOnly: true, action: draft }, null, 2)
        : catalogJson(sceneCatalog),
    );
    if (!ready) {
      return;
    }
    sceneRef.current?.update({
      catalog: sceneCatalog,
      actionId,
      inspect: previewOnly || inspect ? { stateKey: inspectState, direction: inspectDirection } : null,
      autoLoop,
      altMode,
    });
  }, [ready, draft, catalog, actionId, previewOnly, inspect, inspectState, inspectDirection, autoLoop, altMode]);

  const changeAction = (nextId: string): void => {
    const next = ACTION_LAB_PREVIEW_ACTIONS[nextId]?.action ?? catalog.actions[nextId];
    setActionId(nextId);
    setDraft(next);
    // Keep the inspected state valid for the newly selected action.
    const states = ACTION_STATE_KEYS.filter((key) => Boolean(next?.[key]));
    if (!states.includes(inspectState)) {
      setInspectState(states[0] ?? "idle");
    }
    if (ACTION_LAB_PREVIEW_ACTIONS[nextId]) {
      setInspect(true);
    }
    setStatus("Loaded selected action.");
  };

  const setOffsetAxis = (axis: "x" | "y", value: number): void =>
    setDraft((current) => {
      const state = current?.[inspectState];
      if (!current || !state) {
        return current;
      }
      if (layer === "weapon") {
        if (!state.weapon) {
          return current;
        }
        const dir = state.weapon.offset[inspectDirection];
        return {
          ...current,
          [inspectState]: {
            ...state,
            weapon: {
              ...state.weapon,
              offset: { ...state.weapon.offset, [inspectDirection]: { ...dir, [axis]: value } },
            },
          },
        };
      }
      const dir = state.bodyOffset[inspectDirection];
      return {
        ...current,
        [inspectState]: {
          ...state,
          bodyOffset: { ...state.bodyOffset, [inspectDirection]: { ...dir, [axis]: value } },
        },
      };
    });

  const patchFrameHold = (index: number, holdSec: number): void =>
    setDraft((current) => {
      const state = current?.[inspectState];
      if (!current || !state?.bodyFrames) {
        return current;
      }
      const bodyFrames = state.bodyFrames.map((frame, i) => (i === index ? { ...frame, holdSec } : frame));
      return { ...current, [inspectState]: { ...state, bodyFrames } };
    });

  const patchMotionDuration = (durationSec: number): void =>
    setDraft((current) => {
      const state = current?.[inspectState];
      if (!current || !state?.motion) {
        return current;
      }
      return { ...current, [inspectState]: { ...state, motion: { ...state.motion, durationSec } } };
    });

  const patchAfterimageInterval = (intervalMs: number): void =>
    setDraft((current) => {
      const state = current?.[inspectState];
      if (!current || !state?.afterimage) {
        return current;
      }
      return { ...current, [inspectState]: { ...state, afterimage: { ...state.afterimage, intervalMs } } };
    });

  const persist = async (): Promise<void> => {
    if (!draft || previewOnly) {
      setStatus("Preview-only sprite actions are not written to the runtime action catalog.");
      return;
    }
    try {
      const saved = await requestCatalog("PUT", mergeAction(catalog, actionId, draft));
      setCatalog(saved);
      setDraft(saved.actions[actionId]);
      setStatus("Applied — written to action-presentation-catalog.json.");
    } catch (error) {
      setStatus(error instanceof Error ? `Apply failed: ${error.message}` : "Apply failed.");
    }
  };

  const reload = async (): Promise<void> => {
    if (previewOnly) {
      setStatus("Preview-only sprite actions are rebuilt from their approved animation metadata.");
      return;
    }
    try {
      const disk = await requestCatalog("GET");
      setCatalog(disk);
      setDraft(disk.actions[actionId]);
      setStatus("Reloaded on-disk catalog.");
    } catch (error) {
      setStatus(error instanceof Error ? `Reload failed: ${error.message}` : "Reload failed.");
    }
  };

  const importText = (): void => {
    if (previewOnly) {
      setStatus("Preview-only sprite actions cannot import runtime catalog JSON.");
      return;
    }
    try {
      const parsed = parseActionPresentationCatalog(JSON.parse(configText));
      setCatalog(parsed);
      setDraft(parsed.actions[actionId] ?? Object.values(parsed.actions)[0]);
      setStatus("Imported JSON into the working draft.");
    } catch (error) {
      setStatus(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
    }
  };

  const copyJson = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(configText);
      setStatus("Config JSON copied.");
    } catch {
      setStatus("Clipboard unavailable.");
    }
  };

  return (
    <main className="action-lab-shell">
      <header>
        <p className="eyebrow">Action / sequence lab</p>
        <h1>Action presentation</h1>
        <p>
          Dev-only. Runtime catalog actions remain editable and drive the real player sprite. Approved enemy action,
          Dash-killed, and drowning sheets appear as separate preview-only Actions and drive the real enemy presentation
          rig without entering <code>action-presentation-catalog.json</code>.
        </p>
      </header>

      <div className="action-lab-workspace">
        <section className="action-lab-preview" aria-label="Action preview">
          <div ref={hostRef} className="action-lab-canvas-host" data-testid="action-lab-canvas-host" />
          {!ready ? <p role="status">Loading action assets…</p> : null}
        </section>

        <aside className="action-lab-controls" aria-label="Action tuning controls">
          <label className="field">
            <span>Action</span>
            <select
              data-testid="action-lab-action"
              value={actionId}
              onChange={(event) => changeAction(event.target.value)}
            >
              {actionIds.map((id) => (
                <option key={id} value={id}>
                  {ACTION_LAB_PREVIEW_ACTIONS[id]?.action.label ?? catalog.actions[id]?.label ?? id}
                </option>
              ))}
            </select>
          </label>

          <div className="action-lab-toggles">
            <label>
              <input
                type="checkbox"
                checked={previewOnly || inspect}
                disabled={previewOnly}
                onChange={(event) => setInspect(event.target.checked)}
              />{" "}
              Inspect (freeze)
            </label>
          </div>

          {previewOnly || inspect ? (
            <fieldset>
              <legend>Inspect — pick state · direction · layer</legend>
              <div className="action-lab-selects">
                <label className="field">
                  <span>State</span>
                  <select
                    value={inspectState}
                    onChange={(event) => setInspectState(event.target.value as ActionStateKey)}
                  >
                    {presentStates.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Direction</span>
                  <select
                    value={inspectDirection}
                    onChange={(event) => setInspectDirection(event.target.value as ActionDirection)}
                  >
                    {ACTION_DIRECTIONS.map((dir) => (
                      <option key={dir} value={dir}>
                        {dir}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Layer</span>
                  <select
                    value={layer}
                    disabled={!weaponAvailable}
                    onChange={(event) => setInspectLayer(event.target.value as OffsetLayer)}
                  >
                    <option value="body">body</option>
                    <option value="weapon" disabled={!weaponAvailable}>
                      weapon
                    </option>
                  </select>
                </label>
              </div>

              {activeOffset ? (
                <>
                  <Range
                    label={`${layer} offset X`}
                    min={-64}
                    max={64}
                    step={0.5}
                    value={activeOffset.x}
                    disabled={previewOnly}
                    onChange={(x) => setOffsetAxis("x", x)}
                  />
                  <Range
                    label={`${layer} offset Y`}
                    min={-96}
                    max={64}
                    step={0.5}
                    value={activeOffset.y}
                    disabled={previewOnly}
                    onChange={(y) => setOffsetAxis("y", y)}
                  />
                </>
              ) : (
                <p className="action-lab-hint">This state has no {layer} layer to offset.</p>
              )}

              {attackFrames ? (
                <div className="action-lab-timing">
                  <span className="action-lab-timing-title">Attack frame timing (hold s)</span>
                  {attackFrames.map((frame, index) => (
                    <Range
                      key={index}
                      label={`frame ${index}`}
                      min={0.02}
                      max={0.4}
                      step={0.01}
                      value={frame.holdSec}
                      disabled={previewOnly}
                      onChange={(holdSec) => patchFrameHold(index, holdSec)}
                    />
                  ))}
                </div>
              ) : null}

              {motion ? (
                <div className="action-lab-timing">
                  <span className="action-lab-timing-title">Dash timing</span>
                  <Range
                    label="motion duration (s)"
                    min={0.06}
                    max={0.5}
                    step={0.01}
                    value={motion.durationSec}
                    onChange={patchMotionDuration}
                  />
                  {afterimage ? (
                    <Range
                      label="afterimage interval (ms)"
                      min={4}
                      max={60}
                      step={1}
                      value={afterimage.intervalMs}
                      onChange={patchAfterimageInterval}
                    />
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          ) : (
            <fieldset>
              <legend>Play</legend>
              <div className="action-lab-toggles">
                <label>
                  <input type="checkbox" checked={autoLoop} onChange={(event) => setAutoLoop(event.target.checked)} />{" "}
                  Auto loop
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={altMode}
                    disabled={autoLoop}
                    onChange={(event) => setAltMode(event.target.checked)}
                  />{" "}
                  Alt mode (hover to aim, click to execute)
                </label>
              </div>
            </fieldset>
          )}

          <section aria-label="Live config" className="action-lab-config">
            <div className="action-lab-config-head">
              <h2>Config (live)</h2>
              <button type="button" onClick={() => void copyJson()}>
                Copy
              </button>
            </div>
            <textarea
              className="action-lab-config-text"
              spellCheck={false}
              value={configText}
              readOnly={previewOnly}
              onChange={(event) => setConfigText(event.target.value)}
              aria-label="Action presentation catalog JSON"
            />
            <div className="action-lab-actions">
              <button type="button" disabled={previewOnly} onClick={() => void persist()}>
                Apply to JSON
              </button>
              <button type="button" disabled={previewOnly} onClick={importText}>
                Import
              </button>
              <button type="button" disabled={previewOnly} onClick={() => void reload()}>
                Reload
              </button>
            </div>
          </section>

          {previewOnly ? (
            <p className="action-lab-hint">Preview-only Action: timing comes from the approved sprite metadata.</p>
          ) : null}

          {status ? (
            <p className="action-lab-status" role="status">
              {status}
            </p>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
