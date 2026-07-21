export interface VolumeSettings {
  readonly master: number;
  readonly effect: number;
  readonly music: number;
}

export interface SettingsPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly showDebugOverlay: boolean;
  readonly onShowDebugOverlayChange: (value: boolean) => void;
  readonly volume: VolumeSettings;
  readonly onMasterVolumeChange: (value: number) => void;
  readonly onEffectVolumeChange: (value: number) => void;
  readonly onMusicVolumeChange: (value: number) => void;
  readonly muteAudioInBackground: boolean;
  readonly onMuteAudioInBackgroundChange: (value: boolean) => void;
  readonly onRestart: () => void;
}

/**
 * The settings gear and its dialog. Pure presentation driven by props: the session owns the open
 * state (so it can suppress gameplay input while the panel is open) and the settings values. The
 * volume sliders and background-audio toggle always render; the debug-overlay toggle renders only in
 * development builds.
 */
export function SettingsPanel({
  open,
  onOpenChange,
  showDebugOverlay,
  onShowDebugOverlayChange,
  volume,
  onMasterVolumeChange,
  onEffectVolumeChange,
  onMusicVolumeChange,
  muteAudioInBackground,
  onMuteAudioInBackgroundChange,
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
          volume={volume}
          onMasterVolumeChange={onMasterVolumeChange}
          onEffectVolumeChange={onEffectVolumeChange}
          onMusicVolumeChange={onMusicVolumeChange}
          muteAudioInBackground={muteAudioInBackground}
          onMuteAudioInBackgroundChange={onMuteAudioInBackgroundChange}
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
  readonly volume: VolumeSettings;
  readonly onMasterVolumeChange: (value: number) => void;
  readonly onEffectVolumeChange: (value: number) => void;
  readonly onMusicVolumeChange: (value: number) => void;
  readonly muteAudioInBackground: boolean;
  readonly onMuteAudioInBackgroundChange: (value: boolean) => void;
  readonly onRestart: () => void;
}

function SettingsDialog({
  onClose,
  showDebugOverlay,
  onShowDebugOverlayChange,
  volume,
  onMasterVolumeChange,
  onEffectVolumeChange,
  onMusicVolumeChange,
  muteAudioInBackground,
  onMuteAudioInBackgroundChange,
  onRestart,
}: SettingsDialogProps) {
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

        <hr className="settings-divider" />
        <VolumeSlider
          label="Master volume"
          testId="settings-volume-master"
          value={volume.master}
          onChange={onMasterVolumeChange}
        />
        <VolumeSlider
          label="Effect volume"
          testId="settings-volume-effect"
          value={volume.effect}
          onChange={onEffectVolumeChange}
        />
        <VolumeSlider
          label="Music volume"
          testId="settings-volume-music"
          value={volume.music}
          onChange={onMusicVolumeChange}
        />

        <label className="settings-row">
          <input
            type="checkbox"
            data-testid="settings-mute-background-toggle"
            checked={muteAudioInBackground}
            onChange={(event) => onMuteAudioInBackgroundChange(event.target.checked)}
          />
          <span>Mute audio in background</span>
        </label>

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

interface VolumeSliderProps {
  readonly label: string;
  readonly testId: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}

/** A `0..1` volume slider. The stored value is the fraction; the input works in whole percent steps. */
function VolumeSlider({ label, testId, value, onChange }: VolumeSliderProps) {
  return (
    <label className="settings-row settings-volume">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        data-testid={testId}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(event.target.valueAsNumber / 100)}
      />
    </label>
  );
}
