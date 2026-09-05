Date: 2026-09-05. Type: review. Scope: issue #2018 correction to `apps/front/scripts/guards/check-server-static-imports.mts`.

# Bespoke guard admission record — declared versus installed `srvx` (#2018)

The #2018 change is a material extension of the existing static-import guard: it adds a new executable policy assertion that the installed `srvx` package must be the exact version declared by `apps/front/package.json` before the guard diagnoses the import shape. Under the repository's bespoke-guard admission rule, this record captures why that extension is admitted and how it is bounded.

## 1. Current reproducible failure

Issue #2018 reproduced the failure on develop `a6a28e908` with an unchanged `server.mjs`: `apps/front/package.json` declared `srvx@0.12.7`, while the local `node_modules/srvx/package.json` reported `0.11.16`. The previous guard compared against the stale installed export surface and advised changing `server.mjs` to use `serveStatic`. Following that advice made the local guard green while reintroducing the #1822 startup regression against the declared `0.12.7` dependency.

The violating fixture used by the correction is the same on-disk shape:

```text
front/package.json                 dependencies.srvx = 0.12.7
front/node_modules/srvx/package.json  version = 0.11.16
front/server.mjs                  imports staticMiddleware from srvx/static
```

Before the default source accepted the fixture's front directory, the focused suite reported `13` passing tests and `1` failure because the production/default path ignored the mismatched files. After the seam correction, the fixture fails with the declared and installed versions and `pnpm install` advice.

## 2. Critical invariant

This protects a build and release invariant: the static-import guard must diagnose the source against the dependency version the repository declares, not against arbitrary stale local bytes. A wrong local correction can make the guard pass and ship a front server that exits during startup, blocking every page and causing the publish-now e2e failure. The failure is local-only because CI installs with `--frozen-lockfile`, which makes the local diagnostic particularly important rather than hypothetical.

## 3. Why a simpler mechanism is insufficient

The ordinary TypeScript checker and the package manager do not verify this exact boundary before the existing guard loads the installed module. The existing AST check must continue to inspect live exports because a copied export list would drift. A normal unit test can exercise the guard, but cannot replace the production check against the actual worktree's `package.json` and `node_modules` files. The smallest useful addition is therefore an exact string comparison of the two package metadata versions before the existing export-shape check.

## 4. Smallest mechanism and maintenance cost

The implementation keeps the existing guard surface and adds no framework, manifest, allowlist, semver resolver, or copied export inventory. The default source reads exactly two files, `apps/front/package.json` and `apps/front/node_modules/srvx/package.json`; tests use the same layout in a temporary directory. The readers distinguish absent files, read failures, invalid JSON, and missing fields so an operator receives a corrective diagnosis instead of a generic version mismatch.

The maintenance cost is explicit and bounded:

- A future package-manager layout change or dependency relocation must update the two path expressions and their on-disk fixtures.
- Every `srvx` upgrade must continue to run the existing focused guard and confirm exact declared/installed equality.
- The focused test file carries four metadata failure-mode proofs for each metadata side, plus the stale-install and conforming cases. Those tests must change if the package metadata contract changes.
- The check intentionally uses exact equality because this repository pins dependencies exactly. If that pinning policy changes, the comparison policy must be reviewed rather than silently widened to semver compatibility.

There is one source of truth for the export surface: the installed module loaded by the guard. The version check only establishes that the loaded package metadata corresponds to the repository declaration.

## 5. Red/green evidence

Exact focused command:

```text
cd apps/front && pnpm test:server-static-imports-guard
```

Evidence captured while correcting the WIP:

- The on-disk declared `0.12.7` / installed `0.11.16` fixture failed before the default source accepted a supplied front directory, then passed after the production/default path read that fixture.
- The generic-null implementation produced `4` failing diagnostics proofs. The corrected readers distinguish absent, unreadable, invalid-JSON, and missing-field installed metadata, with the same coverage for declared metadata.
- Reapplying the old `source already targets the declared version` wording produced `1` failing source-claim proof. Restoring deferred source diagnosis made it pass.
- The focused suite's final corrected run passed `24/24` tests.

The conforming production/default path was also exercised by the real installed `srvx/static` test and by the production guard command:

```text
cd apps/front && pnpm check:server-static-imports
```

## 6. Retirement or replacement condition

Remove this custom declared/installed version assertion when the repository's supported local workflow guarantees that every guard run follows a frozen `pnpm install` and a standard package-manager integrity check verifies the installed `srvx` package metadata against the declared dependency and lockfile. At that point, replace this portion with that standard check and delete `VersionSource`, the on-disk metadata readers, and their fixtures. If `srvx/static` is removed from `server.mjs`, remove the entire static-import guard after a standard compiler or runtime smoke check covers the replacement contract. Until one of those concrete conditions exists, the local stale-install failure remains reproducible and the guard remains admitted.
