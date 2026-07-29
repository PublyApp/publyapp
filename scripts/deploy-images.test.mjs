import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..');
const script = path.join(scriptsDirectory, 'deploy-images.mjs');
const dokployComposePath = path.join(repositoryRoot, 'dokploy.yml');
const deployImagesWorkflowPath = path.join(
	repositoryRoot,
	'.github',
	'workflows',
	'deploy-images.yml',
);

const IMAGE_ROOT_PATTERN = /^ghcr\.io\/radandevist\/publyapp\/([^:]+):/;

// The exact set the release chain must agree on. Anything more or less is a
// silent deploy hazard: an extra/renamed publish that nothing pulls, or a
// dokploy service pinned to an image nothing builds.
const EXPECTED_IMAGE_ROOTS = new Set(['api', 'migrate', 'front']);

// Exact per-service ownership. The API image is deliberately shared by two
// services (api + worker); migrate and front are each single-owner. Asserting
// this mapping (not just set membership) is what catches two dokploy services
// having their image roots swapped.
const EXPECTED_SERVICE_IMAGE_ROOTS = {
	'publyapp-api': 'api',
	'publyapp-worker': 'api',
	'publyapp-migrate': 'migrate',
	'publyapp-front': 'front',
};

const extractImageRoot = (image, context) => {
	const match = IMAGE_ROOT_PATTERN.exec(image);
	assert.ok(
		match,
		`${context} image "${image}" does not match ghcr.io/radandevist/publyapp/<root>:<tag>`,
	);
	return match[1];
};

// Splits a step's `with.tags` value into individual tags. A single-line `tags: <one tag>`
// yields one entry; a multi-line `tags: |` block yields one entry per non-blank line — a
// second line appended to that block publishes a second, independent image and must be
// counted as its own tag rather than folded into the step's "one image" total.
const splitTags = (tags) =>
	String(tags)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

const readWorkflowPublishedImageRoots = () => {
	const workflow = parse(readFileSync(deployImagesWorkflowPath, 'utf8'));
	const steps = workflow.jobs?.publish?.steps ?? [];
	const buildSteps = steps.filter(
		(step) =>
			step.uses?.startsWith('docker/build-push-action@') && step.with?.tags,
	);

	assert.ok(
		buildSteps.length > 0,
		`found no docker/build-push-action steps in ${deployImagesWorkflowPath}`,
	);

	return buildSteps.flatMap((step) =>
		splitTags(step.with.tags).map((tag) =>
			extractImageRoot(tag, `workflow step "${step.name}"`),
		),
	);
};

// Enumerates EVERY Dokploy service whose image is a first-party
// ghcr.io/radandevist/publyapp/* reference — it does not look up a fixed list of expected
// service keys, so an added, renamed, or repurposed service shows up in the actual mapping
// and fails the deepEqual comparison against EXPECTED_SERVICE_IMAGE_ROOTS below, instead of
// silently passing because nothing ever asked about it.
const readDokployServiceImageRoots = () => {
	const dokploy = parse(readFileSync(dokployComposePath, 'utf8'));
	const services = dokploy.services ?? {};

	const serviceImageRoots = {};
	for (const [serviceName, service] of Object.entries(services)) {
		const image = service?.image;
		if (typeof image !== 'string' || !IMAGE_ROOT_PATTERN.test(image)) {
			continue;
		}
		serviceImageRoots[serviceName] = extractImageRoot(
			image,
			`dokploy service "${serviceName}"`,
		);
	}

	return serviceImageRoots;
};

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
// Dokploy pulls, this script (the manual/local fallback) builds and pushes it, and
// .github/workflows/deploy-images.yml (the actual release publisher) independently
// builds and pushes it too. All three must agree on the EXACT image set AND on
// EXACT per-service ownership — substring/subset checks let a workflow-only typo,
// a script/workflow drift, or two dokploy services swapping image roots pass silently.
test('the script, the release workflow, and dokploy.yml agree on the exact image set and ownership', () => {
	const result = run(['--dry-run', 'HEAD']);
	assert.equal(result.status, 0, result.stderr);

	const scriptPushedImageRoots = new Set(
		[...result.stdout.matchAll(/^==> docker push (\S+):[0-9a-f]{40}$/gm)].map(
			(match) =>
				extractImageRoot(
					`${match[1]}:placeholder`,
					'deploy-images.mjs dry-run',
				),
		),
	);
	assert.deepEqual(
		scriptPushedImageRoots,
		EXPECTED_IMAGE_ROOTS,
		`deploy-images.mjs pushes ${JSON.stringify([...scriptPushedImageRoots])}, expected exactly ${JSON.stringify([...EXPECTED_IMAGE_ROOTS])}`,
	);

	const workflowPublishedImageRoots = new Set(
		readWorkflowPublishedImageRoots(),
	);
	assert.deepEqual(
		workflowPublishedImageRoots,
		EXPECTED_IMAGE_ROOTS,
		`.github/workflows/deploy-images.yml publishes ${JSON.stringify([...workflowPublishedImageRoots])}, ` +
			`expected exactly ${JSON.stringify([...EXPECTED_IMAGE_ROOTS])}. A workflow-only rename publishes ` +
			'under a name nothing deploys while this guard would otherwise stay green.',
	);

	const dokployServiceImageRoots = readDokployServiceImageRoots();
	assert.deepEqual(
		dokployServiceImageRoots,
		EXPECTED_SERVICE_IMAGE_ROOTS,
		`dokploy.yml service->image mapping is ${JSON.stringify(dokployServiceImageRoots)}, expected exactly ` +
			`${JSON.stringify(EXPECTED_SERVICE_IMAGE_ROOTS)}. Exact per-service assertions (not just set ` +
			'membership) are required to catch two services swapping image roots.',
	);

	const dokployImageRoots = new Set(Object.values(dokployServiceImageRoots));
	assert.deepEqual(
		dokployImageRoots,
		EXPECTED_IMAGE_ROOTS,
		`dokploy.yml references image roots ${JSON.stringify([...dokployImageRoots])}, expected exactly ` +
			`${JSON.stringify([...EXPECTED_IMAGE_ROOTS])} — reverse-checks that no dokploy service references ` +
			'an image nothing builds.',
	);
});
