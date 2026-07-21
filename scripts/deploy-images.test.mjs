import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..');
const script = path.join(scriptsDirectory, 'deploy-images.mjs');

const formatArgument = (argument) => {
	return argument.length > 0 && !/[\s"']/.test(argument)
		? argument
		: JSON.stringify(argument);
};

const commandLine = (command, ...args) => {
	return `==> ${[command, ...args].map(formatArgument).join(' ')}`;
};

const run = (args) => {
	return spawnSync(process.execPath, [script, ...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
	});
};

const git = (...args) => {
	const result = spawnSync('git', args, {
		cwd: repositoryRoot,
		encoding: 'utf8',
	});

	assert.equal(result.status, 0, result.stderr);
	return result.stdout.trim();
};

test('unknown option exits 2', () => {
	const result = run(['--unknown']);

	assert.equal(result.status, 2);
	assert.match(result.stderr, /Unknown option: --unknown/);
});

test('help exits 0 and prints usage', () => {
	const result = run(['--help']);

	assert.equal(result.status, 0);
	assert.match(result.stdout, /Usage: scripts\/deploy-images\.mjs/);
});

test('dry run prints the resolved SHA and exact worktree, build, and push commands', () => {
	const ref = 'HEAD';
	const sha = git('rev-parse', ref);
	const commonDirectory = git(
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	);
	const mainRepositoryRoot = path.dirname(commonDirectory);
	const context = path.join(
		mainRepositoryRoot,
		'.worktrees',
		`deploy-build-${sha.slice(0, 12)}`,
	);
	const result = run(['--dry-run', ref]);
	const lines = result.stdout.trim().split(/\r?\n/);

	assert.equal(result.status, 0, result.stderr);
	assert.ok(lines.includes(`==> Resolved ${ref} to ${sha}`));
	assert.ok(
		lines.includes(
			commandLine('git', 'worktree', 'add', '--detach', context, sha),
		),
	);
	assert.ok(
		lines.includes(
			commandLine(
				'docker',
				'buildx',
				'build',
				'--load',
				'--platform',
				'linux/amd64',
				'-f',
				path.join(context, 'apps/api/Dockerfile'),
				'--target',
				'runtime',
				'-t',
				`ghcr.io/radandevist/publyapp/api:${sha}`,
				context,
			),
		),
	);
	assert.ok(
		lines.includes(
			commandLine(
				'docker',
				'buildx',
				'build',
				'--load',
				'--platform',
				'linux/amd64',
				'-f',
				path.join(context, 'apps/api/Dockerfile'),
				'--target',
				'migrate',
				'-t',
				`ghcr.io/radandevist/publyapp/migrate:${sha}`,
				context,
			),
		),
	);
	assert.ok(
		lines.includes(
			commandLine(
				'docker',
				'buildx',
				'build',
				'--load',
				'--platform',
				'linux/amd64',
				'-f',
				path.join(context, 'apps/front-2/Dockerfile'),
				'-t',
				`ghcr.io/radandevist/publyapp/front-2:${sha}`,
				context,
			),
		),
	);
	assert.ok(
		lines.includes(
			commandLine('docker', 'push', `ghcr.io/radandevist/publyapp/api:${sha}`),
		),
	);
	assert.ok(
		lines.includes(
			commandLine(
				'docker',
				'push',
				`ghcr.io/radandevist/publyapp/migrate:${sha}`,
			),
		),
	);
	assert.ok(
		lines.includes(
			commandLine(
				'docker',
				'push',
				`ghcr.io/radandevist/publyapp/front-2:${sha}`,
			),
		),
	);
	assert.ok(
		lines.includes(
			commandLine('git', 'worktree', 'remove', '--force', context),
		),
	);
	assert.ok(lines.includes(`RELEASE_TAG=${sha}`));
});

test('bad ref exits 1', () => {
	const ref = 'does-not-exist-deploy-images-test';
	const result = run([ref]);

	assert.equal(result.status, 1);
	assert.match(result.stderr, new RegExp(`Could not resolve git ref: ${ref}`));
});
