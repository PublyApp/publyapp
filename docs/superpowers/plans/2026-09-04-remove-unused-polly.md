# Remove the Unused Polly Dependency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove PublyApp's unused direct Polly dependency without adding a replacement or changing
runtime behaviour.

**Architecture:** Preserve the existing hexagonal boundaries: provider adapters classify external
failures, while the job engine owns retry and backoff. This change removes dependency metadata and
documentation only.

**Tech Stack:** .NET 10, NuGet central package management, Markdown

---

### Task 1: Remove the direct dependency

**Files:**
- Modify: `Directory.Packages.props:31`
- Modify: `apps/api/PublyApp.Api.csproj:50`
- Modify: `README.md:143`

- [ ] **Step 1: Reconfirm that no application source uses Polly**

Run:

```bash
git grep -nE 'using Polly|Polly\.|ResiliencePipeline' -- '*.cs' ':!*.Spec.cs'
```

Expected: no matches and exit code 1.

- [ ] **Step 2: Remove all three active declarations**

Delete exactly:

```xml
<PackageVersion Include="Polly" Version="8.7.0" />
```

```xml
<PackageReference Include="Polly" />
```

Remove `Polly` from the backend technology cell in `README.md`; do not replace it with another
resilience package.

- [ ] **Step 3: Verify formatting and the declared surface**

Run:

```bash
git diff --check
git grep -n Polly -- Directory.Packages.props apps/api/PublyApp.Api.csproj README.md
```

Expected: `git diff --check` succeeds; the Polly search has no matches and exits 1.

### Task 2: Verify dependency resolution and build

**Files:**
- Verify: `apps/api/.artifacts/obj/PublyApp.Api/project.assets.json` (generated, ignored)

- [ ] **Step 1: Restore the API dependency graph**

Run:

```bash
dotnet restore apps/api/PublyApp.Api.csproj
```

Expected: restore succeeds with no errors.

- [ ] **Step 2: Verify the API no longer directly depends on Polly**

Run:

```bash
dotnet list apps/api/PublyApp.Api.csproj package --format json
```

Expected: command succeeds and the direct top-level package list contains no package named `Polly`.

- [ ] **Step 3: Build the API through the repository recipe**

Run:

```bash
just build-api
```

Expected: `Build succeeded.`, zero warnings, and zero errors.

- [ ] **Step 4: Commit the implementation**

```bash
git add Directory.Packages.props apps/api/PublyApp.Api.csproj README.md
git commit -m "build(api): remove unused Polly dependency"
```

### Task 3: Publish for review

**Files:**
- Verify: complete branch diff against `origin/develop`

- [ ] **Step 1: Verify the final branch**

Run:

```bash
git diff --check origin/develop...HEAD
git status --short
```

Expected: no diff-check errors and a clean worktree.

- [ ] **Step 2: Push and open the pull request**

```bash
git push -u origin chore/remove-unused-polly
gh pr create --base develop --head chore/remove-unused-polly \
  --title "build(api): remove unused Polly dependency" \
  --body-file /tmp/remove-unused-polly-pr.md
```

The PR body must describe the unused direct dependency, state that no replacement was added, link
the existing lean-maintenance portfolio with `Part of #1160`, and list the fresh verification.
