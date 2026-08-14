export type TokenClaims = {
  sub?: string;
  jti?: string;
  iat?: number;
  exp?: number;
};

export function decodeTokenClaims(token: string): TokenClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as TokenClaims;
  } catch {
    return null;
  }
}

export function secondsUntilExpiry(
  claims: TokenClaims | null,
  now = Date.now(),
): number | null {
  return claims?.exp ? Math.max(0, claims.exp - Math.floor(now / 1000)) : null;
}

export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return "ไม่ทราบเวลา";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
