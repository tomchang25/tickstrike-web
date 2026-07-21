import { useEffect, useState } from "react";

export interface SettingsPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly showDebugOverlay: boolean;
  readonly onShowDebugOverlayChange: (value: boolean) => void;
  readonly onRestart: () => void;
}

/**
 * The settings gear and its dialog. Pure presentation driven by props: the session owns the open
 * state (so it can suppress gameplay input while the panel is open) and the settings values. The
 * debug-overlay toggle renders only in development builds; production shows the Restart action alone.
 */
export function SettingsPanel({
  open,
  onOpenChange,
  showDebugOverlay,
  onShowDebugOverlayChange,
  onRestart,
}: SettingsPanelProps) {
  return (
    <>
      <button
        type="button"
        className="settings-gear"
        data-testid="settings-open"
        aria-label="Open settings"
        aria-haspopup="dialog"
        onClick={() => onOpenChange(true)}
      >
        ⚙
      </button>
      {open ? (
        <SettingsDialog
          onClose={() => onOpenChange(false)}
          showDebugOverlay={showDebugOverlay}
          onShowDebugOverlayChange={onShowDebugOverlayChange}
          onRestart={onRestart}
        />
      ) : null}
    </>
  );
}

interface SettingsDialogProps {
  readonly onClose: () => void;
  readonly showDebugOverlay: boolean;
  readonly onShowDebugOverlayChange: (value: boolean) => void;
  readonly onRestart: () => void;
}

function SettingsDialog({ onClose, showDebugOverlay, onShowDebugOverlayChange, onRestart }: SettingsDialogProps) {
  const [confirmingRestart, setConfirmingRestart] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-dialog"
        data-testid="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <h2>Settings</h2>
          <button type="button" className="settings-close" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </div>

        {import.meta.env.DEV ? (
          <label className="settings-row">
            <input
              type="checkbox"
              data-testid="settings-debug-toggle"
              checked={showDebugOverlay}
              onChange={(event) => onShowDebugOverlayChange(event.target.checked)}
            />
            <span>Debug overlay</span>
          </label>
        ) : null}

        <div className="settings-row settings-restart-row">
          {confirmingRestart ? (
            <>
              <span className="settings-restart-warning">Restart the run? Progress is lost.</span>
              <div className="settings-restart-actions">
                <button
                  type="button"
                  className="settings-restart-confirm"
                  data-testid="settings-restart-confirm"
                  onClick={() => {
                    onRestart();
                    onClose();
                  }}
                >
                  Restart
                </button>
                <button type="button" onClick={() => setConfirmingRestart(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="settings-restart"
              data-testid="settings-restart"
              onClick={() => setConfirmingRestart(true)}
            >
              Restart run
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
