import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// findBy*/waitFor default to a 1s budget, which is independent of Vitest's
// own testTimeout. That is plenty for a single file but not when the whole
// suite runs in parallel and several jsdom environments compete for the
// event loop -- page-level tests were failing there while passing in
// isolation. Give the retry loop room; a genuinely missing element still
// fails, just a few seconds later.
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  globalThis.sessionStorage?.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
