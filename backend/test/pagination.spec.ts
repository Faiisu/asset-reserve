import { describe, expect, it } from "vitest";
import { ApiException } from "../src/common/api-exception.js";
import {
  decodeCursor,
  encodeCursor,
  pageInfo,
} from "../src/common/pagination.js";

describe("cursor pagination", () => {
  it("round-trips an opaque cursor", () => {
    const createdAt = new Date("2026-08-15T09:00:00.000Z");
    const cursor = encodeCursor({ id: "item-1", createdAt });
    expect(decodeCursor(cursor)).toEqual({
      id: "item-1",
      createdAt: createdAt.toISOString(),
    });
  });

  it("rejects malformed cursors with the API error contract", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(ApiException);
    try {
      decodeCursor("not-a-cursor");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_REQUEST" });
    }
  });

  it("returns one bounded page and a cursor", () => {
    const rows = [
      { id: "3", createdAt: new Date("2026-08-15T03:00:00Z") },
      { id: "2", createdAt: new Date("2026-08-15T02:00:00Z") },
      { id: "1", createdAt: new Date("2026-08-15T01:00:00Z") },
    ];
    const page = pageInfo(rows, 2);
    expect(page.data).toHaveLength(2);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(page.pageInfo.nextCursor).toBeTypeOf("string");
  });
});
