# When a change needs an end-to-end test

**Level: Guidance** — a strong default. Skip it only with a stated reason in the PR description.

Playwright specs live in `apps/front/e2e/`. They run in CI as four required shards
(`front-e2e.yml`), so this guide decides **what to add**, not whether to run. A suite
that tries to cover everything becomes slow and flaky, and a flaky suite is ignored —
which is the same as having no suite. A suite that covers nothing is honest but useless.

## The five criteria

Write an end-to-end test when **all five** hold. If any fails, don't — and say why in the
PR.

### 1. There is a screen a person can drive

Judge the **user-visible effect**, not the files the diff touches. A change whose diff is
confined to `package.json` or a storage driver still passes this criterion if a person clicks
something to exercise it — a missing SDK that froze report validation has a screen, even
though its diff has none.

It fails when nothing a person can reach changes behaviour: a script, a migration, a lint
rule, a build gate, an internal refactor with identical output. Unit and integration tests
are the right tool there.

### 2. A regression would be silent

This is the one that matters most. Ask: *if someone broke this next month, what would tell
us?*

Don't answer "an existing unit test" from the file listing — **measure it**. Neutralise the
code this change guards, exactly as you would to prove an end-to-end test red, and run the
existing suite:

- an existing test **goes red** → it already covers this, and the end-to-end test earns
  nothing;
- everything **stays green** → the coverage is nominal, and the test is due even though a
  test file exists.

A test that renders a component but never asserts the guard behind it passes this mutation
untouched. Guards, permissions, tenant scoping and multi-step flows all fail this way: they
keep type-checking and keep passing their unit tests while doing the wrong thing.

### 3. The behaviour crosses a seam

A seam means **at least two** of these three are involved:

1. a value is **persisted**;
2. it is read back in a **different request, route, or role**;
3. a **server-side guard** decides who sees it.

That is where the defects no single-screen test can see actually live: a value written on
one screen and read on another, a join that returns the wrong row, a guard applied in the UI
but not in the server action.

A pure render — props in, DOM out, same route, same role — is **not** a seam, and is better
served by a component test. Two variants of one component are still one render.

One deliberate exception: the `i18n` and public-page smokes cover routing, locale
negotiation and middleware at once. They cross a seam the criteria above do not name, and
they stay.

### 4. It is deterministic

No dependency on the wall clock beyond dates you control, no external service, no ordering
that depends on which test ran first. A test that fails one run in ten teaches the team to
re-run it, and from then on it protects nothing.

### 5. The ticket is yours

Decidable from the ticket, not from a feeling: write the end-to-end test when you are the
**author or the assignee** of the ticket carrying the change, or the owner of the domain it
lands in.

Otherwise, don't — open a ticket and assign it to whoever owns the work. Writing a test for
a colleague's change encodes your guess at what they meant, and the test outlives the guess.
If a PR covers someone else's ticket anyway, say whose, and why they agreed.

## What a good spec looks like

**Assert through the API or a second request.** An error toast shown while a row is written
anyway is exactly the class of defect worth catching. Read the state back: either make a
second request (a GET to verify the resource was created, a response from a different role to
verify tenant scoping), or assert the API response itself. Playwright specs talk to the real
stack — look at how existing specs verify persisted state (e.g. `staff-tenants.spec.ts`
asserting list content after a create action, or `ssr-auth-shell.spec.ts` verifying SSR
behaviour via raw `request.get()` calls). A scenario that only reads the DOM has not proven
what was stored.

**Include a positive witness.** At least one scenario where the action is *supposed* to
succeed. Without it, a spec broken for a stupid reason — a renamed selector, an expired
session — looks identical to a guard that works.

**Prove it red.** A test that has never failed proves nothing. Before opening the PR,
neutralise the code it guards, run it, and paste the red output into the PR description.
This is non-negotiable for the mutation rule: the guard must go red when you remove or break
the code it protects. A test that passes against a broken codebase is a false positive
waiting to happen.

**Tag it.** Every top-level `test.describe` carries a `@<domain>` tag (from the closed
vocabulary in [e2e-tags.md](e2e-tags.md)) and a `@<ticket>` tag (the GitHub issue the spec
proves). This makes the suite filterable (`--grep @staff-tenants`) and traceable back to the
work it covers. A Vitest guard enforces this: the build breaks if any top-level describe
lacks a domain tag, uses a word outside the vocabulary, or lacks a ticket tag.
