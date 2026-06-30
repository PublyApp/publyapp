# Front-2 Conventions

These rules apply to `apps/front-2`. Repo-wide API, error, URL, logging, and generated-client
rules from `AGENTS.md` still apply unless this guide explicitly narrows a frontend styling rule.

## HeroUI and Tailwind

`apps/front-2` uses HeroUI v3 components plus Tailwind v4 utility classes as its styling
system.

This intentionally diverges from the MUI + `sx` rules and app-local primitive patterns that
govern `apps/front`. Those current-app rules are scoped to `apps/front`; they do not apply to
`apps/front-2`. Examples include:

- `publy/no-native-html-in-mui-surfaces`
- `publy/no-raw-mui-textfield-register`
- `publy/no-raw-img-in-product-surfaces`

Do not import MUI or `apps/front` UI primitives into `apps/front-2` to reuse current-app
components. Rebuild the surface with HeroUI primitives, Tailwind utilities, and front-2-local
equivalents where needed, keeping shared behavior behind framework-agnostic contracts where
possible.

Portable repo rules still matter in front-2 when their path coverage includes it:

- no token or secret logging
- no `console.*` in source
- no direct Day.js imports in components
- no manual `response-message` translation at mutation call sites
- no `Array.reduce()`

## Locked Conventions Pending Automation

These are design-locked architectural and style conventions that are not yet machine-enforced.
Follow them by hand until automation exists:

- Do not use `createServerFn` for application-data fetching, aggregation, or proxying.
- Do not return raw cookies, session tokens, or token-bearing objects from server functions.
- Do not use React Aria or HeroUI protected/internal APIs directly.
- Do not introduce camelCase URL search params for list/table state.
- Do not move app-bound adapters into `@org/shared-ts`.

## Spike Reference

`apps/front-2-spike` is disposable reference only. Use it to understand harvested patterns and
prior de-risking work, but do not treat spike code as canonical or copy it verbatim as durable
front-2 code.

## Ports and Adapters

Shared code is a ports-and-adapters boundary, not a lift-and-shift of current-app modules.

Framework-agnostic contracts live in `@org/shared-ts` behind injected seams. A scope-aware
client seam should be type-only or hidden behind a framework-neutral port. This snippet is
illustrative, type-only pseudocode and must not become a runtime dependency on the generated
client:

```typescript
type ApiClientPort = unknown;

interface ClientAccessor {
	getOrCreateClient(tenantId: string): ApiClientPort;
	getOrCreateStaffClient(): ApiClientPort;
	getOrCreateAnonymousClient(): ApiClientPort;
}
```

`ApiClientPort` is illustrative, not a required exported name. Pure shared modules must
either import generated client types with `import type` only or hide the generated client behind a
framework-neutral interface.

Pure shared modules may define contracts, pure parsers, redaction helpers, API failure mapping,
query-key helpers, query-state predicates, and framework-neutral query/key/state factories that
receive injected accessors. They must not import React, TanStack Query, Kiota, HeroUI, or MUI at
runtime. Any external framework or client references needed by shared contracts must be
`import type` only, with no runtime import side effects.

App-bound pieces stay local to `apps/front-2`, including:

- `ClientManager` and concrete Kiota client wiring
- environment and cookie I/O
- logout, toast, and tenant-resolution handlers
- HeroUI renderers such as `QueryDisplay`
- route/layout integration and server functions

## Rendering Strategy

Marketing and auth surfaces are SSR.

Authenticated application surfaces are CSR with `ssr: false`. They fetch application data in
the browser with TanStack Query and the Kiota client. Do not fetch authenticated domain data in
server loaders or server functions.

## Server-Function Boundary

`createServerFn` is for frontend-server concerns only:

- cookie read/write
- the login call that sets the session cookie (without returning the session token)
- i18n resource loading

It is not a BFF. Do not use server functions to fetch, aggregate, transform, or proxy domain
entities for authenticated app pages. Application data goes browser to Kiota directly.

Returning a raw cookie, session token, or token-bearing object from a server function is a leak.
Read cookies through server-only helpers and return only the minimum non-secret result needed by
the UI.

## URL State

URL query parameters use snake_case per `AGENTS.md`. Table/list state uses:

- `q`
- `sort_id`
- `sort_order`
- `cursor`
- `size`

The spike's `sortId` and `sortOrder` names are not the convention. Do not parse or emit spike
aliases such as `sortId` or `sortOrder` in durable front-2 routes. Internal TypeScript objects may
use camelCase when useful, but the URL contract must stay snake_case. Convert between internal
state and URL parameters at explicit parse/serialize boundaries, not ad hoc inside components.

## Error Views and Logout

Front-2 preserves the hard RFC 7807 logout split:

- Auth surface `401` follows the auth error path. Show the auth error view. Do not log out.
- Authed surface `401` means the active session is invalid. Log out.
- `403` never logs out, on any surface.

Keep this split in layout error boundaries, TanStack Query error handling, and any future
`AppErrorView` wrappers.
