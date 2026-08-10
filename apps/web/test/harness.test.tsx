// @vitest-environment jsdom
/**
 * Canary for the UI test harness itself (SESSION_HANDOFF trap: the gate was
 * blind to UI until this stage). Proves that .tsx tests under apps/web/test
 * are collected, run in a real DOM, and can render React components — so a
 * later UI test can never pass vacuously against a missing environment.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

describe("UI test harness", () => {
  it("runs in a jsdom environment", () => {
    expect(typeof document).toBe("object");
    expect(document.createElement("div").nodeType).toBe(1);
  });

  it("renders React components into the DOM", () => {
    render(<button type="button">canary</button>);
    expect(screen.getByRole("button", { name: "canary" })).toBeTruthy();
  });
});
