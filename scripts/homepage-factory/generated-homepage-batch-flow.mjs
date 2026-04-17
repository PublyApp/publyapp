import {
	access,
	mkdir,
	readdir,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
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
const GENERATED_HOMEPAGE_PAGES_RELATIVE_DIR =
	'apps/front/src/generated/homepage-gen/pages';

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

const readFileSnapshot = async (filePath) => {
	if (!(await pathExists(filePath))) {
		return {
			existed: false,
			content: null,
		};
	}

	return {
		existed: true,
		content: await readFile(filePath, 'utf8'),
	};
};

const readDirectorySnapshot = async (directoryPath) => {
	if (!(await pathExists(directoryPath))) {
		return {
			existed: false,
			entryNames: [],
		};
	}

	return {
		existed: true,
		entryNames: await readdir(directoryPath),
	};
};

const restoreFileSnapshot = async (filePath, snapshot) => {
	if (!snapshot.existed) {
		await rm(filePath, { force: true });

		return;
	}

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, snapshot.content, 'utf8');
};

const rollbackPromptArchiveArtifacts = async ({
	archiveDir,
	batchIndexPath,
	batchIndexSnapshot,
}) => {
	await rm(archiveDir, { recursive: true, force: true });
	await restoreFileSnapshot(batchIndexPath, batchIndexSnapshot);
};

const rollbackGeneratedHomepageArtifacts = async ({
	pagesDir,
	pagesDirSnapshot,
	runtimeManifestPath,
	runtimeManifestSnapshot,
}) => {
	if (!pagesDirSnapshot.existed) {
		await rm(pagesDir, { recursive: true, force: true });
	} else if (await pathExists(pagesDir)) {
		const currentEntryNames = await readdir(pagesDir);
		const baselineEntryNames = new Set(pagesDirSnapshot.entryNames);

		for (const entryName of currentEntryNames) {
			if (!baselineEntryNames.has(entryName)) {
				await rm(path.join(pagesDir, entryName), {
					force: true,
					recursive: true,
				});
			}
		}
	}

	await restoreFileSnapshot(runtimeManifestPath, runtimeManifestSnapshot);
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
	const archiveDir = path.join(batchesDir, archiveFolder);
	const batchIndexPath = path.join(batchesDir, 'index.json');
	const seed = archiveFolder;
	const config = await loadHomepageFactoryConfig({ factoryDir });
	const promptArtifacts = buildHomepagePromptBatchArtifacts({
		config,
		variants,
		seed,
		buildPrompt: buildHomepagePrompt,
	});
	const runtimeManifestPath = path.join(
		artifactRepoRoot,
		GENERATED_HOMEPAGE_RUNTIME_MANIFEST_RELATIVE_PATH,
	);
	const pagesDir = path.join(
		artifactRepoRoot,
		GENERATED_HOMEPAGE_PAGES_RELATIVE_DIR,
	);
	const [runtimeManifestSnapshot, pagesDirSnapshot, batchIndexSnapshot] =
		await Promise.all([
			readFileSnapshot(runtimeManifestPath),
			readDirectorySnapshot(pagesDir),
			readFileSnapshot(batchIndexPath),
		]);

	try {
		const pageBatch = await prepareGeneratedHomepageBatchImpl({
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
		await rollbackPromptArchiveArtifacts({
			archiveDir,
			batchIndexPath,
			batchIndexSnapshot,
		});
		await rollbackGeneratedHomepageArtifacts({
			pagesDir,
			pagesDirSnapshot,
			runtimeManifestPath,
			runtimeManifestSnapshot,
		});

		throw error;
	}
};
