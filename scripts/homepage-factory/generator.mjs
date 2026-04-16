import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

export const loadHomepageFactoryConfig = async ({ factoryDir }) => {
  return {
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
}) => {
  if (typeof buildPrompt !== 'function') {
    throw new Error('buildPrompt must be provided');
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

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

    await writeFile(path.join(outputDir, fileName), content, 'utf8');

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

  await writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  return { manifest, prompts };
};
