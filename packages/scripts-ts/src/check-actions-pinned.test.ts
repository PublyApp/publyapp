import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { findUnpinnedActions } from './check-actions-pinned.ts';

// Standing proof that the SHA-pinning guard actually fires.
// Every failure mode it claims to catch gets exercised against a throwaway
// repo, so the guard cannot rot into a check that always returns green.

const makeWorkflow = (steps: string): string =>
	`name: fixture\non:\n  pull_request:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;

/**
 * Builds a throwaway repo with one workflow file and, optionally, composite
 * actions under .github/actions/<name>/action.yml (name may contain slashes
 * to prove the scan is recursive). `extraFiles` writes arbitrary repo-root
 * relative files — used by the #1268 local-action fixtures to place actions
 * OUTSIDE .github/actions.
 */
type FixtureAction = { name: string; content: string };
type ExtraFile = { path: string; content: string };

const buildFixture = async ({
	workflowContent,
	actions = [],
	extraFiles = [],
}: {
	workflowContent: string;
	actions?: FixtureAction[];
	extraFiles?: ExtraFile[];
}): Promise<string> => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-actions-pinned-'),
	);

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflowContent,
	);

	for (const { content, name } of actions) {
		const actionDir = path.join(rootDir, '.github/actions', name);
		await mkdir(actionDir, { recursive: true });
		await writeFile(path.join(actionDir, 'action.yml'), content);
	}

	for (const { path: filePath, content } of extraFiles) {
		const fileDir = path.join(rootDir, filePath, '..');
		await mkdir(fileDir, { recursive: true });
		await writeFile(path.join(rootDir, filePath), content);
	}

	return rootDir;
};

const makeAction = (steps: string): string =>
	`name: 'Fixture composite action'\ndescription: 'fixture'\nruns:\n  using: composite\n  steps:\n${steps}`;

test('passes when all uses: are pinned to full SHAs', async () => {
	const content = makeWorkflow(
		'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});

test('fails when a bare major tag is used', async () => {
	const content = makeWorkflow('      - uses: actions/checkout@v7\n');

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, '.github/workflows/fixture.yml');
	assert.strictEqual(findings[0].line, 8);
	assert.strictEqual(findings[0].uses, 'actions/checkout@v7');
});

test('fails when a bare minor tag is used', async () => {
	const content = makeWorkflow(
		'      - uses: docker/build-push-action@v6.1.0\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].uses, 'docker/build-push-action@v6.1.0');
});

test('reports multiple unpinned actions across steps', async () => {
	const content = makeWorkflow(
		'      - uses: actions/checkout@v7\n' +
			'      - uses: actions/setup-node@v7\n' +
			'      - uses: pnpm/action-setup@v6\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 3);
	assert.strictEqual(findings[0].uses, 'actions/checkout@v7');
	assert.strictEqual(findings[1].uses, 'actions/setup-node@v7');
	assert.strictEqual(findings[2].uses, 'pnpm/action-setup@v6');
});

test('mixed pinned and unpinned lines — only unpinned reported', async () => {
	const content = makeWorkflow(
		'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n' +
			'      - uses: actions/setup-dotnet@v4\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].uses, 'actions/setup-dotnet@v4');
});

test('revert restores green — proof of paired regression', async () => {
	// Phase 1: clean (all pinned)
	const cleanContent = makeWorkflow(
		'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n',
	);
	const rootDir = await buildFixture({ workflowContent: cleanContent });
	const cleanFindings = await findUnpinnedActions({ rootDir });
	assert.deepStrictEqual(cleanFindings, []);

	// Phase 2: dirty (unpin one line)
	const dirtyContent = makeWorkflow('      - uses: actions/checkout@v7\n');
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		dirtyContent,
	);
	const dirtyFindings = await findUnpinnedActions({ rootDir });
	assert.strictEqual(dirtyFindings.length, 1);

	// Phase 3: revert (re-pin) → green again
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		cleanContent,
	);
	const revertedFindings = await findUnpinnedActions({ rootDir });
	assert.deepStrictEqual(revertedFindings, []);
});

test('ignores commented-out uses: lines (YAML comments)', async () => {
	const content = makeWorkflow(
		'      # - uses: actions/checkout@v7\n' +
			'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});

// --- #1255 follow-up 1: pin the trailing-comment abuse case ---

test('fails when a mutable tag carries only a full-SHA trailing comment', async () => {
	// `actions/checkout@v1` is the ref GitHub actually checks out; the 40-hex
	// SHA sits in a YAML comment and pins nothing. The captured ref can never
	// include that SHA — `/uses:\s*(\S+)/` already stops at whitespace — so
	// this test does NOT pin comment-stripping. It pins the abuse-class rule
	// proven by mutation in the r1 review: trusting a 40-hex found anywhere
	// on the line (the one mutation that reds this test alone) must stay a
	// failure, never a silent pass. The commented-out twin of the same
	// pattern doubles as the observable control for comment handling: if
	// stripping ever regresses, the twin leaks into the findings instead of
	// passing silently.
	const shaComment = '3d3c42e5aac5ba805825da76410c181273ba90b1';
	const content = makeWorkflow(
		`      # - uses: actions/checkout@v1 # ${shaComment}\n` +
			`      - uses: actions/checkout@v1 # ${shaComment}\n`,
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	// No `file` assertion here on purpose: the reporting path format changes
	// with the #1255 recursive-scan fix, and this test pins the abuse-case
	// behavior (comment-stripping), not the path format.
	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].line, 9);
	assert.strictEqual(findings[0].uses, 'actions/checkout@v1');
});

// --- #1255 follow-up 2: composite actions under .github/actions ---

test('fails when a composite action uses a bare tag', async () => {
	const content = makeWorkflow('      - uses: ./.github/actions/fixture\n');

	const rootDir = await buildFixture({
		workflowContent: content,
		actions: [
			{
				name: 'fixture',
				content: makeAction('      - uses: actions/setup-node@v7\n'),
			},
		],
	});

	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, '.github/actions/fixture/action.yml');
	assert.strictEqual(findings[0].line, 6);
	assert.strictEqual(findings[0].uses, 'actions/setup-node@v7');
});

test('scans nested .github/actions/**/action.yml recursively', async () => {
	const content = makeWorkflow(
		'      - uses: ./.github/actions/group/nested-fixture\n',
	);

	const rootDir = await buildFixture({
		workflowContent: content,
		actions: [
			{
				name: 'group/nested-fixture',
				content: makeAction('      - uses: pnpm/action-setup@v6\n'),
			},
		],
	});

	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(
		findings[0].file,
		'.github/actions/group/nested-fixture/action.yml',
	);
	assert.strictEqual(findings[0].line, 6);
	assert.strictEqual(findings[0].uses, 'pnpm/action-setup@v6');
});

// --- #1261 round-2 finding 2: only .github/actions may be absent ---
//
// The r1 review proved the blanket `catch (ENOENT) continue` was fail-open:
// with no `.github/workflows` under the root (exactly what the guard sees
// when invoked from the wrong working directory), it printed
// "All uses: references … are pinned" with rc=0 where the pre-#1255 guard
// crashed. A missing workflows dir means the scan certified nothing, so it
// must fail loud; only the composite-actions dir may legitimately be absent
// (a repo can have zero composite actions today).

test('fails closed when .github/workflows is absent (wrong-root misfire)', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-actions-pinned-'),
	);

	await assert.rejects(findUnpinnedActions({ rootDir }), (error) => {
		assert.match((error as Error).message, /\.github\/workflows/);
		return true;
	});
});

test('still fails when .github/actions exists but .github/workflows does not', async () => {
	// Order-independence: the tolerance for a missing actions dir must not
	// swallow a missing workflows dir, whichever one is absent.
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-actions-pinned-'),
	);

	const actionDir = path.join(rootDir, '.github/actions/pinned');
	await mkdir(actionDir, { recursive: true });
	await writeFile(
		path.join(actionDir, 'action.yml'),
		makeAction(
			'      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\n',
		),
	);

	await assert.rejects(findUnpinnedActions({ rootDir }), (error) => {
		assert.match((error as Error).message, /\.github\/workflows/);
		return true;
	});
});

test('tolerates an absent .github/actions (no composite actions yet)', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-actions-pinned-'),
	);

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		makeWorkflow(
			'      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n',
		),
	);

	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});

test('passes when every composite action step is pinned', async () => {
	const content = makeWorkflow('      - uses: ./.github/actions/fixture\n');

	const rootDir = await buildFixture({
		workflowContent: content,
		actions: [
			{
				name: 'fixture',
				content: makeAction(
					'      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\n' +
						'      - uses: docker://alpine@sha256:6457d53fb065d6f250e1504b9bc42d5b6c12950f3e2bb2611d13bbca9a4b7c58\n',
				),
			},
		],
	});

	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});

// --- r3 hardening: fail-closed on undecidable / mutable non-action refs ---

test('fails when a uses: value has no @ref at all', async () => {
	// Undecidable input must never pass silently.
	const content = makeWorkflow(
		'      - uses: some-owner/some-action-without-ref\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, '.github/workflows/fixture.yml');
	assert.strictEqual(findings[0].line, 8);
	assert.strictEqual(findings[0].uses, 'some-owner/some-action-without-ref');
});

test('fails when a docker:// image has no digest pin', async () => {
	const content = makeWorkflow('      - uses: docker://alpine:3.20\n');

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, '.github/workflows/fixture.yml');
	assert.strictEqual(findings[0].line, 8);
	assert.strictEqual(findings[0].uses, 'docker://alpine:3.20');
});

test('passes when a docker:// image is pinned by sha256 digest', async () => {
	const content = makeWorkflow(
		'      - uses: docker://alpine@sha256:6457d53fb065d6f250e1504b9bc42d5b6c12950f3e2bb2611d13bbca9a4b7c58\n',
	);

	const rootDir = await buildFixture({ workflowContent: content });
	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});

// --- #1268: local `uses: ./<path>` actions are resolved to their action
// manifest, scanned with the same line rule, and must exist (fail closed).
// A local action living OUTSIDE .github/actions is exactly the gap this
// closes: GitHub allows `uses: ./<any-path-in-repo>`.

test('resolves and scans an out-of-tree local action holding an unpinned ref', async () => {
	// Round-1 adversarial repro from #1268: `tools/probe-action/action.yml`
	// with an unpinned ref, referenced as `uses: ./tools/probe-action`, used
	// to stay green because every `./` value was exempt.
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/probe-action\n'),
		extraFiles: [
			{
				path: 'tools/probe-action/action.yml',
				content: makeAction('      - uses: actions/setup-node@v7\n'),
			},
		],
	});

	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, 'tools/probe-action/action.yml');
	assert.strictEqual(findings[0].line, 6);
	assert.strictEqual(findings[0].uses, 'actions/setup-node@v7');
});

test('stays green when an out-of-tree local action is fully pinned', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/probe-action\n'),
		extraFiles: [
			{
				path: 'tools/probe-action/action.yml',
				content: makeAction(
					'      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\n',
				),
			},
		],
	});

	const findings = await findUnpinnedActions({ rootDir });

	assert.deepStrictEqual(findings, []);
});

test('scans nested local-action references recursively', async () => {
	// Action A references local action B; B holds an unpinned ref. The scan
	// must follow A → B and report against B's own file.
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/outer\n'),
		extraFiles: [
			{
				path: 'tools/outer/action.yml',
				content: makeAction('      - uses: ./tools/outer/inner\n'),
			},
			{
				path: 'tools/outer/inner/action.yml',
				content: makeAction('      - uses: pnpm/action-setup@v6\n'),
			},
		],
	});

	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, 'tools/outer/inner/action.yml');
	assert.strictEqual(findings[0].uses, 'pnpm/action-setup@v6');
});

test('fails closed when a referenced local action has no action.yml', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/ghost-action\n'),
	});

	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, '.github/workflows/fixture.yml');
	assert.strictEqual(findings[0].line, 8);
	assert.match(findings[0].uses, /^\.\/tools\/ghost-action/);
	assert.match(findings[0].reason ?? '', /action\.yml/);
});

test('fails closed when a nested local reference points outside the repository', async () => {
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/outer\n'),
		extraFiles: [
			{
				path: 'tools/outer/action.yml',
				content: makeAction('      - uses: ../outside-repo\n'),
			},
		],
	});

	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, 'tools/outer/action.yml');
	assert.match(findings[0].uses, /^\.\.\/outside-repo/);
	assert.match(findings[0].reason ?? '', /outside/);
});

test('local action cycles terminate via the visited set', async () => {
	// cycle-a carries an unpinned ref AND a back-reference to cycle-b, which
	// points straight back. The scan must terminate (visited set) and still
	// report the unpinned ref exactly once.
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/cycle-a\n'),
		extraFiles: [
			{
				path: 'tools/cycle-a/action.yml',
				content:
					makeAction('      - uses: actions/setup-node@v7\n') +
					'      - uses: ./tools/cycle-b\n',
			},
			{
				path: 'tools/cycle-b/action.yml',
				content: makeAction('      - uses: ./tools/cycle-a\n'),
			},
		],
	});

	// Completing at all proves termination; the exact finding proves the
	// visited set neither drops nor duplicates work inside the cycle.
	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, 'tools/cycle-a/action.yml');
	assert.strictEqual(findings[0].uses, 'actions/setup-node@v7');
});

test('self-referencing local action terminates', async () => {
	// The self-reference plus an unpinned ref in the same file: termination
	// (the test completes) and exactly-one-finding (no duplicate judgment of
	// the revisited file) together pin the visited set.
	const rootDir = await buildFixture({
		workflowContent: makeWorkflow('      - uses: ./tools/self-loop\n'),
		extraFiles: [
			{
				path: 'tools/self-loop/action.yml',
				content:
					makeAction('      - uses: pnpm/action-setup@v6\n') +
					'      - uses: ./tools/self-loop\n',
			},
		],
	});

	const findings = await findUnpinnedActions({ rootDir });

	assert.strictEqual(findings.length, 1);
	assert.strictEqual(findings[0].file, 'tools/self-loop/action.yml');
	assert.strictEqual(findings[0].uses, 'pnpm/action-setup@v6');
});
