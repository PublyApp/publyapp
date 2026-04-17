# Homepage Factory: Assistantly Clean Mint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `assistantly-clean-mint` creative bundle and bias the homepage factory toward it by default (higher frequency), require `hue` in the prompt contract, and load a web marketing font for `/homepage-gen/:id` previews.

**Architecture:** Keep the existing deterministic recipe ordering, but layer a deterministic quota selection for the preferred bundle inside the in-memory prompt artifact builder. Add route-scoped font loading via `links()` on the generated homepage route. Update the prompt template to explicitly call the `hue` skill before UI implementation.

**Tech Stack:** Node ESM scripts (`node:test`), JSON config under `scripts/homepage-factory/`, React Router v7 `links()` (SSR), MUI v6, existing repo scripts (`pnpm test:*`)

---

## File Structure

- Modify: `scripts/homepage-factory/creative-bundles.json`
  - Add new `assistantly-clean-mint` bundle with `assistantly.com` references.
- Modify: `scripts/homepage-factory/generator.mjs`
  - Implement deterministic quota preference in `buildHomepagePromptBatchArtifacts`.
- Modify: `scripts/homepage-factory/prompt-template.mjs`
  - Add explicit `hue` directive and “design language first” contract.
- Modify: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`
  - Add tests that lock the new preference behavior and prompt contract updates.
- Modify: `apps/front/src/routes/marketing/homepage-gen/generated-homepage-page.tsx`
  - Add `links()` that loads marketing font from Google Fonts for `/homepage-gen/:id` only.

Optional docs (only if needed to avoid confusion):
- Modify: `docs/misc/homepage-factory/README.md`
  - Mention that `/homepage-gen/:id` loads a marketing font and prompts can use it.

## Task 1: Add The `assistantly-clean-mint` Creative Bundle

**Files:**
- Modify: `scripts/homepage-factory/creative-bundles.json`

- [ ] **Step 1: Add the new bundle (failing config validation expected if incomplete)**

Add a new object to `scripts/homepage-factory/creative-bundles.json`:

```json
{
  "id": "assistantly-clean-mint",
  "label": "Assistantly Clean Mint",
  "heroStyle": "Big type, calm whitespace, centered clarity with a product frame",
  "visualDensity": "Sparse but intentional",
  "motionBehavior": "Subtle, mostly opacity/translate; no gimmicks",
  "colorDirection": "Bright neutral base with mint accent",
  "surfaceTreatment": "Soft 1px borders + low-elevation shadows; restrained gradients",
  "screenshotTreatment": "Large framed UI capture with generous padding and rounded corners",
  "copyTone": "Confident, calm, specific",
  "compatibilityTags": [
    "agencies",
    "in-house-social-teams",
    "smb-marketing-teams",
    "workflow-story",
    "product-demo-first",
    "proof-first",
    "comparison-led"
  ],
  "referenceAnchors": [
    "https://www.assistantly.com/",
    "https://linear.app",
    "https://stripe.com",
    "https://www.notion.com"
  ],
  "inspirationLibraries": [
    "https://land-book.com/",
    "https://www.awwwards.com/websites/"
  ]
}
```

- [ ] **Step 2: Run prompt tests to ensure config validation still passes**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: PASS. If FAIL, fix missing required fields or unknown compatibility tags.

- [ ] **Step 3: Commit**

```bash
git add scripts/homepage-factory/creative-bundles.json
git commit -m "feat: add assistantly clean mint creative bundle"
```

## Task 2: Prefer Clean Mint By Default (Deterministic Quota)

**Files:**
- Modify: `scripts/homepage-factory/generator.mjs`
- Modify: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`

- [ ] **Step 1: Add a failing test that expects higher frequency of the preferred bundle**

Append to `scripts/homepage-factory/generate-homepage-prompts.test.mjs`:

```js
test('buildHomepagePromptBatchArtifacts prefers assistantly-clean-mint by default', async () => {
  const outputDir = await createTempOutputDir();

  try {
    const config = await loadHomepageFactoryConfig({ factoryDir: FACTORY_DIR });
    const result = buildHomepagePromptBatchArtifacts({
      config,
      variants: 10,
      seed: 'prefer-clean-mint',
      buildPrompt: buildHomepagePrompt,
    });

    const preferredCount = result.manifest.filter(
      (entry) => entry.creativeDirectionBundle === 'assistantly-clean-mint',
    ).length;

    // Target is ~40% by default; allow a small tolerance if recipe pool is constrained.
    assert.ok(preferredCount >= 3, `expected >=3 preferred variants, got ${preferredCount}`);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
```

Note: this test assumes the new bundle exists and has compatible recipes in the config.

- [ ] **Step 2: Run tests and confirm they fail (preference not implemented yet)**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: FAIL with `preferredCount` too low.

- [ ] **Step 3: Implement deterministic quota selection inside `buildHomepagePromptBatchArtifacts`**

In `scripts/homepage-factory/generator.mjs`, within `buildHomepagePromptBatchArtifacts`:

1. Build `allRecipesOrdered` with the existing `sortRecipesBySeed(...)`.
2. Filter to `preferredRecipesOrdered` where `creativeBundle.id === 'assistantly-clean-mint'`, and
   sort with the same sorter.
3. Compute:

```js
const PREFERRED_BUNDLE_ID = 'assistantly-clean-mint';
const PREFERRED_BUNDLE_QUOTA = 0.4;
const preferredTarget = Math.round(variants * PREFERRED_BUNDLE_QUOTA);
const preferredCount = Math.min(preferredTarget, variants, preferredRecipesOrdered.length);
```

4. Build a `selectedRecipes` list:
   - push first `preferredCount` from `preferredRecipesOrdered`
   - then iterate `allRecipesOrdered` and push any not yet used until you reach `variants`
   - if still short (pool smaller than variants), cycle `allRecipesOrdered` like today

Keep selection deterministic: no `Math.random`, no new PRNG. Only deterministic ordering + stable rules.

- [ ] **Step 4: Re-run tests and confirm pass**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/homepage-factory/generator.mjs scripts/homepage-factory/generate-homepage-prompts.test.mjs
git commit -m "feat: prefer assistantly clean mint by default"
```

## Task 3: Require `hue` In The Prompt Contract

**Files:**
- Modify: `scripts/homepage-factory/prompt-template.mjs`
- Modify: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`

- [ ] **Step 1: Add a failing prompt-contract assertion for hue**

In the existing prompt contract test (`generated prompt uses the strategy-first contract`), add:

```js
assert.match(prompt, /\bhue\b/i);
assert.match(prompt, /Design Language/i);
```

Also assert the working order includes something like “Use hue” before “Implement the homepage”.

- [ ] **Step 2: Run prompt tests (expected fail)**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: FAIL on missing `hue` directive.

- [ ] **Step 3: Update `buildHomepagePrompt` to include a Hue directive**

In `scripts/homepage-factory/prompt-template.mjs`, add a section near the top of the user prompt:

- Title like `### Design Language (Use hue)`
- Bullet list requiring:
  - type scale
  - spacing scale
  - surface recipe (border/shadow/radius)
  - CTA styles (pill primary mint, outlined secondary)
  - section rhythm

Also add explicit constraints:
- no default MUI-blue CTA
- consistent radii/shadow tokens
- at least one subtle background texture/gradient (but restrained)

- [ ] **Step 4: Re-run prompt tests (expected pass)**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/homepage-factory/prompt-template.mjs scripts/homepage-factory/generate-homepage-prompts.test.mjs
git commit -m "feat: require hue design language in homepage prompts"
```

## Task 4: Load Marketing Font For `/homepage-gen/:id` (Web Font)

**Files:**
- Modify: `apps/front/src/routes/marketing/homepage-gen/generated-homepage-page.tsx`

- [ ] **Step 1: Add a failing test (optional) or do a code-only change**

There are no existing route-level tests for `links()` here; proceed with code change + typecheck.

- [ ] **Step 2: Add `links()` to load a marketing font**

In `apps/front/src/routes/marketing/homepage-gen/generated-homepage-page.tsx`, add:

```ts
export const links: Route.LinksFunction = () => {
  return [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    {
      rel: 'preconnect',
      href: 'https://fonts.gstatic.com',
      crossOrigin: 'anonymous',
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap',
    },
  ];
};
```

This mirrors the existing `apps/front/src/root.tsx` pattern, but scopes it to `/homepage-gen/:id`.

- [ ] **Step 3: Update the prompt to reference the font stack**

In `scripts/homepage-factory/prompt-template.mjs`, instruct the implementation to use:

`Manrope, Roboto, system-ui, -apple-system, Segoe UI, Arial, sans-serif`

and to apply it at the page root (via `sx` on the top-level container) so it does not mutate global theme.

- [ ] **Step 4: Verify frontend types**

Run:

```powershell
pnpm --dir apps/front type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/homepage-gen/generated-homepage-page.tsx scripts/homepage-factory/prompt-template.mjs
git commit -m "feat: load marketing font for generated homepage previews"
```

## Task 5: Verification + Smoke Run

**Files:**
- Verify: `scripts/homepage-factory/*`
- Verify: `apps/front/src/routes/marketing/homepage-gen/generated-homepage-page.tsx`

- [ ] **Step 1: Run all relevant test suites**

Run:

```powershell
pnpm test:homepage-prompts
pnpm test:homepage-batch
pnpm test:generated-homepages
```

Expected: PASS.

- [ ] **Step 2: Run a batch smoke test**

Run:

```powershell
pnpm generate:homepage-batch -- 10 assistantly-mint-smoke
```

Expected:
- CLI prints 10 mappings
- Batch manifest contains ~40% `creativeDirectionBundle: assistantly-clean-mint` (within recipe constraints)

- [ ] **Step 3: Formatting**

Run:

```powershell
pnpm exec biome check scripts/homepage-factory/generator.mjs scripts/homepage-factory/prompt-template.mjs scripts/homepage-factory/generate-homepage-prompts.test.mjs apps/front/src/routes/marketing/homepage-gen/generated-homepage-page.tsx --write
```

Expected: PASS.

- [ ] **Step 4: Final commit**

```bash
git add scripts/homepage-factory apps/front/src/routes/marketing/homepage-gen/generated-homepage-page.tsx
git commit -m "feat: bias homepage factory toward assistantly clean mint"
```

## Self-Review

### Spec coverage

- New bundle: implemented in Task 1.
- Higher frequency default: implemented + tested in Task 2.
- Hue directive: implemented + tested in Task 3.
- Web font loading for `/homepage-gen/:id`: implemented in Task 4.
- Determinism: maintained by using the existing seed-based ordering and deterministic selection rules.

### Placeholder scan

- No `TODO` / `TBD` placeholders in tasks.
- Each task includes exact file paths, code snippets, and verification commands.

### Consistency checks

- Bundle ID is consistently `assistantly-clean-mint` across JSON, generator logic, and tests.
- Font is consistently `Manrope` across route `links()` and prompt instructions.
