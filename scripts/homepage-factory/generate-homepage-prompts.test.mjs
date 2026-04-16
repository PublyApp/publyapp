import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  generateHomepagePromptBatch,
  loadHomepageFactoryConfig,
} from './generator.mjs';
import { buildHomepagePrompt } from './prompt-template.mjs';

const execFileAsync = promisify(execFile);

const createTempOutputDir = async () => {
  return mkdtemp(path.join(os.tmpdir(), 'homepage-prompts-'));
};

const writeJson = async (filePath, value) => {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
};

const pathExists = async (targetPath) => {
  try {
    await access(targetPath);

    return true;
  } catch {
    return false;
  }
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

test('generateHomepagePromptBatch preserves existing output when buildPrompt throws', async () => {
  const outputDir = await createTempOutputDir();
  const existingFile = path.join(outputDir, 'existing.txt');

  try {
    await writeFile(existingFile, 'keep me', 'utf8');

    await assert.rejects(
      () =>
        generateHomepagePromptBatch({
          config: TEST_CONFIG,
          outputDir,
          variants: 1,
          seed: 'throwing-seed',
          buildPrompt: () => {
            throw new Error('builder failed');
          },
        }),
      /builder failed/,
    );

    assert.equal(await readFile(existingFile, 'utf8'), 'keep me');
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('generateHomepagePromptBatch preserves existing output when staged publish fails', async () => {
  const outputDir = await createTempOutputDir();
  const existingFile = path.join(outputDir, 'existing.txt');
  let writeAttempts = 0;

  try {
    await writeFile(existingFile, 'keep me', 'utf8');

    await assert.rejects(
      () =>
        generateHomepagePromptBatch({
          config: TEST_CONFIG,
          outputDir,
          variants: 2,
          seed: 'publish-failure-seed',
          buildPrompt: buildHomepagePrompt,
          fileOps: {
            writeFile: async (filePath, content, encoding) => {
              writeAttempts += 1;

              if (writeAttempts === 2) {
                throw new Error('simulated write failure');
              }

              return writeFile(filePath, content, encoding);
            },
          },
        }),
      /simulated write failure/,
    );

    assert.equal(await readFile(existingFile, 'utf8'), 'keep me');
    assert.equal(
      await pathExists(path.join(outputDir, '001-homepage-prompt.md')),
      false,
    );
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('loadHomepageFactoryConfig reports missing required array fields clearly', async () => {
  const factoryDir = await mkdtemp(path.join(os.tmpdir(), 'homepage-factory-'));

  try {
    await writeJson(path.join(factoryDir, 'product-core.json'), {
      productName: 'PublyApp',
    });
    await writeJson(path.join(factoryDir, 'audience-overlays.json'), [
      { id: 'agencies', audienceLabel: 'Agencies' },
    ]);
    await writeJson(path.join(factoryDir, 'homepage-archetypes.json'), [
      {
        id: 'workflow-story',
        label: 'Workflow Story',
        compatibleProofStrategies: ['ops-metrics'],
        compatibleCreativeBundles: ['product-led-clean'],
      },
    ]);
    await writeJson(path.join(factoryDir, 'promise-angles.json'), [
      {
        id: 'ship-consistently',
        label: 'Ship Consistently',
        bestFitAudiences: ['agencies'],
        bestFitArchetypes: ['workflow-story'],
      },
    ]);
    await writeJson(path.join(factoryDir, 'proof-strategies.json'), [
      {
        id: 'ops-metrics',
        label: 'Ops Metrics',
        bestFitAudiences: ['agencies'],
        bestFitArchetypes: ['workflow-story'],
      },
    ]);
    await writeJson(path.join(factoryDir, 'creative-bundles.json'), [
      {
        id: 'product-led-clean',
        label: 'Product-Led Clean',
        compatibilityTags: ['agencies', 'workflow-story'],
        referenceAnchors: ['https://example.com/stripe'],
        inspirationLibraries: ['https://example.com/land-book'],
      },
    ]);

    await assert.rejects(
      () => loadHomepageFactoryConfig({ factoryDir }),
      /homepageArchetypes\[0\]\.compatiblePromiseAngles must be an array/,
    );
  } finally {
    await rm(factoryDir, { recursive: true, force: true });
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

test('generate-homepage-prompts CLI writes prompts using repo-relative paths', async () => {
  const repoRoot = path.resolve('.');
  const outputDir = path.join(
    repoRoot,
    'docs/misc/homepage-factory/generated-prompts',
  );
  const backupDir = path.join(
    os.tmpdir(),
    `homepage-prompts-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const hadExistingOutput = await pathExists(outputDir);

  try {
    if (hadExistingOutput) {
      await rename(outputDir, backupDir);
    }

    const { stdout } = await execFileAsync(
      process.execPath,
      ['scripts/generate-homepage-prompts.mjs', '2', 'cli-seed'],
      {
        cwd: repoRoot,
      },
    );

    assert.match(
      stdout,
      /Generated 2 homepage prompts in docs[\\/]+misc[\\/]+homepage-factory[\\/]+generated-prompts/,
    );
    assert.equal(
      await pathExists(path.join(outputDir, '001-homepage-prompt.md')),
      true,
    );
    assert.equal(await pathExists(path.join(outputDir, 'manifest.json')), true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });

    if (hadExistingOutput) {
      await mkdir(path.dirname(outputDir), { recursive: true });
      await rename(backupDir, outputDir);
    }
  }
});
