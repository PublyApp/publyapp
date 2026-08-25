# Exploitability assessment — GHSA-396q-4vc8-28x9 against PublyApp

**Date:** 2026-07-31
**Advisory:** GHSA-396q-4vc8-28x9 — `@microsoft/kiota-http-fetchlibrary`, "Bearer token and Cookie
leak across origin on redirect due to case-mismatched scrub in fetchRequestAdapter" (medium)
**Affected range:** `>= 1.0.0-preview.97`, `<= 1.0.0-preview.101`. Patched in `1.0.0-preview.102`.
**Repository state when this was written:** `apps/front`, `apps/old-front` and `packages/client-ts`
all pinned `1.0.0-preview.97`. This assessment accompanies the bump to `1.0.0-preview.102` (#1036).

This is a record. It describes what was true on the date above; it is not a standing rule.

---

## Verdict

**The advisory's own impact — leaking `Authorization: Bearer` or `Cookie` — is not reachable in this
application, on either frontend, in any version.** Neither header is ever placed on a Kiota request
here: both client managers authenticate with `AnonymousAuthenticationProvider` and attach the session
as a custom `X-Session-Token` header. There is nothing for the broken scrub to fail to remove.

**A neighbouring, genuinely reachable problem does exist, and it is not the one the advisory
describes.** `X-Session-Token` is not a header the library ever attempted to scrub, in any version.
In `apps/front` a same-origin gate in the app's own custom fetch keeps it from crossing a redirect.
In `apps/old-front` there is no such gate, so a cross-origin redirect from the API host would forward
the session token to the redirect target — patched Kiota or not. `apps/old-front` is retired and not
deployed, so this is not a production exposure today, but it is a real defect in committed code and
it is the shape of bug that would come back the moment someone copies that client manager. **This is
reported here as a separate finding for the owner to triage; no issue has been filed for it.**

Confidence: **high** for the "not exploitable as described" conclusion (it rests on a complete
absence of the two headers, verified by search, not on a subtle control). **Medium-high** for the
`X-Session-Token` reachability analysis, which rests on reading the installed library's redirect
recursion rather than on running an end-to-end proof. See "What I could not determine".

---

## The bug, restated

`FetchRequestAdapter.getRequestFromRequestInformation` lower-cases every outgoing header key. The
default `scrubSensitiveHeaders` callback in `RedirectHandlerOptions` then ran
`delete headers.Authorization` / `delete headers.Cookie` — case-sensitive property deletes against
keys that are now `authorization` and `cookie`. The deletes removed nothing, so on a 30x to a
different host or scheme the middleware re-issued the request to the redirect target with those
headers intact.

The fix in `1.0.0-preview.102` iterates the key set and compares lower-cased, and additionally covers
`proxy-authorization`. Verified in the installed artifact:

`node_modules/.pnpm/@microsoft+kiota-http-fetchlibrary@1.0.0-preview.102/…/dist/es/src/middlewares/options/redirectHandlerOptions.js`

```js
if (lower === "authorization" || lower === "cookie" || lower === "proxy-authorization") {
    delete headers[key];
}
```

The `RedirectHandler` is in the default middleware chain
(`MiddlewareFactory.getDefaultMiddlewares` → `[RetryHandler, RedirectHandler, …, CustomFetchHandler]`),
and both of this repository's clients build their HTTP client with `KiotaClientFactory.create(customFetch)`,
which uses that default chain. So the vulnerable middleware **was** loaded in both apps. Reachability
therefore turns entirely on which headers the request carries.

---

## Question 1 — does anything here put an `Authorization` header on a Kiota request?

**No.**

Both client managers construct the adapter with `AnonymousAuthenticationProvider`, which adds no
authentication header at all:

- [`apps/front/src/lib/api-client/client-manager.ts`](../../apps/front/src/lib/api-client/client-manager.ts)
  (`new FetchRequestAdapter(new AnonymousAuthenticationProvider(), …)`)
- [`apps/old-front/src/lib/api-client/client-manager.ts`](../../apps/old-front/src/lib/api-client/client-manager.ts)
  (same shape)

`BaseBearerTokenAuthenticationProvider` — the provider the advisory names as the trigger — appears
nowhere in this repository.

A case-insensitive search for an `Authorization` header across `apps/front/src`, `apps/front/server.mjs`,
`apps/front/scripts`, `packages/shared-ts`, `packages/client-ts/src`, `apps/old-front/src` and
`apps/old-front/app` returns three kinds of hit, none of which is an outgoing request header:

- `packages/shared-ts/lib/redaction.ts` — `'authorization'` in the *redaction deny-list* for logging.
- `packages/shared-ts/lib/redaction.test.ts` — a fixture for that redactor.
- `apps/old-front/src/lib/react-query/query-client.tsx` — a header-normalizing branch in the retired
  app's error/logging path, again reading rather than setting.

The API itself does not accept `Authorization`: it authenticates with `X-Session-Token`
(AGENTS.md, "Session-based auth via `X-Session-Token`"). There is no code path that would benefit
from setting one.

**The advisory's headline impact is therefore inapplicable here.**

## Question 2 — the `Cookie` leg

**Not reachable, browser-side or server-side.**

*Browser.* `buildCustomFetch` in `apps/front`'s client manager builds a fresh `Headers` object from
the incoming init and sets exactly two things — `X-Session-Token` and `X-Tenant-Id` — and only under
the same-origin condition described below. It never sets `Cookie`. It could not usefully do so
anyway: `Cookie` is a forbidden header name in the browser Fetch API. Automatic cookie attachment is
governed by `credentials`, which neither client manager ever sets (so it is the default
`same-origin`) and which is not `include` anywhere in the repository — and browser-attached cookies
never appear in the JavaScript-visible headers object that the middleware forwards in the first
place.

*SSR / `createServerFn`.* The frontend-server surfaces that call the API —
[`auth-actions.ts`](../../apps/front/src/lib/server/auth-actions.ts),
[`session-actions.ts`](../../apps/front/src/lib/server/session-actions.ts),
[`invitation-actions.ts`](../../apps/front/src/lib/server/invitation-actions.ts) — all go through the
same `createClient` / `buildCustomFetch` path. They read the *incoming* request's cookie header
(`apps/front/src/server.ts` reads `request.headers.get('cookie')` for locale resolution; the session
helpers parse the session cookie), but nothing writes a `Cookie` header onto an outgoing Kiota
request. Node's `fetch` (undici) has no cookie jar, so nothing attaches one implicitly either.

On the frontend rule that `createServerFn` must never return a raw cookie or session token: the
question asked here is about what is **sent**, and the answer is that these handlers do send the
session token — as `X-Session-Token`, which is exactly what the API's auth scheme requires. That is
by design and is not the rule's subject. What they do not do is forward the browser's `Cookie`
header verbatim, which is the thing this advisory would punish.

## Question 3 — `X-Session-Token`, which no version ever scrubbed

This is the part worth keeping.

The scrub only ever targeted `Authorization` and `Cookie`. A custom auth header rides through a
cross-origin redirect on every version of the library, patched or not. So the question is whether
either app would re-send it to a redirect target.

**How the redirect actually re-enters app code.** `RedirectHandler.executeWithRedirect` sets
`redirect: "manual"`, reads `Location`, computes `newUrl`, calls the scrub, assigns `url = newUrl`,
and recurses. The terminal handler in the chain is `CustomFetchHandler`, which invokes the app's own
`customFetch(url, fetchRequestInit)`. So on a redirect the app's custom fetch is called **again**,
with the attacker-named URL and the same init.

**`apps/front` — safe, by an explicit gate.** `buildCustomFetch` resolves the incoming URL and
attaches the session and tenant headers only when it matches the configured API origin:

```ts
if (isSameOrigin(requestUrl, baseUrl)) {
    const sessionToken = options.getSessionToken();
    if (sessionToken) {
        headers.set('X-Session-Token', sessionToken);
    }
    if (options.tenantId) {
        headers.set(TENANT_ID_HEADER_KEY, options.tenantId);
    }
}
```

On the redirect leg `requestUrl` is the redirect target, the check fails, and neither header is set.
There is a second, independent reason it holds: the token is never written into
`fetchRequestInit.headers` — the object the middleware owns and forwards — at all. `buildCustomFetch`
copies that object into a new `Headers`, adds the token to the copy, and passes the copy as a fresh
init to the underlying fetch. The Kiota-owned record is never mutated, so there is nothing in it to
carry forward. Both properties would have to be undone for `apps/front` to leak.

**`apps/old-front` — would leak, and this bump does not fix it.**
`ClientManager.createCustomFetch` has no origin check:

```ts
const sessionToken = options.getSessionToken();
const headers = new Headers(init?.headers);

if (sessionToken) headers.set(SESSION_TOKEN_HEADER_KEY, sessionToken);
if (options.tenantId) headers.set(TENANT_ID_HEADER_KEY, options.tenantId);

return fetch(url, { ...init, headers });
```

Called again with the redirect target, it sets `X-Session-Token` unconditionally. A cross-origin
redirect out of the API host would hand the session token to whatever host the `Location` names.
`1.0.0-preview.102` does not change this, because the library never scrubbed that header.

Why this is not a production exposure today: `apps/old-front` is retired — not built for release, not
in `dokploy.yml`, not served. Its API origin comes from the operator-set `VITE_ASP_SERVER_URL`, so
the redirect would still have to originate from the real API host (see Question 4). It is recorded
here as a **separate finding for owner triage**, not as something this change fixes and not as
something to dismiss.

## Question 4 — what would an attacker actually need?

The advisory's three scenarios need a 30x from a trusted host to an attacker-controlled one. Against
this application:

- **Does the app ever point a Kiota client at a host it does not control?** No. The base URL is
  operator configuration in every case: `PUBLIC_API_BASE_URL` (browser) and `SERVER_API_BASE_URL`
  (SSR) in `apps/front/src/lib/env.ts`, `VITE_ASP_SERVER_URL` in `apps/old-front`. None is derived
  from user input, a route parameter, a query string, or an API response body. There is **no
  user-supplied-URL proxy** anywhere — so the advisory's third scenario (confused-deputy SSRF through
  a caller-chosen base URL) has no entry point here.
- **Does the API redirect?** A search of `apps/api` for `TypedResults.Redirect`, `Results.Redirect`,
  `RedirectPermanent`, 3xx status codes and explicit `Location` headers finds **no** handler that
  emits a redirect. The one redirect in the pipeline is `app.UseHttpsRedirection()`
  (`apps/api/Program.cs`, skipped in the Testing environment), which redirects to the **same host**
  on a different scheme. That is not attacker-controllable. (It is worth noting it changes origin as
  far as `isSameOrigin` is concerned, so `apps/front` would drop the session token on such a leg —
  a functional footnote, not a security one; in production the front already addresses the API over
  https.)
- **What is left?** Only the amplifier scenarios: an attacker who can MITM or corrupt a single 30x
  response from the real API host, or who has compromised the API host enough to make it emit one. An
  attacker with either capability has better options than this bug, and TLS on the Traefik hop
  removes the MITM path.

---

## Conclusion for #1036

- Bumping to `1.0.0-preview.102` is correct and should be done — it removes a real defect from a
  library in the shipped app's request path, and the alert should close on the version, not on a
  reachability argument. It is **not** an incident: nothing in this repository ever gave the broken
  scrub an `Authorization` or `Cookie` header to mishandle.
- Severity for this application, before the bump: **informational**. No user data was reachable
  through this specific bug.
- The one thing to carry forward is not in the advisory at all: **`apps/front`'s same-origin gate in
  `buildCustomFetch` is load-bearing security control, not a convenience.** It is what keeps
  `X-Session-Token` from crossing a redirect, and nothing in the Kiota library will do that job if it
  is removed. `apps/old-front` shows what the same client manager looks like without it.

## What I could not determine

- **No dynamic proof.** This is static analysis: the installed library's compiled middleware, plus
  the two client managers and their call sites. I did not stand up a redirecting listener and run the
  app's real client against it. The advisory's own PoC was reproduced by its reporter against
  `preview.100` in a bare harness, not against this application.
- **Production redirect behaviour outside the repository.** Traefik, Dokploy and any CDN in front of
  the API can emit redirects that no amount of reading `apps/api` will reveal. The conclusion
  "the API does not redirect cross-host" is a statement about the application code, not about the
  deployed edge.
- **Whether `preview.97 → preview.102` changes runtime behaviour beyond the scrub.** Five preview
  increments were crossed. `packages/client-ts` type-checks clean against the new runtime,
  `apps/front` builds, type-checks and passes its full suite, and `apps/old-front` type-checks and
  passes its characterization suite — but none of those exercises a live HTTP round trip against the
  real API. Behavioural drift in serialization or the middleware chain would show up in e2e or in
  manual QA, which this change did not run.
