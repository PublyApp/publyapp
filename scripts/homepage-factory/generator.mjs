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
