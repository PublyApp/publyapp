#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { prepareGeneratedHomepageBatch } from './homepage-factory/generated-homepage-batches.mjs';

const filePath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(filePath);
const repoRoot = process.env.GENERATED_HOMEPAGE_REPO_ROOT
	? path.resolve(process.env.GENERATED_HOMEPAGE_REPO_ROOT)
	: path.resolve(scriptsDir, '..');

const run = async () => {
	const variantsArg = process.argv[2] ?? '1';
	const batchLabelArg =
		process.argv[3] ?? new Date().toISOString().slice(0, 10);
	const variants = Number.parseInt(variantsArg, 10);

	const result = await prepareGeneratedHomepageBatch({
		repoRoot,
		variants,
		batchLabel: batchLabelArg,
	});

	process.stdout.write(
		`Prepared ${result.createdEntries.length} generated homepage slots in ${path.relative(repoRoot, result.pagesDir)}\n`,
	);

	for (const entry of result.createdEntries) {
		process.stdout.write(
			`- ${entry.routePath} -> ${path.join(path.relative(repoRoot, result.pagesDir), entry.fileName)}\n`,
		);
	}
};

run().catch((error) => {
	process.stderr.write(`${error.message}\n`);
	process.exit(1);
});
