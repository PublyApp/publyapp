import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const GENERATED_PROMPT_BATCHES_RELATIVE_DIR =
	'docs/misc/homepage-factory/generated-prompts/batches';

const pathExists = async (targetPath) => {
	try {
		await access(targetPath);

		return true;
	} catch {
		return false;
	}
};

const readJsonArray = async (filePath, label) => {
	if (!(await pathExists(filePath))) {
		return [];
	}

	const value = JSON.parse(await readFile(filePath, 'utf8'));

	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array.`);
	}

	return value;
};

export const normalizeHomepageBatchLabel = (input) => {
	const normalized = input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');

	if (normalized.length === 0) {
		throw new Error(
			'Batch label must contain at least one alphanumeric character after normalization.',
		);
	}

	return normalized;
};

export const resolvePromptBatchArchiveFolder = async ({
	batchesDir,
	batchLabel,
}) => {
	await mkdir(batchesDir, { recursive: true });

	let suffix = 1;

	while (true) {
		const archiveFolder =
			suffix === 1 ? batchLabel : `${batchLabel}-${suffix}`;
		const archivePath = path.join(batchesDir, archiveFolder);

		if (!(await pathExists(archivePath))) {
			return archiveFolder;
		}

		suffix += 1;
	}
};

export const writePromptBatchArchive = async ({
	repoRoot,
	batchLabel,
	archiveFolder,
	seed,
	createdAt,
	prompts,
	entries,
}) => {
	const batchesDir = path.join(repoRoot, GENERATED_PROMPT_BATCHES_RELATIVE_DIR);
	const batchDir = path.join(batchesDir, archiveFolder);
	const batchManifestPath = path.join(batchDir, 'manifest.json');
	const indexPath = path.join(batchesDir, 'index.json');

	await mkdir(batchDir, { recursive: true });

	for (const prompt of prompts) {
		await writeFile(path.join(batchDir, prompt.fileName), prompt.content, 'utf8');
	}

	const batchManifest = {
		batchLabel,
		archiveFolder,
		seed,
		variantCount: entries.length,
		createdAt,
		entries,
	};

	await writeFile(
		batchManifestPath,
		JSON.stringify(batchManifest, null, 2),
		'utf8',
	);

	const index = await readJsonArray(indexPath, 'Prompt batch index');

	index.push({
		batchLabel,
		archiveFolder,
		seed,
		variantCount: entries.length,
		createdAt,
		manifestFile: `docs/misc/homepage-factory/generated-prompts/batches/${archiveFolder}/manifest.json`,
		entryIds: entries.map((entry) => entry.id),
	});

	await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');

	return {
		batchesDir,
		batchDir,
		batchManifestPath,
		indexPath,
		batchManifest,
	};
};
