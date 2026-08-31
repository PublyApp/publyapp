import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { checkFeatureAncestry } from './feature-ancestry.ts';

const git = (rootDir: string, args: string[]): string =>
	execFileSync('git', args, {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

// Builds a real repository with two branches: a "develop" commit that is
// NOT an ancestor of "predating" (the branch predates the feature merge).
const buildPredatingRepo = async (): Promise<{
	developTip: string;
	rootDir: string;
}> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-1726-'));

	git(rootDir, ['init', '-b', 'predating']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	// Initial commit shared by both branches.
	execFileSync('git', ['commit', '--allow-empty', '-m', 'initial'], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	// develop advances WITH the feature commit; predating stays behind —
	// so developTip is NOT an ancestor of predating.
	git(rootDir, ['checkout', '-b', 'develop']);
	execFileSync('git', ['commit', '--allow-empty', '-m', 'feature (#1457)'], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	const developTip = git(rootDir, ['rev-parse', 'HEAD']).trim();
	git(rootDir, ['checkout', 'predating']);

	return { developTip, rootDir };
};

test('GREEN: feature commit is an ancestor of the current branch', () => {
	const tip = execFileSync('git', ['rev-parse', 'HEAD'], {
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	}).trim();

	assert.doesNotThrow(
		() => checkFeatureAncestry(tip, 'test-feature'),
		'a commit is always an ancestor of itself',
	);
});

test('RED: predating branch fails loud naming the feature and remedy', async () => {
	const { developTip, rootDir } = await buildPredatingRepo();

	try {
		assert.throws(
			() =>
				checkFeatureAncestry(developTip, 'publish-now (#1457)', {
					cwd: rootDir,
				}),
			(err) => {
				const message = err instanceof Error ? err.message : String(err);
				return (
					/older than the .* merge/.test(message) &&
					/Rebase/.test(message) &&
					/publish-now/.test(message)
				);
			},
			'a predating branch must fail loud naming the situation',
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

// Real git artifact work (clone of a file:// source, branch surgery) can
// exceed vitest's 5000ms default on a busy machine — the front suite's own
// budget policy (W6-FLAKE) exists for exactly this. The assertions below are
// the point; the budget is just a clock-independent allowance.
const GIT_ARTIFACT_TEST_TIMEOUT = 30_000;

const writeFixtureFile = async (
	rootDir: string,
	relativePath: string,
	contents: string,
): Promise<void> => {
	const absolute = path.join(rootDir, relativePath);
	await mkdir(path.dirname(absolute), { recursive: true });
	await writeFile(absolute, contents);
};

// #2009 paired proof, case 1: a GENUINE shallow clone (the same shape
// check-shallow-repo.test.ts builds) whose visible history does NOT contain
// the chosen commit (the source's first commit, truncated away by
// --depth 1). The old helper read `git merge-base --is-ancestor <sha> HEAD`
// as "not an ancestor" when git rejected the sha entirely (exit 128), so it
// reported a stale branch and told the author to rebase — a rebase cannot
// fetch a commit the checkout never had. The new helper must separate the
// two cases: absent commit → name the missing history and the fetch remedy.
const buildShallowCloneMissingCommit = async (): Promise<{
	source: string;
	clone: string;
	missingCommit: string;
}> => {
	const source = await mkdtemp(path.join(os.tmpdir(), 'publyapp-2009-source-'));

	git(source, ['init', '-b', 'main']);
	git(source, ['config', 'user.name', 'Proof Runner']);
	git(source, ['config', 'user.email', 'proof@test.local']);

	await writeFixtureFile(source, 'first.md', 'first commit\n');
	git(source, ['add', 'first.md']);
	git(source, ['commit', '-m', 'first']);
	const missingCommit = git(source, ['rev-parse', 'HEAD']).trim();

	await writeFixtureFile(source, 'second.md', 'second commit\n');
	git(source, ['add', 'second.md']);
	git(source, ['commit', '-m', 'second']);

	const clone = await mkdtemp(path.join(os.tmpdir(), 'publyapp-2009-clone-'));

	execFileSync('git', ['clone', '--depth', '1', `file://${source}`, clone], {
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	assert.equal(
		git(clone, ['rev-parse', '--is-shallow-repository']).trim(),
		'true',
		'the clone must be genuinely shallow',
	);

	return { source, clone, missingCommit };
};

// #2009 paired proof, case 2: a full repository that DOES contain the chosen
// commit — on a sibling branch, NOT as an ancestor of HEAD. Both the old and
// the new helper must keep failing with the not-an-ancestor message and the
// rebase remedy, because here the branch really does predate the merge.
const buildSiblingBranchRepo = async (): Promise<{
	rootDir: string;
	siblingCommit: string;
}> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-2009-side-'));

	git(rootDir, ['init', '-b', 'main']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	await writeFixtureFile(rootDir, 'main.md', 'main work\n');
	git(rootDir, ['add', 'main.md']);
	git(rootDir, ['commit', '-m', 'main-1']);

	git(rootDir, ['checkout', '-b', 'side']);
	await writeFixtureFile(rootDir, 'side.md', 'feature work\n');
	git(rootDir, ['add', 'side.md']);
	git(rootDir, ['commit', '-m', 'feature (#1457)']);
	const siblingCommit = git(rootDir, ['rev-parse', 'HEAD']).trim();

	// main advances past the fork point, so the feature commit is present
	// in the repository but NOT an ancestor of HEAD.
	git(rootDir, ['checkout', 'main']);
	await writeFixtureFile(rootDir, 'main.md', 'main work, continued\n');
	git(rootDir, ['add', 'main.md']);
	git(rootDir, ['commit', '-m', 'main-2']);

	return { rootDir, siblingCommit };
};

// This test is RED against the OLD helper (which answers "older than the
// merge" to a missing commit) and GREEN against the NEW one: the missing-
// history branch of the guard must name the absent commit and the fetch
// remedy, and must never tell the author to rebase.
test(
	'RED: shallow checkout without the commit fails loud naming the missing history and the fetch remedy',
	async () => {
		const { source, clone, missingCommit } =
			await buildShallowCloneMissingCommit();

		try {
			assert.throws(
				() =>
					checkFeatureAncestry(missingCommit, 'publish-now (#1457)', {
						cwd: clone,
					}),
				(err) => {
					const message = err instanceof Error ? err.message : String(err);
					return (
						/no history/.test(message) &&
						/fetch/.test(message) &&
						!/older than/.test(message) &&
						!/Rebase/.test(message) &&
						/publish-now/.test(message)
					);
				},
				'a checkout that has never seen the commit must name the missing history and the fetch remedy, never the branch-age story',
			);
		} finally {
			await rm(source, { recursive: true, force: true });
			await rm(clone, { recursive: true, force: true });
		}
	},
	GIT_ARTIFACT_TEST_TIMEOUT,
);

// The preserved case: the commit IS present but NOT an ancestor. The current
// "older than the merge / rebase" message is correct here, and both helpers
// must keep producing it — this pins that the new absent-commit branch did
// not swallow the genuine predating case.
test(
	'RED: checkout with the commit on a sibling branch still fails as not-an-ancestor',
	async () => {
		const { rootDir, siblingCommit } = await buildSiblingBranchRepo();

		try {
			assert.throws(
				() =>
					checkFeatureAncestry(siblingCommit, 'publish-now (#1457)', {
						cwd: rootDir,
					}),
				(err) => {
					const message = err instanceof Error ? err.message : String(err);
					return (
						/older than the .* merge/.test(message) &&
						/Rebase/.test(message) &&
						/publish-now/.test(message)
					);
				},
				'a present-but-not-ancestor commit must keep the not-an-ancestor message with the rebase remedy',
			);
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	},
	GIT_ARTIFACT_TEST_TIMEOUT,
);

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../..',
);

// #2000: the pairing pin. `checkFeatureAncestry` NEEDS the publish-now commit
// (ef8a43d83) in the e2e checkout; front-e2e.yml's `test` job is the only
// thing that provides it. A guard that needs history and a job that checks
// out shallow are two files nobody compares — this test reads the REAL
// front-e2e.yml (never a fixture) and pins both sides: the `test` job checks
// out at fetch-depth: 0, AND that job is exactly the one that runs the spec
// importing the guard. Removing the depth or setting it to 1 turns this test
// red, naming the workflow file and the step.
//
// Line-based extraction: the workflow's YAML is parsed structurally by
// packages/scripts-ts (check-ci-drift.ts); here the point is to assert REAL
// lines of the REAL file, so a structural change breaks extraction loudly
// instead of being silently accepted.
const extractTestJobStepBlocks = (workflowText: string) => {
	const lines = workflowText.split('\n');
	const isJobHeader = (line: string) =>
		/^  [a-zA-Z][a-zA-Z0-9_-]*:\s*$/.test(line);

	const testJobIndex = lines.findIndex((line) => /^  test:\s*$/.test(line));
	assert.ok(testJobIndex !== -1, 'front-e2e.yml must declare a "test" job');

	const relativeEnd = lines
		.slice(testJobIndex + 1)
		.findIndex((line) => isJobHeader(line));
	const sectionEnd =
		relativeEnd === -1 ? lines.length : testJobIndex + 1 + relativeEnd;

	const section = lines.slice(testJobIndex + 1, sectionEnd);
	const stepsIndex = section.findIndex((line) => /^    steps:\s*$/.test(line));
	assert.ok(
		stepsIndex !== -1,
		'front-e2e.yml test job must contain a "steps" array',
	);

	const stepBlocks: Record<string, string> = {};
	let currentName: string | null = null;
	let currentLines: string[] = [];

	const flush = () => {
		if (currentName !== null) {
			stepBlocks[currentName] = currentLines.join('\n');
		}
		currentLines = [];
	};

	for (const line of section.slice(stepsIndex + 1)) {
		const nameMatch = /^      - name: (.+?)\s*$/.exec(line);
		if (nameMatch !== null) {
			flush();
			currentName = nameMatch[1];
			currentLines = [];
		} else if (currentName !== null) {
			currentLines.push(line);
		}
	}
	flush();

	return stepBlocks;
};

test('GREEN: front-e2e test job checks out full history so feature-ancestry can resolve the publish-now commit (#2000)', async () => {
	const workflowText = await readFile(
		path.join(repoRoot, '.github/workflows/front-e2e.yml'),
		'utf8',
	);
	const stepBlocks = extractTestJobStepBlocks(workflowText);

	const checkout = stepBlocks['Checkout'];
	assert.ok(
		checkout !== undefined,
		'front-e2e.yml test job must contain a "Checkout" step',
	);
	assert.match(
		checkout,
		/uses: actions\/checkout@/,
		'the test job checkout must use actions/checkout',
	);
	assert.match(
		checkout,
		/fetch-depth: 0/,
		'the test job must check out FULL history (fetch-depth: 0): checkFeatureAncestry needs the publish-now commit (ef8a43d83) present in the e2e checkout — a depth-1 clone made the guard misreport the branch as stale and front-e2e went red 4/4 (#2009). Removing the depth or setting it to 1 is exactly the regression this pairing pins.',
	);

	// The guard is invoked from that SAME job: the publish-now spec runs
	// under the chromium project of the playwright step in the test job.
	const playwright = stepBlocks['Run playwright browser tests'];
	assert.ok(
		playwright !== undefined,
		'front-e2e.yml test job must contain the "Run playwright browser tests" step',
	);
	assert.match(
		playwright,
		/--project=chromium/,
		'the publish-now spec must run under the playwright chromium project in the test job',
	);

	const specText = await readFile(
		path.join(repoRoot, 'apps/front/e2e/tenant-posts-publish-now.spec.ts'),
		'utf8',
	);
	assert.match(
		specText,
		/checkFeatureAncestry\('ef8a43d83', 'publish-now \(#1457\)'\)/,
		'the publish-now spec must still invoke the ancestry guard at module load',
	);

	const configText = await readFile(
		path.join(repoRoot, 'apps/front/playwright.config.ts'),
		'utf8',
	);
	assert.match(
		configText,
		/testDir: '\.\/e2e'/,
		'the playwright config must discover specs under e2e/',
	);
	assert.doesNotMatch(
		configText,
		/publish-now/,
		'the playwright config must not ignore the publish-now spec — an ignore pattern would silently cut the guard out of the test job',
	);
});
