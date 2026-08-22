# Epic C — Social accounts (Bluesky first): design

Date: 2026-08-22. Status: approved by the owner in a brainstorming session (decisions recorded below). Supersedes the two-line scope of #630/#640 and the unspecified choices made in PR #1159 (closed without merge; its code is the starting point of C1-bis).

## 1. Decisions taken with the owner

| # | Question | Decision |
|---|---|---|
| 1 | Who is the customer? | **Agencies are a real target** alongside brands. Accounts live at tenant level and can be attached to projects. |
| 2 | Which accounts can a post in project X use? | **Strict with default**: an account attached to no project is visible in every project of the tenant; once attached to one or more projects it is visible only there. |
| 3 | How is a Bluesky account connected? | **App password now, OAuth prepared**: the model carries a credential type (`app_password` today, `oauth` later) and an opaque encrypted secret; the publishing code obtains a session through an interface that does not know how the credential was obtained. |
| 4 | What happens when an account stops working? | **Detect on publish** (v1), periodic probe later. Scheduled posts on that account are **paused** (scheduled date kept); a warning is shown if the date has passed. |
| 5 | Who may do what? | **Three permissions** assigned through profiles like every other tenant permission: `tenant.socialaccounts.view`, `tenant.socialaccounts.manage`, `tenant.socialaccounts.publish`. Tenant admins hold them implicitly. |
| 6 | Where do the encryption keys live? | **Data Protection keys in Postgres, protected by a master key** supplied as a deployment secret (`SOCIAL_ACCOUNTS_MASTER_KEY`, api + worker). No Docker volume dependency. |

## 2. Model

`SocialAccount` (tenant-scoped):
- `TenantId`, `Provider` (enum, `Bluesky` first; stored as int + check constraint like the other enums), `ExternalAccountId` (the Bluesky DID — stable when the handle changes), `DisplayHandle`.
- `CredentialType` (`AppPassword` | `OAuth`), `ProtectedCredentials` (opaque blob, encrypted with a provider-specific Data Protection purpose).
- `Status` (`Active` | `NeedsReconnect` | `Revoked`), `LastSuccessAt`, `LastError` (≤ 2 KB, sanitised: never contains the secret), timestamps.
- Unique on `(TenantId, Provider, ExternalAccountId)`. Two tenants may connect the same Bluesky account.

`SocialAccountProject` (link table): `SocialAccountId`, `ProjectId`. Empty set = visible everywhere in the tenant; non-empty = visible only in those projects.

Visibility rule (single function, used by the list endpoint, the post composer and the publish path): `visibleIn(account, projectId) = account.Status == Active && (account.Projects.Count == 0 || account.Projects.Contains(projectId))`.

## 3. Screens and actions

Settings → Integrations (existing tenant shell page):
- List: handle, provider, status pill (green active / orange needs reconnect / grey revoked), last success, "Visible in: all projects" or the project names.
- **Connect Bluesky account**: drawer with identifier (handle or e-mail) and app password, plus a help link to Bluesky's app-password page. On submit the API opens a Bluesky session immediately, resolves DID + handle, encrypts and stores. If Bluesky refuses, nothing is stored and the error is shown as-is (credentials refused / account not found / Bluesky unreachable, retry).
- **Attach to projects**: checklist of the tenant's projects; none checked = all.
- **Reconnect**: same drawer, handle prefilled; replaces the secret, sets `Active`, resumes paused posts (see §5).
- **Disconnect**: sets `Revoked`, erases the secret, pauses scheduled posts on it, keeps the publication history. A confirmation states these consequences.

Post composer (Epic B/D): the "publish on…" selector lists only accounts that are `Active`, visible in the post's project, and only if the user holds `tenant.socialaccounts.publish`.

Workspace banner: as soon as one account is `NeedsReconnect`, a persistent banner names it with a "Reconnect" button (button only for holders of `manage`; others see the message).

Out of scope for v1 (room kept): OAuth, periodic probe, Mastodon, a staff view of customer accounts (staff sees nothing account-level in v1).

## 4. Security and permissions

- Routes carry their permission; a foreign tenant's account answers 404, never 403.
- The secret is never returned by any API, never logged, never in an error message, never in audit entries.
- Encryption: Data Protection with one purpose per provider. Keys persisted in Postgres (`PersistKeysToDbContext`), protected with the master key (`ProtectKeysWith…` using a key derived from `SOCIAL_ACCOUNTS_MASTER_KEY`). At startup the API decrypts a stored witness value; on failure it refuses to start with a clear message.
- Loss of the master key: documented in `docs/deployment` — generate a new one, every account becomes `NeedsReconnect`, the banner drives reconnection; no post data is lost.
- Audit entries (tenant audit log) for connect, reconnect, disconnect, attach/detach: actor, time, account by handle/DID.
- Rate limit: the connect/reconnect routes (which call Bluesky) get a stricter policy than reads, so the API cannot be used as a credential-guessing relay.

## 5. Failures, reconnection, pause

- A publish failure **caused by the account** (credentials refused, account suspended) — not a network failure nor a content error — sets `NeedsReconnect`, records `LastError`, pauses every scheduled post on the account (distinct status, scheduled date kept), shows the banner.
- Successful reconnect: `Active`; paused posts whose date is still ahead resume; posts whose date has passed stay paused with a "date passed — reschedule or publish now" warning. Nothing is ever published late without an explicit action.
- Voluntary disconnect: same pause; reconnecting the same DID resumes; connecting a different account requires reassigning paused posts by hand.
- Bluesky or network outage: not an account problem; the jobs infrastructure (Epic A) retries with backoff and dead-letters after N attempts — detailed in the Epic D spec.
- Periodic probe (later): a job reusing exactly the session-open call used by connect.

## 6. Delivery

PRs, each reviewable in ~30 minutes, adversarial cross-family review, owner merge:
1. **C1-bis — foundations**: reworks #1159 to this spec (credential type, link table, last success/error, keys in Postgres + master key + startup check, loss procedure in `docs/deployment`). No endpoints.
2. **C2 — Bluesky connect**: minimal Bluesky client (session open with app password, DID/handle resolution), the three permissions, routes list / connect / reconnect / disconnect / attach, audit, rate limit, regenerated Kiota client.
3. **C3 — Integrations screen**: page, connect drawer, attachments, `NeedsReconnect` banner.
4. **C4 — pause and resume**: paused status for scheduled posts, switch to `NeedsReconnect` on credential failure, resume on reconnect, date-passed warning. Depends on D3 for scheduled posts; if D3 is not there yet, C4 ships the status switch + banner and the pause lands with D3.

What every PR must prove (integration specs on the ephemeral database, as the rest of the API):
- the secret never leaks: a spec reads every JSON response of every route and fails if the password appears; same for audit rows;
- isolation: tenant A's account is not found for tenant B;
- visibility rule: unattached account visible in all projects; attached to X, invisible in Y;
- permissions: each verb refused without the right;
- Bluesky refusal → nothing stored (Bluesky client faked in specs, never the real network);
- keys: starting the API with a wrong master key refuses to start; with the right one the witness decrypts;
- one adversarial mutation per PR (e.g. drop the tenant filter → the isolation spec must go red), shown in the PR body.

Front: component tests for the drawer and the banner; one e2e "connect (faked Bluesky) → appears in the list → selectable in the composer", tagged `@tenant-workspace @<ticket>` per the e2e discipline (#1168).

## 7. Hard repo constraints that apply
Vertical slice under `apps/api/Modules/SocialAccounts`; handlers orchestrate, services own the DbContext; analyzers PUBLY00xx; every endpoint declares a rate-limit policy; keyset pagination for lists; permissions per verb at the route; `ResponseKeys` for messages; migrations applied by the one-shot `migrate` service; `just build-api && just generate-client` after any contract change.
