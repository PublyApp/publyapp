import { access, readFile, rm, writeFile } from 'node:fs/promises';
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

const GENERATED_HOMEPAGE_RUNTIME_MANIFEST_RELATIVE_PATH =
	'apps/front/src/generated/homepage-gen/manifest.json';

const pathExists = async (targetPath) => {
	try {
		await access(targetPath);

		return true;
	} catch {
		return false;
	}
};

const toPosixRelativePath = (repoRoot, targetPath) => {
	return path.relative(repoRoot, targetPath).split(path.sep).join('/');
};

const readRuntimeManifestSnapshot = async (manifestPath) => {
	if (!(await pathExists(manifestPath))) {
		return {
			existed: false,
			content: null,
		};
	}

	return {
		existed: true,
		content: await readFile(manifestPath, 'utf8'),
	};
};

const rollbackGeneratedHomepageBatch = async ({
	artifactRepoRoot,
	pageBatch,
	runtimeManifestSnapshot,
}) => {
	for (const entry of pageBatch.createdEntries) {
		await rm(path.join(pageBatch.pagesDir, entry.fileName), { force: true });
	}

	const runtimeManifestPath = path.join(
		artifactRepoRoot,
		GENERATED_HOMEPAGE_RUNTIME_MANIFEST_RELATIVE_PATH,
	);

	if (runtimeManifestSnapshot.existed) {
		await writeFile(
			runtimeManifestPath,
			runtimeManifestSnapshot.content,
			'utf8',
		);

		return;
	}

	await rm(runtimeManifestPath, { force: true });
};

export const generateHomepageBatch = async ({
	sourceRepoRoot,
	artifactRepoRoot = sourceRepoRoot,
	variants = 24,
	batchLabel = new Date().toISOString().slice(0, 10),
	now = () => new Date().toISOString(),
	prepareGeneratedHomepageBatchImpl = prepareGeneratedHomepageBatch,
	writePromptBatchArchiveImpl = writePromptBatchArchive,
}) => {
	const normalizedBatchLabel = normalizeHomepageBatchLabel(batchLabel);
	const createdAt = now();
	const factoryDir = path.join(sourceRepoRoot, 'scripts/homepage-factory');
	const batchesDir = path.join(
		artifactRepoRoot,
		GENERATED_PROMPT_BATCHES_RELATIVE_DIR,
	);
	const archiveFolder = await resolvePromptBatchArchiveFolder({
		batchesDir,
		batchLabel: normalizedBatchLabel,
	});
	const seed = archiveFolder;
	const config = await loadHomepageFactoryConfig({ factoryDir });
	const promptArtifacts = buildHomepagePromptBatchArtifacts({
		config,
		variants,
		seed,
		buildPrompt: buildHomepagePrompt,
	});
	const runtimeManifestSnapshot = await readRuntimeManifestSnapshot(
		path.join(
			artifactRepoRoot,
			GENERATED_HOMEPAGE_RUNTIME_MANIFEST_RELATIVE_PATH,
		),
	);
	const pageBatch = await prepareGeneratedHomepageBatchImpl({
		repoRoot: artifactRepoRoot,
		variants,
		batchLabel: normalizedBatchLabel,
		now: () => createdAt,
	});

	try {
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

		const archive = await writePromptBatchArchiveImpl({
			repoRoot: artifactRepoRoot,
			batchLabel: normalizedBatchLabel,
			archiveFolder,
			seed,
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
	} catch (error) {
		await rollbackGeneratedHomepageBatch({
			artifactRepoRoot,
			pageBatch,
			runtimeManifestSnapshot,
		});

		throw error;
	}
};
