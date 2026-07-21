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
 * debug-overlay toggle renders only in development builds; production shows the Back/Restart footer.
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
        <h2 className="settings-title">Settings</h2>

        {import.meta.env.DEV ? (
          <>
            <hr className="settings-divider" />
            <label className="settings-row">
              <input
                type="checkbox"
                data-testid="settings-debug-toggle"
                checked={showDebugOverlay}
                onChange={(event) => onShowDebugOverlayChange(event.target.checked)}
              />
              <span>Debug mode</span>
            </label>
          </>
        ) : null}

        <hr className="settings-divider" />
        <div className="settings-footer">
          <button type="button" className="settings-back" data-testid="settings-back" onClick={onClose}>
            Back
          </button>
          <button
            type="button"
            className="settings-restart"
            data-testid="settings-restart"
            onClick={() => {
              onRestart();
              onClose();
            }}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  );
}
