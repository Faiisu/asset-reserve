# Google integrations: email notifications, Google Sign-In, Google Calendar sync

> **Status (2026-08-17):** Phase A shipped on
> [`feature/email-notifications`](https://github.com/Faiisu/asset-reserve/tree/feature/email-notifications)
> (not yet merged). **Phase B shipped, in a substantially revised form, on
> `feature/username-google-linking`** as part of switching admin-created
> accounts to username + password (no email/name collected up front) with
> *mandatory* Google linking -- see that branch for the actual design.
> The Phase B section below is kept for history but is superseded: its
> "login-by-email-match" idea no longer applies (accounts have no email to
> match against at creation), and the callback's "connect" branch became
> the *only* way a Google identity is ever linked, not just a Phase C
> stub. Phase C (Calendar sync) is still designed below and not started;
> it can still reuse the shipped `/connect` flow as planned. **Microsoft/Outlook
> was added as a second, independent linking provider on
> `feature/microsoft-outlook-linking`** (branched from the above) --
> linking either provider satisfies the mandatory-link gate, which is why
> the guard/config/frontend pages are named provider-generically
> (`AccountLinkGuard`, `requireAccountLink()`, `ConnectAccountPage`) rather
> than Google-specifically. For the dev/deploy toggle and the actual
> Google Cloud Console / Azure App Registration setup steps (local testing
> and real customer deployment, both providers), see
> [`oauth-setup.md`](./oauth-setup.md) instead of this doc.

## Context

The user asked how to "link Google mail to the application." That turned out to bundle three
distinct, confirmed asks:

1. **Send emails via Gmail** (SMTP + App Password — chosen over the Gmail API/OAuth2 route
   after confirming both are free; SMTP needs far less one-time setup) for three events:
   reservation submitted, reservation approved/rejected, return decision.
2. **"Sign in with Google"** — but strictly *linking* to an existing, admin-created user by
   email match. This app is invite-only ("Use the account created for you by an administrator");
   Google sign-in must never auto-provision a new account.
3. **Sync approved reservations to Google Calendar** — each user connects *their own* calendar
   (not one shared team calendar), reusing the same OAuth flow as sign-in.

The database already has an unused `UserAuthIdentity` model (`prisma/models/users.prisma:43-57`,
comment: "External authentication provider, for example: google or microsoft") — clearly
scaffolded for exactly #2, but nothing writes to it yet. Everything else (email infra, OAuth
client, calendar sync, encrypted token storage) is genuinely new.

This plan intentionally sequences delivery: **Phase A (email) is fully independent and ships
first.** Phase B (Sign-In) builds the OAuth plumbing. Phase C (Calendar) extends Phase B's same
callback route with a second scope — it cannot come before B.

Three manual setup checklists exist at the end (§4) for things only the user can do (Google
Cloud Console OAuth client, Gmail App Password) — Claude Code cannot create Google credentials.

---

## Phase A — Email notifications (Nodemailer + Gmail SMTP) ✅ done

**New reservation lifecycle event bus**, mirroring the existing pattern at
`backend/src/common/asset-lifecycle.events.ts` / `asset-lifecycle.module.ts` (used today by
`AssetsService` → `RecognitionLifecycleListener` for best-effort side effects that never block
or roll back the primary write):
- `backend/src/common/reservation-lifecycle.events.ts` — `@Injectable() ReservationLifecycleEvents`
  wrapping `EventEmitter`, four typed events: `submitted`, `decided`, `cancelled`, `returnDecided`.
- `backend/src/common/reservation-lifecycle.module.ts` — `@Global()`, provides+exports it. Register
  once in `AppModule.imports` (alongside the existing `AssetLifecycleModule` line).

**Emit call sites** (all emitted *after* the transaction commits, never inside it — same rule
`AssetsService` follows):
- `ReservationsService.submit()` (`reservations.service.ts:332-371`) — on the
  `PENDING_APPROVAL` path only, resolve approvers via a new private
  `findApproverRecipients(managementAreaIds)` (loads `UserRole` rows where
  `managementAreaId` is `null` OR in the affected areas — `null` means global per
  `prisma/models/rbac.prisma:20-21` — filters by `reservation:approve` via the existing
  `normalizePermissions` from `src/access-control/permissions.ts`), then `emitSubmitted(...)`.
- `ReservationsService.decideItems()` (`reservations.service.ts:385-505`) — capture the
  recomputed status returned from the transaction, emit `emitDecided({..., status, decision})`
  after it (this event also drives Phase C's calendar creation — one event, two listeners).
- `ReservationsService.cancel()` (`reservations.service.ts:966-1013`) — `emitCancelled(...)`
  (used by Phase C for calendar deletion; no email trigger on cancel per the confirmed scope).
- `ReturnsService.decide()` (`returns.service.ts:437-784`) — `emitReturnDecided(...)`, reusing
  the already-present `returnDetailInclude` (`returns.service.ts:18-45`) which nests
  `reservation.requester.profile` for the name/email.

Both `ReservationsService` and `ReturnsService` constructors gain a second parameter:
`private readonly reservationEvents: ReservationLifecycleEvents`.

**New email module**, `backend/src/email/`:
- `email-templates.ts` — pure functions, no I/O: `reservationSubmittedEmail`,
  `reservationDecidedEmail`, `returnDecidedEmail`, each returning `{subject, html}`.
- `email.service.ts` — `EmailService`. Constructor reads `appConfig.smtp()` once; if `null`
  (unconfigured), the transporter stays `null` and every send silently no-ops with a
  `console.warn` (so the app boots fine without SMTP configured, e.g. in dev/CI). `deliver()`
  wraps `nodemailer`'s `sendMail` in try/catch and never throws — matches
  `RecognitionService.setDisabled`'s "never blocks the primary action" contract exactly.
- `email-lifecycle.listener.ts` — `@Injectable() implements OnModuleInit`, subscribes to the
  three relevant events in `onModuleInit()`, calls the matching `EmailService` method with `void`
  (fire-and-forget), mirroring `recognition-lifecycle.listener.ts` precisely.
- `email.module.ts` — registers `EmailService` + `EmailLifecycleListener`. Add to `AppModule`.

**Config** (`backend/src/config.ts`): new `smtp()` getter — returns `null` if
`SMTP_USER`/`SMTP_APP_PASSWORD` are both absent (feature disabled), throws if only one is set
(misconfiguration), else returns `{host, port, user, appPassword, fromEmail, fromName}` with
`smtp.gmail.com`/`465` defaults. This is the first "optional feature, enabled only if env vars
are present" pattern in this config file — introduce it here, matching `jwtSecret()`'s
fail-fast-on-partial-config style but adding the "fully absent = disabled" branch it doesn't have.

**New dependencies**: `nodemailer` (+ `@types/nodemailer` dev dep).

---

## Phase B — Google Sign-In (not started)

**New module**, `backend/src/google-auth/`:
- `google-oauth-client.ts` — plain function `createOAuth2Client()` (not a Nest provider — keeps
  this dependency-free so Phase C's calendar module can reuse it without a module import), reads
  `appConfig.googleAuth()`, returns a `google-auth-library` `OAuth2Client`.
- `google-auth.dto.ts` — `GoogleCallbackQueryDto {code?, state?, error?}`.
- `google-auth.service.ts`:
  - `buildAuthUrl(scope, state, {forceConsent?})` — `access_type: "offline"` always; **Google
    only issues a `refresh_token` on first consent unless `prompt=consent` is forced** — Phase C's
    `/connect` endpoint must always pass `forceConsent: true` so reconnecting after a disconnect
    reliably yields a fresh refresh token.
  - `exchangeCode(code)` — token exchange + ID-token verification (`sub`, `email`,
    `email_verified`, `name`).
  - `signState(payload)` / `verifyState(token)` — signs `{purpose: "login"}` or
    `{purpose: "connect", userId}` via the existing `JwtService` (short `expiresIn: "10m"`,
    separate from the access-token TTL). **This is how the one callback route tells the two
    flows apart** — the state token is the discriminator, and it's signed so it can't be
    tampered with client-side.
- `google-auth.controller.ts` (`@Controller("auth/google")`):
  - `GET /login` — `@Public()`. Redirect to Google with `["openid","email","profile"]` scope,
    `state = signState({purpose:"login"})`.
  - `GET /connect` — authenticated. Redirect with those scopes **plus**
    `https://www.googleapis.com/auth/calendar.events`, `state = signState({purpose:"connect", userId})`,
    `forceConsent: true`. (Phase C wires the persistence side of this; the route itself belongs
    here since it shares the callback.)
  - `GET /callback` — `@Public()`. Verify `state`; branch on `purpose`:
    - `"login"`: exchange code → verify `email_verified`. Look up `UserAuthIdentity` by
      `[provider, providerUserId]` (existing composite unique). If missing, look up `User` by
      lowercased email (matching `LoginDto`'s `.trim().toLowerCase()` convention in
      `auth/auth.dto.ts`) — **found → link (create the `UserAuthIdentity` row) and log in; not
      found → redirect to `${frontendBaseUrl}/login?googleError=no_account`, never create a
      user.** Inactive user → `googleError=inactive`. On success, build a session exactly like
      `AuthService.login()` does (`sessions.getActor` + `jwt.signAsync({sub, jti})`), redirect to
      `${frontendBaseUrl}/auth/google/callback?token=...`.
    - `"connect"` (Phase C): handled there.
- `google-auth.module.ts` — `imports: [AuthModule]` to reuse `SessionService`/`JwtService`.
  **Requires one small edit to `auth/auth.module.ts`**: `exports: [SessionService]` →
  `exports: [SessionService, JwtModule]`, so `JwtService` doesn't need a second, divergent
  registration.

**Config**: new `googleAuth()` getter (same "all-or-nothing, else throws" pattern as `smtp()`) for
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`; new required
`frontendBaseUrl()` (first time the backend needs to know the frontend's own origin — used to
build the post-login redirect).

**New dependencies**: `googleapis`, `google-auth-library`.

### Frontend (Phase B)

- `frontend/src/pages/LoginPage.tsx` — after the `</form>` (~line 105), a real
  `<a href="/api/v1/auth/google/login">Continue with Google</a>` (full navigation, **not** an
  `onClick`/`api.ts` call — it must leave the SPA to reach Google, consistent with how the app
  never builds absolute backend URLs and stays same-origin/relative everywhere). Surface
  `?googleError=...` from `useSearchParams()` in the existing error-alert slot.
- New `frontend/src/pages/GoogleCallbackPage.tsx` — reads `?token=`, calls the existing
  `setAccessToken()` (from `api.ts`) then `useAuth().refresh()` (already does exactly
  "read token, call `/bff/session`, hydrate session" — reuse it instead of duplicating
  `LoginPage`'s login logic), navigates to `/`.
- Route in `frontend/src/app.tsx`: `<Route path="auth/google/callback" element={<GoogleCallbackPage />} />`
  as a **top-level** route (sibling of `/login`, outside `ProtectedApp` — must be reachable
  pre-authentication).

---

## Phase C — Google Calendar sync (not started)

**Schema additions**:
- `prisma/models/users.prisma` — new model `UserGoogleCalendarConnection` (one row per user,
  `userId` as PK): `googleAccountEmail`, `refreshTokenCipher` (encrypted, see below), `scope`,
  `connectedAt`, `updatedAt`. Kept **separate from `UserAuthIdentity`** deliberately —
  `UserAuthIdentity` is pure identity-for-login (provider-agnostic, no tokens); this table holds
  an ongoing, renewable credential that login itself never needs to persist.
- `prisma/models/reservations.prisma` — one nullable column on `Reservation`:
  `googleCalendarEventId String?`. No `include`/`select` changes needed anywhere that already
  fetches a `Reservation` — Prisma returns scalar columns by default.
- The refresh token is encrypted at rest (it grants standing write access to someone's personal
  calendar): new `backend/src/common/secret-cipher.ts` (`encryptSecret`/`decryptSecret`, AES-256-GCM,
  random IV per call, using Node's built-in `node:crypto` — no new dependency). Key from a new
  required env var `TOKEN_ENCRYPTION_KEY` (base64, must decode to exactly 32 bytes — validated in
  `config.ts` the same way `jwtSecret()` validates length).
- Run `npx prisma migrate dev --name google_integrations` after both model edits.

**`google-auth.controller.ts`'s `/callback`, `"connect"` branch** (completing Phase B's stub):
exchange code (now includes a `refresh_token` since `/connect` forced consent) → if no
`refresh_token` came back (user denied offline access — an edge case, not the happy path),
redirect `?googleError=no_refresh_token`; else `upsert` the connection row with the encrypted
token, redirect to `${frontendBaseUrl}/settings?googleCalendar=connected`. Also:
- `GET /auth/google/calendar-connection` — authenticated, returns
  `{connected, googleAccountEmail, connectedAt}`.
- `DELETE /auth/google/calendar-connection` — authenticated, deletes the row (best-effort token
  revocation via Google, swallowed on failure — the DB delete is what actually matters).

**New module**, `backend/src/google-calendar/`:
- `google-calendar.service.ts`:
  - `createEventForReservation(reservationId, requesterId, details)` — best-effort, never throws.
    Idempotency guard: if `googleCalendarEventId` is already set, return (v1 rule: create once on
    first `APPROVED`/`PARTIALLY_APPROVED` transition). No connection for the requester → silent
    skip (per the confirmed "each user connects their own; unconnected = silently skipped"
    decision — this is the expected common case, not a warning-worthy one). On success, persist
    the returned event id. On an invalid-grant/revoked-token error specifically, delete the stale
    connection row (so future attempts skip cleanly instead of erroring every time); any other
    error is `console.warn`-only.
  - `deleteEventForReservation(reservationId, requesterId)` — best-effort; clears
    `googleCalendarEventId` to `null` regardless of outcome (don't retry forever, don't leave a
    stale "synced" badge showing).
  - **Stated v1 limitation** (comment atop the file, not a silent gap): the event is created once
    on first approval and deleted on cancel — it is *not* kept in live sync with later
    approved change-requests (e.g. a subsequent approved batch, or a time change). A reasonable
    fast-follow, out of scope here.
- `google-calendar-lifecycle.listener.ts` — subscribes to `onDecided` (creates when status is
  `APPROVED`/`PARTIALLY_APPROVED`) and `onCancelled` (deletes), same `OnModuleInit` + `void`
  fire-and-forget pattern as Phase A/the recognition listener.
- `google-calendar.module.ts` — no `imports` needed (uses the global `PrismaService`, the global
  `ReservationLifecycleEvents`, and the plain-function OAuth client/cipher helpers — no coupling
  to `GoogleAuthModule`).

### Frontend (Phase C)

- New `frontend/src/pages/SettingsPage.tsx` — loads `/auth/google/calendar-connection` on mount;
  shows connected state (`Connected as <email>` + Disconnect button) or a
  `<a href="/api/v1/auth/google/connect">Connect Google Calendar</a>` link (again a real
  navigation, not a fetch call). Route: `<Route path="settings" element={<SettingsPage />} />`
  inside `ProtectedApp` (personal page, no permission gate).
- Nav entry: add a "Settings" link to the **profile popover** in
  `frontend/src/components/AppShell.tsx` (confirmed structure at lines ~176-209: the popover
  already renders `session?.user.email` + a Log out button) — right spot for an account-scoped
  page, not the main Workspace/Administration sidebar nav.
- `frontend/src/pages/ReservationDetailPage.tsx` — a small "Synced to calendar" badge next to the
  existing status pill (confirmed at `~line 505-508`), shown when `reservation.googleCalendarSynced`.
- `frontend/src/types.ts` — add `GoogleCalendarConnection` type; add
  `googleCalendarSynced: boolean` to `ReservationDetail`. Backend counterpart: add
  `googleCalendarSynced: Boolean(reservation.googleCalendarEventId)` to the object literal
  `ReservationsService.toDetail()` already returns (`reservations.service.ts:1220+`).
- `frontend/src/api.ts` — `googleCalendarConnection()` (GET) and `disconnectGoogleCalendar()`
  (DELETE), both through the existing `request<T>()` helper.

---

## §4 — Manual setup (only the user can do this; Claude Code cannot create Google credentials)

**Google Cloud Console** (needed for Phase B and C):
1. console.cloud.google.com → create/select a project.
2. APIs & Services → Library → enable **Google Calendar API**.
3. APIs & Services → OAuth consent screen → External (or Internal if on a Workspace domain) →
   add scopes `openid`, `.../userinfo.email`, `.../userinfo.profile`, `.../auth/calendar.events`
   → while in Testing mode, add the Google accounts you'll test with under "Test users".
4. APIs & Services → Credentials → Create Credentials → OAuth client ID → **Web application**.
5. Authorized redirect URIs → add the exact value that will become `GOOGLE_REDIRECT_URI`
   (e.g. `http://localhost:3000/api/v1/auth/google/callback` for local dev) — must match
   byte-for-byte.
6. Copy the Client ID/Secret into `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
7. Set `FRONTEND_BASE_URL` in `backend/.env` (e.g. `http://localhost:5173`).
8. `openssl rand -base64 32` → `TOKEN_ENCRYPTION_KEY` in `backend/.env`.
9. If the consent screen stays in "Testing" mode, only added test users can sign in/consent —
   publish it (or add every real user as a tester) before wider rollout.

**Gmail App Password** (needed for Phase A):
1. Enable 2-Step Verification on the sending Gmail/Workspace account
   (myaccount.google.com/security).
2. myaccount.google.com/apppasswords → create one (e.g. named "Asset Reservation SMTP") →
   copy the 16-character password.
3. `backend/.env`: `SMTP_USER` = that account's address, `SMTP_APP_PASSWORD` = the generated
   password.
4. Gmail requires `From` to match (or be a verified alias of) the authenticated account — keep
   `SMTP_FROM_EMAIL` equal to `SMTP_USER` unless a "Send As" alias is separately configured.
5. FYI: consumer Gmail caps around 500 sends/day, Workspace higher — fine for these 3 low-volume
   triggers.

New env vars land in `backend/.env.example` and `backend/.env.docker.example`, grouped under new
`#`-commented sections (`# Email (Gmail SMTP + App Password)`, `# Google Sign-In & Calendar Sync`),
matching the existing style in those files.

---

## Verification

**Phase A**: `test/reservations.service.spec.ts` and `test/returns.service.spec.ts` construct
`ReservationsService`/`ReturnsService` directly with a mock Prisma — every `new ReservationsService(x)`
/`new ReturnsService(x)` call site needs a second `reservationEvents` argument (a real
`new ReservationLifecycleEvents()` instance is enough, same precedent as
`test/assets.service.spec.ts`'s `const lifecycle = new AssetLifecycleEvents();`). Add spy
assertions (`reservationEvents.onSubmitted(spy)` etc.) to the existing submit/decideItems/decide
tests to confirm the right event fires with the right payload. New `test/email.service.spec.ts`
for the pure template functions + the "SMTP unconfigured → silent no-op, never throws" behavior.
Manual: real SMTP creds in `.env`, run the dev stack, submit → approve/reject → return-decide a
reservation through the UI, confirm 3 real emails land with correct content.

**Phase B**: `test/google-auth.service.spec.ts` for `signState`/`verifyState` round-trip and the
callback branch logic (existing identity → login; matching active user, no identity yet →
auto-link + login; no matching user → `no_account` redirect **and assert no `prisma.user.create`
call happens**; inactive user → `inactive` redirect) against a mocked Prisma. Manual E2E (can't be
unit-tested): complete the Cloud Console checklist, click "Continue with Google" with an account
matching an existing user → lands authenticated in the app; repeat with a non-matching Google
account → confirm the clear error and confirm (via the Users admin page or a DB check) that no
new user was created.

**Phase C**: unit-test `GoogleCalendarService` with `googleapis` mocked — no connection → no-op;
connection present → correct `insert` call + persisted event id; insert throws → swallowed,
resolves anyway; invalid-grant error → connection row deleted; delete clears the column
regardless of outcome. Extend the reservation specs to assert `emitDecided`/`emitCancelled` fire
correctly. Manual E2E: connect a real Google account from `/settings`, approve a reservation for
that user, confirm the event appears on calendar.google.com with the right title/time; cancel the
reservation, confirm the event disappears; separately approve a reservation for a user who never
connected and confirm approval still succeeds normally with no error surfaced.

### Critical files
- `backend/prisma/models/users.prisma`, `backend/prisma/models/reservations.prisma`
- `backend/src/reservations/reservations.service.ts`, `backend/src/returns/returns.service.ts`
- `backend/src/config.ts`
- `backend/src/common/asset-lifecycle.events.ts` (template being cloned for reservations)
- `backend/src/auth/auth.module.ts`, `backend/src/auth/auth.dto.ts`
- `frontend/src/app.tsx`, `frontend/src/components/AppShell.tsx`, `frontend/src/pages/LoginPage.tsx`
