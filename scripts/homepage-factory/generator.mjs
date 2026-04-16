import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
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

export const pickOne = (items, random, label = 'items') => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${label} must contain at least one item`);
  }

  return items[Math.floor(random() * items.length)];
};

export const pickCompatibleOne = ({
  items,
  predicate,
  random,
  label = 'items',
}) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${label} must contain at least one item`);
  }

  const compatibleItems = items.filter(predicate);

  if (compatibleItems.length === 0) {
    throw new Error(`No compatible ${label} available for the selected variant`);
  }

  return pickOne(compatibleItems, random, label);
};

export const readJson = async (filePath) => {
  const raw = await readFile(filePath, 'utf8');

  return JSON.parse(raw);
};

const assertObject = (value, label) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
};

const assertString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
};

const assertStringArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  for (const [index, item] of value.entries()) {
    assertString(item, `${label}[${index}]`);
  }
};

const assertObjectArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  for (const [index, item] of value.entries()) {
    assertObject(item, `${label}[${index}]`);
  }
};

export const validateHomepageFactoryConfig = (config) => {
  assertObject(config, 'config');
  assertObject(config.productCore, 'productCore');
  assertString(config.productCore.productName, 'productCore.productName');

  assertObjectArray(config.audienceOverlays, 'audienceOverlays');
  for (const [index, item] of config.audienceOverlays.entries()) {
    assertString(item.id, `audienceOverlays[${index}].id`);
    assertString(
      item.audienceLabel,
      `audienceOverlays[${index}].audienceLabel`,
    );
  }

  assertObjectArray(config.homepageArchetypes, 'homepageArchetypes');
  for (const [index, item] of config.homepageArchetypes.entries()) {
    assertString(item.id, `homepageArchetypes[${index}].id`);
    assertString(item.label, `homepageArchetypes[${index}].label`);
    assertStringArray(
      item.compatiblePromiseAngles,
      `homepageArchetypes[${index}].compatiblePromiseAngles`,
    );
    assertStringArray(
      item.compatibleProofStrategies,
      `homepageArchetypes[${index}].compatibleProofStrategies`,
    );
    assertStringArray(
      item.compatibleCreativeBundles,
      `homepageArchetypes[${index}].compatibleCreativeBundles`,
    );
  }

  assertObjectArray(config.promiseAngles, 'promiseAngles');
  for (const [index, item] of config.promiseAngles.entries()) {
    assertString(item.id, `promiseAngles[${index}].id`);
    assertString(item.label, `promiseAngles[${index}].label`);
    assertStringArray(
      item.bestFitAudiences,
      `promiseAngles[${index}].bestFitAudiences`,
    );
    assertStringArray(
      item.bestFitArchetypes,
      `promiseAngles[${index}].bestFitArchetypes`,
    );
  }

  assertObjectArray(config.proofStrategies, 'proofStrategies');
  for (const [index, item] of config.proofStrategies.entries()) {
    assertString(item.id, `proofStrategies[${index}].id`);
    assertString(item.label, `proofStrategies[${index}].label`);
    assertStringArray(
      item.bestFitAudiences,
      `proofStrategies[${index}].bestFitAudiences`,
    );
    assertStringArray(
      item.bestFitArchetypes,
      `proofStrategies[${index}].bestFitArchetypes`,
    );
  }

  assertObjectArray(config.creativeBundles, 'creativeBundles');
  for (const [index, item] of config.creativeBundles.entries()) {
    assertString(item.id, `creativeBundles[${index}].id`);
    assertString(item.label, `creativeBundles[${index}].label`);
    assertStringArray(
      item.compatibilityTags,
      `creativeBundles[${index}].compatibilityTags`,
    );
    assertStringArray(
      item.referenceAnchors,
      `creativeBundles[${index}].referenceAnchors`,
    );
    assertStringArray(
      item.inspirationLibraries,
      `creativeBundles[${index}].inspirationLibraries`,
    );
  }
};

export const loadHomepageFactoryConfig = async ({ factoryDir }) => {
  const config = {
    productCore: await readJson(path.join(factoryDir, 'product-core.json')),
    audienceOverlays: await readJson(
      path.join(factoryDir, 'audience-overlays.json'),
    ),
    homepageArchetypes: await readJson(
      path.join(factoryDir, 'homepage-archetypes.json'),
    ),
    promiseAngles: await readJson(path.join(factoryDir, 'promise-angles.json')),
    proofStrategies: await readJson(
      path.join(factoryDir, 'proof-strategies.json'),
    ),
    creativeBundles: await readJson(
      path.join(factoryDir, 'creative-bundles.json'),
    ),
  };

  validateHomepageFactoryConfig(config);

  return config;
};

const defaultFileOps = {
  access,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
};

const pathExists = async (targetPath, fileOps) => {
  try {
    await fileOps.access(targetPath);

    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
};

const createTempSiblingPath = (targetPath, suffix) => {
  const uniqueId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${targetPath}.${suffix}-${uniqueId}`;
};

const publishGeneratedBatch = async ({
  outputDir,
  prompts,
  manifest,
  fileOps,
}) => {
  const outputParentDir = path.dirname(outputDir);

  await fileOps.mkdir(outputParentDir, { recursive: true });

  let stagingDir = await fileOps.mkdtemp(
    path.join(outputParentDir, '.homepage-factory-stage-'),
  );
  let backupDir = null;
  let existingOutputMoved = false;
  let published = false;

  try {
    for (const prompt of prompts) {
      await fileOps.writeFile(
        path.join(stagingDir, prompt.fileName),
        prompt.content,
        'utf8',
      );
    }

    await fileOps.writeFile(
      path.join(stagingDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );

    if (await pathExists(outputDir, fileOps)) {
      backupDir = createTempSiblingPath(outputDir, 'backup');
      await fileOps.rename(outputDir, backupDir);
      existingOutputMoved = true;
    }

    await fileOps.rename(stagingDir, outputDir);
    stagingDir = null;
    published = true;

    if (backupDir !== null) {
      await fileOps.rm(backupDir, { recursive: true, force: true });
      backupDir = null;
    }
  } catch (error) {
    if (!published && existingOutputMoved && backupDir !== null) {
      if (await pathExists(outputDir, fileOps)) {
        await fileOps.rm(outputDir, { recursive: true, force: true });
      }

      await fileOps.rename(backupDir, outputDir);
      backupDir = null;
    }

    throw error;
  } finally {
    if (stagingDir !== null) {
      await fileOps.rm(stagingDir, { recursive: true, force: true });
    }

    if (backupDir !== null) {
      await fileOps.rm(backupDir, { recursive: true, force: true });
    }
  }
};

export const selectVariantRecipe = ({ config, random }) => {
  const audienceOverlay = pickOne(
    config.audienceOverlays,
    random,
    'audienceOverlays',
  );
  const homepageArchetype = pickCompatibleOne({
    items: config.homepageArchetypes,
    predicate: (item) => {
      return (
        config.promiseAngles.some((promiseAngle) => {
          return (
            item.compatiblePromiseAngles.includes(promiseAngle.id) &&
            promiseAngle.bestFitAudiences.includes(audienceOverlay.id) &&
            promiseAngle.bestFitArchetypes.includes(item.id)
          );
        }) &&
        config.proofStrategies.some((proofStrategy) => {
          return (
            item.compatibleProofStrategies.includes(proofStrategy.id) &&
            proofStrategy.bestFitAudiences.includes(audienceOverlay.id) &&
            proofStrategy.bestFitArchetypes.includes(item.id)
          );
        }) &&
        config.creativeBundles.some((creativeBundle) => {
          return (
            item.compatibleCreativeBundles.includes(creativeBundle.id) &&
            creativeBundle.compatibilityTags.includes(audienceOverlay.id) &&
            creativeBundle.compatibilityTags.includes(item.id)
          );
        })
      );
    },
    random,
    label: 'homepageArchetypes',
  });
  const promiseAngle = pickCompatibleOne({
    items: config.promiseAngles,
    predicate: (item) => {
      return (
        homepageArchetype.compatiblePromiseAngles.includes(item.id) &&
        item.bestFitAudiences.includes(audienceOverlay.id) &&
        item.bestFitArchetypes.includes(homepageArchetype.id)
      );
    },
    random,
    label: 'promiseAngles',
  });
  const proofStrategy = pickCompatibleOne({
    items: config.proofStrategies,
    predicate: (item) => {
      return (
        homepageArchetype.compatibleProofStrategies.includes(item.id) &&
        item.bestFitAudiences.includes(audienceOverlay.id) &&
        item.bestFitArchetypes.includes(homepageArchetype.id)
      );
    },
    random,
    label: 'proofStrategies',
  });
  const creativeBundle = pickCompatibleOne({
    items: config.creativeBundles,
    predicate: (item) => {
      return (
        homepageArchetype.compatibleCreativeBundles.includes(item.id) &&
        item.compatibilityTags.includes(audienceOverlay.id) &&
        item.compatibilityTags.includes(homepageArchetype.id)
      );
    },
    random,
    label: 'creativeBundles',
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
  fileOps,
}) => {
  if (typeof buildPrompt !== 'function') {
    throw new Error('generateHomepagePromptBatch requires a buildPrompt function.');
  }
  validateHomepageFactoryConfig(config);

  const resolvedFileOps = {
    ...defaultFileOps,
    ...fileOps,
  };

  const manifest = [];
  const prompts = [];

  for (let variant = 1; variant <= variants; variant += 1) {
    const random = mulberry32(hashSeed(`${seed}-${variant}`));
    const {
      audienceOverlay,
      homepageArchetype,
      promiseAngle,
      proofStrategy,
      creativeBundle,
    } = selectVariantRecipe({ config, random });
    const selectedReferences = creativeBundle.referenceAnchors.slice(0, 4);
    const selectedLibraries = creativeBundle.inspirationLibraries.slice(0, 2);
    const content = buildPrompt({
      variant,
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

    const manifestEntry = {
      variant,
      fileName,
      seed: `${seed}-${variant}`,
      audienceOverlay: audienceOverlay.id,
      homepageArchetype: homepageArchetype.id,
      promiseAngle: promiseAngle.id,
      proofStrategy: proofStrategy.id,
      creativeDirectionBundle: creativeBundle.id,
      selectedReferences,
      selectedLibraries,
    };

    manifest.push(manifestEntry);
    prompts.push({ fileName, content });
  }

  await publishGeneratedBatch({
    outputDir,
    prompts,
    manifest,
    fileOps: resolvedFileOps,
  });

  return { manifest, prompts };
};
