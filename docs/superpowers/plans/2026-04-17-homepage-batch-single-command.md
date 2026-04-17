# Homepage Batch Single-Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current two-command homepage factory workflow with one append-only batch command that creates prompt archives, generated page scaffolds, and explicit prompt-to-page-to-route mapping in a single run.

**Architecture:** Keep the current low-level prompt generator and generated-homepage scaffolder, but add one orchestration layer that uses a pure in-memory prompt-artifact builder plus a new append-only prompt archive helper. The new CLI should resolve prompt config from the real repo, allow artifact output into an override repo root for tests, and write one batch manifest plus a top-level batch index without changing the existing `/homepage-gen/:id` runtime model.

**Tech Stack:** Node.js ESM scripts (`node:test`, `fs/promises`, `path`), existing homepage factory modules under `scripts/homepage-factory/`, repo scripts in `package.json`, Markdown docs in `docs/misc/homepage-factory/`

---

## File Structure

- Modify: `package.json`
  - Add `generate:homepage-batch` and a focused test script for the new batch workflow.
- Modify: `scripts/homepage-factory/generator.mjs`
  - Extract a pure prompt-artifact builder that returns prompts and strategy metadata without writing to disk.
- Modify: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`
  - Cover the new pure builder while keeping the existing low-level prompt generator contract green.
- Create: `scripts/homepage-factory/prompt-batch-archive.mjs`
  - Own batch-label normalization, append-only archive-folder resolution, per-batch manifest construction, and top-level batch-index writes.
- Create: `scripts/homepage-factory/prompt-batch-archive.test.mjs`
  - Cover archive-folder collision handling, path formatting, per-batch manifest writing, and append-only batch index updates.
- Create: `scripts/homepage-factory/generated-homepage-batch-flow.mjs`
  - Orchestrate config loading, in-memory prompt generation, page scaffolding, archive writes, and the final prompt-to-page mapping.
- Create: `scripts/homepage-factory/generated-homepage-batch-flow.test.mjs`
  - Cover single-command batch generation, repeated-label archive suffixes, and combined prompt/page manifest correctness.
- Create: `scripts/generate-homepage-batch.mjs`
  - Thin CLI entry point for `pnpm generate:homepage-batch`.
- Modify: `docs/misc/homepage-factory/README.md`
  - Make the single-command append-only workflow the primary documented usage path.

## Task 1: Extract A Pure Prompt Artifact Builder

**Files:**
- Modify: `scripts/homepage-factory/generator.mjs`
- Modify: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`

- [ ] **Step 1: Add a failing test for in-memory prompt artifact generation**

Append this test to `scripts/homepage-factory/generate-homepage-prompts.test.mjs`:

```js
import { buildHomepagePromptBatchArtifacts } from './generator.mjs';

test('buildHomepagePromptBatchArtifacts returns prompt files and manifest metadata without writing to disk', async () => {
  const result = await buildHomepagePromptBatchArtifacts({
    config: TEST_CONFIG,
    variants: 2,
    seed: 'artifact-seed',
    buildPrompt: buildHomepagePrompt,
  });

  assert.deepEqual(
    result.manifest.map((entry) => {
      return {
        variant: entry.variant,
        fileName: entry.fileName,
        seed: entry.seed,
      };
    }),
    [
      {
        variant: 1,
        fileName: '001-homepage-prompt.md',
        seed: 'artifact-seed',
      },
      {
        variant: 2,
        fileName: '002-homepage-prompt.md',
        seed: 'artifact-seed',
      },
    ],
  );
  assert.equal(result.prompts.length, 2);
  assert.equal(result.prompts[0].fileName, '001-homepage-prompt.md');
  assert.match(result.prompts[0].content, /Homepage Prompt Variant 1/i);
});
```

- [ ] **Step 2: Run the prompt tests to verify the new test fails**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: FAIL with `buildHomepagePromptBatchArtifacts is not a function` or an equivalent missing-export error.

- [ ] **Step 3: Extract the pure builder from `generator.mjs`**

In `scripts/homepage-factory/generator.mjs`, add this exported helper above
`generateHomepagePromptBatch` and refactor the existing function to call it:

```js
export const buildHomepagePromptBatchArtifacts = async ({
  config,
  variants,
  seed,
  buildPrompt,
}) => {
  if (typeof buildPrompt !== 'function') {
    throw new Error(
      'buildHomepagePromptBatchArtifacts requires a buildPrompt function.',
    );
  }

  assertVariantCount(variants);
  validateHomepageFactoryConfig(config);

  const orderedRecipes = sortRecipesBySeed(
    collectCompatibleRecipes(config),
    seed,
  );

  if (orderedRecipes.length === 0) {
    throw new Error(
      'No compatible homepage recipes available for the selected config.',
    );
  }

  const manifest = [];
  const prompts = [];

  for (let variant = 1; variant <= variants; variant += 1) {
    const {
      audienceOverlay,
      homepageArchetype,
      promiseAngle,
      proofStrategy,
      creativeBundle,
    } = orderedRecipes[(variant - 1) % orderedRecipes.length];
    const selectedReferences = creativeBundle.referenceAnchors.slice(0, 4);
    const selectedLibraries = creativeBundle.inspirationLibraries.slice(0, 2);

    validateHomepagePromptInputs({
      seed,
      productCore: config.productCore,
      audienceOverlay,
      homepageArchetype,
      promiseAngle,
      proofStrategy,
      creativeBundle,
      selectedReferences,
      selectedLibraries,
    });

    const fileName = `${String(variant).padStart(3, '0')}-homepage-prompt.md`;
    const content = buildPrompt({
      variant,
      seed,
      productCore: config.productCore,
      audienceOverlay,
      homepageArchetype,
      promiseAngle,
      proofStrategy,
      creativeBundle,
      selectedReferences,
      selectedLibraries,
    });

    manifest.push({
      variant,
      fileName,
      seed,
      audienceOverlay: audienceOverlay.id,
      homepageArchetype: homepageArchetype.id,
      promiseAngle: promiseAngle.id,
      proofStrategy: proofStrategy.id,
      creativeDirectionBundle: creativeBundle.id,
      selectedReferences,
      selectedLibraries,
    });
    prompts.push({ fileName, content });
  }

  return { manifest, prompts };
};

export const generateHomepagePromptBatch = async ({
  config,
  outputDir,
  variants,
  seed,
  buildPrompt,
  fileOps,
}) => {
  const { manifest, prompts } = await buildHomepagePromptBatchArtifacts({
    config,
    variants,
    seed,
    buildPrompt,
  });
  const resolvedFileOps = {
    ...defaultFileOps,
    ...fileOps,
  };

  await publishGeneratedBatch({
    outputDir,
    prompts,
    manifest,
    fileOps: resolvedFileOps,
  });

  return { manifest, prompts };
};
```

- [ ] **Step 4: Run the prompt tests again to verify the extraction works**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: PASS with the new pure-builder test plus the existing prompt generator tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/homepage-factory/generator.mjs scripts/homepage-factory/generate-homepage-prompts.test.mjs
git commit -m "refactor: extract homepage prompt batch artifacts"
```

## Task 2: Add Append-Only Prompt Batch Archive Helpers

**Files:**
- Create: `scripts/homepage-factory/prompt-batch-archive.mjs`
- Create: `scripts/homepage-factory/prompt-batch-archive.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for archive-folder allocation and batch manifest writes**

Create `scripts/homepage-factory/prompt-batch-archive.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  GENERATED_PROMPT_BATCHES_RELATIVE_DIR,
  normalizeHomepageBatchLabel,
  resolvePromptBatchArchiveFolder,
  writePromptBatchArchive,
} from './prompt-batch-archive.mjs';

const createTempRepoRoot = async () => {
  return mkdtemp(path.join(os.tmpdir(), 'homepage-batch-archive-'));
};

const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, 'utf8'));
};

test('normalizeHomepageBatchLabel slugifies user input', () => {
  assert.equal(
    normalizeHomepageBatchLabel('  April 17 Batch  '),
    'april-17-batch',
  );
  assert.equal(
    normalizeHomepageBatchLabel('agency_review__wave'),
    'agency-review-wave',
  );
  assert.throws(
    () => normalizeHomepageBatchLabel('!!!'),
    /Batch label must contain at least one alphanumeric character/i,
  );
});

test('resolvePromptBatchArchiveFolder appends numeric suffixes for collisions', async () => {
  const repoRoot = await createTempRepoRoot();
  const batchesDir = path.join(
    repoRoot,
    GENERATED_PROMPT_BATCHES_RELATIVE_DIR,
  );

  try {
    const first = await resolvePromptBatchArchiveFolder({
      batchesDir,
      batchLabel: 'april-17-batch',
    });
    assert.equal(first, 'april-17-batch');

    await writePromptBatchArchive({
      repoRoot,
      batchLabel: 'april-17-batch',
      archiveFolder: first,
      seed: 'april-17-batch',
      createdAt: '2026-04-17T08:30:00.000Z',
      prompts: [
        {
          fileName: '001-homepage-prompt.md',
          content: '# Prompt 1\n',
        },
      ],
      entries: [
        {
          variant: 1,
          generatedHomepageId: 1,
          routePath: '/homepage-gen/1',
          pageFile: 'apps/front/src/generated/homepage-gen/pages/generated-homepage-0001.tsx',
          promptFile: 'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/001-homepage-prompt.md',
          audienceOverlay: 'agencies',
          homepageArchetype: 'comparison-led',
          promiseAngle: 'publish-without-chaos',
          proofStrategy: 'comparison-checklist',
          creativeDirectionBundle: 'product-led-clean',
          selectedReferences: ['https://stripe.com'],
          selectedLibraries: ['https://land-book.com/'],
        },
      ],
    });

    const second = await resolvePromptBatchArchiveFolder({
      batchesDir,
      batchLabel: 'april-17-batch',
    });
    assert.equal(second, 'april-17-batch-2');

    const index = await readJson(
      path.join(batchesDir, 'index.json'),
    );
    assert.equal(index.length, 1);
    assert.equal(index[0].archiveFolder, 'april-17-batch');

    const batchManifest = await readJson(
      path.join(batchesDir, 'april-17-batch', 'manifest.json'),
    );
    assert.equal(batchManifest.batchLabel, 'april-17-batch');
    assert.equal(batchManifest.entries[0].generatedHomepageId, 1);
    assert.equal(
      batchManifest.entries[0].promptFile,
      'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/001-homepage-prompt.md',
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Add a focused batch test script and verify the new tests fail**

Modify `package.json`:

```json
{
  "scripts": {
    "deploy:artifacts": "node ./scripts/deploy.mjs",
    "generate:homepage-prompts": "node ./scripts/generate-homepage-prompts.mjs",
    "prepare:generated-homepages": "node ./scripts/prepare-generated-homepages.mjs",
    "test:generated-homepages": "node --test ./scripts/homepage-factory/generated-homepage-batches.test.mjs ./scripts/homepage-factory/generated-homepage-manifest-utils.test.mjs",
    "test:homepage-prompts": "node --test ./scripts/homepage-factory/generate-homepage-prompts.test.mjs",
    "test:homepage-batch": "node --test ./scripts/homepage-factory/prompt-batch-archive.test.mjs",
    "prepare": "husky"
  }
}
```

Run:

```powershell
pnpm test:homepage-batch
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./prompt-batch-archive.mjs`.

- [ ] **Step 3: Implement the archive helper module**

Create `scripts/homepage-factory/prompt-batch-archive.mjs`:

```js
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const GENERATED_PROMPT_BATCHES_RELATIVE_DIR =
  'docs/misc/homepage-factory/generated-prompts/batches';

const pathExists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const readJsonArray = async (filePath, label) => {
  if (!(await pathExists(filePath))) {
    return [];
  }

  const value = JSON.parse(await readFile(filePath, 'utf8'));

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value;
};

export const normalizeHomepageBatchLabel = (input) => {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (normalized.length === 0) {
    throw new Error(
      'Batch label must contain at least one alphanumeric character after normalization.',
    );
  }

  return normalized;
};

export const resolvePromptBatchArchiveFolder = async ({
  batchesDir,
  batchLabel,
}) => {
  await mkdir(batchesDir, { recursive: true });

  let suffix = 1;

  while (true) {
    const archiveFolder =
      suffix === 1 ? batchLabel : `${batchLabel}-${suffix}`;
    const archivePath = path.join(batchesDir, archiveFolder);

    if (!(await pathExists(archivePath))) {
      return archiveFolder;
    }

    suffix += 1;
  }
};

export const writePromptBatchArchive = async ({
  repoRoot,
  batchLabel,
  archiveFolder,
  seed,
  createdAt,
  prompts,
  entries,
}) => {
  const batchesDir = path.join(repoRoot, GENERATED_PROMPT_BATCHES_RELATIVE_DIR);
  const batchDir = path.join(batchesDir, archiveFolder);
  const batchManifestPath = path.join(batchDir, 'manifest.json');
  const indexPath = path.join(batchesDir, 'index.json');

  await mkdir(batchDir, { recursive: true });

  for (const prompt of prompts) {
    await writeFile(path.join(batchDir, prompt.fileName), prompt.content, 'utf8');
  }

  const batchManifest = {
    batchLabel,
    archiveFolder,
    seed,
    variantCount: entries.length,
    createdAt,
    entries,
  };

  await writeFile(
    batchManifestPath,
    JSON.stringify(batchManifest, null, 2),
    'utf8',
  );

  const index = await readJsonArray(indexPath, 'Prompt batch index');

  index.push({
    batchLabel,
    archiveFolder,
    seed,
    variantCount: entries.length,
    createdAt,
    manifestFile: `docs/misc/homepage-factory/generated-prompts/batches/${archiveFolder}/manifest.json`,
    entryIds: entries.map((entry) => entry.generatedHomepageId),
  });

  await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');

  return {
    batchesDir,
    batchDir,
    batchManifestPath,
    indexPath,
    batchManifest,
  };
};
```

- [ ] **Step 4: Run the batch archive tests to verify append-only archive behavior**

Run:

```powershell
pnpm test:homepage-batch
```

Expected: PASS with label-normalization and archive-collision tests green.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/homepage-factory/prompt-batch-archive.mjs scripts/homepage-factory/prompt-batch-archive.test.mjs
git commit -m "feat: add append-only homepage prompt archives"
```

## Task 3: Add The Single-Command Batch Orchestrator And CLI

**Files:**
- Create: `scripts/homepage-factory/generated-homepage-batch-flow.mjs`
- Create: `scripts/homepage-factory/generated-homepage-batch-flow.test.mjs`
- Create: `scripts/generate-homepage-batch.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing end-to-end tests for the new batch flow**

Create `scripts/homepage-factory/generated-homepage-batch-flow.test.mjs`:

```js
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { generateHomepageBatch } from './generated-homepage-batch-flow.mjs';

const execFileAsync = promisify(execFile);

const createTempRepoRoot = async () => {
  return mkdtemp(path.join(os.tmpdir(), 'homepage-batch-flow-'));
};

const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, 'utf8'));
};

test('generateHomepageBatch creates page slots, prompt archive, and combined batch manifest', async () => {
  const artifactRepoRoot = await createTempRepoRoot();

  try {
    const result = await generateHomepageBatch({
      sourceRepoRoot: path.resolve('.'),
      artifactRepoRoot,
      variants: 2,
      batchLabel: 'April 17 Batch',
      now: () => '2026-04-17T09:15:00.000Z',
    });

    assert.equal(result.batchLabel, 'april-17-batch');
    assert.equal(result.archiveFolder, 'april-17-batch');
    assert.equal(result.entries.length, 2);
    assert.equal(result.entries[0].generatedHomepageId, 1);
    assert.equal(result.entries[0].routePath, '/homepage-gen/1');
    assert.equal(
      result.entries[0].pageFile,
      'apps/front/src/generated/homepage-gen/pages/generated-homepage-0001.tsx',
    );
    assert.equal(
      result.entries[0].promptFile,
      'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/001-homepage-prompt.md',
    );

    const runtimeManifest = await readJson(
      path.join(
        artifactRepoRoot,
        'apps/front/src/generated/homepage-gen/manifest.json',
      ),
    );
    assert.deepEqual(
      runtimeManifest.map((entry) => entry.id),
      [1, 2],
    );

    const batchManifest = await readJson(
      path.join(
        artifactRepoRoot,
        'docs/misc/homepage-factory/generated-prompts/batches/april-17-batch/manifest.json',
      ),
    );
    assert.equal(batchManifest.entries.length, 2);
    assert.equal(batchManifest.entries[1].generatedHomepageId, 2);

    const batchIndex = await readJson(
      path.join(
        artifactRepoRoot,
        'docs/misc/homepage-factory/generated-prompts/batches/index.json',
      ),
    );
    assert.equal(batchIndex.length, 1);
    assert.equal(batchIndex[0].archiveFolder, 'april-17-batch');
  } finally {
    await rm(artifactRepoRoot, { recursive: true, force: true });
  }
});

test('generateHomepageBatch reuses the normalized label but allocates a unique archive folder on collision', async () => {
  const artifactRepoRoot = await createTempRepoRoot();

  try {
    const first = await generateHomepageBatch({
      sourceRepoRoot: path.resolve('.'),
      artifactRepoRoot,
      variants: 1,
      batchLabel: 'April 17 Batch',
      now: () => '2026-04-17T09:15:00.000Z',
    });
    const second = await generateHomepageBatch({
      sourceRepoRoot: path.resolve('.'),
      artifactRepoRoot,
      variants: 1,
      batchLabel: 'April 17 Batch',
      now: () => '2026-04-17T10:00:00.000Z',
    });

    assert.equal(first.batchLabel, 'april-17-batch');
    assert.equal(first.archiveFolder, 'april-17-batch');
    assert.equal(second.batchLabel, 'april-17-batch');
    assert.equal(second.archiveFolder, 'april-17-batch-2');
    assert.equal(second.entries[0].generatedHomepageId, 2);
  } finally {
    await rm(artifactRepoRoot, { recursive: true, force: true });
  }
});

test('generate-homepage-batch CLI prints route to page to prompt mapping', async () => {
  const artifactRepoRoot = await createTempRepoRoot();

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['scripts/generate-homepage-batch.mjs', '2', 'April 17 Batch'],
      {
        cwd: path.resolve('.'),
        env: {
          ...process.env,
          GENERATED_HOMEPAGE_REPO_ROOT: artifactRepoRoot,
        },
      },
    );

    assert.match(stdout, /Generated homepage batch "april-17-batch" with 2 variants/i);
    assert.match(stdout, /\/homepage-gen\/1/i);
    assert.match(stdout, /generated-homepage-0002\.tsx/i);
    assert.match(stdout, /001-homepage-prompt\.md/i);
  } finally {
    await rm(artifactRepoRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Extend the batch test script and verify the new tests fail**

Modify `package.json`:

```json
{
  "scripts": {
    "test:homepage-batch": "node --test ./scripts/homepage-factory/prompt-batch-archive.test.mjs ./scripts/homepage-factory/generated-homepage-batch-flow.test.mjs"
  }
}
```

Run:

```powershell
pnpm test:homepage-batch
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./generated-homepage-batch-flow.mjs`.

- [ ] **Step 3: Implement the orchestration helper**

Create `scripts/homepage-factory/generated-homepage-batch-flow.mjs`:

```js
import path from 'node:path';

import {
  buildHomepagePromptBatchArtifacts,
  loadHomepageFactoryConfig,
} from './generator.mjs';
import { prepareGeneratedHomepageBatch } from './generated-homepage-batches.mjs';
import {
  GENERATED_PROMPT_BATCHES_RELATIVE_DIR,
  normalizeHomepageBatchLabel,
  resolvePromptBatchArchiveFolder,
  writePromptBatchArchive,
} from './prompt-batch-archive.mjs';
import { buildHomepagePrompt } from './prompt-template.mjs';

const toPosixRelativePath = (repoRoot, targetPath) => {
  return path.relative(repoRoot, targetPath).split(path.sep).join('/');
};

export const generateHomepageBatch = async ({
  sourceRepoRoot,
  artifactRepoRoot = sourceRepoRoot,
  variants = 24,
  batchLabel = new Date().toISOString().slice(0, 10),
  now = () => new Date().toISOString(),
}) => {
  const normalizedBatchLabel = normalizeHomepageBatchLabel(batchLabel);
  const createdAt = now();
  const factoryDir = path.join(sourceRepoRoot, 'scripts/homepage-factory');
  const config = await loadHomepageFactoryConfig({ factoryDir });
  const promptArtifacts = await buildHomepagePromptBatchArtifacts({
    config,
    variants,
    seed: normalizedBatchLabel,
    buildPrompt: buildHomepagePrompt,
  });
  const batchesDir = path.join(
    artifactRepoRoot,
    GENERATED_PROMPT_BATCHES_RELATIVE_DIR,
  );
  const archiveFolder = await resolvePromptBatchArchiveFolder({
    batchesDir,
    batchLabel: normalizedBatchLabel,
  });
  const pageBatch = await prepareGeneratedHomepageBatch({
    repoRoot: artifactRepoRoot,
    variants,
    batchLabel: normalizedBatchLabel,
    now: () => createdAt,
  });

  const entries = promptArtifacts.manifest.map((manifestEntry, index) => {
    const pageEntry = pageBatch.createdEntries[index];
    const pageFile = toPosixRelativePath(
      artifactRepoRoot,
      path.join(pageBatch.pagesDir, pageEntry.fileName),
    );
    const promptFile =
      `docs/misc/homepage-factory/generated-prompts/batches/${archiveFolder}/${manifestEntry.fileName}`;

    return {
      ...manifestEntry,
      generatedHomepageId: pageEntry.id,
      routePath: pageEntry.routePath,
      pageFile,
      promptFile,
    };
  });

  const archive = await writePromptBatchArchive({
    repoRoot: artifactRepoRoot,
    batchLabel: normalizedBatchLabel,
    archiveFolder,
    seed: normalizedBatchLabel,
    createdAt,
    prompts: promptArtifacts.prompts,
    entries,
  });

  return {
    batchLabel: normalizedBatchLabel,
    archiveFolder,
    createdAt,
    entries,
    batchManifestPath: archive.batchManifestPath,
    runtimeManifestPath: pageBatch.manifestPath,
  };
};
```

- [ ] **Step 4: Add the new CLI entry point and package script**

Create `scripts/generate-homepage-batch.mjs`:

```js
#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { generateHomepageBatch } from './homepage-factory/generated-homepage-batch-flow.mjs';

const filePath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(filePath);
const sourceRepoRoot = path.resolve(scriptsDir, '..');
const artifactRepoRoot = process.env.GENERATED_HOMEPAGE_REPO_ROOT
  ? path.resolve(process.env.GENERATED_HOMEPAGE_REPO_ROOT)
  : sourceRepoRoot;

const run = async () => {
  const variantsArg = process.argv[2] ?? '24';
  const batchLabelArg = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  const variants = Number.parseInt(variantsArg, 10);

  const result = await generateHomepageBatch({
    sourceRepoRoot,
    artifactRepoRoot,
    variants,
    batchLabel: batchLabelArg,
  });

  process.stdout.write(
    `Generated homepage batch "${result.batchLabel}" with ${result.entries.length} variants\n`,
  );

  for (const entry of result.entries) {
    process.stdout.write(
      `- ${entry.routePath} -> ${entry.pageFile} -> ${entry.promptFile}\n`,
    );
  }
};

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
```

Modify `package.json`:

```json
{
  "scripts": {
    "generate:homepage-batch": "node ./scripts/generate-homepage-batch.mjs"
  }
}
```

- [ ] **Step 5: Run the new batch tests and the existing generated-homepages tests**

Run:

```powershell
pnpm test:homepage-batch
pnpm test:generated-homepages
```

Expected:

- `pnpm test:homepage-batch` PASS with flow and CLI tests green
- `pnpm test:generated-homepages` PASS unchanged, proving the low-level page-slot helper still works

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/generate-homepage-batch.mjs scripts/homepage-factory/generated-homepage-batch-flow.mjs scripts/homepage-factory/generated-homepage-batch-flow.test.mjs
git commit -m "feat: add single-command homepage batch generation"
```

## Task 4: Rewrite The README Around The Batch-First Workflow

**Files:**
- Modify: `docs/misc/homepage-factory/README.md`

- [ ] **Step 1: Replace the current usage section with the single-command workflow**

Update `docs/misc/homepage-factory/README.md` so the primary usage section reads like this:

````md
## Recommended Workflow

Run one command to generate a complete append-only homepage batch:

```bash
pnpm generate:homepage-batch -- 5 april-17-batch
```

This command:

- creates new generated homepage route slots under `apps/front/src/generated/homepage-gen/pages/`
- appends those routes to `apps/front/src/generated/homepage-gen/manifest.json`
- writes prompt files into `docs/misc/homepage-factory/generated-prompts/batches/<archive-folder>/`
- writes a per-batch manifest that maps prompt file -> page file -> `/homepage-gen/:id`
- appends a top-level batch index at `docs/misc/homepage-factory/generated-prompts/batches/index.json`

After running it:

1. open the per-batch `manifest.json`
2. pick the variant you want
3. use the mapped prompt markdown file
4. implement the page in the mapped generated page file
5. preview it at the mapped `/homepage-gen/:id` route

## Low-Level Commands

These still exist for advanced or partial workflows:

- `pnpm generate:homepage-prompts -- <variants> <seed>`
- `pnpm prepare:generated-homepages -- <variants> <batch-label>`
````

- [ ] **Step 2: Lint the updated README**

Run:

```powershell
pnpm exec markdownlint docs/misc/homepage-factory/README.md
```

Expected: PASS with no Markdown lint errors in the updated README.

- [ ] **Step 3: Commit**

```bash
git add docs/misc/homepage-factory/README.md
git commit -m "docs: document homepage batch workflow"
```

## Task 5: Run Final Verification And Prepare The Feature Branch

**Files:**
- Verify: `package.json`
- Verify: `scripts/generate-homepage-batch.mjs`
- Verify: `scripts/homepage-factory/generator.mjs`
- Verify: `scripts/homepage-factory/prompt-batch-archive.mjs`
- Verify: `scripts/homepage-factory/prompt-batch-archive.test.mjs`
- Verify: `scripts/homepage-factory/generated-homepage-batch-flow.mjs`
- Verify: `scripts/homepage-factory/generated-homepage-batch-flow.test.mjs`
- Verify: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`
- Verify: `docs/misc/homepage-factory/README.md`

- [ ] **Step 1: Run the prompt and batch test suites**

Run:

```powershell
pnpm test:homepage-prompts
pnpm test:homepage-batch
pnpm test:generated-homepages
```

Expected: PASS on all three commands.

- [ ] **Step 2: Run a smoke batch into a temporary artifact repo root**

Run:

```powershell
$temp = Join-Path $env:TEMP "homepage-batch-smoke-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $temp | Out-Null
$env:GENERATED_HOMEPAGE_REPO_ROOT = $temp
pnpm generate:homepage-batch -- 2 april-17-smoke
Get-Content (Join-Path $temp 'docs/misc/homepage-factory/generated-prompts/batches/index.json')
Remove-Item Env:GENERATED_HOMEPAGE_REPO_ROOT
Remove-Item -LiteralPath $temp -Recurse -Force
```

Expected:

- command prints two route-to-page-to-prompt mappings
- `index.json` contains one batch record with `archiveFolder` set to `april-17-smoke`
- the temporary output contains both prompt files and generated homepage page files

- [ ] **Step 3: Run targeted formatting/lint checks on the modified slice**

Run:

```powershell
pnpm exec biome check package.json scripts/generate-homepage-batch.mjs scripts/homepage-factory/generator.mjs scripts/homepage-factory/prompt-batch-archive.mjs scripts/homepage-factory/prompt-batch-archive.test.mjs scripts/homepage-factory/generated-homepage-batch-flow.mjs scripts/homepage-factory/generated-homepage-batch-flow.test.mjs scripts/homepage-factory/generate-homepage-prompts.test.mjs docs/misc/homepage-factory/README.md --write
```

Expected: PASS, or only formatting changes that are then written in place.

- [ ] **Step 4: Review the diff**

Run:

```powershell
git diff --stat
git diff -- package.json scripts/generate-homepage-batch.mjs scripts/homepage-factory docs/misc/homepage-factory/README.md
```

Expected: diff is limited to the planned script, test, package, and README files, with no unrelated app code changes.

- [ ] **Step 5: Commit the finished feature**

```bash
git add package.json scripts/generate-homepage-batch.mjs scripts/homepage-factory docs/misc/homepage-factory/README.md
git commit -m "feat: add append-only homepage batch workflow"
```

## Self-Review

### Spec coverage

- Single-command UX: covered by Task 3 via `generateHomepageBatch` and `generate-homepage-batch.mjs`.
- Append-only prompt archives: covered by Task 2 via `prompt-batch-archive.mjs`.
- Append-only generated homepage routes: preserved by Task 3 through `prepareGeneratedHomepageBatch`.
- Per-batch manifest with prompt-to-page-to-route mapping: covered by Tasks 2 and 3.
- Top-level batch index: covered by Task 2.
- Existing `/homepage-gen/:id` runtime model: preserved and re-verified in Task 3 and Task 5.
- No Codex automation: maintained by keeping the scope to artifact generation and documentation only.
- README migration to the new primary workflow: covered by Task 4.

### Placeholder scan

- No task placeholders remain.
- Every code-changing step includes concrete code blocks or exact file content.
- Every verification step includes an exact command and expected outcome.

### Type consistency

- The new combined manifest fields remain consistent across tests and implementation:
  `generatedHomepageId`, `routePath`, `pageFile`, `promptFile`, `audienceOverlay`,
  `homepageArchetype`, `promiseAngle`, `proofStrategy`, and `creativeDirectionBundle`.
- Archive terminology stays consistent:
  `batchLabel` is the normalized logical label, `archiveFolder` is the collision-safe folder name.
- The new CLI command and helper names stay aligned:
  `generate:homepage-batch`, `generateHomepageBatch`, `normalizeHomepageBatchLabel`,
  `resolvePromptBatchArchiveFolder`, and `writePromptBatchArchive`.
