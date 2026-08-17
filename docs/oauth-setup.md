# OAuth (Google + Microsoft): dev/deploy modes and customer setup

Companion to [`google-integrations-plan.md`](./google-integrations-plan.md) (the original design
doc, Google-only). This one is the operational reference for both supported providers: how the
dev/deploy toggle works, how to set up real OAuth credentials for local testing, and what changes
when you deploy to actual customers. A user can link **either provider, or both** -- linking any
one of them satisfies the mandatory-link gate.

---

## 1. How the mode toggle works

There's no explicit "dev mode" / "deploy mode" flag. Behavior is derived from env vars in
`backend/.env`:

```
appConfig.requireAccountLink() =
  (googleAuth() !== null || microsoftAuth() !== null) && REQUIRE_ACCOUNT_LINK !== "false"
```

| Providers configured | `REQUIRE_ACCOUNT_LINK` | Result |
|---|---|---|
| neither | — | **Off.** Nothing to link to. Username+password login works normally, no gate, both "Continue with ..." links 503 cleanly if clicked. |
| at least one | unset (default) | **On.** Every user is hard-blocked at `/connect-account` until they link *any* configured provider. This is the production default. |
| at least one | `false` | **Off**, even though a provider is configured. Lets you test the actual link/consent flow locally without every other login being blocked while you're doing unrelated work. |

Google and Microsoft are configured **independently** -- set up just one, both, or neither. The
gate only cares whether the user has linked *something*, not which provider.

Changing any of these takes effect **on backend restart only** — env vars are read once at
process start (`import "dotenv/config"` in `config.ts`), not hot-reloaded.

### Switching modes locally

```bash
# Edit backend/.env, then:
cd backend
pkill -f "node --watch dist/src/main.js"   # or however you're running it
nohup node --watch dist/src/main.js > /tmp/backend-node.log 2>&1 &
```

If you're running the full stack via `docker-compose.yml` instead, the same vars are passed
through as `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`,
`MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`/`MICROSOFT_REDIRECT_URI`/`MICROSOFT_TENANT_ID`,
and `REQUIRE_ACCOUNT_LINK` — `docker compose up -d --force-recreate backend` after editing `.env`.

---

## 2. Local dev / testing setup

### 2.A Google

**Create the OAuth client:**
1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** (Internal only works if you're on a Workspace domain and every
     tester is inside it).
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
   - **Test users**: add every Google account that needs to sign in — while the app is
     unpublished ("Testing" status), *only* accounts on this list (or accounts with an IAM role
     on the same GCP project, see the troubleshooting note in §4) can complete consent. Max 100.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Leave **Authorized JavaScript origins** empty — this app never calls Google from the
     browser directly, only via server-side redirects.
   - **Authorized redirect URIs** → add exactly `http://localhost:3000/api/v1/auth/google/callback`
     (byte-for-byte match required, no trailing slash).
4. Copy the **Client ID** and **Client Secret**.

**Configure the backend:**
```bash
# backend/.env
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback
FRONTEND_BASE_URL=http://localhost:5173
# REQUIRE_ACCOUNT_LINK=false   # uncomment to test without the hard gate
```

### 2.B Microsoft

**Prerequisite: getting into the Azure Portal.** App Registrations live in Microsoft Entra ID
(formerly Azure AD), part of Azure. If you've never used Azure with this Microsoft account
before, two things trip people up:

- **Is this free?** Yes, for what we need. Azure bundles two unrelated things under one signup
  flow: (1) **Entra ID / App Registrations** — creating an app, a client secret, redirect URIs —
  is free forever, no subscription, no expiration; (2) **Azure's paid cloud services** (VMs,
  databases, storage) — this is what the "free trial" ($200 credit for 30 days) is actually for,
  and we don't touch any of it. Microsoft does **not** auto-charge your card when that 30-day
  trial ends — you'd just lose access to trial-only paid resources (which you never used) until
  you actively choose to upgrade. The card Microsoft asks for during signup is for identity
  verification only, not a payment authorization.
- **"AADSTS16000: User account ... does not exist in tenant ..." when signing into
  portal.azure.com.** This means your personal account got routed into an org's Azure tenant it
  has no access to (often a stale cached tenant context from a different account signed in
  before). Fix: open a **private/incognito browser window**, go directly to
  `https://portal.azure.com/`, and make sure you're signing in with the exact account you intend
  to use (look for "Use another account" if it tries to auto-continue with a cached one). If it
  still fails, the account likely has no Azure tenant of its own yet — complete the free signup
  at [azure.microsoft.com/free](https://azure.microsoft.com/free/) with that same account first,
  which provisions one, then retry the portal.

**Create the App Registration:**
1. [portal.azure.com](https://portal.azure.com) → **App registrations → New registration**.
2. **Supported account types** — this is the one decision Google doesn't have an equivalent of:
   - *Accounts in any organizational directory and personal Microsoft accounts* (multi-tenant +
     personal) → pairs with `MICROSOFT_TENANT_ID=common`, the default this app uses if unset.
     Lets both personal Outlook/Hotmail accounts and any organization's Microsoft 365 accounts
     sign in — the closest Microsoft equivalent to "any Google account."
   - *Accounts in any organizational directory only* → pairs with `MICROSOFT_TENANT_ID=organizations`.
   - *Accounts in this organizational directory only* → pairs with `MICROSOFT_TENANT_ID=<your tenant GUID>`,
     restricting sign-in to just your own org.
3. **Redirect URI** → platform **Web**, value exactly
   `http://localhost:3000/api/v1/auth/microsoft/callback` (byte-for-byte match required).
4. **Certificates & secrets → New client secret** → copy the **value** immediately (Azure only
   shows it once).
5. Copy the **Application (client) ID** from the Overview page.

Unlike Google, there's no separate "test users" list to maintain for a multi-tenant app in
Testing-equivalent status — any account matching the selected account type can sign in
immediately once the redirect URI and credentials are correct.

**Configure the backend:**
```bash
# backend/.env
MICROSOFT_CLIENT_ID=<application (client) ID>
MICROSOFT_CLIENT_SECRET=<client secret value>
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/v1/auth/microsoft/callback
MICROSOFT_TENANT_ID=common
FRONTEND_BASE_URL=http://localhost:5173
# REQUIRE_ACCOUNT_LINK=false   # uncomment to test without the hard gate
```

**Known limitation:** a Microsoft-linked user's profile picture stays unset. Google's ID token
includes a public `picture` URL; Microsoft's doesn't — getting one requires an authenticated
Microsoft Graph `/me/photo/$value` call and re-hosting the result, which isn't implemented.
Email and name still populate normally.

### 2.C Sharing credentials with another developer

`backend/.env` is gitignored — these values never end up in git, regardless of provider. Being
added as a Google **Test user** (or the account type matching Microsoft's App Registration) is
necessary but not sufficient. Three things have to line up for either provider:

1. **Their account is allowed to sign in** (Google: on the Test users list, or has IAM access to
   the project; Microsoft: matches the App Registration's supported account type).
2. **Credentials** — they need the actual Client ID/Secret in their own local `.env` (hand these
   over via a password manager, not chat/email in plaintext long-term).
3. **Redirect URI match** — their local backend has to be reachable at the exact URI registered
   with that provider. Fine if they run on the same port; otherwise needs its own registered entry.

Missing any one blocks them, usually with a confusing error that doesn't point at the real cause.

---

## 3. Deploying to real customers

Local dev credentials do **not** carry over — you need production-appropriate versions of
everything in §2, for whichever provider(s) you're offering.

### 3.1 Who should own the credentials

Use an account **the company controls long-term** for both Google Cloud Console and Azure
Portal — not an individual employee's personal account. If that person leaves, whoever's left
needs to still be able to rotate secrets, update redirect URIs, or manage the consent
screen/App Registration.

- **Google, with Workspace:** create the project under the org, using an admin account or a
  dedicated shared account (e.g. `it@yourcompany.com`).
- **Google, without Workspace:** use a company-owned Gmail set up specifically for this.
- **Microsoft:** use an account with access to your company's Azure/Microsoft 365 tenant (or a
  dedicated tenant created for this), not a personal Microsoft account.

Store credentials in a shared password manager either way, not one person's memory.

### 3.2 Publish/finalize the consent experience

- **Google**: Testing mode's 100-account cap and test-user allowlist aren't viable for real
  customers — you need **OAuth consent screen → Publish app**. For this app's scopes (all
  non-sensitive), that's normally a button click, but requires first: a **privacy policy URL**
  (and usually terms-of-service), **domain verification** via
  [Google Search Console](https://search.google.com/search-console), and basic app branding
  (name, logo, support email). Confirm **External** user type (not Internal) so customers outside
  your own org can sign in.
- **Microsoft**: no separate publish step — the App Registration's supported account type
  (chosen in §2.B) already determines who can sign in immediately. Just confirm it's set to
  something customers actually qualify for (`common` unless you have a specific reason to
  restrict it).

### 3.3 Production credentials

Create **separate** OAuth clients/App Registrations for production rather than reusing the
local-dev ones — cleaner secret rotation, and a compromised dev secret doesn't touch production.

```bash
GOOGLE_CLIENT_ID=<production client ID>
GOOGLE_CLIENT_SECRET=<production client secret>
GOOGLE_REDIRECT_URI=https://your-real-domain.com/api/v1/auth/google/callback

MICROSOFT_CLIENT_ID=<production application (client) ID>
MICROSOFT_CLIENT_SECRET=<production client secret value>
MICROSOFT_REDIRECT_URI=https://your-real-domain.com/api/v1/auth/microsoft/callback
MICROSOFT_TENANT_ID=common

FRONTEND_BASE_URL=https://your-real-domain.com
# REQUIRE_ACCOUNT_LINK unset -> hard gate on, the intended production behavior
```

The redirect URIs registered with each provider must match these exactly — HTTPS, real domain,
no trailing slash. You don't have to offer both providers; set up only the one(s) you need.

### 3.4 Secret handling

`GOOGLE_CLIENT_SECRET`/`MICROSOFT_CLIENT_SECRET` get the same treatment as
`JWT_SECRET`/`TOKEN_ENCRYPTION_KEY` already do in this app: injected via your deployment's env
vars or secrets manager, never committed to a `.env` file in git, never pasted into chat/tickets
as the long-term storage location.

### 3.5 Go-live checklist

- [ ] Production credentials created under company-controlled accounts (§3.1), for each provider
      you're offering
- [ ] Google consent screen published (not left in Testing), if offering Google (§3.2)
- [ ] Microsoft App Registration's account type confirmed correct, if offering Microsoft (§3.2)
- [ ] Production redirect URIs registered, matching the `*_REDIRECT_URI` env vars exactly (§3.3)
- [ ] Credentials + `FRONTEND_BASE_URL` set in the production deployment's secrets,
      `REQUIRE_ACCOUNT_LINK` left unset
- [ ] One real end-to-end login tested per offered provider against production before announcing
      to customers

---

## 4. Troubleshooting (issues actually hit while building this)

**A provider's callback redirect includes more query params than `code`/`state`/`error`.**
Google sends `scope`, `authuser`, `prompt`, `iss`, and `hd` for Workspace accounts; Microsoft
sends `session_state` and `error_description`. This app's global validation
(`whitelist: true, forbidNonWhitelisted: true`) 422s on any undeclared field —
`GoogleCallbackQueryDto`/`MicrosoftCallbackQueryDto` explicitly whitelist all of these with
`@Allow()`. If a provider adds a new one in the future and you see a `VALIDATION_ERROR`
mentioning a `property ... should not exist` on a callback route, that's the fix to reapply.

**Linked profile pictures don't render (Google).** The app's CSP originally only allowed
`img-src 'self' data:`, silently blocking Google's `*.googleusercontent.com` avatar URLs (no
error in the app itself — check the browser console for a CSP violation, or check
`img.naturalWidth === 0` on the `<img>` element). Fixed in `backend/src/main.ts`'s helmet
registration; if you see this again for some other external image source, add its origin to the
same `imgSrc` array rather than disabling CSP. (Microsoft-linked users never have a picture at
all in the current implementation — see §2.B's known limitation, not a bug.)

**"redirect_uri_mismatch"** — the running backend's `GOOGLE_REDIRECT_URI`/`MICROSOFT_REDIRECT_URI`
doesn't exactly match an entry registered with that provider. Check for a trailing slash, http
vs. https, or a stale port.

**"Access blocked: this app hasn't been verified" / similar at Google's screen** — the signing-in
account isn't on the Test users list (§2.A) *and* doesn't have an IAM role on the same GCP
project. Project Owners/Editors/etc. are automatically treated as testers too, without needing a
separate Test users entry — check IAM & Admin → IAM if someone can sign in unexpectedly and you
don't remember adding them as a test user.

**A brand-new admin-created user isn't blocked by the link gate even though a provider is
configured** — check `REQUIRE_ACCOUNT_LINK` isn't set to `"false"` in the env the backend
actually loaded, and confirm with `GET /api/v1/auth/me` that `accountLinkRequired` is `true` in
the response.

**Linking a real account to a user who already had a real email (e.g. legacy seeded accounts)
doesn't update their email.** This is intentional, not a bug — email only populates the first
time it's `null`. Linking doesn't overwrite an existing email with whichever provider account
happens to get linked. If you need to change it anyway, that's a direct database update today
(no admin-UI "edit email" feature exists).
