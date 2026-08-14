import { describe, expect, it } from "vitest";
import {
  PERMISSION_KEYS,
  normalizePermissions,
} from "../src/access-control/permissions.js";

describe("permission catalog", () => {
  it("contains the twelve contract permission keys", () => {
    expect(PERMISSION_KEYS).toHaveLength(12);
  });

  it("deduplicates, sorts, and rejects unknown values", () => {
    expect(
      normalizePermissions([
        "user:create",
        "asset:view",
        "user:create",
        "other",
      ]),
    ).toEqual(["asset:view", "user:create"]);
  });
});
