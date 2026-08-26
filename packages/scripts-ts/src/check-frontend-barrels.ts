import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ignoredSegments = new Set([
	'.git',
	'.react-router',
	'.turbo',
	'build',
	'dist',
	'node_modules',
]);

export const allowedFrontendIndexFiles = [
	'apps/front/src/components/app-shell/index.ts',
	'apps/front/src/components/field/index.ts',
];

// @ts-expect-error rung-0: add proper type in later rung
const toPosixPath = (value) => value.split(path.sep).join('/');

// @ts-expect-error rung-0: add proper type in later rung
const getRelativePath = (rootDir, filePath) => {
	return toPosixPath(path.relative(rootDir, filePath));
};

// @ts-expect-error rung-0: add proper type in later rung
const isFrontendIndexFile = (relativePath) => {
	return (
		relativePath.startsWith('apps/front/src/') &&
		!relativePath.startsWith('apps/front/src/routes/') &&
		(relativePath.endsWith('/index.ts') || relativePath.endsWith('/index.tsx'))
	);
};

const scanDirectory = async ({
	// @ts-expect-error rung-0: add proper type in later rung
	directoryPath,
	// @ts-expect-error rung-0: add proper type in later rung
	rootDir,
	// @ts-expect-error rung-0: add proper type in later rung
	allowedFiles,
	// @ts-expect-error rung-0: add proper type in later rung
	findings,
}) => {
	const entries = await readdir(directoryPath, { withFileTypes: true });

	for (const entry of entries) {
		if (ignoredSegments.has(entry.name)) {
			continue;
		}

		const entryPath = path.join(directoryPath, entry.name);

		if (entry.isDirectory()) {
			await scanDirectory({
				directoryPath: entryPath,
				rootDir,
				allowedFiles,
				findings,
			});
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		const relativePath = getRelativePath(rootDir, entryPath);

		if (isFrontendIndexFile(relativePath) && !allowedFiles.has(relativePath)) {
			findings.push(relativePath);
		}
	}
};

export const findDisallowedFrontendBarrels = async ({
	rootDir = process.cwd(),
	allowedFiles = new Set(allowedFrontendIndexFiles),
} = {}) => {
	// @ts-expect-error rung-0: TS7034
	const findings = [];
	const frontendSourceRoot = path.join(rootDir, 'apps/front/src');

	await scanDirectory({
		directoryPath: frontendSourceRoot,
		rootDir,
		allowedFiles,
		// @ts-expect-error rung-0: TS7005
		findings,
	});

	// @ts-expect-error rung-0: TS7005
	return findings.sort((left, right) => left.localeCompare(right));
};

const parseRootDir = () => {
	const rootIndex = process.argv.indexOf('--root');

	if (rootIndex === -1) {
		return process.cwd();
	}

	const rootDir = process.argv[rootIndex + 1];

	if (!rootDir) {
		throw new Error('Missing value for --root');
	}

	return path.resolve(rootDir);
};

const isDirectRun = () => {
	return process.argv[1] === fileURLToPath(import.meta.url);
};

if (isDirectRun()) {
	try {
		const rootDir = parseRootDir();
		const findings = await findDisallowedFrontendBarrels({ rootDir });

		if (findings.length > 0) {
			console.error('Found disallowed hand-written frontend barrel files:');

			for (const finding of findings) {
				console.error(`- ${finding}`);
			}

			console.error('');
			console.error(
				'Prefer direct imports. Add an allowlist entry only for an intentional documented facade.',
			);
			process.exit(1);
		}

		console.log('No disallowed hand-written frontend barrel files found.');
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
