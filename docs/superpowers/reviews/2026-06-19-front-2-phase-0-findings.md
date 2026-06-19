# front-2 Phase 0 — GO/NO-GO findings

> **Status:** Phase 0 de-risking spike (disposable). This document is the single
> **GO/NO-GO record** for the proposed migration of PublyApp's frontend to
> **TanStack Start + HeroUI v3**. Phase 0 is the cheapest kill-switch: it records
> license + version-stability + architecture evidence so the migration can be
> proven-or-killed before any expensive work. Later Phase 0 tasks append more
> sections to this same file. **GO is forbidden until every gate below is written
> down with real, observed evidence.**
>
> All command output recorded here was captured by direct `registry.npmjs.org` /
> `raw.githubusercontent.com` curls and `gh` searches on **2026-06-19** — not from
> memory and not from `npm view`. Versions on the registry may move after this date.

---

## License gate

**Task 0.1 — HeroUI v3 license gate.** Goal: confirm the *consumed npm artifact*
(`@heroui/react@3.x`) is MIT, and surface the discrepancy between the v3 repo's
`LICENSE` file (Apache-2.0) and its `package.json` (`MIT`).

### Observed evidence (curl, 2026-06-19)

| Source | Command | Observed value |
| --- | --- | --- |
| npm artifact | `curl -s https://registry.npmjs.org/@heroui/react/3.2.1` → `.license` | **`MIT`** |
| v3 repo `LICENSE` file | `curl -s https://raw.githubusercontent.com/heroui-inc/heroui/v3/LICENSE \| head -3` | **`Apache License, Version 2.0, January 2004`** (Apache-2.0 header) |
| v3 repo `package.json` | `curl -s https://raw.githubusercontent.com/heroui-inc/heroui/v3/package.json` → `.license` | **`MIT`** |

Raw captures:

```
npm @heroui/react license: MIT

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

v3 package.json license: MIT
```

**Discrepancy:** the v3 branch ships an **Apache-2.0 `LICENSE` file** while both the
published npm package metadata and the v3 `package.json` declare **`MIT`**. The
*consumed artifact* (npm `@heroui/react@3.2.1`) declares MIT, which is the working
assumption for the spike, but the in-repo Apache-2.0 LICENSE file means upstream
intent is **not unambiguously confirmed**.

### Upstream clarification (search only — no issue opened)

Per spike rules, only an **existing** issue/discussion search was performed; opening a
new issue against a third-party repo is an outward-facing action deferred to the human.

- `gh issue list --repo heroui-inc/heroui --search "license MIT Apache in:title,body" --state all --limit 10` → **no results**.
- Broader `license in:title` → only Pro-seat/Pro-license issues (#5337 "purchasing 25 licenses", #2996 "User broke NextUI Pro License") — **unrelated** to the MIT-vs-Apache file discrepancy.
- `Apache` keyword → only unrelated bug reports (#2512, #1424).
- Discussions (GraphQL, first 10) → all feature/component topics; **none** about licensing.

**Result: no existing upstream issue found** that addresses the MIT-vs-Apache
discrepancy for `@heroui/react@3.x`. Opening one is **deferred to the human**
(outward-facing action on a third-party repo).

### Gate rule (Finding #25)

> **`PENDING-UPSTREAM` may allow the *spike* to run (MIT on the consumed npm
> artifact is the working assumption), but it FORCES `NO-GO for Phase 1
> token/design work` until upstream confirms MIT governs `@heroui/react@3.x`.**

**Gate state:** `PENDING-UPSTREAM`. Spike MAY proceed; Phase 1 token/design work is
**blocked** until upstream confirmation.

---

## Architecture gate

**Placeholder (decision recorded now; a later Phase 0 task confirms it).** GO is
forbidden until this decision is written down, so it is captured here up front:

- **Decision: direct-Kiota.** The .NET API (consumed via the Kiota-generated
  TypeScript client) is the **single source of truth** for application data.
- `createServerFn` is used for **cookie-I/O only** — not as a data/BFF layer.
- The spike **reproduces the currently-shipped JS-readable-cookie session model**
  (it does NOT introduce a BFF and does NOT move auth server-side).
- **This is NOT a BFF.** No server-side data aggregation or API proxying is added.

> _Confirmation deferred to a later Phase 0 task; the decision above is the binding
> assumption for the spike._
