import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '../../..');
const script = path.join(scriptsDirectory, 'deploy-images.ts');
const dokployComposePath = path.join(repositoryRoot, 'dokploy.yml');
const deployImagesWorkflowPath = path.join(
	repositoryRoot,
	'.github',
	'workflows',
	'deploy-images.yml',
);

// Matches a first-party ghcr.io/publyapp/publyapp/<root> reference, tagged, digested, or
// bare. Docker resolves a bare reference (no `:tag`) to `:latest` — that is still a real,
// published/pulled image, so it must be collected, not skipped for lack of a colon. The tag
// itself is deliberately NOT part of the contract (only the root is), so `:<tag>` and/or
// `@sha256:<digest>` are optional and their content is not captured.
//
// The root group `([^/:@]+)` stops at the first `/`, `:`, or `@`, and the whole pattern is
// anchored with `$`. That is deliberate on both edges of the widening:
//   - A deeper path segment (`.../publyapp/api/evil:tag`) can never be silently folded into
//     the `api` root: the root group stops before the second `/`, and the trailing `/evil:tag`
//     is not consumable by the optional tag/digest groups, so the `$` anchor fails the whole
//     match. `extractImageRoot` then asserts loudly instead of mis-categorizing it as `api`.
//   - A registry/namespace that merely starts with the same characters (e.g.
//     `ghcr.io/publyapp/publyapp-other/...`) never matches at all: the pattern requires the
//     literal `publyapp/` (with the slash), not just the substring `publyapp`.
const IMAGE_ROOT_PATTERN =
	/^ghcr\.io\/publyapp\/publyapp\/([^/:@]+)(?::[^@]+)?(?:@sha256:[0-9a-f]{64})?$/;

// Broader net used only to decide whether a Dokploy service's image is "first-party enough"
// to require exact IMAGE_ROOT_PATTERN compliance. Anything with this literal prefix must fully
// match IMAGE_ROOT_PATTERN or extractImageRoot fails the test loudly — it is never silently
// treated as an unrelated third-party image and skipped, the way a genuinely unrelated image
// (e.g. a database) legitimately is.
const FIRST_PARTY_IMAGE_PREFIX = 'ghcr.io/publyapp/publyapp/';

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

// @ts-expect-error rung-0: add proper type in later rung
const extractImageRoot = (image, context) => {
	const match = IMAGE_ROOT_PATTERN.exec(image);
	assert.ok(
		match,
		`${context} image "${image}" does not match ghcr.io/publyapp/publyapp/<root>:<tag>`,
	);
	return match[1];
};

// Splits a step's `with.tags` value into individual tags. A single-line `tags: <one tag>`
// yields one entry; a multi-line `tags: |` block yields one entry per non-blank line — a
// second line appended to that block publishes a second, independent image and must be
// counted as its own tag rather than folded into the step's "one image" total.
// @ts-expect-error rung-0: add proper type in later rung
const splitTags = (tags) =>
	String(tags)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

const readWorkflowPublishedImageRoots = () => {
	const workflow = parse(readFileSync(deployImagesWorkflowPath, 'utf8'));
	const steps = workflow.jobs?.publish?.steps ?? [];
	// #1362: the workflow derives its GHCR root from github.repository_owner
	// (lowercased) in the "Resolve lowercase image namespace" step instead of a
	// hardcoded namespace. At rest the workflow's `${{ ... }}` expressions are
	// unevaluated text (`env.OWNER` reads back as the literal placeholder), so
	// the harness evaluates the step the way GitHub would: it injects the
	// origin remote's owner as OWNER and runs the step's own shell against a
	// scratch GITHUB_OUTPUT file. Running the real script (not a re-derivation)
	// means a broken namespace expression fails this guard instead of CI.
	const nsStep = steps.find(
		// @ts-expect-error rung-0: add proper type in later rung
		(step) => step.id === 'ns',
	);
	assert.ok(
		nsStep,
		`found no "Resolve lowercase image namespace" (id: ns) step in ${deployImagesWorkflowPath}`,
	);
	const ownerProbe = spawnSync(
		'git',
		['config', '--get', 'remote.origin.url'],
		{ cwd: repositoryRoot, encoding: 'utf8' },
	);
	assert.ok(
		ownerProbe.status === 0 && ownerProbe.stdout.trim().length > 0,
		`could not read remote.origin.url from ${repositoryRoot}: ${ownerProbe.stderr}`,
	);
	const owner =
		/github\.com[/:]([^/]+)\//i.exec(ownerProbe.stdout)?.[1] ?? undefined;
	assert.ok(
		owner !== undefined,
		`no GitHub owner found in remote.origin.url: ${ownerProbe.stdout}`,
	);
	const githubOutputPath = path.join(
		mkdtempSync(path.join(tmpdir(), 'ns-')),
		'output',
	);
	const nsRun = spawnSync('bash', ['-c', String(nsStep.run)], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env: { ...process.env, OWNER: owner, GITHUB_OUTPUT: githubOutputPath },
	});
	assert.ok(
		nsRun.status === 0,
		`namespace resolution step failed: ${nsRun.stderr}`,
	);
	const rootLine = readFileSync(githubOutputPath, 'utf8')
		.split(/\r?\n/)
		.find((line) => line.startsWith('root='));
	assert.ok(
		rootLine !== undefined,
		`namespace step wrote no root= line to $GITHUB_OUTPUT (${String(nsStep.run)})`,
	);
	const resolvedRoot = rootLine.slice('root='.length);
	// @ts-expect-error rung-0: add proper type in later rung
	const buildSteps = steps.filter(
		// @ts-expect-error rung-0: add proper type in later rung
		(step) =>
			step.uses?.startsWith('docker/build-push-action@') && step.with?.tags,
	);

	assert.ok(
		buildSteps.length > 0,
		`found no docker/build-push-action steps in ${deployImagesWorkflowPath}`,
	);

	// @ts-expect-error rung-0: add proper type in later rung
	return buildSteps.flatMap((step) =>
		splitTags(step.with.tags).map((tag) => {
			// @ts-expect-error rung-0: add proper type in later rung
			const resolved = tag.replaceAll(
				'${{ steps.ns.outputs.root }}',
				resolvedRoot,
			);
			return extractImageRoot(resolved, `workflow step "${step.name}"`);
		}),
	);
};

// Enumerates EVERY Dokploy service whose image is a first-party
// ghcr.io/publyapp/publyapp/* reference — it does not look up a fixed list of expected
// service keys, so an added, renamed, or repurposed service shows up in the actual mapping
// and fails the deepEqual comparison against EXPECTED_SERVICE_IMAGE_ROOTS below, instead of
// silently passing because nothing ever asked about it.
const readDokployServiceImageRoots = () => {
	const dokploy = parse(readFileSync(dokployComposePath, 'utf8'));
	const services = dokploy.services ?? {};

	const serviceImageRoots = {};
	for (const [serviceName, service] of Object.entries(services)) {
		// @ts-expect-error rung-0: TS2339
		const image = service?.image;
		if (
			typeof image !== 'string' ||
			!image.startsWith(FIRST_PARTY_IMAGE_PREFIX)
		) {
			continue;
		}
		// @ts-expect-error rung-0: TS7053
		serviceImageRoots[serviceName] = extractImageRoot(
			image,
			`dokploy service "${serviceName}"`,
		);
	}

	return serviceImageRoots;
};

// @ts-expect-error rung-0: add proper type in later rung
const formatArgument = (argument) => {
	if (argument.length > 0 && !/[\s"']/.test(argument)) {
		return argument;
	}
	return JSON.stringify(argument);
};

// @ts-expect-error rung-0: add proper type in later rung
const commandLine = (command, ...args) => {
	return `==> ${[command, ...args].map(formatArgument).join(' ')}`;
};

// @ts-expect-error rung-0: add proper type in later rung
const run = (args) => {
	return spawnSync(process.execPath, [script, ...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
	});
};

// @ts-expect-error rung-0: TS7019
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
				`ghcr.io/publyapp/publyapp/api:${sha}`,
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
				`ghcr.io/publyapp/publyapp/migrate:${sha}`,
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
				`ghcr.io/publyapp/publyapp/front:${sha}`,
				context,
			),
		),
	);
	assert.ok(
		lines.includes(
			commandLine('docker', 'push', `ghcr.io/publyapp/publyapp/api:${sha}`),
		),
	);
	assert.ok(
		lines.includes(
			commandLine('docker', 'push', `ghcr.io/publyapp/publyapp/migrate:${sha}`),
		),
	);
	assert.ok(
		lines.includes(
			commandLine('docker', 'push', `ghcr.io/publyapp/publyapp/front:${sha}`),
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
