import { useEffect, useRef, useState } from "react";
import {
  ENTITY_PRESENTATION_LAB_PROFILES,
  mountEntityPresentationLabScene,
  type EntityPresentationLabCellFill,
  type EntityPresentationLabDirection,
  type EntityPresentationLabPose,
  type EntityPresentationLabScene,
} from "@presentation/pixi/entity-presentation-lab-scene";
import {
  createEntityPresentationProfileOverride,
  entityPresentationProfileCatalog,
  parseEntityPresentationProfileCatalog,
  resolveEntityPresentationProfile,
  type EntityPresentationProfile,
  type EntityPresentationProfileCatalog,
} from "@presentation/pixi/entity-presentation-profiles";

type EditTarget = "general" | "specific";
const PROFILE_CATALOG_ENDPOINT = "/__debug/entity-presentation-profile-catalog";

interface RangeControlProps {
  readonly label: string;
  readonly testId: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  onChange(value: number): void;
}

function RangeControl({ label, testId, value, min, max, step = 1, onChange }: RangeControlProps) {
  return (
    <label className="entity-lab-range">
      <span>{label}</span>
      <input
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{value}</output>
    </label>
  );
}

function catalogJson(catalog: EntityPresentationProfileCatalog): string {
  return JSON.stringify(catalog, null, 2);
}

function profileForTarget(
  target: EditTarget,
  profileId: string,
  catalog: EntityPresentationProfileCatalog,
): EntityPresentationProfile {
  return target === "general" ? catalog.general : resolveEntityPresentationProfile(profileId, catalog);
}

function withDraftProfile(
  target: EditTarget,
  profileId: string,
  draft: EntityPresentationProfile,
  catalog: EntityPresentationProfileCatalog,
): EntityPresentationProfileCatalog {
  if (target === "general") {
    return { ...catalog, general: draft };
  }

  const profiles = { ...catalog.profiles };
  const override = createEntityPresentationProfileOverride(catalog.general, draft);
  if (Object.keys(override).length === 0) {
    delete profiles[profileId];
  } else {
    profiles[profileId] = override;
  }
  return { ...catalog, profiles };
}

async function requestCatalog(method: "GET" | "PUT", catalog?: EntityPresentationProfileCatalog) {
  const response = await fetch(PROFILE_CATALOG_ENDPOINT, {
    method,
    headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined,
    body: catalog ? JSON.stringify(catalog) : undefined,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Profile catalog request failed (${response.status}).`;
    throw new Error(message);
  }
  return parseEntityPresentationProfileCatalog(payload);
}

export function EntityPresentationLabApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EntityPresentationLabScene | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<EntityPresentationProfileCatalog>(entityPresentationProfileCatalog);
  const [catalogText, setCatalogText] = useState(() => catalogJson(entityPresentationProfileCatalog));
  const [editTarget, setEditTarget] = useState<EditTarget>("general");
  const [profileId, setProfileId] = useState(ENTITY_PRESENTATION_LAB_PROFILES[0]?.id ?? "character.ninja");
  const [draft, setDraft] = useState<EntityPresentationProfile>(entityPresentationProfileCatalog.general);
  const [direction, setDirection] = useState<EntityPresentationLabDirection>("down");
  const [pose, setPose] = useState<EntityPresentationLabPose>("idle");
  const [cellFill, setCellFill] = useState<EntityPresentationLabCellFill>("purple");
  const [shadowVisible, setShadowVisible] = useState(true);
  const [guidesVisible, setGuidesVisible] = useState(true);
  const [operationStatus, setOperationStatus] = useState("");
  const [writingCatalog, setWritingCatalog] = useState(false);
  const selectedProfile =
    ENTITY_PRESENTATION_LAB_PROFILES.find((profile) => profile.id === profileId) ?? ENTITY_PRESENTATION_LAB_PROFILES[0];
  const clipboardAvailable = typeof navigator.clipboard?.writeText === "function";
  const hasSpecificOverride = catalog.profiles[profileId] !== undefined;
  const profileSource =
    editTarget === "general"
      ? "General profile"
      : hasSpecificOverride
        ? `${profileId} override with General fallback`
        : "General fallback (no specific override)";

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let scene: EntityPresentationLabScene | undefined;
    let cancelled = false;
    void mountEntityPresentationLabScene(host).then((mountedScene) => {
      if (cancelled) {
        mountedScene.destroy();
        return;
      }
      scene = mountedScene;
      sceneRef.current = mountedScene;
      setReady(true);
    });
    return () => {
      cancelled = true;
      scene?.destroy();
      sceneRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    sceneRef.current?.update({
      profileId,
      direction,
      pose,
      cellFill,
      groundY: draft.groundY,
      bodyAnchorX: draft.bodyFoot.x,
      bodyAnchorY: draft.bodyFoot.y,
      bodyScale: draft.bodyScale,
      shadowVisible,
      guidesVisible,
      shadowStyle: draft.shadow,
    });
  }, [ready, profileId, direction, pose, cellFill, draft, shadowVisible, guidesVisible]);

  const changeProfile = (nextProfileId: string): void => {
    const nextProfile = ENTITY_PRESENTATION_LAB_PROFILES.find((profile) => profile.id === nextProfileId);
    setProfileId(nextProfileId);
    setPose(nextProfile?.poses[0] ?? "idle");
    setDraft(profileForTarget(editTarget, nextProfileId, catalog));
    setOperationStatus("Unsaved values discarded; loaded the selected profile.");
  };

  const changeEditTarget = (nextTarget: EditTarget): void => {
    setEditTarget(nextTarget);
    setDraft(profileForTarget(nextTarget, profileId, catalog));
    setOperationStatus("Unsaved values discarded; loaded the selected edit target.");
  };

  const persistCatalog = async (
    nextCatalog: EntityPresentationProfileCatalog,
    successMessage: string,
  ): Promise<EntityPresentationProfileCatalog | undefined> => {
    setWritingCatalog(true);
    try {
      const savedCatalog = await requestCatalog("PUT", nextCatalog);
      setCatalog(savedCatalog);
      setCatalogText(catalogJson(savedCatalog));
      setOperationStatus(successMessage);
      return savedCatalog;
    } catch (error) {
      setOperationStatus(error instanceof Error ? `Write failed: ${error.message}` : "Write failed.");
      return undefined;
    } finally {
      setWritingCatalog(false);
    }
  };

  const applyProfile = async (): Promise<void> => {
    const nextCatalog = withDraftProfile(editTarget, profileId, draft, catalog);
    await persistCatalog(
      nextCatalog,
      editTarget === "general"
        ? "General profile written to the runtime catalog."
        : `${profileId} override written to the runtime catalog.`,
    );
  };

  const resetProfile = (): void => {
    setDraft(profileForTarget(editTarget, profileId, catalog));
    setOperationStatus("Draft reset to the current working catalog.");
  };

  const useGeneralProfile = async (): Promise<void> => {
    const profiles = { ...catalog.profiles };
    delete profiles[profileId];
    const nextCatalog = { ...catalog, profiles };
    const savedCatalog = await persistCatalog(nextCatalog, `${profileId} override removed from the runtime catalog.`);
    if (savedCatalog) {
      setDraft(savedCatalog.general);
    }
  };

  const importCatalog = async (): Promise<void> => {
    try {
      const nextCatalog = parseEntityPresentationProfileCatalog(JSON.parse(catalogText));
      const savedCatalog = await persistCatalog(nextCatalog, "Imported JSON written to the runtime catalog.");
      if (savedCatalog) {
        setDraft(profileForTarget(editTarget, profileId, savedCatalog));
      }
    } catch (error) {
      setOperationStatus(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
    }
  };

  const copyCatalog = async (): Promise<void> => {
    if (!clipboardAvailable) {
      setOperationStatus("Clipboard unavailable; select the JSON manually.");
      return;
    }
    try {
      const output = catalogJson(catalog);
      await navigator.clipboard.writeText(output);
      setCatalogText(output);
      setOperationStatus("Working catalog JSON copied.");
    } catch {
      setOperationStatus("Clipboard permission denied; select the JSON manually.");
    }
  };

  const reloadRuntimeCatalog = async (): Promise<void> => {
    setWritingCatalog(true);
    try {
      const runtimeCatalog = await requestCatalog("GET");
      setCatalog(runtimeCatalog);
      setCatalogText(catalogJson(runtimeCatalog));
      setDraft(profileForTarget(editTarget, profileId, runtimeCatalog));
      setOperationStatus("Reloaded the repository runtime catalog.");
    } catch (error) {
      setOperationStatus(error instanceof Error ? `Reload failed: ${error.message}` : "Reload failed.");
    } finally {
      setWritingCatalog(false);
    }
  };

  return (
    <main className="entity-lab-shell">
      <header>
        <div>
          <p className="eyebrow">Entity presentation lab</p>
          <h1>Ground, Body, Shadow</h1>
        </div>
        <p>Dev-only calibration against the data-driven production Pixi presentation rig.</p>
      </header>

      <div className="entity-lab-workspace">
        <section className="entity-lab-preview" aria-label="Entity presentation preview">
          <div ref={hostRef} className="entity-lab-canvas-host" data-testid="entity-presentation-canvas-host" />
          {!ready ? <p role="status">Loading presentation assets…</p> : null}
          <p className="entity-lab-cell-note">Outlined area: one 64×64 runtime grid cell.</p>
        </section>

        <aside className="entity-lab-controls" aria-label="Entity calibration controls">
          <div className="entity-lab-selects">
            <label className="field entity-lab-profile-field">
              <span>Profile</span>
              <select
                data-testid="entity-lab-profile"
                value={profileId}
                onChange={(event) => changeProfile(event.target.value)}
              >
                {ENTITY_PRESENTATION_LAB_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Direction</span>
              <select
                data-testid="entity-lab-direction"
                value={direction}
                onChange={(event) => setDirection(event.target.value as EntityPresentationLabDirection)}
              >
                <option value="down">Down</option>
                <option value="up">Up</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>

            <label className="field">
              <span>Pose</span>
              <select
                data-testid="entity-lab-pose"
                value={pose}
                onChange={(event) => setPose(event.target.value as EntityPresentationLabPose)}
              >
                {selectedProfile?.poses.map((profilePose) => (
                  <option key={profilePose} value={profilePose}>
                    {profilePose}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Edit values for</span>
              <select
                data-testid="entity-lab-edit-target"
                value={editTarget}
                onChange={(event) => changeEditTarget(event.target.value as EditTarget)}
              >
                <option value="general">General</option>
                <option value="specific">Selected entity</option>
              </select>
            </label>

            <label className="field">
              <span>Grid cell fill</span>
              <select
                data-testid="entity-lab-cell-fill"
                value={cellFill}
                onChange={(event) => setCellFill(event.target.value as EntityPresentationLabCellFill)}
              >
                <option value="purple">Purple</option>
                <option value="white">White</option>
              </select>
            </label>
          </div>

          <p className="entity-lab-profile-source" data-testid="entity-lab-profile-source">
            Source: {profileSource}
          </p>

          <section aria-labelledby="entity-lab-body-title">
            <h2 id="entity-lab-body-title">Ground and body</h2>
            <RangeControl
              label="Ground Y"
              testId="entity-lab-ground-y"
              value={draft.groundY}
              min={0}
              max={32}
              onChange={(groundY) => setDraft((current) => ({ ...current, groundY }))}
            />
            <RangeControl
              label="Foot X"
              testId="entity-lab-foot-x"
              value={draft.bodyFoot.x}
              min={0}
              max={16}
              step={0.5}
              onChange={(x) => setDraft((current) => ({ ...current, bodyFoot: { ...current.bodyFoot, x } }))}
            />
            <RangeControl
              label="Foot Y"
              testId="entity-lab-foot-y"
              value={draft.bodyFoot.y}
              min={0}
              max={16}
              step={0.5}
              onChange={(y) => setDraft((current) => ({ ...current, bodyFoot: { ...current.bodyFoot, y } }))}
            />
            <RangeControl
              label="Scale"
              testId="entity-lab-body-scale"
              value={draft.bodyScale}
              min={1}
              max={8}
              step={0.1}
              onChange={(bodyScale) => setDraft((current) => ({ ...current, bodyScale }))}
            />
          </section>

          <section aria-labelledby="entity-lab-shadow-title">
            <h2 id="entity-lab-shadow-title">Shared shadow</h2>
            <RangeControl
              label="Offset X"
              testId="entity-lab-shadow-x"
              value={draft.shadow.offsetX}
              min={-16}
              max={16}
              onChange={(offsetX) => setDraft((current) => ({ ...current, shadow: { ...current.shadow, offsetX } }))}
            />
            <RangeControl
              label="Offset Y"
              testId="entity-lab-shadow-y"
              value={draft.shadow.offsetY}
              min={-12}
              max={12}
              onChange={(offsetY) => setDraft((current) => ({ ...current, shadow: { ...current.shadow, offsetY } }))}
            />
            <RangeControl
              label="Radius X"
              testId="entity-lab-shadow-radius-x"
              value={draft.shadow.radiusX}
              min={4}
              max={40}
              onChange={(radiusX) => setDraft((current) => ({ ...current, shadow: { ...current.shadow, radiusX } }))}
            />
            <RangeControl
              label="Radius Y"
              testId="entity-lab-shadow-radius-y"
              value={draft.shadow.radiusY}
              min={1}
              max={16}
              onChange={(radiusY) => setDraft((current) => ({ ...current, shadow: { ...current.shadow, radiusY } }))}
            />
            <RangeControl
              label="Alpha"
              testId="entity-lab-shadow-alpha"
              value={draft.shadow.alpha}
              min={0}
              max={1}
              step={0.05}
              onChange={(alpha) => setDraft((current) => ({ ...current, shadow: { ...current.shadow, alpha } }))}
            />
          </section>

          <div className="entity-lab-toggles">
            <label>
              <input
                type="checkbox"
                checked={shadowVisible}
                onChange={(event) => setShadowVisible(event.target.checked)}
              />
              Shadow
            </label>
            <label>
              <input
                type="checkbox"
                checked={guidesVisible}
                onChange={(event) => setGuidesVisible(event.target.checked)}
              />
              Ground guides
            </label>
          </div>

          <div className="entity-lab-actions">
            <button
              type="button"
              data-testid="entity-lab-apply-profile"
              disabled={writingCatalog}
              onClick={() => void applyProfile()}
            >
              Apply Profile to JSON
            </button>
            <button type="button" data-testid="entity-lab-reset-profile" onClick={resetProfile}>
              Reset Profile
            </button>
            <button
              type="button"
              data-testid="entity-lab-use-general"
              disabled={writingCatalog || editTarget !== "specific" || !hasSpecificOverride}
              onClick={() => void useGeneralProfile()}
            >
              Use General
            </button>
          </div>

          <section aria-labelledby="entity-lab-catalog-title">
            <div className="entity-lab-export-heading">
              <h2 id="entity-lab-catalog-title">Profile catalog JSON</h2>
              <button
                type="button"
                data-testid="entity-lab-copy-catalog"
                disabled={!clipboardAvailable}
                onClick={() => void copyCatalog()}
              >
                Copy JSON
              </button>
            </div>
            <textarea
              className="entity-lab-catalog-text"
              data-testid="entity-lab-catalog-json"
              aria-label="Entity presentation profile catalog JSON"
              spellCheck={false}
              value={catalogText}
              onChange={(event) => setCatalogText(event.target.value)}
            />
            <div className="entity-lab-actions">
              <button
                type="button"
                data-testid="entity-lab-import-catalog"
                disabled={writingCatalog}
                onClick={() => void importCatalog()}
              >
                Import JSON
              </button>
              <button
                type="button"
                data-testid="entity-lab-reload-runtime"
                disabled={writingCatalog}
                onClick={() => void reloadRuntimeCatalog()}
              >
                Reload Runtime Catalog
              </button>
            </div>
          </section>

          {operationStatus ? (
            <p className="entity-lab-copy-status" data-testid="entity-lab-operation-status" role="status">
              {operationStatus}
            </p>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
