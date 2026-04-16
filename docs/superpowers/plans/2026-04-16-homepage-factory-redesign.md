# Homepage Factory Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current style-random homepage prompt generator with a curated, audience-aware, archetype-driven factory that generates higher-quality PublyApp homepage prompts.

**Architecture:** Keep `scripts/generate-homepage-prompts.mjs` as the CLI entry point, but move generation logic into a testable module under `scripts/homepage-factory/`. Drive prompt generation from structured JSON files for PublyApp core, audience overlays, archetypes, promise angles, proof strategies, and creative bundles, then render a strategy-first prompt template plus richer manifest metadata.

**Tech Stack:** Node.js ESM (`node:test`, `fs/promises`, `path`), JSON config files, existing repo scripts in `package.json`, Markdown docs under `docs/misc/homepage-factory/`

---

## File Structure

- Modify: `package.json`
  - Add a focused test script for the homepage factory so the slice can be verified without running unrelated repo work.
- Modify: `scripts/generate-homepage-prompts.mjs`
  - Keep CLI argument parsing and output message only; delegate generation to the extracted module and resolve paths relative to the script instead of `process.cwd()`.
- Create: `scripts/homepage-factory/generator.mjs`
  - Own deterministic selection, config loading, compatibility filtering, file writing, and manifest generation.
- Create: `scripts/homepage-factory/prompt-template.mjs`
  - Isolate prompt rendering so strategy-first prompt contract changes stay out of the generator control flow.
- Delete: `scripts/homepage-factory/inspiration-bank.json`
  - Remove the legacy style-axis-only data source once the structured factory data is in place.
- Create: `scripts/homepage-factory/product-core.json`
  - Store stable PublyApp product truths and anti-generic copy guardrails.
- Create: `scripts/homepage-factory/audience-overlays.json`
  - Store audience-specific pains, outcomes, objections, proof expectations, and CTA preferences.
- Create: `scripts/homepage-factory/homepage-archetypes.json`
  - Store curated page-flow archetypes and compatibility lists.
- Create: `scripts/homepage-factory/promise-angles.json`
  - Store concrete hero promise directions and audience/archetype fit.
- Create: `scripts/homepage-factory/proof-strategies.json`
  - Store credibility models and recommended proof elements by audience/archetype.
- Create: `scripts/homepage-factory/creative-bundles.json`
  - Store compatible visual-direction bundles plus reference pools.
- Create: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`
  - Cover deterministic generation, compatibility enforcement, prompt contract shape, and manifest metadata.
- Modify: `docs/misc/homepage-factory/README.md`
  - Explain the new data model, the new factory workflow, and the files used to tune strategy versus creative direction.
- Modify: `docs/misc/homepage-factory/generated-prompts/001-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/002-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/003-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/004-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/005-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/manifest.json`
  - Commit a regenerated review batch that reflects the new prompt contract and manifest schema.

## Task 1: Extract A Testable Generator Core

**Files:**
- Create: `scripts/homepage-factory/generator.mjs`
- Create: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing deterministic-generation test**

Create `scripts/homepage-factory/generate-homepage-prompts.test.mjs` with this initial test:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { generateHomepagePromptBatch } from './generator.mjs';

const createTempOutputDir = async () => {
  return mkdtemp(path.join(os.tmpdir(), 'homepage-prompts-'));
};

const TEST_CONFIG = {
  productCore: {
    productName: 'PublyApp',
  },
  audienceOverlays: [{ id: 'agencies', audienceLabel: 'Agencies' }],
  homepageArchetypes: [{ id: 'workflow-story', label: 'Workflow Story' }],
  promiseAngles: [{ id: 'ship-consistently', label: 'Ship Consistently' }],
  proofStrategies: [{ id: 'ops-metrics', label: 'Ops Metrics' }],
  creativeBundles: [{ id: 'product-led-clean', label: 'Product-Led Clean' }],
};

test('generateHomepagePromptBatch is deterministic for a fixed seed', async () => {
  const firstDir = await createTempOutputDir();
  const secondDir = await createTempOutputDir();

  try {
    const first = await generateHomepagePromptBatch({
      config: TEST_CONFIG,
      outputDir: firstDir,
      variants: 2,
      seed: 'deterministic-seed',
    });
    const second = await generateHomepagePromptBatch({
      config: TEST_CONFIG,
      outputDir: secondDir,
      variants: 2,
      seed: 'deterministic-seed',
    });

    assert.deepEqual(first.manifest, second.manifest);
    assert.equal(first.prompts.length, 2);
    assert.equal(second.prompts.length, 2);

    const manifestOnDisk = JSON.parse(
      await readFile(path.join(firstDir, 'manifest.json'), 'utf8'),
    );

    assert.deepEqual(manifestOnDisk, first.manifest);
  } finally {
    await rm(firstDir, { recursive: true, force: true });
    await rm(secondDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test scripts/homepage-factory/generate-homepage-prompts.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./generator.mjs`.

- [ ] **Step 3: Create the minimal generator module**

Create `scripts/homepage-factory/generator.mjs` with a small deterministic core:

```js
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const mulberry32 = (seed) => {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashSeed = (input) => {
  let hash = 1779033703 ^ input.length;

  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return hash >>> 0;
};

export const pickOne = (items, random) => {
  return items[Math.floor(random() * items.length)];
};

export const generateHomepagePromptBatch = async ({
  config,
  outputDir,
  variants,
  seed,
}) => {
  await mkdir(outputDir, { recursive: true });

  const manifest = [];
  const prompts = [];

  for (let variant = 1; variant <= variants; variant += 1) {
    const random = mulberry32(hashSeed(`${seed}-${variant}`));
    const audienceOverlay = pickOne(config.audienceOverlays, random);
    const homepageArchetype = pickOne(config.homepageArchetypes, random);
    const promiseAngle = pickOne(config.promiseAngles, random);
    const proofStrategy = pickOne(config.proofStrategies, random);
    const creativeDirectionBundle = pickOne(config.creativeBundles, random);
    const fileName = `${String(variant).padStart(3, '0')}-homepage-prompt.md`;
    const content = `# Homepage Prompt Variant ${variant}\n\n- Audience: ${audienceOverlay.id}\n- Archetype: ${homepageArchetype.id}\n- Promise: ${promiseAngle.id}\n- Proof: ${proofStrategy.id}\n- Creative bundle: ${creativeDirectionBundle.id}\n`;

    await writeFile(path.join(outputDir, fileName), content, 'utf8');

    const manifestEntry = {
      variant,
      fileName,
      seed: `${seed}-${variant}`,
      audienceOverlay: audienceOverlay.id,
      homepageArchetype: homepageArchetype.id,
      promiseAngle: promiseAngle.id,
      proofStrategy: proofStrategy.id,
      creativeDirectionBundle: creativeDirectionBundle.id,
    };

    manifest.push(manifestEntry);
    prompts.push({ fileName, content });
  }

  await writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  return { manifest, prompts };
};
```

- [ ] **Step 4: Add a focused test script to `package.json`**

Modify `package.json`:

```json
{
  "scripts": {
    "deploy:artifacts": "node ./scripts/deploy.mjs",
    "generate:homepage-prompts": "node ./scripts/generate-homepage-prompts.mjs",
    "test:homepage-prompts": "node --test ./scripts/homepage-factory/generate-homepage-prompts.test.mjs",
    "prepare": "husky"
  }
}
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: PASS with one deterministic-generation test.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/homepage-factory/generator.mjs scripts/homepage-factory/generate-homepage-prompts.test.mjs
git commit -m "test: extract homepage generator core"
```

## Task 2: Replace The Legacy Inspiration Bank With Structured Factory Data

**Files:**
- Create: `scripts/homepage-factory/product-core.json`
- Create: `scripts/homepage-factory/audience-overlays.json`
- Create: `scripts/homepage-factory/homepage-archetypes.json`
- Create: `scripts/homepage-factory/promise-angles.json`
- Create: `scripts/homepage-factory/proof-strategies.json`
- Create: `scripts/homepage-factory/creative-bundles.json`
- Create: `scripts/homepage-factory/prompt-template.mjs`
- Modify: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`
- Modify: `scripts/homepage-factory/generator.mjs`
- Modify: `scripts/generate-homepage-prompts.mjs`
- Delete: `scripts/homepage-factory/inspiration-bank.json`

- [ ] **Step 1: Add a failing compatibility test that uses repo config files**

Append this test to `scripts/homepage-factory/generate-homepage-prompts.test.mjs`:

```js
import { loadHomepageFactoryConfig } from './generator.mjs';

const FACTORY_DIR = path.resolve('scripts/homepage-factory');

test('generated variants use compatible strategy metadata', async () => {
  const outputDir = await createTempOutputDir();

  try {
    const config = await loadHomepageFactoryConfig({ factoryDir: FACTORY_DIR });
    const result = await generateHomepagePromptBatch({
      config,
      outputDir,
      variants: 6,
      seed: 'compatibility-seed',
    });

    for (const entry of result.manifest) {
      const archetype = config.homepageArchetypes.find(
        (item) => item.id === entry.homepageArchetype,
      );
      const promiseAngle = config.promiseAngles.find(
        (item) => item.id === entry.promiseAngle,
      );
      const proofStrategy = config.proofStrategies.find(
        (item) => item.id === entry.proofStrategy,
      );
      const creativeBundle = config.creativeBundles.find(
        (item) => item.id === entry.creativeDirectionBundle,
      );

      assert.ok(entry.audienceOverlay);
      assert.ok(archetype.compatiblePromiseAngles.includes(entry.promiseAngle));
      assert.ok(archetype.compatibleProofStrategies.includes(entry.proofStrategy));
      assert.ok(archetype.compatibleCreativeBundles.includes(entry.creativeDirectionBundle));
      assert.ok(promiseAngle.bestFitAudiences.includes(entry.audienceOverlay));
      assert.ok(promiseAngle.bestFitArchetypes.includes(entry.homepageArchetype));
      assert.ok(proofStrategy.bestFitAudiences.includes(entry.audienceOverlay));
      assert.ok(proofStrategy.bestFitArchetypes.includes(entry.homepageArchetype));
      assert.ok(creativeBundle.compatibilityTags.includes(entry.audienceOverlay));
      assert.ok(creativeBundle.compatibilityTags.includes(entry.homepageArchetype));
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail because config loading does not exist yet**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: FAIL with `loadHomepageFactoryConfig is not a function` or missing config file errors.

- [ ] **Step 3: Create the structured JSON files**

Create `scripts/homepage-factory/product-core.json`:

```json
{
  "productName": "PublyApp",
  "productSummary": "AI-first social publishing workspace for planning, drafting, reviewing, and shipping better social content faster.",
  "taglineDirections": [
    "Ship better social content, faster, with AI workflows.",
    "Plan, draft, review, and publish social content without workflow chaos."
  ],
  "coreDifferentiators": [
    "Combines AI-assisted drafting with real publishing workflow structure.",
    "Built for approval-heavy social teams, not just solo creators.",
    "Keeps planning, editing, review, and publishing context in one place."
  ],
  "workflowStrengths": [
    "campaign planning",
    "draft generation",
    "review and approval coordination",
    "publishing readiness"
  ],
  "trustSignals": [
    "operationally serious product posture",
    "clear review states and workflow visibility",
    "reduced tool-switching across the content lifecycle"
  ],
  "ctaThemes": ["Book a walkthrough", "See the workflow", "Start planning content"],
  "proofAssets": [
    "approval cycle speed",
    "content throughput gains",
    "reduced revision churn"
  ],
  "productVisualRequirements": [
    "Show a believable social publishing workflow.",
    "Show calendar, draft, review, or queue states.",
    "Avoid abstract charts as the primary hero visual."
  ],
  "voiceGuardrails": [
    "operationally serious",
    "modern and confident",
    "specific instead of hype-driven"
  ],
  "forbiddenClaims": [
    "fully autonomous social media",
    "guaranteed virality",
    "replace your marketing team"
  ],
  "forbiddenCopyPatterns": [
    "unlock your social potential",
    "supercharge your workflow",
    "AI-powered productivity for modern teams"
  ]
}
```

Create `scripts/homepage-factory/audience-overlays.json`:

```json
[
  {
    "id": "agencies",
    "audienceLabel": "Agencies",
    "primaryPains": [
      "client approval bottlenecks",
      "context switching across client accounts",
      "revision churn before publishing"
    ],
    "desiredOutcomes": [
      "ship client content faster",
      "standardize delivery workflows",
      "reduce approval friction"
    ],
    "topObjections": [
      "our process is too custom",
      "switching tools will slow us down"
    ],
    "decisionCriteria": [
      "multi-workflow visibility",
      "approval clarity",
      "team coordination"
    ],
    "proofExpectations": ["workflow proof", "delivery metrics", "team coordination evidence"],
    "ctaPreference": "Book a walkthrough",
    "productFocusAreas": ["approvals", "campaign visibility", "publishing readiness"],
    "faqConcerns": ["client collaboration", "handoff speed", "process standardization"],
    "preferredToneAdjustments": ["confident", "delivery-focused", "operational"]
  },
  {
    "id": "in-house-social-teams",
    "audienceLabel": "In-House Social Teams",
    "primaryPains": [
      "fragmented planning and publishing",
      "slow review cycles",
      "unclear publishing readiness"
    ],
    "desiredOutcomes": [
      "consistent publishing cadence",
      "better cross-functional visibility",
      "cleaner review flow"
    ],
    "topObjections": [
      "we already use several tools",
      "AI features usually feel gimmicky"
    ],
    "decisionCriteria": [
      "workflow clarity",
      "calendar confidence",
      "trustworthy collaboration"
    ],
    "proofExpectations": ["workflow clarity", "team adoption", "review-state visibility"],
    "ctaPreference": "See the workflow",
    "productFocusAreas": ["calendar", "review flow", "publishing queue"],
    "faqConcerns": ["approvals", "handoffs", "tool consolidation"],
    "preferredToneAdjustments": ["clear", "trustworthy", "team-oriented"]
  },
  {
    "id": "smb-marketing-teams",
    "audienceLabel": "SMB Marketing Teams",
    "primaryPains": [
      "too much time spent getting content out",
      "small teams juggling planning and publishing",
      "slow content production"
    ],
    "desiredOutcomes": [
      "ship better content with less chaos",
      "maintain consistency with lean teams",
      "move from ideas to published posts faster"
    ],
    "topObjections": [
      "this looks too complex for a lean team",
      "AI tools often create generic content"
    ],
    "decisionCriteria": [
      "speed to publish",
      "ease of use",
      "visible workflow value"
    ],
    "proofExpectations": ["speed improvements", "ease-of-use signals", "clear workflow snapshots"],
    "ctaPreference": "Start planning content",
    "productFocusAreas": ["drafting", "planning", "publishing speed"],
    "faqConcerns": ["setup effort", "team adoption", "content quality"],
    "preferredToneAdjustments": ["pragmatic", "clear", "momentum-focused"]
  }
]
```

Create `scripts/homepage-factory/homepage-archetypes.json`:

```json
[
  {
    "id": "workflow-story",
    "label": "Workflow Story",
    "heroGoal": "Show how PublyApp moves a team from idea to published content with less friction.",
    "narrativeOrder": [
      "hero",
      "workflow-overview",
      "step-by-step walkthrough",
      "feature depth",
      "proof",
      "faq",
      "final-cta"
    ],
    "requiredSections": ["hero", "workflow-walkthrough", "feature-depth", "proof", "final-cta"],
    "optionalSections": ["logo-strip", "faq", "pricing-teaser"],
    "proofPlacement": "after the workflow walkthrough",
    "ctaStyle": "See the workflow",
    "compatiblePromiseAngles": ["publish-without-chaos", "approval-clarity", "ship-consistently"],
    "compatibleProofStrategies": ["workflow-artifacts", "ops-metrics"],
    "compatibleCreativeBundles": ["product-led-clean", "warm-operator", "editorial-dark"]
  },
  {
    "id": "proof-first",
    "label": "Proof First",
    "heroGoal": "Lead with evidence that the workflow is credible and operationally serious.",
    "narrativeOrder": [
      "hero",
      "social-proof",
      "proof-metrics",
      "core-benefits",
      "product-visual",
      "faq",
      "final-cta"
    ],
    "requiredSections": ["hero", "proof", "core-benefits", "product-visual", "final-cta"],
    "optionalSections": ["logo-strip", "pricing-teaser", "faq"],
    "proofPlacement": "immediately below the hero",
    "ctaStyle": "Book a walkthrough",
    "compatiblePromiseAngles": ["approval-clarity", "replace-fragmented-tools", "ship-consistently"],
    "compatibleProofStrategies": ["ops-metrics", "customer-credibility"],
    "compatibleCreativeBundles": ["product-led-clean", "contrast-grid", "editorial-dark"]
  },
  {
    "id": "comparison-led",
    "label": "Comparison Led",
    "heroGoal": "Frame PublyApp against fragmented planning, drafting, and publishing workflows.",
    "narrativeOrder": [
      "hero",
      "comparison",
      "benefits",
      "workflow-proof",
      "faq",
      "final-cta"
    ],
    "requiredSections": ["hero", "comparison", "core-benefits", "proof", "final-cta"],
    "optionalSections": ["logo-strip", "pricing-teaser"],
    "proofPlacement": "after the comparison section",
    "ctaStyle": "See the workflow",
    "compatiblePromiseAngles": ["replace-fragmented-tools", "publish-without-chaos"],
    "compatibleProofStrategies": ["comparison-checklist", "workflow-artifacts"],
    "compatibleCreativeBundles": ["contrast-grid", "warm-operator", "product-led-clean"]
  },
  {
    "id": "product-demo-first",
    "label": "Product Demo First",
    "heroGoal": "Anchor the page around a believable product visual and explain the workflow through it.",
    "narrativeOrder": [
      "hero",
      "product-visual",
      "feature-depth",
      "proof",
      "faq",
      "final-cta"
    ],
    "requiredSections": ["hero", "product-visual", "feature-depth", "proof", "final-cta"],
    "optionalSections": ["logo-strip", "workflow-summary", "pricing-teaser"],
    "proofPlacement": "after feature depth",
    "ctaStyle": "See the workflow",
    "compatiblePromiseAngles": ["publish-without-chaos", "ship-consistently"],
    "compatibleProofStrategies": ["workflow-artifacts", "customer-credibility"],
    "compatibleCreativeBundles": ["product-led-clean", "editorial-dark", "warm-operator"]
  }
]
```

Create `scripts/homepage-factory/promise-angles.json`:

```json
[
  {
    "id": "publish-without-chaos",
    "label": "Publish Without Chaos",
    "corePromise": "Turn social publishing from a messy handoff process into a clear operational workflow.",
    "bestFitAudiences": ["in-house-social-teams", "smb-marketing-teams", "agencies"],
    "bestFitArchetypes": ["workflow-story", "comparison-led", "product-demo-first"],
    "headlineDirection": "Make the workflow feel orderly, visible, and ready to ship.",
    "supportingMessageThemes": ["workflow clarity", "publishing confidence", "less chaos"]
  },
  {
    "id": "approval-clarity",
    "label": "Approval Clarity",
    "corePromise": "Move content through review and approval with less back-and-forth and more certainty.",
    "bestFitAudiences": ["agencies", "in-house-social-teams"],
    "bestFitArchetypes": ["workflow-story", "proof-first"],
    "headlineDirection": "Lead with review-state clarity and reduced revision churn.",
    "supportingMessageThemes": ["clear approvals", "stakeholder visibility", "faster sign-off"]
  },
  {
    "id": "ship-consistently",
    "label": "Ship Consistently",
    "corePromise": "Help lean teams publish better social content on a dependable rhythm.",
    "bestFitAudiences": ["smb-marketing-teams", "in-house-social-teams"],
    "bestFitArchetypes": ["workflow-story", "proof-first", "product-demo-first"],
    "headlineDirection": "Tie better content quality directly to consistent execution.",
    "supportingMessageThemes": ["consistency", "content cadence", "team momentum"]
  },
  {
    "id": "replace-fragmented-tools",
    "label": "Replace Fragmented Tools",
    "corePromise": "Bring planning, drafting, review, and publishing into one more coherent workflow.",
    "bestFitAudiences": ["agencies", "in-house-social-teams"],
    "bestFitArchetypes": ["comparison-led", "proof-first"],
    "headlineDirection": "Contrast fragmented tool stacks with one clearer operating system.",
    "supportingMessageThemes": ["fewer handoffs", "less context switching", "unified workflow"]
  }
]
```

Create `scripts/homepage-factory/proof-strategies.json`:

```json
[
  {
    "id": "ops-metrics",
    "label": "Ops Metrics",
    "proofType": "metrics",
    "bestFitAudiences": ["agencies", "in-house-social-teams", "smb-marketing-teams"],
    "bestFitArchetypes": ["workflow-story", "proof-first"],
    "recommendedProofElements": [
      "approval-cycle speed",
      "content throughput gains",
      "reduced revision churn"
    ],
    "proofPlacementGuidance": "Use a tight proof band with 2-3 outcome metrics and one supporting testimonial."
  },
  {
    "id": "workflow-artifacts",
    "label": "Workflow Artifacts",
    "proofType": "workflow",
    "bestFitAudiences": ["agencies", "in-house-social-teams", "smb-marketing-teams"],
    "bestFitArchetypes": ["workflow-story", "comparison-led", "product-demo-first"],
    "recommendedProofElements": [
      "approval states",
      "calendar snapshots",
      "review-ready product visuals"
    ],
    "proofPlacementGuidance": "Use product visuals and annotated workflow states as proof, not just decoration."
  },
  {
    "id": "customer-credibility",
    "label": "Customer Credibility",
    "proofType": "testimonial",
    "bestFitAudiences": ["agencies", "in-house-social-teams"],
    "bestFitArchetypes": ["proof-first", "product-demo-first"],
    "recommendedProofElements": [
      "testimonial quote",
      "team role or context",
      "specific operational win"
    ],
    "proofPlacementGuidance": "Put a concrete testimonial close to the hero or primary product explanation."
  },
  {
    "id": "comparison-checklist",
    "label": "Comparison Checklist",
    "proofType": "comparison",
    "bestFitAudiences": ["agencies", "in-house-social-teams"],
    "bestFitArchetypes": ["comparison-led"],
    "recommendedProofElements": [
      "side-by-side workflow comparison",
      "tool-sprawl pain points",
      "operational differences"
    ],
    "proofPlacementGuidance": "Use a grounded comparison grid that avoids naming competitors directly."
  }
]
```

Create `scripts/homepage-factory/creative-bundles.json`:

```json
[
  {
    "id": "product-led-clean",
    "label": "Product-Led Clean",
    "heroStyle": "product-screenshot-first",
    "visualDensity": "medium",
    "motionBehavior": "micro-interactions-only",
    "colorDirection": "frosted-blue-professional",
    "surfaceTreatment": "clean layered panels with restrained depth",
    "screenshotTreatment": "large anchored product frames with light annotation callouts",
    "copyTone": "technical-and-trustworthy",
    "compatibilityTags": [
      "agencies",
      "in-house-social-teams",
      "smb-marketing-teams",
      "workflow-story",
      "proof-first",
      "comparison-led",
      "product-demo-first"
    ],
    "referenceAnchors": [
      "https://stripe.com",
      "https://linear.app",
      "https://www.figma.com",
      "https://www.intercom.com"
    ],
    "inspirationLibraries": [
      "https://land-book.com/",
      "https://www.awwwards.com/websites/"
    ]
  },
  {
    "id": "warm-operator",
    "label": "Warm Operator",
    "heroStyle": "soft-saas-clean",
    "visualDensity": "medium",
    "motionBehavior": "hover-depth-card-system",
    "colorDirection": "warm-neutral-with-electric-accent",
    "surfaceTreatment": "soft panels with crisp callouts and warm neutrals",
    "screenshotTreatment": "workflow composites with card-like framing",
    "copyTone": "confident-and-precise",
    "compatibilityTags": [
      "agencies",
      "in-house-social-teams",
      "smb-marketing-teams",
      "workflow-story",
      "comparison-led",
      "product-demo-first"
    ],
    "referenceAnchors": [
      "https://www.notion.com",
      "https://www.airtable.com",
      "https://slack.com",
      "https://www.webflow.com"
    ],
    "inspirationLibraries": [
      "https://www.lapa.ninja/",
      "https://land-book.com/"
    ]
  },
  {
    "id": "editorial-dark",
    "label": "Editorial Dark",
    "heroStyle": "dark-editorial",
    "visualDensity": "high",
    "motionBehavior": "scroll-narrative",
    "colorDirection": "midnight-indigo-with-cyan",
    "surfaceTreatment": "editorial contrast blocks with glowing product accents",
    "screenshotTreatment": "dramatic framed UI crops with strong depth separation",
    "copyTone": "visionary-and-future-forward",
    "compatibilityTags": [
      "agencies",
      "in-house-social-teams",
      "workflow-story",
      "proof-first",
      "product-demo-first"
    ],
    "referenceAnchors": [
      "https://linear.app",
      "https://stripe.com",
      "https://www.figma.com",
      "https://www.webflow.com"
    ],
    "inspirationLibraries": [
      "https://www.awwwards.com/websites/",
      "https://land-book.com/"
    ]
  },
  {
    "id": "contrast-grid",
    "label": "Contrast Grid",
    "heroStyle": "bold-typographic",
    "visualDensity": "medium-high",
    "motionBehavior": "animated-gradient-accent",
    "colorDirection": "black-white-plus-single-accent",
    "surfaceTreatment": "high-contrast sections with rigid grid rhythm",
    "screenshotTreatment": "boxed UI modules inside comparison and proof layouts",
    "copyTone": "pragmatic-operations-first",
    "compatibilityTags": [
      "agencies",
      "in-house-social-teams",
      "proof-first",
      "comparison-led"
    ],
    "referenceAnchors": [
      "https://stripe.com",
      "https://linear.app",
      "https://www.intercom.com",
      "https://www.figma.com"
    ],
    "inspirationLibraries": [
      "https://www.awwwards.com/websites/",
      "https://www.lapa.ninja/"
    ]
  }
]
```

- [ ] **Step 4: Update the generator module to load config files and enforce compatibility**

Replace `scripts/homepage-factory/generator.mjs` with:

```js
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, 'utf8'));
};

export const mulberry32 = (seed) => {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashSeed = (input) => {
  let hash = 1779033703 ^ input.length;

  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return hash >>> 0;
};

export const pickOne = (items, random) => {
  return items[Math.floor(random() * items.length)];
};

const pickCompatibleOne = ({ items, predicate, random, label }) => {
  const compatibleItems = items.filter(predicate);

  if (compatibleItems.length === 0) {
    throw new Error(`No compatible ${label} found for the selected variant recipe.`);
  }

  return pickOne(compatibleItems, random);
};

export const loadHomepageFactoryConfig = async ({ factoryDir }) => {
  const [
    productCore,
    audienceOverlays,
    homepageArchetypes,
    promiseAngles,
    proofStrategies,
    creativeBundles,
  ] = await Promise.all([
    readJson(path.join(factoryDir, 'product-core.json')),
    readJson(path.join(factoryDir, 'audience-overlays.json')),
    readJson(path.join(factoryDir, 'homepage-archetypes.json')),
    readJson(path.join(factoryDir, 'promise-angles.json')),
    readJson(path.join(factoryDir, 'proof-strategies.json')),
    readJson(path.join(factoryDir, 'creative-bundles.json')),
  ]);

  return {
    productCore,
    audienceOverlays,
    homepageArchetypes,
    promiseAngles,
    proofStrategies,
    creativeBundles,
  };
};

export const selectVariantRecipe = ({ config, random }) => {
  const audienceOverlay = pickOne(config.audienceOverlays, random);
  const homepageArchetype = pickCompatibleOne({
    items: config.homepageArchetypes,
    random,
    label: 'homepage archetype',
    predicate: (item) => {
      return item.compatibleCreativeBundles.some((bundleId) => {
        const bundle = config.creativeBundles.find((candidate) => candidate.id === bundleId);

        return bundle?.compatibilityTags.includes(audienceOverlay.id);
      });
    },
  });
  const promiseAngle = pickCompatibleOne({
    items: config.promiseAngles,
    random,
    label: 'promise angle',
    predicate: (item) => {
      return (
        item.bestFitAudiences.includes(audienceOverlay.id) &&
        item.bestFitArchetypes.includes(homepageArchetype.id) &&
        homepageArchetype.compatiblePromiseAngles.includes(item.id)
      );
    },
  });
  const proofStrategy = pickCompatibleOne({
    items: config.proofStrategies,
    random,
    label: 'proof strategy',
    predicate: (item) => {
      return (
        item.bestFitAudiences.includes(audienceOverlay.id) &&
        item.bestFitArchetypes.includes(homepageArchetype.id) &&
        homepageArchetype.compatibleProofStrategies.includes(item.id)
      );
    },
  });
  const creativeBundle = pickCompatibleOne({
    items: config.creativeBundles,
    random,
    label: 'creative direction bundle',
    predicate: (item) => {
      return (
        item.compatibilityTags.includes(audienceOverlay.id) &&
        item.compatibilityTags.includes(homepageArchetype.id) &&
        homepageArchetype.compatibleCreativeBundles.includes(item.id)
      );
    },
  });

  return {
    audienceOverlay,
    homepageArchetype,
    promiseAngle,
    proofStrategy,
    creativeBundle,
  };
};

export const generateHomepagePromptBatch = async ({
  config,
  outputDir,
  variants,
  seed,
  buildPrompt,
}) => {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const manifest = [];
  const prompts = [];

  for (let variant = 1; variant <= variants; variant += 1) {
    const random = mulberry32(hashSeed(`${seed}-${variant}`));
    const recipe = selectVariantRecipe({ config, random });
    const fileName = `${String(variant).padStart(3, '0')}-homepage-prompt.md`;
    const selectedReferences = recipe.creativeBundle.referenceAnchors.slice(0, 4);
    const selectedLibraries = recipe.creativeBundle.inspirationLibraries.slice(0, 2);
    const content = buildPrompt({
      variant,
      productCore: config.productCore,
      ...recipe,
      selectedReferences,
      selectedLibraries,
    });

    await writeFile(path.join(outputDir, fileName), content, 'utf8');

    manifest.push({
      variant,
      fileName,
      seed: `${seed}-${variant}`,
      audienceOverlay: recipe.audienceOverlay.id,
      homepageArchetype: recipe.homepageArchetype.id,
      promiseAngle: recipe.promiseAngle.id,
      proofStrategy: recipe.proofStrategy.id,
      creativeDirectionBundle: recipe.creativeBundle.id,
      selectedReferences,
      selectedLibraries,
    });
    prompts.push({ fileName, content });
  }

  await writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  return { manifest, prompts };
};
```

Then update `scripts/generate-homepage-prompts.mjs` to load the new config with repo-relative paths:

Create `scripts/homepage-factory/prompt-template.mjs` with a temporary minimal builder so the CLI
stays working before Task 3 rewrites the full prompt contract:

```js
export const buildHomepagePrompt = ({
  variant,
  audienceOverlay,
  homepageArchetype,
  promiseAngle,
  proofStrategy,
  creativeBundle,
}) => {
  return `# Homepage Prompt Variant ${variant}

## Variant Metadata
- Primary audience: **${audienceOverlay.audienceLabel}**
- Homepage archetype: **${homepageArchetype.label}**
- Promise angle: **${promiseAngle.label}**
- Proof strategy: **${proofStrategy.label}**
- Creative bundle: **${creativeBundle.label}**
`;
};
```

Then update `scripts/generate-homepage-prompts.mjs` to load the new config with repo-relative paths:

```js
#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { generateHomepagePromptBatch, loadHomepageFactoryConfig } from './homepage-factory/generator.mjs';
import { buildHomepagePrompt } from './homepage-factory/prompt-template.mjs';

const filePath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(filePath);
const repoRoot = path.resolve(scriptsDir, '..');
const factoryDir = path.join(repoRoot, 'scripts/homepage-factory');
const outputDir = path.join(repoRoot, 'docs/misc/homepage-factory/generated-prompts');

const run = async () => {
  const variantsArg = process.argv[2] ?? '24';
  const seedArg = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  const variants = Number.parseInt(variantsArg, 10);

  if (!Number.isInteger(variants) || variants <= 0 || variants > 200) {
    throw new Error('Variants must be an integer between 1 and 200.');
  }

  const config = await loadHomepageFactoryConfig({ factoryDir });

  await generateHomepagePromptBatch({
    config,
    outputDir,
    variants,
    seed: seedArg,
    buildPrompt: buildHomepagePrompt,
  });

  process.stdout.write(
    `Generated ${variants} homepage prompts in ${path.relative(repoRoot, outputDir)}\n`,
  );
};

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
```

Also update `scripts/homepage-factory/generate-homepage-prompts.test.mjs` so every
`generateHomepagePromptBatch(...)` call passes the builder:

```js
import { buildHomepagePrompt } from './prompt-template.mjs';
```

```js
const first = await generateHomepagePromptBatch({
  config: TEST_CONFIG,
  outputDir: firstDir,
  variants: 2,
  seed: 'deterministic-seed',
  buildPrompt: buildHomepagePrompt,
});
```

```js
const result = await generateHomepagePromptBatch({
  config,
  outputDir,
  variants: 6,
  seed: 'compatibility-seed',
  buildPrompt: buildHomepagePrompt,
});
```

After the new config files are live and no code references the old file, remove it:

```bash
git rm scripts/homepage-factory/inspiration-bank.json
```

- [ ] **Step 5: Run the tests to verify compatibility logic passes**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: PASS with both deterministic and compatibility tests green.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/generate-homepage-prompts.mjs scripts/homepage-factory
git commit -m "feat: add structured homepage factory data"
```

## Task 3: Rewrite The Prompt Template Around The Strategy-First Contract

**Files:**
- Modify: `scripts/homepage-factory/prompt-template.mjs`
- Modify: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`
- Modify: `scripts/homepage-factory/generator.mjs`

- [ ] **Step 1: Add a failing prompt-contract test**

Append this test:

```js
test('generated prompt uses the strategy-first contract', async () => {
  const outputDir = await createTempOutputDir();

  try {
    const config = await loadHomepageFactoryConfig({ factoryDir: FACTORY_DIR });
    const result = await generateHomepagePromptBatch({
      config,
      outputDir,
      variants: 1,
      seed: 'prompt-contract',
      buildPrompt: buildHomepagePrompt,
    });

    const prompt = result.prompts[0].content;
    const orderedSections = [
      '## Variant Metadata',
      '## System Prompt',
      '## User Prompt',
      '### Product Core',
      '### Audience Overlay',
      '### Archetype Brief',
      '### Creative Direction',
      '### Working Order',
      '### Output Contract',
    ];

    let previousIndex = -1;

    for (const heading of orderedSections) {
      const currentIndex = prompt.indexOf(heading);
      assert.ok(currentIndex > previousIndex, `${heading} should appear in order`);
      previousIndex = currentIndex;
    }

    assert.match(prompt, /No vague AI-productivity filler/i);
    assert.match(prompt, /1\. Define the homepage concept/);
    assert.match(prompt, /5\. Implement the homepage/);
    assert.match(prompt, /show a believable social publishing workflow/i);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
```

Also add the import near the top:

```js
import { buildHomepagePrompt } from './prompt-template.mjs';
```

- [ ] **Step 2: Run the tests to verify the new prompt-contract test fails**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: FAIL because the temporary prompt template from Task 2 does not yet contain the required strategy-first sections.

- [ ] **Step 3: Rewrite the prompt template module**

Replace `scripts/homepage-factory/prompt-template.mjs` with:

```js
const renderList = (items) => {
  return items.map((item) => `- ${item}`).join('\n');
};

export const buildHomepagePrompt = ({
  variant,
  productCore,
  audienceOverlay,
  homepageArchetype,
  promiseAngle,
  proofStrategy,
  creativeBundle,
  selectedReferences,
  selectedLibraries,
}) => {
  return `# Homepage Prompt Variant ${variant}

## Variant Metadata
- Primary audience: **${audienceOverlay.audienceLabel}**
- Homepage archetype: **${homepageArchetype.label}**
- Promise angle: **${promiseAngle.label}**
- Proof strategy: **${proofStrategy.label}**
- Creative bundle: **${creativeBundle.label}**

## System Prompt
You are an award-winning SaaS design + implementation agent.

Design bar:
- The output must look and feel on par with elite multi-million-dollar SaaS websites.
- Prioritize clarity, visual hierarchy, and conversion impact over decoration.
- Every section should feel purposeful, premium, and production-ready.

Non-generic guardrails:
- No vague AI-productivity filler.
- No interchangeable SaaS headline language.
- The hero must make a concrete promise to the selected audience.
- Proof must match the selected audience and archetype.
- Product visuals must show a believable social publishing workflow.
- Avoid verbs like "streamline", "optimize", and "unlock" unless tied to a concrete outcome.

Execution rules:
- Build a complete homepage in React + TypeScript + MUI v6.
- Use only MUI primitives/components and sx styling.
- Maintain AA contrast and responsive behavior from 320px to 1536px+.

## User Prompt
Create a homepage concept for **${productCore.productName}**.

### Product Core
- Summary: ${productCore.productSummary}
- Core differentiators:
${renderList(productCore.coreDifferentiators)}
- Workflow strengths:
${renderList(productCore.workflowStrengths)}
- Trust signals:
${renderList(productCore.trustSignals)}
- Product visual requirements:
${renderList(productCore.productVisualRequirements)}
- Forbidden claims:
${renderList(productCore.forbiddenClaims)}
- Forbidden copy patterns:
${renderList(productCore.forbiddenCopyPatterns)}

### Audience Overlay
- Audience: ${audienceOverlay.audienceLabel}
- Primary pains:
${renderList(audienceOverlay.primaryPains)}
- Desired outcomes:
${renderList(audienceOverlay.desiredOutcomes)}
- Top objections:
${renderList(audienceOverlay.topObjections)}
- Decision criteria:
${renderList(audienceOverlay.decisionCriteria)}

### Archetype Brief
- Hero goal: ${homepageArchetype.heroGoal}
- Narrative order:
${renderList(homepageArchetype.narrativeOrder)}
- Proof placement: ${homepageArchetype.proofPlacement}
- CTA style: ${homepageArchetype.ctaStyle}

### Creative Direction
- Hero style: ${creativeBundle.heroStyle}
- Visual density: ${creativeBundle.visualDensity}
- Motion behavior: ${creativeBundle.motionBehavior}
- Color direction: ${creativeBundle.colorDirection}
- Surface treatment: ${creativeBundle.surfaceTreatment}
- Screenshot treatment: ${creativeBundle.screenshotTreatment}
- Copy tone: ${creativeBundle.copyTone}

### Strategy Inputs
- Core promise: ${promiseAngle.corePromise}
- Headline direction: ${promiseAngle.headlineDirection}
- Supporting message themes:
${renderList(promiseAngle.supportingMessageThemes)}
- Proof type: ${proofStrategy.proofType}
- Recommended proof elements:
${renderList(proofStrategy.recommendedProofElements)}
- Proof placement guidance: ${proofStrategy.proofPlacementGuidance}

### Design Inspiration Anchors
Use these references for style analysis only:
${renderList(selectedReferences)}

Use these galleries for composition ideas:
${renderList(selectedLibraries)}

### Working Order
Before implementation, work in this order:
1. Define the homepage concept.
2. Define the messaging strategy.
3. Define the section-by-section narrative.
4. Define the visual direction rationale.
5. Implement the homepage.

### Output Contract
1. Provide a concise concept summary.
2. Provide a messaging strategy summary.
3. Provide a section outline.
4. Provide the full homepage implementation.
5. Provide a short quality self-check covering accessibility, responsiveness, and non-generic quality.
`;
};
```

- [ ] **Step 4: Wire the generator to always receive `buildHomepagePrompt`**

In `scripts/homepage-factory/generator.mjs`, make `buildPrompt` mandatory:

```js
if (typeof buildPrompt !== 'function') {
  throw new Error('generateHomepagePromptBatch requires a buildPrompt function.');
}
```

Place that guard near the top of `generateHomepagePromptBatch`, before the loop.

- [ ] **Step 5: Run the tests to verify the strategy-first prompt contract passes**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: PASS with deterministic, compatibility, and prompt-contract tests all green.

- [ ] **Step 6: Commit**

```bash
git add scripts/homepage-factory/generator.mjs scripts/homepage-factory/prompt-template.mjs scripts/homepage-factory/generate-homepage-prompts.test.mjs
git commit -m "feat: add strategy-first homepage prompt contract"
```

## Task 4: Update Documentation And Regenerate The Review Batch

**Files:**
- Modify: `docs/misc/homepage-factory/README.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/001-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/002-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/003-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/004-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/005-homepage-prompt.md`
- Modify: `docs/misc/homepage-factory/generated-prompts/manifest.json`

- [ ] **Step 1: Rewrite the README around the new factory model**

Update `docs/misc/homepage-factory/README.md` so the core sections read like this:

```md
# PublyApp Homepage Factory

This factory generates curated homepage prompt variants for PublyApp. It is optimized for higher
average homepage quality, not maximum random variation.

## What changed

Each variant now combines:

- one shared PublyApp core profile
- one audience overlay
- one curated homepage archetype
- one compatible promise angle
- one compatible proof strategy
- one compatible creative bundle

## Files That Control The Factory

- `scripts/homepage-factory/product-core.json`
- `scripts/homepage-factory/audience-overlays.json`
- `scripts/homepage-factory/homepage-archetypes.json`
- `scripts/homepage-factory/promise-angles.json`
- `scripts/homepage-factory/proof-strategies.json`
- `scripts/homepage-factory/creative-bundles.json`

## Output Shape

Each generated prompt now includes:

- variant metadata
- strategy-first system prompt guardrails
- product core block
- audience overlay block
- archetype brief
- creative direction block
- concept-before-implementation working order
```

- [ ] **Step 2: Regenerate the committed review batch**

Run:

```powershell
pnpm generate:homepage-prompts -- 5 publyapp-check
```

Expected: `Generated 5 homepage prompts in docs\misc\homepage-factory\generated-prompts`

- [ ] **Step 3: Verify the generated files reflect the new contract**

Run:

```powershell
Get-Content 'docs/misc/homepage-factory/generated-prompts/001-homepage-prompt.md'
Get-Content 'docs/misc/homepage-factory/generated-prompts/manifest.json'
```

Expected in the prompt file:

- `## Variant Metadata`
- `### Product Core`
- `### Audience Overlay`
- `### Archetype Brief`
- `### Working Order`

Expected in the manifest:

- `audienceOverlay`
- `homepageArchetype`
- `promiseAngle`
- `proofStrategy`
- `creativeDirectionBundle`
- `selectedReferences`

- [ ] **Step 4: Commit**

```bash
git add docs/misc/homepage-factory/README.md docs/misc/homepage-factory/generated-prompts
git commit -m "docs: regenerate homepage factory review batch"
```

## Task 5: Run Final Verification And Prepare For Review

**Files:**
- Verify: `package.json`
- Verify: `scripts/generate-homepage-prompts.mjs`
- Verify: `scripts/homepage-factory/generator.mjs`
- Verify: `scripts/homepage-factory/prompt-template.mjs`
- Verify: `scripts/homepage-factory/product-core.json`
- Verify: `scripts/homepage-factory/audience-overlays.json`
- Verify: `scripts/homepage-factory/homepage-archetypes.json`
- Verify: `scripts/homepage-factory/promise-angles.json`
- Verify: `scripts/homepage-factory/proof-strategies.json`
- Verify: `scripts/homepage-factory/creative-bundles.json`
- Verify: `scripts/homepage-factory/generate-homepage-prompts.test.mjs`
- Verify: `docs/misc/homepage-factory/README.md`
- Verify: `docs/misc/homepage-factory/generated-prompts/001-homepage-prompt.md`
- Verify: `docs/misc/homepage-factory/generated-prompts/002-homepage-prompt.md`
- Verify: `docs/misc/homepage-factory/generated-prompts/003-homepage-prompt.md`
- Verify: `docs/misc/homepage-factory/generated-prompts/004-homepage-prompt.md`
- Verify: `docs/misc/homepage-factory/generated-prompts/005-homepage-prompt.md`
- Verify: `docs/misc/homepage-factory/generated-prompts/manifest.json`

- [ ] **Step 1: Run the focused homepage factory tests**

Run:

```powershell
pnpm test:homepage-prompts
```

Expected: PASS with all homepage factory tests green.

- [ ] **Step 2: Run repo formatting/lint on the modified slice**

Run:

```powershell
just check-write
```

Expected: PASS, or only pre-existing unrelated repo issues. No new formatting or lint issues in the homepage factory files.

- [ ] **Step 3: Generate one larger batch as a final smoke check**

Run:

```powershell
pnpm generate:homepage-prompts -- 12 publyapp-review-batch
```

Expected:

- command succeeds
- `manifest.json` contains 12 entries
- entries use multiple audience overlays and archetypes
- prompt files are generated with the strategy-first contract

- [ ] **Step 4: Review the diff before asking for code review**

Run:

```powershell
git diff --stat
git diff -- scripts/generate-homepage-prompts.mjs scripts/homepage-factory package.json docs/misc/homepage-factory
```

Expected: diff is limited to the planned files and shows:

- legacy inspiration bank removed
- structured JSON files added
- generator extracted and template rewritten
- test coverage added
- README and committed review batch updated

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/generate-homepage-prompts.mjs scripts/homepage-factory docs/misc/homepage-factory
git commit -m "feat: redesign homepage prompt factory"
```

## Self-Review

### Spec coverage

- Shared PublyApp core profile: implemented in Task 2 via `product-core.json`.
- One audience overlay per variant: implemented and tested in Task 2.
- Curated homepage archetypes: implemented in Task 2.
- Promise angles and proof strategies: implemented in Task 2.
- Compatibility-filtered creative bundles: implemented and tested in Task 2.
- Strategy-first prompt contract: implemented and tested in Task 3.
- Manifest enrichment: implemented in Tasks 2 and 4.
- README and workflow docs: implemented in Task 4.
- Verification path: implemented in Task 5.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every code-changing step includes concrete code or file contents.
- Every execution step includes an exact command and expected result.

### Type consistency

- Manifest field names stay consistent across tests, generator output, README, and prompt template:
  `audienceOverlay`, `homepageArchetype`, `promiseAngle`, `proofStrategy`,
  `creativeDirectionBundle`, `selectedReferences`, and `selectedLibraries`.
- Config collection names stay consistent in code and tests:
  `productCore`, `audienceOverlays`, `homepageArchetypes`, `promiseAngles`,
  `proofStrategies`, and `creativeBundles`.
