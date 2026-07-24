// Shared entry point for component tests: the panel-render layer that renders a single React
// component into jsdom and asserts the DOM a user would see, without a browser, PixiJS, or a dev
// server. Every component test imports `render`/`screen`/`userEvent` from here so jest-dom matchers
// and automatic unmount cleanup are wired in one place. See dev/standards/test_economy_standard.md.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

export { render, screen, within, fireEvent } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
