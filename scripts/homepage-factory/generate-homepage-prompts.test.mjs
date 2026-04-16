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
