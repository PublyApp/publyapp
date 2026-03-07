# Packages Naming Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename `packages/js-client` → `client-ts`, `packages/shared` → `shared-ts`, and prepare `shared-cs` for future C# worker service.

**Architecture:** Move content to new folders, update package.json names, update all import references, update configuration files, then delete old folders.

**Tech Stack:** pnpm workspaces, TypeScript, .NET 10

---

## Pre-flight: Verify Current State

**Step 1: Check git status**

```bash
git status
```

Expected: Clean working tree (commit any pending changes first).

---

## Task 1: Move js-client Content to client-ts

**Files:**
- Execute: `mv packages/js-client/* packages/client-ts/`
- Execute: `mv packages/js-client/.gitignore packages/client-ts/`
- Execute: `rmdir packages/js-client`

**Step 1: Move files**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2
mv packages/js-client/* packages/client-ts/
mv packages/js-client/.gitignore packages/client-ts/ 2>/dev/null || true
rmdir packages/js-client 2>/dev/null || rmdir packages/js-client
ls packages/
```

Expected: `client-ts/` folder has the content, `js-client/` removed.

**Step 2: Commit**

```bash
git add packages/client-ts packages/js-client
git commit -m "refactor: move js-client to client-ts"
```

---

## Task 2: Move shared Content to shared-ts

**Files:**
- Execute: `mv packages/shared/* packages/shared-ts/`
- Execute: `rmdir packages/shared`

**Step 1: Move files**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2
mv packages/shared/* packages/shared-ts/
rmdir packages/shared
ls packages/
```

Expected: `shared-ts/` folder has the content, `shared/` removed.

**Step 2: Commit**

```bash
git add packages/shared packages/shared-ts
git commit -m "refactor: move shared to shared-ts"
```

---

## Task 3: Update client-ts package.json

**Files:**
- Modify: `packages/client-ts/package.json`

**Step 1: Update name**

```bash
# Edit packages/client-ts/package.json line 2
# Change: "name": "@org/js-client"
# To:     "name": "@org/client-ts"
```

**Step 2: Commit**

```bash
git add packages/client-ts/package.json
git commit -m "refactor: rename package to @org/client-ts"
```

---

## Task 4: Update shared-ts package.json

**Files:**
- Modify: `packages/shared-ts/package.json`

**Step 1: Update name**

```bash
# Edit packages/shared-ts/package.json line 2
# Change: "name": "@org/shared"
# To:     "name": "@org/shared-ts"
```

**Step 2: Commit**

```bash
git add packages/shared-ts/package.json
git commit -m "refactor: rename package to @org/shared-ts"
```

---

## Task 5: Update TypeScript Import References

**Files:**
- Modify: All files in `apps/front/` with `@org/shared` or `@org/js-client`

**Step 1: Find all imports to update**

```bash
grep -r "@org/shared" apps/front/src --include="*.ts" --include="*.tsx" -l
grep -r "@org/js-client" apps/front/src --include="*.ts" --include="*.tsx" -l
```

**Step 2: Replace in imports (execute these sed commands)**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2

# Replace @org/shared with @org/shared-ts
find apps/front/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i 's|@org/shared/|@org/shared-ts/|g' {} \;

# Replace @org/js-client with @org/client-ts
find apps/front/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i 's|@org/js-client/|@org/client-ts/|g' {} \;
```

**Step 3: Verify changes**

```bash
grep -r "@org/shared" apps/front/src --include="*.ts" --include="*.tsx" | grep -v "shared-ts"
grep -r "@org/js-client" apps/front/src --include="*.ts" --include="*.tsx" | grep -v "client-ts"
```

Expected: No matches (all replaced).

**Step 4: Also update @types files**

```bash
find apps/front/@types -type f -exec sed -i 's|@org/shared/|@org/shared-ts/|g' {} \;
```

**Step 5: Commit**

```bash
git add apps/front/src apps/front/@types
git commit -m "refactor: update imports to use new package names"
```

---

## Task 6: Update tsconfig.paths.json

**Files:**
- Modify: `tsconfig.paths.json`

**Step 1: Read current file**

```bash
cat tsconfig.paths.json
```

**Step 2: Edit**

```json
// Change:
"@/js-client/*": ["./packages/js-client/*"],
"@/shared/*": ["./packages/shared/*"]

// To:
"@/js-client/*": ["./packages/client-ts/*"],
"@/shared/*": ["./packages/shared-ts/*"]
```

**Step 3: Commit**

```bash
git add tsconfig.paths.json
git commit -m "refactor: update tsconfig path aliases"
```

---

## Task 7: Update biome.jsonc

**Files:**
- Modify: `biome.jsonc`

**Step 1: Read current ignore patterns**

```bash
grep -A2 "ignore" biome.jsonc
```

**Step 2: Edit**

```jsonc
// Change:
"ignore": ["apps/api", "packages/js-client", "apps/front/node_modules"]

// To:
"ignore": ["apps/api", "packages/client-ts", "apps/front/node_modules"]
```

**Step 3: Commit**

```bash
git add biome.jsonc
git commit -m "refactor: update biome ignore patterns"
```

---

## Task 8: Update .lintstagedrc.js

**Files:**
- Modify: `.lintstagedrc.js`

**Step 1: Read current file**

```bash
cat .lintstagedrc.js
```

**Step 2: Edit**

```javascript
// Change: (file) => !file.includes('packages/js-client/')
// To:     (file) => !file.includes('packages/client-ts/')
```

**Step 3: Commit**

```bash
git add .lintstagedrc.js
git commit -m "refactor: update lintstaged ignore pattern"
```

---

## Task 9: Update Makefile

**Files:**
- Modify: `Makefile`

**Step 1: Read relevant lines**

```bash
grep -n "SHARED_DIR\|JS_CLIENT_DIR" Makefile
```

**Step 2: Edit Makefile lines 7-8**

```makefile
# Change:
SHARED_DIR = packages/shared
JS_CLIENT_DIR = packages/js-client

# To:
SHARED_DIR = packages/shared-ts
JS_CLIENT_DIR = packages/client-ts
```

**Step 3: Also update lines 292-293**

```makefile
# Change:
@$(RM) packages/shared/node_modules
@$(RM) packages/js-client/node_modules

# To:
@$(RM) packages/shared-ts/node_modules
@$(RM) packages/client-ts/node_modules
```

**Step 4: Commit**

```bash
git add Makefile
git commit -m "refactor: update Makefile package paths"
```

---

## Task 10: Update apps/front/Dockerfile

**Files:**
- Modify: `apps/front/Dockerfile`

**Step 1: Read Dockerfile lines with package paths**

```bash
grep -n "packages/shared\|packages/js-client" apps/front/Dockerfile
```

**Step 2: Edit lines 15-16, 31, 53-54**

```dockerfile
# Change:
COPY packages/shared/package.json ./packages/shared/
COPY packages/js-client/package.json ./packages/js-client/

# To:
COPY packages/shared-ts/package.json ./packages/shared-ts/
COPY packages/client-ts/package.json ./packages/client-ts/
```

Also update the `RUN cd packages/shared` and `RUN cd packages/js-client` lines.

**Step 3: Commit**

```bash
git add apps/front/Dockerfile
git commit -m "refactor: update Dockerfile package paths"
```

---

## Task 11: Update apps/front/vite.config.ts

**Files:**
- Modify: `apps/front/vite.config.ts`

**Step 1: Find the line**

```bash
grep -n "packages/shared" apps/front/vite.config.ts
```

**Step 2: Edit line 39**

```typescript
// Change:
ignored: ['**/packages/shared/lib/i18n/json/**']

// To:
ignored: ['**/packages/shared-ts/lib/i18n/json/**']
```

**Step 3: Commit**

```bash
git add apps/front/vite.config.ts
git commit -m "refactor: update vite.config ignore path"
```

---

## Task 12: Update apps/front/_vite/copy-i18n-files.ts

**Files:**
- Modify: `apps/front/_vite/copy-i18n-files.ts`

**Step 1: Find lines**

```bash
grep -n "packages/shared" apps/front/_vite/copy-i18n-files.ts
```

**Step 2: Edit lines 14 and 81**

```typescript
// Change:
path.resolve(process.cwd(), '../../packages/shared/lib/i18n/json')

// To:
path.resolve(process.cwd(), '../../packages/shared-ts/lib/i18n/json')
```

**Step 3: Commit**

```bash
git add apps/front/_vite/copy-i18n-files.ts
git commit -m "refactor: update i18n copy paths"
```

---

## Task 13: Update apps/front/_vite/generate-client.ts

**Files:**
- Modify: `apps/front/_vite/generate-client.ts`

**Step 1: Find line**

```bash
grep -n "packages/js-client" apps/front/_vite/generate-client.ts
```

**Step 2: Edit line 23**

```typescript
// Change:
'../../packages/js-client',

// To:
'../../packages/client-ts',
```

**Step 3: Commit**

```bash
git add apps/front/_vite/generate-client.ts
git commit -m "refactor: update generate-client path"
```

---

## Task 14: Update apps/api/MainApi.csproj

**Files:**
- Modify: `apps/api/MainApi.csproj`

**Step 1: Find line**

```bash
grep -n "packages/shared" apps/api/MainApi.csproj
```

**Step 2: Edit line 63**

```xml
<!-- Change: -->
<TranslationJsonFile>$(MSBuildProjectDirectory)\..\..\packages\shared\lib\i18n\json\response-message.en.json</TranslationJsonFile>

<!-- To: -->
<TranslationJsonFile>$(MSBuildProjectDirectory)\..\..\packages\shared-ts\lib\i18n\json\response-message.en.json</TranslationJsonFile>
```

**Step 3: Commit**

```bash
git add apps/api/MainApi.csproj
git commit -m "refactor: update csproj translation path"
```

---

## Task 15: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Step 1: Find lines**

```bash
grep -n "packages/js-client\|packages/shared" AGENTS.md
```

**Step 2: Edit references**

Replace:
- `packages/js-client` → `packages/client-ts`
- `packages/shared` → `packages/shared-ts`

**Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md package paths"
```

---

## Task 16: Run pnpm install

**Step 1: Install dependencies**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2
pnpm install
```

Expected: No errors, lockfile regenerated.

**Step 2: Commit lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: regenerate lockfile after package rename"
```

---

## Task 17: Verify Build

**Step 1: Build API**

```bash
make build-api
```

Expected: SUCCESS

**Step 2: Build Frontend**

```bash
make build-front
```

Expected: SUCCESS

**Step 3: Generate Client (optional - tests API changes)**

```bash
make generate-client
```

Expected: SUCCESS

---

## Task 18: Final Commit

**Step 1: Review all changes**

```bash
git log --oneline -10
```

**Step 2: Tag (optional)**

```bash
git tag -a packages-rename-v1 -m "Renamed packages: js-client→client-ts, shared→shared-ts"
```
