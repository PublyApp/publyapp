import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..');
const script = path.join(scriptsDirectory, 'deploy-images.mjs');
const dokployComposePath = path.join(repositoryRoot, 'dokploy.yml');

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
				path.join(context, 'apps/front/Dockerfile'),
				'-t',
				`ghcr.io/radandevist/publyapp/front:${sha}`,
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
				`ghcr.io/radandevist/publyapp/front:${sha}`,
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

// A mismatch here is invisible until a deploy fails: dokploy.yml pins the image
// Dokploy pulls, and this script builds and pushes the image under test. If the
// two names ever disagree, the next deploy pulls a tag that was never pushed.
test('every image name deploy-images.mjs builds and pushes appears in dokploy.yml', () => {
	const result = run(['--dry-run', 'HEAD']);
	assert.equal(result.status, 0, result.stderr);

	const pushedImageRoots = [
		...result.stdout.matchAll(/^==> docker push (\S+):[0-9a-f]{40}$/gm),
	].map((match) => match[1]);
	assert.ok(
		pushedImageRoots.length >= 3,
		`expected at least 3 pushed images in dry-run output, got: ${JSON.stringify(pushedImageRoots)}`,
	);

	const dokployCompose = readFileSync(dokployComposePath, 'utf8');

	for (const imageRoot of pushedImageRoots) {
		assert.ok(
			dokployCompose.includes(`${imageRoot}:`),
			`dokploy.yml does not reference "${imageRoot}", which deploy-images.mjs builds and pushes. ` +
				'The built image name and the deployed image name must match, or the next deploy pulls a tag that was never pushed.',
		);
	}
});
