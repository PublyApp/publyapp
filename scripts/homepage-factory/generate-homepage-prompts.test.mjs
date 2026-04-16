import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  generateHomepagePromptBatch,
  loadHomepageFactoryConfig,
} from './generator.mjs';
import { buildHomepagePrompt } from './prompt-template.mjs';

const createTempOutputDir = async () => {
  return mkdtemp(path.join(os.tmpdir(), 'homepage-prompts-'));
};

const TEST_CONFIG = {
  productCore: {
    productName: 'PublyApp',
  },
  audienceOverlays: [
    { id: 'agencies', audienceLabel: 'Agencies' },
    { id: 'in-house', audienceLabel: 'In-House Teams' },
  ],
  homepageArchetypes: [
    {
      id: 'workflow-story',
      label: 'Workflow Story',
      compatiblePromiseAngles: ['ship-consistently', 'launch-faster'],
      compatibleProofStrategies: ['ops-metrics', 'social-proof'],
      compatibleCreativeBundles: ['product-led-clean', 'editorial-bold'],
    },
    {
      id: 'product-tour',
      label: 'Product Tour',
      compatiblePromiseAngles: ['ship-consistently', 'launch-faster'],
      compatibleProofStrategies: ['ops-metrics', 'social-proof'],
      compatibleCreativeBundles: ['product-led-clean', 'editorial-bold'],
    },
  ],
  promiseAngles: [
    {
      id: 'ship-consistently',
      label: 'Ship Consistently',
      bestFitAudiences: ['agencies', 'in-house'],
      bestFitArchetypes: ['workflow-story', 'product-tour'],
    },
    {
      id: 'launch-faster',
      label: 'Launch Faster',
      bestFitAudiences: ['agencies', 'in-house'],
      bestFitArchetypes: ['workflow-story', 'product-tour'],
    },
  ],
  proofStrategies: [
    {
      id: 'ops-metrics',
      label: 'Ops Metrics',
      bestFitAudiences: ['agencies', 'in-house'],
      bestFitArchetypes: ['workflow-story', 'product-tour'],
    },
    {
      id: 'social-proof',
      label: 'Social Proof',
      bestFitAudiences: ['agencies', 'in-house'],
      bestFitArchetypes: ['workflow-story', 'product-tour'],
    },
  ],
  creativeBundles: [
    {
      id: 'product-led-clean',
      label: 'Product-Led Clean',
      compatibilityTags: ['agencies', 'in-house', 'workflow-story', 'product-tour'],
      referenceAnchors: [
        'https://example.com/stripe',
        'https://example.com/linear',
        'https://example.com/figma',
        'https://example.com/intercom',
      ],
      inspirationLibraries: [
        'https://example.com/land-book',
        'https://example.com/awwwards',
      ],
    },
    {
      id: 'editorial-bold',
      label: 'Editorial Bold',
      compatibilityTags: ['agencies', 'in-house', 'workflow-story', 'product-tour'],
      referenceAnchors: [
        'https://example.com/notion',
        'https://example.com/airtable',
        'https://example.com/slack',
        'https://example.com/webflow',
      ],
      inspirationLibraries: [
        'https://example.com/lapa',
        'https://example.com/land-book',
      ],
    },
  ],
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
      buildPrompt: buildHomepagePrompt,
    });
    const second = await generateHomepagePromptBatch({
      config: TEST_CONFIG,
      outputDir: secondDir,
      variants: 2,
      seed: 'deterministic-seed',
      buildPrompt: buildHomepagePrompt,
    });

    assert.deepEqual(first.manifest, second.manifest);
    assert.deepEqual(first.manifest, [
      {
        variant: 1,
        fileName: '001-homepage-prompt.md',
        seed: 'deterministic-seed-1',
        audienceOverlay: 'agencies',
        homepageArchetype: 'product-tour',
        promiseAngle: 'ship-consistently',
        proofStrategy: 'social-proof',
        creativeDirectionBundle: 'editorial-bold',
        selectedReferences: [
          'https://example.com/notion',
          'https://example.com/airtable',
          'https://example.com/slack',
          'https://example.com/webflow',
        ],
        selectedLibraries: [
          'https://example.com/lapa',
          'https://example.com/land-book',
        ],
      },
      {
        variant: 2,
        fileName: '002-homepage-prompt.md',
        seed: 'deterministic-seed-2',
        audienceOverlay: 'agencies',
        homepageArchetype: 'workflow-story',
        promiseAngle: 'ship-consistently',
        proofStrategy: 'social-proof',
        creativeDirectionBundle: 'product-led-clean',
        selectedReferences: [
          'https://example.com/stripe',
          'https://example.com/linear',
          'https://example.com/figma',
          'https://example.com/intercom',
        ],
        selectedLibraries: [
          'https://example.com/land-book',
          'https://example.com/awwwards',
        ],
      },
    ]);
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

test('generateHomepagePromptBatch rejects empty selection arrays', async () => {
  const outputDir = await createTempOutputDir();

  try {
    await assert.rejects(
      () =>
        generateHomepagePromptBatch({
          config: {
            ...TEST_CONFIG,
            audienceOverlays: [],
          },
          outputDir,
          variants: 1,
          seed: 'deterministic-seed',
          buildPrompt: buildHomepagePrompt,
        }),
      /audienceOverlays must contain at least one item/,
    );
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

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
      buildPrompt: buildHomepagePrompt,
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
      assert.ok(
        archetype.compatibleCreativeBundles.includes(
          entry.creativeDirectionBundle,
        ),
      );
      assert.ok(promiseAngle.bestFitAudiences.includes(entry.audienceOverlay));
      assert.ok(promiseAngle.bestFitArchetypes.includes(entry.homepageArchetype));
      assert.ok(proofStrategy.bestFitAudiences.includes(entry.audienceOverlay));
      assert.ok(proofStrategy.bestFitArchetypes.includes(entry.homepageArchetype));
      assert.ok(creativeBundle.compatibilityTags.includes(entry.audienceOverlay));
      assert.ok(
        creativeBundle.compatibilityTags.includes(entry.homepageArchetype),
      );
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
