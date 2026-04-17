#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { generateHomepageBatch } from './homepage-factory/generated-homepage-batch-flow.mjs';

const filePath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(filePath);
const sourceRepoRoot = path.resolve(scriptsDir, '..');
const artifactRepoRoot = process.env.GENERATED_HOMEPAGE_REPO_ROOT
	? path.resolve(process.env.GENERATED_HOMEPAGE_REPO_ROOT)
	: sourceRepoRoot;

const run = async () => {
	const variantsArg = process.argv[2] ?? '24';
	const batchLabelArg =
		process.argv[3] ?? new Date().toISOString().slice(0, 10);

	if (!/^\d+$/.test(variantsArg)) {
		throw new Error('Variants must be an integer between 1 and 200.');
	}

	const variants = Number.parseInt(variantsArg, 10);

	const result = await generateHomepageBatch({
		sourceRepoRoot,
		artifactRepoRoot,
		variants,
		batchLabel: batchLabelArg,
	});

	process.stdout.write(
		`Generated homepage batch "${result.batchLabel}" with ${result.entries.length} variants\n`,
	);

	for (const entry of result.entries) {
		process.stdout.write(
			`- ${entry.routePath} -> ${entry.pageFile} -> ${entry.promptFile}\n`,
		);
	}
};

run().catch((error) => {
	process.stderr.write(`${error.message}\n`);
	process.exit(1);
});
