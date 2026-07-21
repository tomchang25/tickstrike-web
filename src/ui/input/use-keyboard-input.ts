import { useEffect, useRef } from "react";
import type { Cell } from "@core/model/types";
import { ATTACK_KEYS, MOBILITY_MODIFIER_KEY, MOVE_KEYS, normalizeKey } from "./keymap";

// Held-direction movement steps at a fixed cadence — the movement-rate design parameter — rather
// than being paced by animation length. It matches the presentation's move duration (0.26 s) so the
// felt rate is unchanged, but enqueue-triggered fast-forward now trims any longer enemy VFX tail.
const MOVE_REPEAT_MS = 260;

export interface KeyboardInputHandlers {
  move(direction: Cell): void;
  attack(direction: Cell): void;
  setMobilityActive(active: boolean): void;
}

export interface KeyboardInputOptions {
  /** Whether gameplay input is currently accepted (overlay-closed, encounter running). */
  interactive: boolean;
  handlers: KeyboardInputHandlers;
}

/**
 * Owns the window keyboard listeners for Move (WASD/arrows, held-repeat) and Normal Attack (IJKL),
 * plus the Alt Mobility modifier. Listeners register once per mount and read the latest options
 * through refs, so an `interactive` change never re-registers or flickers `data-keyboard-input-ready`.
 * Blur and visibility-hidden release held movement and reset Mobility mode, fixing the stuck-Alt case.
 * The hook never touches the runtime; it only invokes the supplied handlers, which self-gate.
 */
export function useKeyboardInput({ interactive, handlers }: KeyboardInputOptions): void {
  const interactiveRef = useRef(interactive);
  const handlersRef = useRef(handlers);
  interactiveRef.current = interactive;
  handlersRef.current = handlers;

  useEffect(() => {
    const heldMovement = new Map<string, number>();

    const stopHeldMovement = () => {
      for (const timer of heldMovement.values()) {
        window.clearInterval(timer);
      }
      heldMovement.clear();
    };

    const releaseAll = () => {
      stopHeldMovement();
      handlersRef.current.setMobilityActive(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === MOBILITY_MODIFIER_KEY) {
        if (interactiveRef.current) {
          event.preventDefault();
          handlersRef.current.setMobilityActive(true);
        }
        return;
      }
      if (!interactiveRef.current) {
        return;
      }
      const key = normalizeKey(event.key);
      const moveDirection = MOVE_KEYS[key];
      if (moveDirection) {
        event.preventDefault();
        if (heldMovement.has(key)) {
          return;
        }
        // Fire on a fixed cadence; move() keeps the interactive/runtime guards, and enqueueing a
        // step while the previous turn still animates fast-forwards it rather than dropping it.
        const repeatMove = () => {
          handlersRef.current.move(moveDirection);
        };
        repeatMove();
        heldMovement.set(key, window.setInterval(repeatMove, MOVE_REPEAT_MS));
        return;
      }
      const attackDirection = ATTACK_KEYS[key];
      if (attackDirection) {
        if (event.repeat) {
          return;
        }
        event.preventDefault();
        handlersRef.current.attack(attackDirection);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === MOBILITY_MODIFIER_KEY) {
        handlersRef.current.setMobilityActive(false);
      }
      const key = normalizeKey(event.key);
      const timer = heldMovement.get(key);
      if (timer !== undefined) {
        window.clearInterval(timer);
        heldMovement.delete(key);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        releaseAll();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.documentElement.dataset.keyboardInputReady = "true";

    return () => {
      stopHeldMovement();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      delete document.documentElement.dataset.keyboardInputReady;
    };
  }, []);
}
