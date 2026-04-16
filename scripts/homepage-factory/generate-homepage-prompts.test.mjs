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
  audienceOverlays: [
    { id: 'agencies', audienceLabel: 'Agencies' },
    { id: 'in-house', audienceLabel: 'In-House Teams' },
  ],
  homepageArchetypes: [
    { id: 'workflow-story', label: 'Workflow Story' },
    { id: 'product-tour', label: 'Product Tour' },
  ],
  promiseAngles: [
    { id: 'ship-consistently', label: 'Ship Consistently' },
    { id: 'launch-faster', label: 'Launch Faster' },
  ],
  proofStrategies: [
    { id: 'ops-metrics', label: 'Ops Metrics' },
    { id: 'social-proof', label: 'Social Proof' },
  ],
  creativeBundles: [
    { id: 'product-led-clean', label: 'Product-Led Clean' },
    { id: 'editorial-bold', label: 'Editorial Bold' },
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
    });
    const second = await generateHomepagePromptBatch({
      config: TEST_CONFIG,
      outputDir: secondDir,
      variants: 2,
      seed: 'deterministic-seed',
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
        }),
      /audienceOverlays must contain at least one item/,
    );
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
