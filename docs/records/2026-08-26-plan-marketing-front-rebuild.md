# Lane mktp — Rebuild the marketing surface on `apps/front` from the closed old-front marketing PRs, and sequence the open marketing cluster (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** PLAN ONLY — the plan PR ships this document and nothing else. It closes nothing. **Part of #368.** Umbrella issue created for the rebuild: **#1474** (this plan PR creates it; the implementation lanes hang off it).

The marketing pages (pricing, legal trio, about/contact/security, blog, changelog, plus the second-batch surfaces) were shipped on the retired old front. The 5-phase implementation is PR **#367** (merged 2026-05-06; feature commit `a33270803`, 168 files — all marketing routes, `_components/`, `_data/`, registry and error views on the pre-rename `apps/front`). It was preceded by the homepage rebuild **#339** (merged 2026-04-30) and followed by the second-batch AIDesigner PRs **#668–#673**, closed unmerged on 2026-07-21 when `apps/old-front` was retired (tag `old-front-final`). Two attribution corrections (round 2): closed PR **#362** describes this work in its body but is superseded by #367 — its diff is 22 residual files with a single marketing file (`marketing-faq-accordion.tsx`); siblings **#664–#667** are lint/framework/docs/context PRs whose diffs contain no marketing files. Everything in #368–#375 assumes those pages exist on the current front. They do not: `apps/front` has the landing page at `/`, the #1038 marketing shell whose nav/footer destinations are deliberately route-less until their routes exist, cookie consent (#1038), and a two-flag registry.

> **How the closed-PR inventory was derived:** from the commits, not the PR bodies — for each candidate PR, `gh pr view <N> --json mergeCommit,files` (+ `git show --stat <mergeCommit>` for merged ones); a PR counts as delivering marketing surface only if its diff adds marketing routes/components/data. Full per-PR evidence: `.dump/citations-r2.md`.

---

## Sources read while writing this plan

Every load-bearing claim below was verified against this tree at `develop` = `e13ee04a7` (this lane branches from it) and **re-verified at the round-2 tip** after `develop` advanced to `67a365db2` (`git diff --name-only e13ee04a7..origin/develop` touches none of these paths):

| Claim | Source |
|---|---|
| What the five-phase implementation delivered, phase by phase, with file paths | Closed PR [#367](https://github.com/PublyApp/publyapp/pull/367) — merged 2026-05-06; feature commit `a33270803` (`git show --stat a33270803`: 168 files, incl. all `apps/front/src/routes/marketing/**` routes, `_components/`, `_data/`, `_tree/marketing.routes.ts`, FEATURES registry). Superseded closed PR [#362](https://github.com/PublyApp/publyapp/pull/362) was read in full for its body's phase table and scope decisions; its diff is 22 residual files with only one marketing file (`marketing-faq-accordion.tsx`) |
| Homepage rebuild | Closed PR [#339](https://github.com/PublyApp/publyapp/pull/339) (merged 2026-04-30; diff carries the marketing home routes/components) |
| Second-batch surfaces (comparison, feature pages, roadmap, customer story, SEO infra, cookie consent) and their locked scope decisions | Closed unmerged PRs [#671](https://github.com/PublyApp/publyapp/pull/671), [#669](https://github.com/PublyApp/publyapp/pull/669), [#670](https://github.com/PublyApp/publyapp/pull/670), [#668](https://github.com/PublyApp/publyapp/pull/668), [#672](https://github.com/PublyApp/publyapp/pull/672), [#673](https://github.com/PublyApp/publyapp/pull/673) bodies + file lists (each diff carries its own marketing files; see citations-r2) |
| Context (non-marketing): why the old front was rewritten on TanStack Router before the marketing phases landed | #665 (React Router 7.16 upgrade on the pre-migration front), #664/#666/#667 read for context; none carry marketing files |
| The 2026-04-30…05-06 specs/plans survive in history | commit `a33270803` — the PR #367 feature commit (168 files of implementation that also added 12 spec/plan docs: `docs/superpowers/{specs,plans}/2026-05-0{1,2,3,6}-marketing-*`); retrievable via `git show a33270803:<path>` |
| The 2026-05-08 second-batch specs survive on the closed PR branches | fetched `refs/pull/668/head` → `git show pull-668:docs/superpowers/specs/2026-05-08-customer-story-template-design.md` (readable; canvas IDs recorded) |
| Full old-front marketing inventory at retirement (routes, ~18 components, data modules, contact-form Zod schema verbatim, retired flag set) | `docs/records/2026-08-22-review-old-front-marketing-screens.md` |
| Current front has only `/` at top level; everything else is auth/authed | `apps/front/src/routes.ts` (virtual route config; no marketing subtree), `apps/front/src/routes/` listing |
| Marketing chrome is mounted by the ROOT shell, not by a route group | `apps/front/src/routes/__root.tsx:343-344` (`isSelfShelledPath` = exactly `/`), `:346-352` (`resolveRouteSurface` → `'marketing'` for every non-auth path), `:602-610` (non-self-shelled marketing paths wrapped in `MarketingLayout`) |
| `MarketingLayout` is the root `shellComponent` wrapper precisely so error/not-found branches share the chrome | `apps/front/src/layouts/marketing-layout.tsx:1-24` |
| Root not-found renders `View404` inside that chrome | `__root.tsx:318` (`RootNotFound`), `:751` (`notFoundComponent`) |
| Landing `/` owns its whole shell by design (exemption, not an oversight) | `apps/front/src/routes/index.tsx:50-60` doc comment; `__root.tsx:602-606` |
| Current flag registry: build-time frozen, `marketing.customerLogos`/`.socialProof` only, no Dockerfile ARG for marketing flags | `apps/front/src/lib/flags.ts:32-35` + module doc (:13-17) |
| Nav/footer entries without a `to` are data, dropped by renderers; adding the route later is the whole change | `apps/front/src/components/marketing/marketing-nav.ts` (doc comment + closed `MarketingRoutePath` union `'/' \| '/login' \| '/signup'`); `marketing-nav.test.ts` asserts destinations against the real route tree |
| i18n `landing` namespace exists; namespaces are hand-registered and coverage-tested | `apps/front/src/lib/i18n.namespaces.ts` (`FEATURE_I18N_NAMESPACES` incl. `'landing'`), `apps/front/src/i18n/locales/{en,fr}/landing.json` |
| Per-page `<title>`/description come from the page's own namespace via root-dehydrated i18n context | `apps/front/src/routes/index.tsx:385-402` (`head: ({ match })` + `createI18nFromResources`) |
| Marketing/auth SSR; authed CSR; `createServerFn` boundary rules | `docs/guides/front/conventions.md` "Rendering Strategy", "Server-Function Boundary". The retired-app guide `docs/guides/marketing-surface-conventions.md` is also cited in older drafts: it was deleted from `develop` by commit `77609e3575307c1e6b225f458f36b6e29e390d0b` (#993 doc prune, 2026-07-29) and is now read **from history** via `git show 77609e357~1:docs/guides/marketing-surface-conventions.md`; its constraints live on in DESIGN.md §5 and the in-tree marketing shell set |
| Shipped pricing-band idiom: struck price + beta note (owner rule precedent) | `apps/front/src/components/marketing/landing/landing-pricing.tsx:41-47` (three-register price row: `<del>` figure, unit, beta note) |
| Cookie consent already shipped on current front (categories, fail-closed, prefs drawer) | `apps/front/src/components/marketing/cookie-consent-band.tsx`, `cookie-prefs-drawer.tsx`, `apps/front/src/lib/store/cookie-consent-store.ts:28-51` |
| Design-language constraints for marketing surfaces (two container widths, static header hairline — no scroll elevation/hide-on-scroll, contrast guards) | `DESIGN.md` §5 "Marketing surfaces" (:295-323), §6 guards table |
| Entity-avatar rule (initials on deterministic palette; neutral tokens only for non-identity) | `AGENTS.md` "Entity images and avatars" |
| State components mandated for loading/empty/error | `AGENTS.md` front standards; `apps/front/src/components/ui/{state-view,state-surface,skeleton}.tsx` exist |
| Doc-link hygiene gate (records bodies exempt; relative links still checked elsewhere) | `justfile:330-340` (`ci-doc-links`) |
| Open-cluster expectations this plan must satisfy | Issues [#368](https://github.com/PublyApp/publyapp/issues/368), [#369](https://github.com/PublyApp/publyapp/issues/369), [#370](https://github.com/PublyApp/publyapp/issues/370), [#372](https://github.com/PublyApp/publyapp/issues/372), [#373](https://github.com/PublyApp/publyapp/issues/373), [#374](https://github.com/PublyApp/publyapp/issues/374), [#375](https://github.com/PublyApp/publyapp/issues/375) bodies |
| Plan format reference | `lane/wt-1051p:docs/records/2026-08-26-plan-1051-feature-flags.md` (not on `develop`; read from its branch) |

One brief correction, same spirit as the 1051p correction: the brief lists **home** among the pages to rebuild. Home already exists on the current front — the self-shelled landing page (`/`, chosen from four directions in #1082, promoted in #1049, bands gated in #1056). It is **out of the rebuild scope**; only cross-surface integration (nav anchors, shared chrome) touches it.

---

# Part 1 — Inventory: what the closed PRs delivered, and what ports vs rewrites

## 1.1 Routes

| Retired route | Delivered by | Content/data portable? | Verdict on current front |
|---|---|---|---|
| `/` home | #339, #1049-era | n/a | **Already rebuilt** (self-shelled landing). Out of scope; integrate nav/footer anchors only. |
| `/pricing` | #367 P1 | Yes: tiers (creator 19/15, scale 49/39, enterprise custom), 6-category comparison matrix, 5 FAQs (retirement record §_data/pricing) | Rebuild page; **prices ship struck-through + beta note** (owner rule, see D7) |
| `/terms` `/privacy` `/cookies` | #367 P2 | Yes: TOC ids, section copy, lastUpdated trio (retirement record) | Rebuild via one `LegalDocPage`-equivalent shell + data modules; `/cookies` wires the **existing** prefs drawer |
| `/about` | #367 P3 | Copy yes; 12 team members are fictional placeholders (#368 A3) | Rebuild; team grid uses **initials avatars**, never stock portraits |
| `/contact` | #367 P3 | Yes: channels, support tiers, topics, 4 FAQs, Zod schema preserved verbatim in retirement record | Rebuild form (RHF+Zod via front field wrappers); **honest placeholder submit** (D8); backend = #369 B1 |
| `/security` | #367 P3 | Structure yes; badges/sub-processors are unverified claims (#368 A4) | Rebuild; claims carry visible "pending review" treatment; `noindex` question deferred to #374 |
| `/blog` + `/blog/:slug` | #367 P4 | Data shapes yes; 13 posts (3 unpublished)/4 tags are placeholders (#368 A1) | Phase 2 rebuild; static typed data modules; JSX-as-content bodies |
| `/changelog` + `/changelog/:year` | #367 P5 | Shapes yes; 40 entries 2015–2026 are placeholders (#368 A2) | Phase 2 rebuild; `/changelog` redirects to latest year |
| marketing catch-all 404 | #367 P3 | n/a | **Exists**: root `notFoundComponent` → `View404` inside `MarketingLayout` chrome. Polish optional, lowest priority |
| `/sitemap.xml`, `/robots.txt`, canonical/OG/JSON-LD | #672 | Approach portable | **Not rebuilt here** — this is #374's slice, sequenced after the routes exist (D9) |
| Trailing-slash 301 loader | #672 | Policy question only | Deferred to #374 canonical decision (open question Q2) |

Second AIDesigner batch (#372 umbrella): `/compare/:competitor` (#671), `/features/:slug` (#669), `/roadmap` (#670), `/customer-stories/:slug` (#668) were built and closed; `/tools` + `/tools/:slug` and `/help` were canvases only, never built. All are **out of Phases 1–2**: each gets its own spec → plan → PR after the core pages establish the shared patterns (#372's own stated process). Their specs remain retrievable (`refs/pull/668-671/head`). `/docs` was scoped out even then → #373, untouched here.

## 1.2 Components (~18 retired primitives → disposition)

| Retired primitive | Disposition on `apps/front` |
|---|---|
| Topbar w/ transparent-on-scroll, ScrollProgress, BackToTop | **Drop.** `DESIGN.md` §5 pins a sticky header with *static* bottom hairline — no scroll elevation, no hide-on-scroll. Current `marketing-header.tsx` is the canon. |
| Footer (+ flag-guarded columns, newsletter slot) | **Exists** (`marketing-footer.tsx`). Newsletter input: **do not ship decoratively** — added only with #369 B2/B3 backend (or with an honest-placeholder pass if product wants it earlier; default: omit). |
| Mega-menu / mobile nav / container | **Exist** (`marketing-nav.ts`, `marketing-mobile-nav.tsx`, `marketing-container.tsx`). Adding a route = giving the entry its `to`; renderers pick it up everywhere at once. |
| `CtaBand` | **Replaced by** existing `marketing-cta-band.tsx`. |
| `MarketingHero`, `ContentBand`, `MarketingEyebrow`, `PricingTierCard`, `BillingCycleToggle` | Rewrite per surface under `src/components/marketing/<surface>/` (the established `landing/` pattern), Base UI + Tailwind v4 through `components/ui/*`. No MUI/`sx`, no framer-motion (CSS transitions + the `use-landing-reveal` pattern suffice). |
| `MarketingFaqAccordion` | Rewrite as `components/ui/accordion.tsx` wrapper over the Base UI accordion primitive (verify exact export at implementation; fallback: composed disclosures) + cva variants file (`only-export-components`, #1417). |
| `LegalDocPage` (slot-based, sticky TOC, active-section highlight) + `useActiveTocSection` | Rewrite: route-private `_legal-doc-shell.tsx` + `_use-active-toc-section.ts` (IntersectionObserver; `scroll-margin-top` aligned to `--publy-header-height`). Pattern proven, code new. |
| Blog set (`BlogPostCard` standard/featured/compact, `BlogArticlePage`, ShareRow) | Rewrite in phase 2. Share buttons are plain links + clipboard; share *analytics* waits for #375 (B4). Cover-hover reflow lesson carries over: lock aspect ratio, absolute inset. |
| Changelog set (`ChangelogEntry`, `VersionPill`, `EntryTypePill`, year chips, gated stats/subscribe) | Rewrite in phase 2; year chips on `components/ui/tabs.tsx`; `VersionPill` copy-on-click via clipboard; stats + subscribe stay behind their own default-OFF flags (subscribe band itself deferred to #369). |
| `CustomerStory*`, `Feature*`, `Comparison*`, `Roadmap*` sets | Not rebuilt in Phases 1–2 (#372 lanes). Contracts documented above; specs retrievable. |
| `CookieConsent` directory (banner/dialog/store/window API) | **Done** on current front (#1038): band, prefs drawer, zustand store, fail-closed parse, 3 optional categories. Remaining work is taxonomy reconciliation with the rebuilt cookies page (#370 residue), not a rebuild. |
| `JsonLd` + `lib/seo/*` (canonical/meta builders/5 schema builders) | Rewritten inside #374 against TanStack `head()`; per-page title/description land earlier via D6. |
| `MarketingErrorView` + ErrorBoundary-on-layout | **Replaced by** root `notFoundComponent`/error branch rendering inside the mounted chrome (`View404`, `state-surface` for error views). No per-layout boundary needed; the root shell covers it by construction. |
| `FEATURES` registry + route/link spread-guards | **Replaced by** current `flags.ts` (same build-time freeze semantics) + conditional route registration in `routes.ts` + conditional `to` in `marketing-nav.ts` (D5). |

## 1.3 Data modules (portable starting points — nearly all flagged placeholder by #368)

`_data/pricing.ts`, `_data/legal-{terms,privacy,cookies}.ts`, `_data/about.ts`, `_data/contact.ts`, `_data/security.ts`, `_data/blog.ts`, `_data/changelog.tsx`, `_articles/*.tsx` (4 placeholder bodies). Port shapes + copy into per-surface data modules under the new component directories; mark placeholder-bearing facts in-code (comment naming the #368 letter) and in-UI where the fact is user-visible (D7/D8). The contact Zod schema ports verbatim from the retirement record.

---

# Part 2 — Architecture

## D1. No `(marketing)` route group — the repo's equivalent already exists

The brief offers "a `MarketingLayout` route group under `apps/front/src/routes/(marketing)/…` **or the repo's equivalent**". The repo's equivalent is strictly better than a route group here: `__root.tsx` resolves every non-auth, non-self-shelled path to the `'marketing'` surface and wraps it in `MarketingLayout` via the root `shellComponent` (`__root.tsx:343-352, 602-610`). A route group would double the chrome or fight the shell; the shell mount is also the only wrapper covering error and not-found branches, which a route group cannot reach. Consequence: **new pages are ordinary entries in the virtual config** `apps/front/src/routes.ts`, with files under `apps/front/src/routes/marketing/**` (route-local privates prefixed `_`). `/` keeps its self-shelled exemption; if it ever adopts the shared shell, delete `isSelfShelledPath` rather than leaving it to match nothing (existing instruction, restated).

Route registration is conditional per flag, mirroring the retired `marketing.routes.ts` spread-guard — `routes.ts` is plain build-time TS, so:

```ts
...(FEATURES.marketing.pricing ? [route('/pricing', 'marketing/pricing.tsx')] : []),
```

Disabled flag ⇒ route not registered ⇒ unknown URL falls to the root not-found inside marketing chrome — identical semantics to the retired catch-all behaviour.

## D2. File layout (one surface at a time)

```
apps/front/src/routes/marketing/
  pricing.tsx                      # route file: Route + page + head()
  terms.tsx  privacy.tsx  cookies.tsx
  about.tsx  contact.tsx  security.tsx
  blog/index.tsx  blog/$slug.tsx
  changelog/index.tsx              # beforeLoad redirect → latest year
  changelog/$year.tsx
  _legal-doc-shell.tsx  _use-active-toc-section.ts
apps/front/src/components/marketing/
  pricing/…  about/…  contact/…  security/…
  legal/…    blog/…    changelog/…
apps/front/src/i18n/locales/{en,fr}/marketing-<surface>.json
```

Dynamic segments use `$slug`/`$year`; malformed/unknown params render the not-found view (throw `notFound()` / notFoundComponent semantics — no route constraints anywhere, consistent with repo ID rules). Route-local helpers are `_`-prefixed; component files export components only (#1417); breadcrumbs: these are marketing routes — `staticData.crumbs: 'shell'` is the sanctioned shape for marketing surfaces (conventions, breadcrumb contract).

## D3. i18n — `landing` stays `/`'s namespace; each new surface gets `marketing-<surface>`

Namespaces: `marketing-pricing`, `marketing-legal` (trio shares one), `marketing-about`, `marketing-contact`, `marketing-security`, `marketing-blog`, `marketing-changelog`. Each is added to `FEATURE_I18N_NAMESPACES` in `i18n.namespaces.ts`, gets identical-shape EN+FR JSON, is attached via the route's `staticData.i18nNamespaces`, and is enforced by the existing key-coverage test. All copy goes through `t()` (the landing pattern). **Requirement for every implementing phase (not a fact today): zero `<Trans>` call sites introduced** — proven per surface by the trans-render guard suite staying green (`src/lib/i18n/trans-render.guard.test.tsx` inside `pnpm --filter front test`) after the phase's files land; a phase that needs rich text uses `t()` composition, not a new unguarded call site. No hardcoded strings, no raw colors — the design-system/z-index guards run in the suite regardless.

## D4. SSR and data

**Requirements the implementing phases must prove (nothing is built yet, so these are not facts):** every marketing page renders SSR by default and fetches nothing — content is static TS data modules compiled in; there are no loaders, no server functions, no authenticated fetches (conventions forbid app-data server fns anyway). Proof per surface: route tests asserting the route registers without a loader/server handler and renders purely from its data module, plus typecheck catching stray server-fn imports. Client-only behaviour (consent band, prefs drawer, clipboard, toc-highlight) hydrates as today. React Compiler handles memoisation — no new `useMemo`/`useCallback`.

## D5. Flags per surface — gate, do not omit

Extend `FEATURES.marketing` in `flags.ts` (same `readFlag` build-time freeze; camelCase JS paths to match the existing two entries):

| Flag | Default | Gates |
|---|---|---|
| `pricing` | false | `/pricing` route + nav/footer entry |
| `legal` | false | terms/privacy/cookies routes + entries |
| `about`, `contact`, `security` | false | respective routes + entries |
| `blog`, `changelog` | false | phase 2 routes + entries |
| `changelogStats` | false | stats cards only (real data source = #368 A5) |

Semantics carried over from the retired registry — **requirement: exactly one flag drives BOTH route registration AND nav/footer visibility**; this is forward-looking until each surface ships, and each implementing PR must prove it with route tests (flag OFF ⇒ route not registered; flag ON ⇒ route registered AND nav/footer entries carry their `to`) while `marketing-nav.test.ts` keeps every destination honest against the real route tree ("no dead ends" rule intact; the closed `MarketingRoutePath` union extends per route). Enforcement of the owner rule in production is structural: front flags are build-time frozen and **no Dockerfile ARG/ENV pair exists for marketing flags**, so nothing ships enabled unless someone deliberately adds the ARG and builds an image with it — and #368's content gates must close first. Prices and claims inside enabled-for-preview pages carry their own honest treatment (D7/D8) so even a preview build doesn't present fabrication as fact.

## D6. Canonical/meta per page — what lands now vs what stays in #374

Every page ships `head()` from day one, exactly on the `index.tsx:385-402` pattern: title + description read from the page's own namespace via the root-dehydrated i18n context (locale-correct, no second English source). Dynamic pages derive theirs per param (blog post title/excerpt; changelog year). That satisfies #374's per-page-meta premise incrementally; **canonical URLs, OG/Twitter completeness, JSON-LD schemas, sitemap.xml, robots.txt, trailing-slash policy and the public-origin env var stay in #374**, which this plan sequences immediately after phase 2 (D10). Note for #374: `apps/front/src/lib/env.ts` has API base URLs but no public site origin today — canonicals need one added.

## D7. Prices: struck-through with a beta note (owner rule made visible)

The shipped landing pricing band already codifies the treatment (`landing-pricing.tsx:41-47`): the numeric price alone sits in `<del>` at the display step, the `/ month` unit follows muted, and a full-foreground beta-note label states the actual offer. The rebuilt `/pricing` reuses exactly this register system for all tiers (placeholder numbers ported from the retired `_data/pricing.ts`), plus a visible "beta — plans not final" note near the toggle, and the comparison matrix/FAQ copy avoids claiming purchasable plans. Gate + visible strike + beta note = the page can be enabled for preview without lying.

## D8. Forms: honest placeholders that say they are placeholders

- `/contact`: full RHF+Zod validation (schema ported verbatim, wired through the front form/field wrappers). Submit does **not** fake success: it performs the mailto hand-off (the only transport that exists) and an inline notice states plainly that the form isn't connected yet and direct email is the reliable channel. No invented success toast (mutation-feedback ownership rule applies to real mutations only). #369 B1 replaces the handler with a real endpoint.
- Newsletter footer input and changelog subscribe band: **omitted** until #369 B2/B3 provide the provider; nothing decorative ships.
- Security badges/sub-processors render with a visible "pending compliance review" annotation; about team members render as initials avatars (fictional people get no stock faces). Each such spot cites its #368 letter in a code comment so the content-swap sweep is greppable.

## D9. What is explicitly NOT ported

MUI/`sx`/`themeConfig`/`varAlpha`/`applyStyles`; framer-motion springs; `nuqs` (blog tag filter uses router search params, snake_case `?tag=`, canonical question deferred to #374); react-router-style `meta` exports (TanStack `head()` instead); the trailing-slash 301 loader; the retired `deepFreeze` registry shape (current `as const` style wins); ScrollProgress/BackToTop (contradict current design language); the old marketing 404 art direction (current `View404` stands until someone asks for polish).

---

# Part 3 — Sequencing

Ordering principles: each task is independently shippable and leaves `pnpm --filter front test` green; a surface lands complete (route + flag + i18n EN/FR + nav entry + tests) or not at all; phase 1 establishes every reusable pattern so phase 2 is repetition; #374 follows the routes; the cluster issues hang off #1474.

## Phase 1 — core pages

- [ ] **T1. Pricing.** Flag `marketing.pricing`; `routes/marketing/pricing.tsx`; `components/marketing/pricing/` (hero, `BillingCycleToggle` rewrite, tier trays with the three-register struck-price row, comparison matrix, FAQ on the new accordion ui primitive); data module ported; namespace `marketing-pricing` EN+FR; nav/footer `to` behind the flag; route tests incl. flag-off registration + flag-on render + struck-price assertions (hoisted-mutable-getter mock pattern from the landing band tests).
- [ ] **T2. Legal trio.** Flag `marketing.legal`; `_legal-doc-shell.tsx` + `_use-active-toc-section.ts`; three data modules (TOC ids, sections, lastUpdated kept in trio-lockstep); `/cookies` wires "Open cookie preferences" to the existing drawer; namespace `marketing-legal`.
- [ ] **T3. About.** Flag `marketing.about`; values + hiring CTA + team grid on initials avatars (placeholder-people annotation, #368 A3); founder-quote block.
- [ ] **T4. Contact.** Flag `marketing.contact`; RHF+Zod via field wrappers; honest-placeholder submit (D8); info panel + quick-answers FAQ.
- [ ] **T5. Security.** Flag `marketing.security`; pillars + sub-processors table-in-card + disclosure section; pending-review annotations (D8).
- [ ] **T6. Phase-1 sweep.** Full front suite once; typecheck; `just react-doctor`; knip clean; update `.dump/report.md` evidence.

## Phase 2 — blog + changelog (data model + pages)

- [ ] **T7. Blog.** Flag `marketing.blog`; typed post/tag/author data modules (placeholders labelled #368 A1/A3); index with `?tag=` filter (router search params) + featured hero; `$slug` article route with per-post `head()`, sticky TOC, share row (links + clipboard only); unknown/unpublished slug → not-found.
- [ ] **T8. Changelog.** Flag `marketing.changelog` (+ `changelogStats` gated off); year-chip navigation on `ui/tabs`; `$year` page with dashed-rail entries + version-pill copy-on-click; `/changelog/index.tsx` `beforeLoad` redirect to latest available year, empty-state when none; entries labelled #368 A2.
- [ ] **T9. Phase-2 sweep.** Same gates as T6.

## Phase 3 — cluster integration (mostly other lanes; this plan defines the edges)

- [ ] **T10. #374 SEO slice** (own lane, after T7/T8): sitemap.xml + robots.txt as raw-Response server routes, canonical + OG/Twitter audit, JSON-LD per #374's schema list, public-origin env var, trailing-slash decision. Skips flag-disabled routes.
- [ ] **T11. #369 forms** (own lane): contact endpoint/provider decision + newsletter + changelog subscribe sharing one provider; removes the D8 notices.
- [ ] **T12. #370 residue** (small): reconcile consent categories ↔ rebuilt cookies page inventory; policy-version bump if taxonomy changes.
- [ ] **T13. #368 content swaps** (editorial lane): closes A1–A5; only then may a Dockerfile ARG be added and flags flip in release builds.
- [ ] **T14. #372 second batch** (own spec→plan→PR cycles, in #372's own priority order): comparison → feature pages → customer stories → roadmap; tools/help last (interactive, not pure marketing).
- [ ] **#373 /docs and #375 analytics:** explicitly outside #1474; #375's consent precondition is already satisfied by the shipped banner.

## Verification policy (captain 2026-08-23)

No local e2e stack (`just ci-e2e-front`, docker compose test stack) — CI runs front-e2e on the PR and that is the evidence. Local proof: targeted `pnpm --filter front exec vitest run <files>` per task, one full `pnpm --filter front test` per phase sweep (design-system + z-index + focus/contrast guards ride inside it), `pnpm --filter front typecheck`, `just react-doctor` on changed files. Keep every heavy invocation focused; nothing near the 20-minute lock ceiling.

## Open questions (deliberate, blocking nothing above)

1. **Q1 — marketing 404 art direction.** Current root `View404` is serviceable inside the chrome; the retired gradient-numeral view is not ported unless product asks.
2. **Q2 — trailing slash.** Default: no trailing slash (TanStack norm), enforced canonically in #374 with redirects if the owner prefers slashes.
3. **Q3 — blog authoring format.** JSX-as-content for phase 2 (parity, zero new infra); revisit MDX when #368 brings real articles.
4. **Q4 — language switcher.** The retired `languageSwitcher` flag is not rebuilt; current front has no switcher UI and EN+FR is served by i18n negotiation. Out of scope until product asks.

## Round-3 follow-up audit (per #1517)

The two #1517 follow-up items were re-verified at the implementation
start of the marketing rebuild on `lane/grp-planfollowups` against the
current state on `develop`. The plan body already carries the
provenance note for the deleted guide (line 35 of the original "Sources
read" table); the round-3 note below adds the file-count verification
that the proof file `.dump/proof-1517.md` recorded.

1. **File counts re-derived.** The "reel" column in the table below is
   re-derivable today via
   `gh pr view <N> --json files --jq '[.files[] | select(.path | test("marketing"; "i"))] | length'`,
   counting entries whose path contains the substring "marketing"
   (case-insensitive). None of the six PRs has a mergeCommit (all are
   `state: "CLOSED"`, `mergedAt: null`), so the literal command the
   issue requests, `git show --stat <mergeCommit>`, cannot run; the
   `gh pr view --json files` snapshot exposes the same file list and
   matches the "reel" column to the unit:

   | PR | annonce (planned) | reel (PR diff, path ~ /marketing/i) |
   |----|-------------------|-------------------------------------|
   | #668 | 12/13 | 9/13 |
   | #669 | 12/13 | 9/13 |
   | #670 | 10/12 | 7/12 |
   | #671 | 9/13  | 8/13 |
   | #672 | 21/28 | 18/28 |
   | #673 | 11/13 | 1/13 |

   The "annonce" column cannot be re-derived from a non-existent
   citations file; it is the plan-as-merged ground truth. The
   "reel" column is the only one a future implementer needs to
   re-derive, and the methodology above is named.
2. **Provenance of the deleted guide.** The plan's "Sources read"
   table (line 35) already records the deletion commit
   `77609e3575307c1e6b225f458f36b6e29e390d0b` and notes that the
   only path that resolves today is
   `git show 77609e357~1:docs/guides/marketing-surface-conventions.md`.
   Verified by `git show 77609e357~1:docs/guides/marketing-surface-conventions.md`
   (returns the file's content header) and
   `git show 77609e357:docs/guides/marketing-surface-conventions.md`
   (returns "fatal: path ... not found in tree"). `git ls-tree -r HEAD`
   and `git ls-tree -r origin/develop` return no path matching
   `marketing-surface-conventions`. The plan's wording now says
   "read from history", not "read from the file" — an implementer
   following the plan will run the git-show command, not look for
   the file on disk.

No code change is required; the corrections are already present in
the merged plan's "Sources read" table. This round-3 note exists so
the audit trail from #1517 is captured at the same standing-rules
level as the round-2 corrections, not scattered across the body.
