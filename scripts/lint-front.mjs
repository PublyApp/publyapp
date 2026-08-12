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

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(scriptDirectory, '..');
const ignoredDirectories = new Set([
	'.git',
	'.output',
	'.turbo',
	'build',
	'dist',
	'node_modules',
]);
const compareStrings = (left, right) => {
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}
	return 0;
};

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
				`${argument} is owned by scripts/lint-front.mjs and cannot be overridden`,
			);
		}

		oxlintArguments.push(argument);
	}

	return {
		rootDirectory: path.resolve(rootDirectory),
		oxlintArguments,
	};
};

const isWithinDirectory = (candidate, directory) => {
	const relativePath = path.relative(directory, candidate);
	return (
		relativePath === '' ||
		(!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
	);
};

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

const findFiles = (rootDirectory, relativeDirectories, extensions) => {
	const files = [];

	const visit = (directory) => {
		const entries = readdirSync(directory, { withFileTypes: true }).sort(
			(left, right) => compareStrings(left.name, right.name),
		);

		for (const entry of entries) {
			if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
				continue;
			}

			const absolutePath = path.join(directory, entry.name);
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

	return files.sort(compareStrings);
};

const formatFiles = (rootDirectory, files) => {
	if (files.length === 0) {
		return ['  (no files)'];
	}

	return files.map(
		(file) =>
			`  ${path.relative(rootDirectory, file).split(path.sep).join('/')}`,
	);
};

export const normalizeRelativePath = (relativePath) =>
	relativePath.split('\\').join('/').split(path.sep).join('/');

const classifyFiles = (rootDirectory, files, projectRules) => {
	const projects = new Map(
		projectRules.map(({ name, tsconfigPath }) => [
			name,
			{ files: [], tsconfigPath },
		]),
	);

	for (const file of files) {
		const relativePath = normalizeRelativePath(
			path.relative(rootDirectory, file),
		);
		const project = projectRules.find(({ matches }) => matches(relativePath));
		if (project === undefined) {
			throw new Error(`unclassified lint file: ${relativePath}`);
		}
		projects.get(project.name).files.push(file);
	}

	return projects;
};

const runOxlint = ({
	configPath,
	files,
	forwardedArguments,
	rootDirectory,
	tsconfigPath,
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
	configPath,
	forwardedArguments,
	projects,
	rootDirectory,
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
		'scripts/tsconfig.lint.json',
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

	const typeScriptFiles = findFiles(
		rootDirectory,
		['apps/front', 'packages/shared-ts', 'scripts'],
		new Set(['.ts', '.tsx']),
	);
	const javaScriptFiles = findFiles(
		rootDirectory,
		['apps/front', 'packages/shared-ts', 'scripts'],
		new Set(['.js', '.mjs', '.cjs']),
	);

	const typeScriptProjects = classifyFiles(rootDirectory, typeScriptFiles, [
		{
			name: 'front-source',
			matches: (file) => file.startsWith('apps/front/src/'),
			tsconfigPath,
		},
		{
			name: 'front-tooling',
			matches: (file) =>
				file.startsWith('apps/front/') && !file.startsWith('apps/front/src/'),
			tsconfigPath: frontTsconfigPath,
		},
		{
			name: 'shared-ts',
			matches: (file) => file.startsWith('packages/shared-ts/'),
			tsconfigPath: sharedTsconfigPath,
		},
		{
			name: 'scripts',
			matches: (file) => file.startsWith('scripts/'),
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
			matches: (file) => file.startsWith('apps/front/'),
			tsconfigPath: frontTsconfigPath,
		},
		{
			name: 'shared-javascript',
			matches: (file) => file.startsWith('packages/shared-ts/'),
			tsconfigPath: sharedTsconfigPath,
		},
		{
			name: 'scripts-javascript',
			matches: (file) => file.startsWith('scripts/'),
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
			...project,
		})),
		rootDirectory,
		typeAware: true,
	});

	return typeScriptStatus === 0 &&
		javaScriptStatus === 0 &&
		typeAwareJavaScriptStatus === 0
		? 0
		: 1;
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
