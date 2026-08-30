import { spawnSync } from 'node:child_process';
import {
	existsSync,
	readFileSync,
	readdirSync,
	realpathSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createGitIgnoreChecker } from './git-check-ignore.ts';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(scriptDirectory, '../../..');
const ignoredDirectories = new Set([
	'.git',
	'.output',
	'.turbo',
	'build',
	'dist',
	'node_modules',
]);
// @ts-expect-error rung-0: add proper type in later rung
const compareStrings = (left, right) => {
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}
	return 0;
};

// @ts-expect-error rung-0: add proper type in later rung
const parseArguments = (argumentsList) => {
	let rootDirectory = process.cwd();
	const oxlintArguments = [];

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];

		if (argument === '--root') {
			const nextArgument = argumentsList[index + 1];
			if (nextArgument === undefined) {
				throw new Error('--root requires a directory');
			}
			rootDirectory = nextArgument;
			index += 1;
			continue;
		}

		if (argument.startsWith('--root=')) {
			rootDirectory = argument.slice('--root='.length);
			continue;
		}

		if (
			argument === '--config' ||
			argument === '--tsconfig' ||
			argument === '--type-aware' ||
			argument === '--type-check' ||
			argument.startsWith('--config=') ||
			argument.startsWith('--tsconfig=')
		) {
			throw new Error(
				`${argument} is owned by packages/scripts-ts/src/lint-front.ts and cannot be overridden`,
			);
		}

		oxlintArguments.push(argument);
	}

	return {
		rootDirectory: path.resolve(rootDirectory),
		oxlintArguments,
	};
};

// @ts-expect-error rung-0: add proper type in later rung
const isWithinDirectory = (candidate, directory) => {
	const relativePath = path.relative(directory, candidate);
	return (
		relativePath === '' ||
		(!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
	);
};

// @ts-expect-error rung-0: add proper type in later rung
const getOxlintCommand = (rootDirectory) => {
	const candidates = [
		{
			path: path.resolve(rootDirectory, 'node_modules/.bin/oxlint'),
			repository: rootDirectory,
		},
		{
			path: path.resolve(rootDirectory, 'node_modules/oxlint/bin/oxlint'),
			repository: rootDirectory,
		},
		{
			path: path.resolve(repositoryDirectory, 'node_modules/.bin/oxlint'),
			repository: repositoryDirectory,
		},
		{
			path: path.resolve(repositoryDirectory, 'node_modules/oxlint/bin/oxlint'),
			repository: repositoryDirectory,
		},
	];

	for (const candidate of candidates) {
		if (!existsSync(candidate.path)) {
			continue;
		}

		const resolvedCandidate = realpathSync(candidate.path);

		if (
			isWithinDirectory(resolvedCandidate, candidate.repository) &&
			readFileSync(candidate.path, 'utf8').startsWith('#!/usr/bin/env node')
		) {
			return {
				command: process.execPath,
				prefixArguments: [candidate.path],
			};
		}
	}

	return {
		command: 'pnpm',
		prefixArguments: ['exec', 'oxlint'],
	};
};

// @ts-expect-error rung-0: add proper type in later rung
const findFiles = (
	rootDirectory,
	relativeDirectories,
	extensions,
	gitIgnoreChecker,
) => {
	// @ts-expect-error rung-0: TS7034
	const files = [];

	// @ts-expect-error rung-0: add proper type in later rung
	const visit = (directory) => {
		const entries = readdirSync(directory, { withFileTypes: true }).sort(
			(left, right) => compareStrings(left.name, right.name),
		);

		// One batched `git check-ignore --stdin -z` per tree level (issue
		// #1909): git's ignore set is the authority for what the walk skips,
		// united with the gate's own static list below. Tracked files never
		// match, so committed paths (`apps/api/Generated`, `routeTree.gen.ts`)
		// still reach oxlint unless the static list excludes them.
		const gitIgnoredPaths =
			gitIgnoreChecker === null
				? new Set()
				: gitIgnoreChecker(
						entries.map((entry) => path.join(directory, entry.name)),
					);

		for (const entry of entries) {
			const absolutePath = path.join(directory, entry.name);

			if (gitIgnoredPaths.has(absolutePath)) {
				continue;
			}

			if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
				continue;
			}

			if (entry.isDirectory()) {
				visit(absolutePath);
				continue;
			}

			if (entry.isFile() && extensions.has(path.extname(entry.name))) {
				files.push(absolutePath);
			}
		}
	};

	for (const relativeDirectory of relativeDirectories) {
		const absoluteDirectory = path.resolve(rootDirectory, relativeDirectory);
		if (existsSync(absoluteDirectory)) {
			visit(absoluteDirectory);
		}
	}

	// @ts-expect-error rung-0: TS7005
	return files.sort(compareStrings);
};

// @ts-expect-error rung-0: add proper type in later rung
const formatFiles = (rootDirectory, files) => {
	if (files.length === 0) {
		return ['  (no files)'];
	}

	return files.map(
		// @ts-expect-error rung-0: add proper type in later rung
		(file) =>
			`  ${path.relative(rootDirectory, file).split(path.sep).join('/')}`,
	);
};

// @ts-expect-error rung-0: add proper type in later rung
export const normalizeRelativePath = (relativePath) =>
	relativePath.split('\\').join('/').split(path.sep).join('/');

// @ts-expect-error rung-0: add proper type in later rung
const classifyFiles = (rootDirectory, files, projectRules) => {
	const projects = new Map(
		// @ts-expect-error rung-0: add proper type in later rung
		projectRules.map(({ name, tsconfigPath }) => [
			name,
			{ files: [], tsconfigPath },
		]),
	);

	for (const file of files) {
		const relativePath = normalizeRelativePath(
			path.relative(rootDirectory, file),
		);
		// @ts-expect-error rung-0: add proper type in later rung
		const project = projectRules.find(({ matches }) => matches(relativePath));
		if (project === undefined) {
			throw new Error(`unclassified lint file: ${relativePath}`);
		}
		// @ts-expect-error rung-0: TS2571
		projects.get(project.name).files.push(file);
	}

	return projects;
};

const runOxlint = ({
	// @ts-expect-error rung-0: add proper type in later rung
	configPath,
	// @ts-expect-error rung-0: add proper type in later rung
	files,
	// @ts-expect-error rung-0: add proper type in later rung
	forwardedArguments,
	// @ts-expect-error rung-0: add proper type in later rung
	rootDirectory,
	// @ts-expect-error rung-0: add proper type in later rung
	tsconfigPath,
	// @ts-expect-error rung-0: add proper type in later rung
	typeAware,
}) => {
	const oxlintCommand = getOxlintCommand(rootDirectory);
	const commandArguments = [
		...oxlintCommand.prefixArguments,
		'--config',
		configPath,
		'--format',
		'unix',
		...(typeAware ? ['--tsconfig', tsconfigPath, '--type-aware'] : []),
		...forwardedArguments,
		...files,
	];
	const result = spawnSync(oxlintCommand.command, commandArguments, {
		cwd: repositoryDirectory,
		encoding: 'utf8',
		env: process.env,
	});

	if (result.stdout) {
		process.stdout.write(result.stdout);
	}
	if (result.stderr) {
		process.stderr.write(result.stderr);
	}

	if (result.error) {
		console.error(`Failed to start oxlint: ${result.error.message}`);
		return 1;
	}

	return result.status ?? 1;
};

const runProjects = ({
	// @ts-expect-error rung-0: add proper type in later rung
	configPath,
	// @ts-expect-error rung-0: add proper type in later rung
	forwardedArguments,
	// @ts-expect-error rung-0: add proper type in later rung
	projects,
	// @ts-expect-error rung-0: add proper type in later rung
	rootDirectory,
	// @ts-expect-error rung-0: add proper type in later rung
	typeAware,
}) => {
	let status = 0;
	for (const project of projects) {
		if (project.files.length === 0) {
			continue;
		}
		console.log(`  project ${project.name}:`);
		const projectStatus = runOxlint({
			configPath,
			files: project.files,
			forwardedArguments,
			rootDirectory,
			tsconfigPath: project.tsconfigPath,
			typeAware,
		});
		if (projectStatus !== 0) {
			status = 1;
		}
	}
	return status;
};

// @ts-expect-error rung-0: add proper type in later rung
const createSyntaxConfig = (rootDirectory, configPath) => {
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	const syntaxConfigPath = path.join(
		rootDirectory,
		`.oxlint-syntax-${process.pid}.json`,
	);
	const options = config.options ?? {};
	writeFileSync(
		syntaxConfigPath,
		JSON.stringify({
			...config,
			options: {
				...options,
				typeAware: false,
				typeCheck: false,
			},
		}),
	);

	return syntaxConfigPath;
};

const main = () => {
	const { oxlintArguments, rootDirectory } = parseArguments(
		process.argv.slice(2),
	);
	const configPath = path.join(rootDirectory, '.oxlintrc.json');
	const tsconfigPath = path.join(
		rootDirectory,
		'apps/front/tsconfig.lint.json',
	);
	const frontTsconfigPath = path.join(
		rootDirectory,
		'apps/front/tsconfig.json',
	);
	const sharedTsconfigPath = path.join(
		rootDirectory,
		'packages/shared-ts/tsconfig.json',
	);
	const scriptsTsconfigPath = path.join(
		rootDirectory,
		'packages/scripts-ts/tsconfig.json',
	);

	if (
		![
			configPath,
			tsconfigPath,
			frontTsconfigPath,
			sharedTsconfigPath,
			scriptsTsconfigPath,
		].every(existsSync)
	) {
		throw new Error('expected all explicit lint configs to exist');
	}

	const gitIgnoreChecker = createGitIgnoreChecker(rootDirectory);
	const typeScriptFiles = findFiles(
		rootDirectory,
		['apps/front', 'packages/shared-ts', 'packages/scripts-ts/src'],
		new Set(['.ts', '.tsx']),
		gitIgnoreChecker,
	);
	const javaScriptFiles = findFiles(
		rootDirectory,
		['apps/front', 'packages/shared-ts', 'packages/scripts-ts/src'],
		new Set(['.js', '.mjs', '.cjs']),
		gitIgnoreChecker,
	);

	const typeScriptProjects = classifyFiles(rootDirectory, typeScriptFiles, [
		{
			name: 'front-source',
			// @ts-expect-error rung-0: add proper type in later rung
			matches: (file) => file.startsWith('apps/front/src/'),
			tsconfigPath,
		},
		{
			name: 'front-tooling',
			// @ts-expect-error rung-0: add proper type in later rung
			matches: (file) =>
				file.startsWith('apps/front/') && !file.startsWith('apps/front/src/'),
			tsconfigPath: frontTsconfigPath,
		},
		{
			name: 'shared-ts',
			// @ts-expect-error rung-0: add proper type in later rung
			matches: (file) => file.startsWith('packages/shared-ts/'),
			tsconfigPath: sharedTsconfigPath,
		},
		{
			name: 'scripts',
			// @ts-expect-error rung-0: add proper type in later rung
			matches: (file) => file.startsWith('packages/scripts-ts/src/'),
			tsconfigPath: scriptsTsconfigPath,
		},
	]);

	console.log('type-aware TypeScript:');
	for (const line of formatFiles(rootDirectory, typeScriptFiles)) {
		console.log(line);
	}
	const typeScriptStatus = runProjects({
		configPath,
		forwardedArguments: oxlintArguments,
		projects: [...typeScriptProjects.entries()].map(([name, project]) => ({
			name,
			// @ts-expect-error rung-0: TS2698
			...project,
		})),
		rootDirectory,
		typeAware: true,
	});

	console.log('syntax JavaScript:');
	for (const line of formatFiles(rootDirectory, javaScriptFiles)) {
		console.log(line);
	}
	const javaScriptProjects = classifyFiles(rootDirectory, javaScriptFiles, [
		{
			name: 'front-javascript',
			// @ts-expect-error rung-0: add proper type in later rung
			matches: (file) => file.startsWith('apps/front/'),
			tsconfigPath: frontTsconfigPath,
		},
		{
			name: 'shared-javascript',
			// @ts-expect-error rung-0: add proper type in later rung
			matches: (file) => file.startsWith('packages/shared-ts/'),
			tsconfigPath: sharedTsconfigPath,
		},
		{
			name: 'scripts-javascript',
			// @ts-expect-error rung-0: add proper type in later rung
			matches: (file) => file.startsWith('packages/scripts-ts/src/'),
			tsconfigPath: scriptsTsconfigPath,
		},
	]);

	const syntaxConfigPath = createSyntaxConfig(rootDirectory, configPath);
	let javaScriptStatus = 0;
	try {
		javaScriptStatus = runProjects({
			configPath: syntaxConfigPath,
			forwardedArguments: oxlintArguments,
			projects: [...javaScriptProjects.entries()].map(([name, project]) => ({
				name,
				// @ts-expect-error rung-0: TS2698
				...project,
			})),
			rootDirectory,
			typeAware: false,
		});
	} finally {
		unlinkSync(syntaxConfigPath);
	}

	console.log('type-aware JavaScript:');
	const typeAwareJavaScriptStatus = runProjects({
		configPath,
		forwardedArguments: oxlintArguments,
		projects: [...javaScriptProjects.entries()].map(([name, project]) => ({
			name,
			// @ts-expect-error rung-0: TS2698
			...project,
		})),
		rootDirectory,
		typeAware: true,
	});

	if (
		typeScriptStatus === 0 &&
		javaScriptStatus === 0 &&
		typeAwareJavaScriptStatus === 0
	) {
		return 0;
	}
	return 1;
};

const isDirectRun =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	try {
		process.exitCode = main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
