#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  generateHomepagePromptBatch,
  loadHomepageFactoryConfig,
} from './homepage-factory/generator.mjs';
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
