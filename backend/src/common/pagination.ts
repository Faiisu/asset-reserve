import { ApiException } from "./api-exception.js";

export type CursorValue = { createdAt: string; id: string };

export function encodeCursor(value: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: value.createdAt.toISOString(), id: value.id }),
  ).toString("base64url");
}

export function decodeCursor(cursor?: string): CursorValue | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as CursorValue;
    if (!parsed.id || Number.isNaN(Date.parse(parsed.createdAt)))
      throw new Error("Invalid cursor");
    return parsed;
  } catch {
    throw new ApiException(
      400,
      "INVALID_REQUEST",
      "The pagination cursor is invalid.",
      {
        cursor: "Use the opaque cursor returned by the previous response.",
      },
    );
  }
}

export function pageInfo<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
) {
  const hasNextPage = rows.length > limit;
  const data = hasNextPage ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return {
    data,
    pageInfo: {
      nextCursor: hasNextPage && last ? encodeCursor(last) : null,
      hasNextPage,
    },
  };
}
