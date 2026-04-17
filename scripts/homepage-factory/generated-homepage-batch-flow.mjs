import path from 'node:path';

import { prepareGeneratedHomepageBatch } from './generated-homepage-batches.mjs';
import {
	buildHomepagePromptBatchArtifacts,
	loadHomepageFactoryConfig,
} from './generator.mjs';
import {
	GENERATED_PROMPT_BATCHES_RELATIVE_DIR,
	normalizeHomepageBatchLabel,
	resolvePromptBatchArchiveFolder,
	writePromptBatchArchive,
} from './prompt-batch-archive.mjs';
import { buildHomepagePrompt } from './prompt-template.mjs';

const toPosixRelativePath = (repoRoot, targetPath) => {
	return path.relative(repoRoot, targetPath).split(path.sep).join('/');
};

export const generateHomepageBatch = async ({
	sourceRepoRoot,
	artifactRepoRoot = sourceRepoRoot,
	variants = 24,
	batchLabel = new Date().toISOString().slice(0, 10),
	now = () => new Date().toISOString(),
}) => {
	const normalizedBatchLabel = normalizeHomepageBatchLabel(batchLabel);
	const createdAt = now();
	const factoryDir = path.join(sourceRepoRoot, 'scripts/homepage-factory');
	const config = await loadHomepageFactoryConfig({ factoryDir });
	const promptArtifacts = buildHomepagePromptBatchArtifacts({
		config,
		variants,
		seed: normalizedBatchLabel,
		buildPrompt: buildHomepagePrompt,
	});
	const batchesDir = path.join(
		artifactRepoRoot,
		GENERATED_PROMPT_BATCHES_RELATIVE_DIR,
	);
	const archiveFolder = await resolvePromptBatchArchiveFolder({
		batchesDir,
		batchLabel: normalizedBatchLabel,
	});
	const pageBatch = await prepareGeneratedHomepageBatch({
		repoRoot: artifactRepoRoot,
		variants,
		batchLabel: normalizedBatchLabel,
		now: () => createdAt,
	});

	if (promptArtifacts.manifest.length !== pageBatch.createdEntries.length) {
		throw new Error(
			'Generated prompt artifacts and generated homepage entries must have matching lengths.',
		);
	}

	const entries = promptArtifacts.manifest.map((manifestEntry, index) => {
		const pageEntry = pageBatch.createdEntries[index];
		const pageFile = toPosixRelativePath(
			artifactRepoRoot,
			path.join(pageBatch.pagesDir, pageEntry.fileName),
		);
		const promptFile = `docs/misc/homepage-factory/generated-prompts/batches/${archiveFolder}/${manifestEntry.fileName}`;

		return {
			...manifestEntry,
			id: pageEntry.id,
			generatedHomepageId: pageEntry.id,
			routePath: pageEntry.routePath,
			pageFile,
			promptFile,
		};
	});

	const archive = await writePromptBatchArchive({
		repoRoot: artifactRepoRoot,
		batchLabel: normalizedBatchLabel,
		archiveFolder,
		seed: normalizedBatchLabel,
		createdAt,
		prompts: promptArtifacts.prompts,
		entries,
	});

	return {
		batchLabel: normalizedBatchLabel,
		archiveFolder,
		createdAt,
		entries,
		batchManifestPath: archive.batchManifestPath,
		runtimeManifestPath: pageBatch.manifestPath,
	};
};
