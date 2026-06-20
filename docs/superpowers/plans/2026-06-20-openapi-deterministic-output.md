# Deterministic OpenAPI Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/api/openapi.json` (and the Kiota-generated `packages/client-ts`) reproducibly byte-identical across machines/CI, and enforce it durably.

**Architecture:** The fix (an `OpenApiDocumentNormalizer` document transformer) is already implemented and verified same-machine. This plan adds the two missing pieces: a pinned SDK (`global.json`) so a known toolchain produces the committed spec, and a CI "spec drift" workflow that rebuilds + regenerates and fails if the tree goes dirty. An optional task removes Windows-local CRLF noise from client regeneration.

**Tech Stack:** .NET 10 SDK (10.0.102), `just` task runner, Kiota (local dotnet tool 1.29.0), Node 24 + pnpm 10.13.1, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-20-openapi-deterministic-output-design.md`

**Branch:** `codex/683-openapi-parameter-ordering` (already checked out; fix + spec committed).

**Execution note:** Per repo orchestration policy, code/CI execution is performed by Codex and reviewed here. Final CI behavior can only be confirmed by pushing and watching the Actions run — Task 2 and Task 4 include that as an explicit step.

---

## File Structure

- **Create** `global.json` (repo root) — pins the .NET SDK feature band.
- **Create** `.github/workflows/openapi-spec-drift.yml` — the drift guard (the repo's first build-based workflow; mirrors the minimal style of `.github/workflows/require-linked-issue.yml`).
- **Modify** `justfile` (`generate-client` recipe, line ~233-236) — optional CRLF normalization of generated `.ts`.

No application code changes — the normalizer, regenerated spec/client, tests, and docs already exist on the branch.

---

## Task 1: Pin the .NET SDK with `global.json`

**Why:** The drift guard must build with the same SDK feature band (`10.0.102`) that produced the committed `openapi.json`. Without a `global.json`, the SDK floats per machine/runner and the guard can fail spuriously. This is issue #683 approach #2.

**Files:**
- Create: `global.json`

- [ ] **Step 1: Confirm the SDK version that produced the committed spec**

Run: `dotnet --version`
Expected: `10.0.102` (the band the committed `apps/api/openapi.json` was generated with). If it differs, use the value printed here in Step 2 instead.

- [ ] **Step 2: Create `global.json`**

Create `global.json` at the repo root:

```json
{
  "sdk": {
    "version": "10.0.102",
    "rollForward": "latestFeature"
  }
}
```

`latestFeature` keeps developers on newer SDK feature bands unblocked locally; CI pins the exact version explicitly in Task 2, so CI determinism does not depend on this `rollForward` value.

- [ ] **Step 3: Verify the build still reproduces a clean tree**

Run:
```bash
just build-api-full
git status --short
```
Expected: build succeeds; `git status --short` prints nothing (no `openapi.json` diff).

- [ ] **Step 4: Verify client regeneration is still clean**

Run:
```bash
just generate-client
git status --short
```
Expected: empty (on Windows, if `models/index.ts` shows as modified, it is CRLF-only — `git add --renormalize packages/client-ts && git status --short` must then be empty; Task 3 removes this noise).

- [ ] **Step 5: Commit**

```bash
git add global.json
git commit -m "build(api): pin .NET SDK via global.json for deterministic OpenAPI output

Refs #683

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add the CI spec-drift guard workflow

**Why:** Closes acceptance criteria #1 (byte-identical across machines) and #4 (durable CI enforcement). A clean CI build + client regeneration must leave the tree byte-clean.

**Files:**
- Create: `.github/workflows/openapi-spec-drift.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/openapi-spec-drift.yml`:

```yaml
name: OpenAPI Spec Drift

# Guards determinism of the build-generated apps/api/openapi.json and the
# Kiota-generated packages/client-ts. A clean build + client regeneration must
# leave the tree byte-identical; a dirty tree means the committed artifacts
# drifted and need regenerating + committing. See issue #683.

on:
  pull_request:
    paths:
      - "apps/api/**"
      - "packages/client-ts/**"
      - "justfile"
      - "global.json"
      - ".config/dotnet-tools.json"
      - ".github/workflows/openapi-spec-drift.yml"
  push:
    branches: [develop]
    paths:
      - "apps/api/**"
      - "packages/client-ts/**"
      - "justfile"
      - "global.json"
      - ".config/dotnet-tools.json"
      - ".github/workflows/openapi-spec-drift.yml"

permissions:
  contents: read

jobs:
  spec-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up .NET (pinned for CI determinism)
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: "10.0.102"

      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.13.1

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: pnpm

      - name: Set up just
        uses: extractions/setup-just@v2

      - name: Install workspace dependencies
        run: pnpm install --frozen-lockfile

      - name: Restore .NET tools (kiota, dotnet-ef)
        run: dotnet tool restore

      - name: Build API (regenerates openapi.json)
        run: just build-api-full

      - name: Fail if openapi.json drifted
        run: |
          if ! git diff --exit-code -- apps/api/openapi.json; then
            echo "::error::apps/api/openapi.json is not byte-identical to a clean build. Run 'just build-api' locally and commit the result."
            exit 1
          fi

      - name: Regenerate TypeScript client
        run: just generate-client

      - name: Fail if client drifted
        run: |
          if ! git diff --exit-code -- packages/client-ts; then
            echo "::error::packages/client-ts is not byte-identical to a clean 'just generate-client'. Regenerate and commit."
            exit 1
          fi

      - name: Run OpenAPI contract spec
        run: |
          cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test \
            --filter "FullyQualifiedName~OpenApiContractSpec"
```

- [ ] **Step 2: Validate the YAML locally**

Run (if `actionlint` is available): `actionlint .github/workflows/openapi-spec-drift.yml`
Expected: no errors. If `actionlint` is not installed, visually confirm indentation and that every `uses:`/`run:` step is well-formed.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/openapi-spec-drift.yml
git commit -m "ci: add OpenAPI/client spec-drift guard

Rebuilds the API and regenerates the Kiota client on PRs and develop
pushes, failing if apps/api/openapi.json or packages/client-ts is left
dirty. Enforces deterministic OpenAPI output.

Refs #683

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Verify on a real CI run (after the PR is opened in Task 4)**

After pushing, open the PR's Checks tab and confirm the `OpenAPI Spec Drift / spec-drift` job runs and passes. If it fails on a toolchain/setup step (e.g. the translation-key generation during `dotnet build` needs a tool not yet installed), fix the workflow, commit, and re-push until the job is green. A green run is the proof of acceptance criteria #1 and #4.

---

## Task 3 (optional): Remove Windows CRLF noise from client regeneration

**Why:** On Windows, `just generate-client` rewrites generated `.ts` with CRLF, so `models/index.ts` shows as modified until git normalizes it (content is byte-identical after `.gitattributes eol=lf`). Normalizing in the recipe removes the cosmetic noise. Skippable — CI on Linux emits LF and is unaffected.

**Files:**
- Modify: `justfile` (the `generate-client` recipe, currently lines ~233-236)

- [ ] **Step 1: Replace the post-generate normalization step**

In `justfile`, the `generate-client` recipe currently ends with a node step that normalizes only `kiota-lock.json`:

```
generate-client:
  cd {{js_client_dir}} && dotnet kiota generate -d ../../{{api_dir}}/openapi.json -o src -l typescript -n PublyApp.Api.Client -c ApiClient
  cd {{js_client_dir}} && node -e "const fs=require('fs'); const p='src/kiota-lock.json'; if (fs.existsSync(p)) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n'))"
```

Replace the second command (the `node -e ...` line) with a version that normalizes every generated `.ts`/`.json` under `src`:

```
  cd {{js_client_dir}} && node -e "const fs=require('fs'),path=require('path'); const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name); return e.isDirectory()?walk(p):[p];}); for (const f of walk('src')) { if (f.endsWith('.ts')||f.endsWith('.json')) { const c=fs.readFileSync(f,'utf8'); const n=c.replace(/\r\n?/g,'\n'); if (n!==c) fs.writeFileSync(f,n); } }"
```

- [ ] **Step 2: Verify on Windows the tree stays clean**

Run:
```bash
just generate-client
git status --short
```
Expected: empty (no `models/index.ts` CRLF noise).

- [ ] **Step 3: Commit**

```bash
git add justfile
git commit -m "build(client): normalize CRLF in all generated client files

Extends the generate-client post-step to LF-normalize every generated
.ts/.json so Windows regeneration leaves no working-tree noise.

Refs #683

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Open the PR

**Why:** Ship the branch for review. Must link #683 to satisfy the existing `require-linked-issue` gate.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin codex/683-openapi-parameter-ordering
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create --base develop --head codex/683-openapi-parameter-ordering \
  --title "chore(api): deterministic OpenAPI output (normalizer + CI drift guard)" \
  --body "Closes #683

Pins OpenAPI parameter ordering via an OpenApiDocumentNormalizer document
transformer, pins the .NET SDK with global.json, and adds a CI spec-drift
guard that fails if apps/api/openapi.json or packages/client-ts is left
dirty by a clean build/regeneration.

Verified same-machine: clean build leaves the tree byte-identical;
negative control confirms the transformer is the cause; OpenApiContractSpec
passes (4/4). Cross-machine determinism is enforced by the new CI guard.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: Confirm gates run**

Open the PR Checks tab. Confirm both `Require Linked Issue` and `OpenAPI Spec Drift / spec-drift` run and pass. Do **not** merge — the user merges.

---

## Self-review notes

- **Spec coverage:** Piece 1 (CI guard) → Task 2; Piece 2 (pinned SDK) → Task 1; Piece 3 (CRLF tidy) → Task 3; Piece 4 (PR) → Task 4. Verification recipe from the spec is exercised in Task 1 Steps 3-4 and Task 2 Step 4.
- **Non-goals respected:** no paths/tags/schema ordering; no schema/route/behavior changes.
- **SDK version:** `10.0.102` is used consistently in `global.json` (Task 1) and the workflow (Task 2), matching the locally verified build. (The issue text mentioned `10.0.300`; ground-truth on the build machine is `10.0.102`.)
