Closes #1623

## What is removed

- `serialize-error` (root `package.json` `dependencies`): no importer anywhere in `apps/` or `packages/`.
- `nanoid` (the `^5.1.16` direct declaration in `packages/shared-ts/package.json`): no importer anywhere.
- The two root `pnpm.overrides` security caps for `nanoid` (`nanoid@<3.3.18 → ^3.3.18` and `nanoid@>=4.0.0 <5.0.9 → ^5.1.16`).

## Proof of absence of usage

Documented in `.dump/preuve-absence-usage.md`. No `import`/`require`/`import()` of any of the three in workspace source, specs, scripts, or CI config.

For `nanoid`, the prior record claimed "no transitive consumer resolves nanoid" — that was wrong. `pnpm why nanoid` only returns empty because, with the overrides gone, `nanoid` is no longer hoisted to the graph root; it still lives as a deep transitive dependency of `postcss`. The `pnpm-lock.yaml` shows it explicitly:

```yaml
  postcss@8.5.25:
    dependencies:
      nanoid: 3.3.18
```

`postcss@8.5.25` resolves `nanoid@3.3.18`, which is already the patched version for GHSA-mwcw-c2x4-8c55. So `nanoid` is **not orphaned** — it is present only as a transitive consumer already on a safe version. That is exactly the removal condition `docs/guides/dependency-health.md` states ("Remove both overrides once upstream consumers resolve fixed versions without them"), so both caps are safe to drop.

## Security control output

`docs/guides/dependency-health.md` describes two standing audit commands as the proof that removing the caps does not reopen GHSA-mwcw-c2x4-8c55. Both run clean:

```
$ pnpm audit --prod --audit-level=high
No known vulnerabilities found

$ pnpm audit --audit-level=moderate
No known vulnerabilities found
```

Full output captured in `.dump/preuve-audit.md`. Neither reports anything on `nanoid`.

## Documentation update

`docs/guides/dependency-health.md` previously asserted the two `pnpm.overrides` caps still existed and that the `packages/shared-ts` `^5.1.16` direct declaration satisfied the range. Both statements were false after the removal commit. The `nanoid` paragraph has been rewritten to state the caps and the direct declaration are removed, the only remaining consumer is transitive (`postcss@8.5.25 → nanoid@3.3.18`, already patched), and the documented removal condition is met.

The guard `packages/scripts-ts/src/dependency-health-pin-location.test.ts` was checked — it only covers the `@microsoft/kiota-http-fetchlibrary` (#880) record, not the `nanoid`, `serialize-error`, or `Serilog.Enrichers.Environment` paragraphs — so the doc edit does not regress it (test still passes, 2/2).

## Build / typecheck gate (what the prior removal actually proved)

The fast proof gate (`just build-api` + `pnpm --filter front typecheck`) surfaced a real regression introduced by the removal commit `ec7089c99`:

- Front typecheck: **green**.
- API build: failed with `CS1061: 'LoggerEnrichmentConfiguration' does not contain a definition for 'WithMachineName'`.

The prior lane's proof asserted `WithMachineName()` comes from `Serilog.Enrichers.Thread`, so `Serilog.Enrichers.Environment` (the only package it removed) was "unused". That is false: inspecting the NuGet assemblies shows `Serilog.Enrichers.Thread` 3.1.0 exposes only `WithThreadId`/`WithThreadName`, while `WithMachineName` lives in `Serilog.Enrichers.Environment`. `apps/api/Lib/Extensions/LoggerConfigExtensions.cs` calls `Enrich.WithMachineName()`, so the package is genuinely used.

The build gate is the proof: removing a used reference breaks compilation. `Serilog.Enrichers.Environment` was therefore **restored** in `Directory.Packages.props` and `apps/api/PublyApp.Api.csproj` (commit `f59772210`). It stays in scope as a used dependency.

(Note: the API build also hits a 2-minute timeout in the OpenAPI document generation step `dotnet-getdocument.dll`. That step is environmental — the tool runs cleanly in ~5s when invoked directly and writes `PublyApp.Api.json`; compilation itself passes with zero `error CS`. This is unrelated to the dependency change and is not addressed here, per the brief's instruction to keep this out of the heavy queue.)

## What remains unverified

- The OpenAPI-generation 2-minute timeout on `dotnet build` was not root-caused in this task (environmental; direct invocation succeeds). It is flagged above, not fixed.
- No integration (`just ci`) / e2e suite was run, per the brief's instruction not to add long work to the saturated heavy-queue lock.

## Automated PR note

The automated PR **#1581** (the `nanoid` version bump) becomes moot once this PR is merged: the direct `nanoid` declaration and both security caps are removed, and the only remaining consumer (`postcss`) already resolves the patched `nanoid@3.3.18`. This PR does **not** close #1581; that decision is left to its owner.
