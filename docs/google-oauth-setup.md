# Google OAuth: dev/deploy modes and customer setup

Companion to [`google-integrations-plan.md`](./google-integrations-plan.md) (the original design doc).
This one is the operational reference: how the dev/deploy toggle works, how to set up a real
OAuth client for local testing, and what changes when you deploy to actual customers.

---

## 1. How the mode toggle works

There's no explicit "dev mode" / "deploy mode" flag. Behavior is derived from two env vars in
`backend/.env`:

```
appConfig.requireGoogleLink() = googleAuth() !== null && REQUIRE_GOOGLE_LINK !== "false"
```

| `GOOGLE_CLIENT_ID` / `SECRET` / `REDIRECT_URI` | `REQUIRE_GOOGLE_LINK` | Result |
|---|---|---|
| unset | — | **Off.** Nothing to link to. Username+password login works normally, no gate, "Continue with Google" 503s cleanly if clicked. |
| set | unset (default) | **On.** Every user is hard-blocked at `/connect-google` until they link. This is the production default. |
| set | `false` | **Off**, even though Google is configured. Lets you test the actual link/consent flow locally without every other login being blocked while you're doing unrelated work. |

Changing any of these takes effect **on backend restart only** — env vars are read once at
process start (`import "dotenv/config"` in `config.ts`), not hot-reloaded.

### Switching modes locally

```bash
# Edit backend/.env, then:
cd backend
pkill -f "node --watch dist/src/main.js"   # or however you're running it
nohup node --watch dist/src/main.js > /tmp/backend-node.log 2>&1 &
```

If you're running the full stack via `docker-compose.yml` instead, the same three vars are passed
through as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` /
`REQUIRE_GOOGLE_LINK` — `docker compose up -d --force-recreate backend` after editing `.env`.

---

## 2. Local dev / testing setup (row 2 or 3 in the table above)

### 2.1 Create the OAuth client

1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** (Internal only works if you're on a Workspace domain and every
     tester is inside it).
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
   - **Test users**: add every Google account that needs to sign in — while the app is
     unpublished ("Testing" status), *only* accounts on this list can complete consent. Max 100.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Leave **Authorized JavaScript origins** empty — this app never calls Google from the
     browser directly, only via server-side redirects.
   - **Authorized redirect URIs** → add exactly:
     ```
     http://localhost:3000/api/v1/auth/google/callback
     ```
     Byte-for-byte match required, no trailing slash.
4. Copy the **Client ID** and **Client Secret**.

### 2.2 Configure the backend

```bash
# backend/.env
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback
FRONTEND_BASE_URL=http://localhost:5173
# REQUIRE_GOOGLE_LINK=false   # uncomment to test without the hard gate
```

`backend/.env` is gitignored — these values never end up in git. Restart the backend (§1) to
pick them up.

### 2.3 Sharing this client with another developer

Being added as a **Test user** is necessary but not sufficient. Three things have to line up:

1. **Test user** — their Google account is on the list in §2.1.
2. **Credentials** — they need the actual Client ID/Secret in their own local `.env` (not in
   git — hand these over via a password manager, not chat/email in plaintext long-term).
3. **Redirect URI match** — their local backend has to be reachable at the exact
   `http://localhost:3000/api/v1/auth/google/callback` registered in §2.1. Fine if they run on
   the same port; a different port/host needs its own entry added to Authorized redirect URIs.

Missing any one blocks them, usually with a confusing error that doesn't point at the real cause
(`redirect_uri_mismatch` for #3, a Google-side "access blocked" for #1, nothing sent to Google at
all for #2).

---

## 3. Deploying to real customers

Local dev credentials do **not** carry over — you need production-appropriate versions of
everything in §2.

### 3.1 Who should own the OAuth client

Use a Google account **the company controls long-term**, not an individual employee's personal
account — if that person leaves, whoever's left needs to still be able to rotate the secret,
update the redirect URI, or manage the consent screen.

- **Have Google Workspace?** Create the project under the org, using an admin account or a
  dedicated shared account (e.g. `it@yourcompany.com`).
- **No Workspace?** Use a company-owned Gmail set up specifically for this, with the login
  stored in a shared password manager, not one person's memory.

### 3.2 Publish the OAuth consent screen

Testing mode's 100-account cap and test-user allowlist aren't viable for real customers — you
need **OAuth consent screen → Publish app**. For this app's scopes (`openid`/`email`/`profile`,
all non-sensitive), that's normally a button click, not a multi-week Google review, but it does
require filling in first:

- **Privacy policy URL** (and usually a terms-of-service URL).
- **Domain verification** via [Google Search Console](https://search.google.com/search-console)
  for whatever domain your homepage/support links point to.
- App name, logo, support email — what customers actually see on the consent screen.

Also decide the **user type** at this point: External (any Google account, what you want for
customers) vs. Internal (Workspace-org-only — wrong choice if customers aren't inside your org).

### 3.3 Production credentials

Create a **separate OAuth client** for production rather than reusing the local-dev one — cleaner
secret rotation, and a compromised dev secret doesn't touch production.

```
GOOGLE_CLIENT_ID=<production client ID>
GOOGLE_CLIENT_SECRET=<production client secret>
GOOGLE_REDIRECT_URI=https://your-real-domain.com/api/v1/auth/google/callback
FRONTEND_BASE_URL=https://your-real-domain.com
# REQUIRE_GOOGLE_LINK unset -> hard gate on, the intended production behavior
```

The redirect URI in Google Cloud Console's Authorized redirect URIs list must match this exactly
— HTTPS, real domain, no trailing slash.

### 3.4 Secret handling

`GOOGLE_CLIENT_SECRET` gets the same treatment as `JWT_SECRET`/`TOKEN_ENCRYPTION_KEY` already do
in this app: injected via your deployment's env vars or secrets manager, never committed to a
`.env` file in git, never pasted into chat/tickets as the long-term storage location.

### 3.5 Go-live checklist

- [ ] Production OAuth client created under a company-controlled account (§3.1)
- [ ] Consent screen published, not left in Testing (§3.2)
- [ ] Domain verified in Search Console, privacy policy URL set (§3.2)
- [ ] Production redirect URI registered, matches `GOOGLE_REDIRECT_URI` exactly (§3.3)
- [ ] `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI`/`FRONTEND_BASE_URL` set in the production
      deployment's secrets, `REQUIRE_GOOGLE_LINK` left unset
- [ ] One real end-to-end login tested against production before announcing to customers

---

## 4. Troubleshooting (issues actually hit while building this)

**Google's callback redirect includes more than `code`/`state`/`error`.** It also sends `scope`,
`authuser`, `prompt`, `iss`, and `hd` for Workspace accounts. This app's global validation
(`whitelist: true, forbidNonWhitelisted: true`) 422s on any undeclared field —
`GoogleCallbackQueryDto` (`backend/src/google-auth/google-auth.dto.ts`) explicitly whitelists all
of these with `@Allow()`. If Google adds a new one in the future and you see a
`VALIDATION_ERROR` mentioning a `property ... should not exist` on the callback route, that's the
fix to reapply.

**Linked profile pictures don't render.** The app's CSP originally only allowed
`img-src 'self' data:`, silently blocking Google's `*.googleusercontent.com` avatar URLs (no
error in the app itself — check the browser console for a CSP violation, or check
`img.naturalWidth === 0` on the `<img>` element). Fixed in `backend/src/main.ts`'s helmet
registration; if you see this again for some other external image source, add its origin to the
same `imgSrc` array rather than disabling CSP.

**"redirect_uri_mismatch"** — the running backend's `GOOGLE_REDIRECT_URI` doesn't exactly match
an entry in the OAuth client's Authorized redirect URIs. Check for a trailing slash, http vs.
https, or a stale port.

**"Access blocked: this app hasn't been verified" / similar at Google's screen** — the signing-in
account isn't on the Test users list (§2.1) and the app isn't published (§3.2).

**A brand-new admin-created user isn't blocked by the link gate even though Google is
configured** — check `REQUIRE_GOOGLE_LINK` isn't set to `"false"` in the env the backend actually
loaded, and confirm with `GET /api/v1/auth/me` that `googleLinkRequired` is `true` in the
response.
