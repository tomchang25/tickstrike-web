// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, userEvent } from "./harness";
import { SettingsPanel, type SettingsPanelProps } from "@ui/settings/settings-panel";

function baseProps(overrides: Partial<SettingsPanelProps> = {}): SettingsPanelProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    showDebugOverlay: false,
    onShowDebugOverlayChange: vi.fn(),
    volume: { master: 0.4, effect: 0.6, music: 0.8 },
    onMasterVolumeChange: vi.fn(),
    onEffectVolumeChange: vi.fn(),
    onMusicVolumeChange: vi.fn(),
    muteAudioInBackground: true,
    onMuteAudioInBackgroundChange: vi.fn(),
    turnOrderPacing: "fast",
    onTurnOrderPacingChange: vi.fn(),
    onRestart: vi.fn(),
    ...overrides,
  };
}

describe("SettingsPanel", () => {
  it("renders the dialog only while open", () => {
    const { rerender } = render(<SettingsPanel {...baseProps({ open: false })} />);
    expect(screen.queryByTestId("settings-panel")).not.toBeInTheDocument();

    rerender(<SettingsPanel {...baseProps({ open: true })} />);
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
  });

  it("shows each stored volume fraction as whole percent", () => {
    render(<SettingsPanel {...baseProps()} />);

    expect(screen.getByTestId("settings-volume-master")).toHaveValue("40");
    expect(screen.getByTestId("settings-volume-effect")).toHaveValue("60");
    expect(screen.getByTestId("settings-volume-music")).toHaveValue("80");
  });

  it("reports a slider change back as a 0..1 fraction", () => {
    const onMasterVolumeChange = vi.fn();
    render(<SettingsPanel {...baseProps({ onMasterVolumeChange })} />);

    fireEvent.change(screen.getByTestId("settings-volume-master"), { target: { value: "25" } });
    expect(onMasterVolumeChange).toHaveBeenCalledWith(0.25);
  });

  it("reflects the background-mute state and reports a toggle", async () => {
    const onMuteAudioInBackgroundChange = vi.fn();
    render(<SettingsPanel {...baseProps({ onMuteAudioInBackgroundChange })} />);

    const toggle = screen.getByTestId("settings-mute-background-toggle");
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(onMuteAudioInBackgroundChange).toHaveBeenCalledWith(false);
  });

  it("reflects the turn-order pacing and reports a selection", async () => {
    const onTurnOrderPacingChange = vi.fn();
    render(<SettingsPanel {...baseProps({ turnOrderPacing: "fast", onTurnOrderPacingChange })} />);

    const select = screen.getByTestId("settings-turn-order-pacing");
    expect(select).toHaveValue("fast");
    await userEvent.selectOptions(select, "normal");
    expect(onTurnOrderPacingChange).toHaveBeenCalledWith("normal");
  });

  it("restarts and closes from the footer control", async () => {
    const onRestart = vi.fn();
    const onOpenChange = vi.fn();
    render(<SettingsPanel {...baseProps({ onRestart, onOpenChange })} />);

    await userEvent.click(screen.getByTestId("settings-restart"));
    expect(onRestart).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
