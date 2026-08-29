import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
	classifyRelevance,
	parseChangedFilesTotal,
} from './ci-changed-paths.ts';

// These tests are the standing proof that the changed-path classifier fails
// closed at GitHub's 3,000-file "List pull request files" ceiling, rather
// than silently certifying an incomplete list as "not relevant". See #1017.

const pattern = '^(apps/front/|packages/shared-ts/)';

test('push runs are relevant by construction, without needing file evidence', () => {
	const result = classifyRelevance({
		eventName: 'push',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, true);
});

// ROUND 4: #1017 adds `merge_group:` to all four workflows so their required
// checks can report for a merge-queue entry (GitHub documents that a
// required check missing this event waits forever in a queue). There is no
// pull-request file list to evaluate a merge-queue entry against, so
// merge_group must resolve relevant unconditionally — proven independently
// of the generic "any non-pull_request event" case below, so a future
// change that special-cases `push` without also covering `merge_group`
// cannot pass silently.
test('merge_group runs are relevant by construction, without needing file evidence', () => {
	const result = classifyRelevance({
		eventName: 'merge_group',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /merge_group/);
});

test('merge_group runs are relevant even when files/changedFilesTotal look like a genuinely empty diff', () => {
	// Guards against a future refactor that route merge_group through the
	// same file-list logic as pull_request: even a complete, verified-empty
	// file list must not flip this to false, because merge_group has no file
	// list to evaluate in the first place.
	const result = classifyRelevance({
		eventName: 'merge_group',
		files: [],
		changedFilesTotal: 0,
		pattern: '^(apps/front/)',
	});

	assert.equal(result.relevant, true);
});

test('an arbitrary non-pull_request, non-merge_group event is still relevant by construction (the generic fallback)', () => {
	const result = classifyRelevance({
		eventName: 'workflow_dispatch',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a complete file list containing a relevant path is relevant', () => {
	const files = ['apps/front/src/routes.ts', 'README.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: files.length,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a complete file list with no relevant path is not relevant', () => {
	const files = ['README.md', 'docs/guides/foo.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: files.length,
		pattern,
	});

	assert.equal(result.relevant, false);
});

test('an empty pull request (no files changed) is not relevant', () => {
	const result = classifyRelevance({
		eventName: 'pull_request',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, false);
});

test('BLOCKER: a truncated list that omits the relevant file fails closed to relevant', () => {
	// The exact false-green path from the review: the PR reports far more
	// changed files than the API actually returned (the 3,000-file ceiling),
	// and none of the returned files happen to match. A naive matcher would
	// report relevant=false here and let the heavy job skip.
	const files = ['README.md', 'docs/guides/foo.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 3001,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /incomplete/);
});

test('BLOCKER: exactly the 3,000-file ceiling with the total one over it fails closed', () => {
	const files = Array.from({ length: 3000 }, (_, i) => `docs/file-${i}.md`);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 3001,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a missing changed_files total fails closed rather than assuming completeness', () => {
	const files = ['README.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: undefined,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /missing|not a valid/);
});

test('a non-array file list (malformed API response) fails closed', () => {
	const result = classifyRelevance({
		eventName: 'pull_request',
		files: null,
		changedFilesTotal: 5,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /not an array/);
});

test('a file count that exceeds the reported total also fails closed (anomalous, not just short)', () => {
	const files = ['a.txt', 'b.txt', 'c.txt'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 2,
		pattern,
	});

	assert.equal(result.relevant, true);
});

// ---------------------------------------------------------------------------
// parseChangedFilesTotal(): the exact boundary round 2 found broken. `gh
// api --jq` on a missing property (or a literal `null`) exits 0 with EMPTY
// stdout, and naive `Number('')` is `0` — a fabricated, valid-looking total.
// classifyRelevance() itself was always correct about undefined/null; the
// CLI was handing it a lie instead. These pin the raw-string boundary.
// ---------------------------------------------------------------------------

test('parseChangedFilesTotal: empty stdout (missing changed_files) is invalid', () => {
	assert.equal(parseChangedFilesTotal(''), undefined);
});

test('parseChangedFilesTotal: whitespace-only stdout is invalid', () => {
	assert.equal(parseChangedFilesTotal('   \n'), undefined);
});

test('parseChangedFilesTotal: literal "null" (jq\'s rendering of a null field) is invalid', () => {
	assert.equal(parseChangedFilesTotal('null\n'), undefined);
});

test('parseChangedFilesTotal: a non-numeric value is invalid', () => {
	assert.equal(parseChangedFilesTotal('abc'), undefined);
});

test('parseChangedFilesTotal: a negative value is invalid', () => {
	assert.equal(parseChangedFilesTotal('-1'), undefined);
});

test('parseChangedFilesTotal: a decimal value is invalid', () => {
	assert.equal(parseChangedFilesTotal('3.5'), undefined);
});

// ---------------------------------------------------------------------------
// #1261 round-2 finding 1: the guard's only server-side runner is
// front-ci.yml's `gate-selftest` job, which is relevance-gated on this
// classifier. `.github/actions/**` (the composite-action half of the
// check-actions-pinned scan) must be in the REAL pattern from front-ci.yml,
// so an actions-only PR — e.g. a Dependabot github-actions bump inside an
// existing action.yml, or a human unpinning one — wakes gate-selftest up.
// The pattern is extracted from the workflow YAML itself, not restated here,
// so narrowing it back is caught. Paired proof: this test is RED against the
// old pattern (no `.github/actions/` group) and GREEN after adding it.
// ---------------------------------------------------------------------------

const frontCiClassifierPattern = readFileSync(
	new URL('../../../.github/workflows/front-ci.yml', import.meta.url),
	'utf8',
).match(/node "\$CLASSIFIER" '([^']*)'/)?.[1];

test('#1261: front-ci classifier selects .github/actions/foo/action.yml as relevant', () => {
	assert.ok(
		frontCiClassifierPattern,
		'classifier invocation found in front-ci.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['.github/actions/foo/action.yml'],
		changedFilesTotal: 1,
		pattern: frontCiClassifierPattern,
	});

	assert.equal(result.relevant, true);
});

// ---------------------------------------------------------------------------
// #1275 (#1273 follow-up): quality-gate.yml gates its heavy job on this same
// classifier, and @org/shared-ts's standing typecheck/test steps live under
// `packages/shared-ts/**`. Nothing pinned that a shared-ts-only PR selects
// the gate, so a silent narrowing of the REAL pattern would stop running
// shared-ts verification without anyone noticing. As with #1261 above, the
// pattern is extracted from the workflow YAML itself, not restated here, so
// narrowing it is caught. Paired proof: this test is RED against a narrowed
// pattern (the `packages/` group removed) and GREEN against the shipped one.
// ---------------------------------------------------------------------------

const qualityGateClassifierPattern = readFileSync(
	new URL('../../../.github/workflows/quality-gate.yml', import.meta.url),
	'utf8',
).match(/node "\$CLASSIFIER" '([^']*)'/)?.[1];

test('#1275: quality-gate classifier selects packages/shared-ts/src/lib/foo.ts as relevant', () => {
	assert.ok(
		qualityGateClassifierPattern,
		'classifier invocation found in quality-gate.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['packages/shared-ts/src/lib/logger/iso-logger.ts'],
		changedFilesTotal: 1,
		pattern: qualityGateClassifierPattern,
	});

	assert.equal(result.relevant, true);
});

// ---------------------------------------------------------------------------
// #1279 (#1276 follow-up): the #1275 case above pins a file deep inside
// `packages/shared-ts/src/`, which is exactly where the review found the
// blind spot: narrowing the real pattern's `packages/` group to
// `packages/shared-ts/src/` keeps that one file matching, so the gate keeps
// running for src-only PRs while `packages/shared-ts/package.json` (and its
// tsconfig) silently drop out of gate selection — dependency bumps and
// tsconfig changes stop waking quality-gate with no signal. Pin those two
// paths too, extracted from the workflow YAML as above. Paired proof: both
// new cases are RED against the narrowed pattern while the #1275 case stays
// GREEN.
// ---------------------------------------------------------------------------

test('#1279: quality-gate classifier selects packages/shared-ts/package.json as relevant', () => {
	assert.ok(
		qualityGateClassifierPattern,
		'classifier invocation found in quality-gate.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['packages/shared-ts/package.json'],
		changedFilesTotal: 1,
		pattern: qualityGateClassifierPattern,
	});

	assert.equal(result.relevant, true);
});

test('#1279: quality-gate classifier selects packages/shared-ts/tsconfig.json as relevant', () => {
	assert.ok(
		qualityGateClassifierPattern,
		'classifier invocation found in quality-gate.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['packages/shared-ts/tsconfig.json'],
		changedFilesTotal: 1,
		pattern: qualityGateClassifierPattern,
	});

	assert.equal(result.relevant, true);
});

test('parseChangedFilesTotal: a valid non-negative integer, with surrounding whitespace, parses', () => {
	assert.equal(parseChangedFilesTotal('  42  \n'), 42);
});

test('parseChangedFilesTotal: zero is a valid, distinct value (a genuinely empty PR)', () => {
	assert.equal(parseChangedFilesTotal('0'), 0);
});

test('parseChangedFilesTotal: a large but plausible total parses', () => {
	assert.equal(parseChangedFilesTotal('3001'), 3001);
});

// ---------------------------------------------------------------------------
// #1334 fix round 1: quality-gate.yml runs the dependency-health pin-location
// contract test (packages/scripts-ts/src/dependency-health-pin-location.test.ts),
// which guards docs/guides/dependency-health.md. That workflow gates its heavy
// job on this classifier, whose pattern previously had no `docs/` group at all,
// so a pull request touching ONLY the guarded doc skipped the gate entirely and
// the contract never executed — exactly the drift #1334 exists to prevent. The
// doc path is now pinned here against the REAL pattern extracted from the
// workflow YAML, so deleting the `docs/guides/dependency-health\.md$`
// alternative from the inline regex is caught by CI, not discovered by review.
// Paired proof: the first case is RED when the alternative is removed from the
// shipped pattern and GREEN against it.
// ---------------------------------------------------------------------------

test('#1334: quality-gate classifier selects docs/guides/dependency-health.md as relevant', () => {
	assert.ok(
		qualityGateClassifierPattern,
		'classifier invocation found in quality-gate.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['docs/guides/dependency-health.md'],
		changedFilesTotal: 1,
		pattern: qualityGateClassifierPattern,
	});

	assert.equal(result.relevant, true);
});

test('#1334: an unrelated docs page stays outside quality-gate selection', () => {
	assert.ok(
		qualityGateClassifierPattern,
		'classifier invocation found in quality-gate.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['docs/guides/local-ci-gate.md'],
		changedFilesTotal: 1,
		pattern: qualityGateClassifierPattern,
	});

	assert.equal(result.relevant, false);
});

// ---------------------------------------------------------------------------
// #1798 fix round 4: quality-gate.yml runs the deploy env doc guard
// (packages/scripts-ts/src/check-deploy-env-docs.ts), which guards
// docs/deployment/first-deploy-runbook.md. That workflow gates its heavy job
// on this classifier, whose pattern previously had no `docs/deployment/` group
// at all, so a pull request touching ONLY the guarded runbook skipped the gate
// entirely and the guard never executed — exactly the bypass #1798 exists to
// close. The runbook path is now pinned here against the REAL pattern
// extracted from the workflow YAML, so deleting the
// `docs/deployment/first-deploy-runbook\.md$` alternative from the inline
// regex is caught by CI, not discovered by review. Paired proof: the first
// case is RED when the alternative is removed from the shipped pattern and
// GREEN against it.
// ---------------------------------------------------------------------------

test('#1798: quality-gate classifier selects docs/deployment/first-deploy-runbook.md as relevant', () => {
	assert.ok(
		qualityGateClassifierPattern,
		'classifier invocation found in quality-gate.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['docs/deployment/first-deploy-runbook.md'],
		changedFilesTotal: 1,
		pattern: qualityGateClassifierPattern,
	});

	assert.equal(result.relevant, true);
});

test('#1798: an unrelated deployment doc stays outside quality-gate selection', () => {
	assert.ok(
		qualityGateClassifierPattern,
		'classifier invocation found in quality-gate.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['docs/deployment/unrelated-doc.md'],
		changedFilesTotal: 1,
		pattern: qualityGateClassifierPattern,
	});

	assert.equal(result.relevant, false);
});

// Paired RED proof for the #1798 classifier pin: the runbook path MUST be
// pinned in the quality-gate classifier pattern. If the
// `docs/deployment/first-deploy-runbook\.md$` alternative is removed from the
// pattern, a PR touching ONLY the guarded runbook becomes irrelevant and the
// gate never runs — exactly the bypass #1798 exists to close. This test is
// RED against the narrowed pattern (alternative removed) and GREEN against
// the shipped one (tested above).
test('#1798 paired RED: quality-gate classifier ignores runbook PR when pattern alternative is removed', () => {
	assert.ok(
		qualityGateClassifierPattern,
		'classifier invocation found in quality-gate.yml',
	);

	// Remove the docs/deployment/first-deploy-runbook\.md$ alternative.
	// The pattern string contains a literal '$' (not an anchor) followed by ')'.
	const narrowedPattern = qualityGateClassifierPattern!
		.split('|docs/deployment/first-deploy-runbook\\.md$')
		.join('');

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['docs/deployment/first-deploy-runbook.md'],
		changedFilesTotal: 1,
		pattern: narrowedPattern,
	});

	assert.equal(
		result.relevant,
		false,
		'RED phase failed: even without the runbook alternative in the pattern, the runbook PR is still classified as relevant. The #1798 pin is not what wakes the gate.',
	);
});

// ---------------------------------------------------------------------------
// #1357 fix round 1: docs-archive.yml now also runs the prune-inventory
// freshness step (`node packages/scripts-ts/src/audit-docs-prune.ts --check`),
// so an edit to that generator itself must wake the gate. Its classifier
// pattern previously listed only check-doc-links.ts/.test.ts and the workflow
// file, so a PR touching only audit-docs-prune.ts skipped the gate entirely.
// Pin the path against the REAL pattern extracted from the workflow YAML, not
// a restatement. Paired proof: this case is RED against the pre-round-1
// pattern (no audit-docs-prune alternative) and GREEN against the shipped one.
// ---------------------------------------------------------------------------

const docsArchiveClassifierPattern = readFileSync(
	new URL('../../../.github/workflows/docs-archive.yml', import.meta.url),
	'utf8',
).match(/node "\$CLASSIFIER" '([^']*)'/)?.[1];

test('#1357 r1: docs-archive classifier selects packages/scripts-ts/src/audit-docs-prune.ts as relevant', () => {
	assert.ok(
		docsArchiveClassifierPattern,
		'classifier invocation found in docs-archive.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['packages/scripts-ts/src/audit-docs-prune.ts'],
		changedFilesTotal: 1,
		pattern: docsArchiveClassifierPattern,
	});

	assert.equal(result.relevant, true);
});

// ---------------------------------------------------------------------------
// CLI boundary: spawn the real scripts/ci-changed-paths.mjs entry point
// against a stubbed `gh`, exactly as the round-2 review demanded. The unit
// tests above prove classifyRelevance() and parseChangedFilesTotal() are
// each individually correct; this proves the CLI actually wires the raw
// `gh` stdout through parseChangedFilesTotal() rather than a bare Number().
// ---------------------------------------------------------------------------

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '../../..');
const cliScript = path.join(scriptsDirectory, 'ci-changed-paths.ts');

/**
 * Builds a fake `gh` executable on its own PATH directory. It answers both
 * `gh api` calls the CLI makes: the PR's `changed_files` total (no
 * `--paginate`), and the paginated file list (`--paginate` present).
 * `respond.total` / `respond.files` are the raw stdout text `gh` would have
 * printed for each call — a real `gh api --jq` on an absent/null field
 * prints nothing, which these fixtures reproduce directly.
 */
const buildFakeGh = ({ total = '', files = '' }) => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'publyapp-fake-gh-'));
	const ghPath = path.join(dir, 'gh');

	writeFileSync(
		ghPath,
		[
			'#!/usr/bin/env node',
			'const args = process.argv.slice(2);',
			"const isFilesCall = args.includes('--paginate');",
			`process.stdout.write(isFilesCall ? ${JSON.stringify(files)} : ${JSON.stringify(total)});`,
			'process.exit(0);',
			'',
		].join('\n'),
	);
	chmodSync(ghPath, 0o755);

	return dir;
};

// @ts-expect-error rung-0: add proper type in later rung
const runCli = (pattern, fakeGhDir) => {
	const env = {
		...process.env,
		PATH: `${fakeGhDir}:${process.env.PATH}`,
		GITHUB_EVENT_NAME: 'pull_request',
		GH_REPO: 'PublyApp/publyapp',
		PR_NUMBER: '1',
		GH_TOKEN: 'test-token',
	};
	// @ts-expect-error rung-0: TS2339
	delete env.GITHUB_OUTPUT;

	return spawnSync(process.execPath, [cliScript, pattern], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env,
	});
};

// @ts-expect-error rung-0: add proper type in later rung
const withFakeGh = (respond, fn) => {
	const fakeGhDir = buildFakeGh(respond);
	try {
		return fn(fakeGhDir);
	} finally {
		rmSync(fakeGhDir, { recursive: true, force: true });
	}
};

test('CLI BOUNDARY: empty stdout for changed_files (missing/null field) fails closed to relevant=true', () => {
	// This is the review's literal repro: both real `gh` calls return empty
	// output. The real bug was `Number('')` === 0 turning that into a
	// certified-complete, certified-empty PR.
	// @ts-expect-error rung-0: add proper type in later rung
	withFakeGh({ total: '', files: '' }, (fakeGhDir) => {
		const result = runCli('^(apps/front/|packages/shared-ts/)', fakeGhDir);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^relevant=true/);
	});
});

test('CLI BOUNDARY: literal "null" stdout for changed_files fails closed to relevant=true', () => {
	// @ts-expect-error rung-0: add proper type in later rung
	withFakeGh({ total: 'null\n', files: '' }, (fakeGhDir) => {
		const result = runCli('^(apps/front/|packages/shared-ts/)', fakeGhDir);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^relevant=true/);
	});
});

test('CLI BOUNDARY: a genuinely empty, verified-complete PR (changed_files=0, no files) is not relevant', () => {
	// @ts-expect-error rung-0: add proper type in later rung
	withFakeGh({ total: '0\n', files: '' }, (fakeGhDir) => {
		const result = runCli('^(apps/front/|packages/shared-ts/)', fakeGhDir);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^relevant=false/);
	});
});

test('CLI BOUNDARY: a complete, matching file list is relevant', () => {
	withFakeGh(
		{ total: '1\n', files: 'apps/front/src/routes.ts\n' },
		// @ts-expect-error rung-0: add proper type in later rung
		(fakeGhDir) => {
			const result = runCli('^(apps/front/|packages/shared-ts/)', fakeGhDir);

			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, /^relevant=true/);
		},
	);
});

// ---------------------------------------------------------------------------
// GITHUB_OUTPUT: the round-3 review's BLOCKER. Every test above deletes
// GITHUB_OUTPUT and asserts only stdout — but stdout is diagnostic. The
// workflows branch on the `relevant=...` line appended to GITHUB_OUTPUT, and
// nothing above ever read that file back for a pull_request event that could
// legitimately answer either true or false. The reviewer's mutation
// (`relevant=${eventName !== 'pull_request'}` instead of
// `relevant=${relevant}` on the appendFileSync call) preserves every pure
// decision, every stdout message, and the push case — and silently flips
// every real pull request's actual gate signal to false. These tests read
// the real GITHUB_OUTPUT file back and assert its EXACT contents, so that
// exact mutation cannot pass.
// ---------------------------------------------------------------------------

/**
 * Like buildFakeGh, but the "files" call (`--paginate`) can be made to fail
 * (nonzero exit, so a real `gh` auth/rate-limit/network failure is
 * reproduced) instead of answering.
 */
const buildFakeGhWithFilesFailure = ({ total = '1\n' }) => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'publyapp-fake-gh-fail-'));
	const ghPath = path.join(dir, 'gh');

	writeFileSync(
		ghPath,
		[
			'#!/usr/bin/env node',
			'const args = process.argv.slice(2);',
			"const isFilesCall = args.includes('--paginate');",
			'if (isFilesCall) {',
			"  process.stderr.write('gh: rate limit exceeded\\n');",
			'  process.exit(1);',
			'}',
			`process.stdout.write(${JSON.stringify(total)});`,
			'process.exit(0);',
			'',
		].join('\n'),
	);
	chmodSync(ghPath, 0o755);

	return dir;
};

/**
 * Runs the real CLI with a REAL GITHUB_OUTPUT file (never deleted) and
 * returns both stdout and the file's exact final contents.
 */
// @ts-expect-error rung-0: add proper type in later rung
const runCliWithRealOutput = (pattern, fakeGhDir, extraEnv = {}) => {
	const outputDir = mkdtempSync(
		path.join(os.tmpdir(), 'publyapp-github-output-'),
	);
	const githubOutputPath = path.join(outputDir, 'github-output.txt');
	writeFileSync(githubOutputPath, '');

	try {
		const result = spawnSync(process.execPath, [cliScript, pattern], {
			cwd: repositoryRoot,
			encoding: 'utf8',
			env: {
				...process.env,
				PATH: `${fakeGhDir}:${process.env.PATH}`,
				GITHUB_EVENT_NAME: 'pull_request',
				GH_REPO: 'PublyApp/publyapp',
				PR_NUMBER: '1',
				GH_TOKEN: 'test-token',
				...extraEnv,
				GITHUB_OUTPUT: githubOutputPath,
			},
		});

		return { ...result, output: readFileSync(githubOutputPath, 'utf8') };
	} finally {
		rmSync(outputDir, { recursive: true, force: true });
	}
};

test('GITHUB_OUTPUT BLOCKER: a complete, matching PR writes exactly relevant=true', () => {
	withFakeGh(
		{ total: '1\n', files: 'apps/front/src/routes.ts\n' },
		// @ts-expect-error rung-0: add proper type in later rung
		(fakeGhDir) => {
			const { status, output } = runCliWithRealOutput(
				'^(apps/front/|packages/shared-ts/)',
				fakeGhDir,
			);

			assert.equal(status, 0);
			assert.equal(output, 'relevant=true\n');
		},
	);
});

test('GITHUB_OUTPUT BLOCKER: a complete, irrelevant PR writes exactly relevant=false', () => {
	// @ts-expect-error rung-0: add proper type in later rung
	withFakeGh({ total: '1\n', files: 'README.md\n' }, (fakeGhDir) => {
		const { status, output } = runCliWithRealOutput(
			'^(apps/front/|packages/shared-ts/)',
			fakeGhDir,
		);

		assert.equal(status, 0);
		assert.equal(output, 'relevant=false\n');
	});
});

test('GITHUB_OUTPUT BLOCKER: an incomplete/unverifiable PR (truncated count) writes exactly relevant=true', () => {
	// @ts-expect-error rung-0: add proper type in later rung
	withFakeGh({ total: '3001\n', files: 'README.md\n' }, (fakeGhDir) => {
		const { status, output } = runCliWithRealOutput(
			'^(apps/front/|packages/shared-ts/)',
			fakeGhDir,
		);

		assert.equal(status, 0);
		assert.equal(output, 'relevant=true\n');
	});
});

test('GITHUB_OUTPUT BLOCKER: a gh failure (rate limit / auth / network) exits nonzero and fabricates no output', () => {
	const fakeGhDir = buildFakeGhWithFilesFailure({ total: '1\n' });
	try {
		const { status, output } = runCliWithRealOutput(
			'^(apps/front/|packages/shared-ts/)',
			fakeGhDir,
		);

		assert.notEqual(status, 0);
		assert.equal(output, '');
	} finally {
		rmSync(fakeGhDir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// #1462: the new api-tests.yml gate runs the FULL API test suite behind this
// classifier. Nothing pinned that the workflow's own file (or an API source
// change) selects the gate, so a silent narrowing of the REAL pattern would
// stop running the suite without anyone noticing — the exact #1275/#1279
// blindness, applied to backend CI. The pattern is extracted from the
// workflow YAML itself, not restated here, so narrowing it is caught.
// Paired proof: both cases are RED against a pattern narrowed to drop the
// `.github/workflows/api-tests.yml` / `apps/api/` groups and GREEN against
// the shipped one.
// ---------------------------------------------------------------------------

const apiTestsClassifierPattern = readFileSync(
	new URL('../../../.github/workflows/api-tests.yml', import.meta.url),
	'utf8',
).match(/node "\$CLASSIFIER" '([^']*)'/)?.[1];

test('#1462: api-tests classifier selects .github/workflows/api-tests.yml as relevant', () => {
	assert.ok(
		apiTestsClassifierPattern,
		'classifier invocation found in api-tests.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['.github/workflows/api-tests.yml'],
		changedFilesTotal: 1,
		pattern: apiTestsClassifierPattern,
	});

	assert.equal(result.relevant, true);
});

test('#1462: api-tests classifier selects apps/api/Modules/Auth/Services/foo.cs as relevant', () => {
	assert.ok(
		apiTestsClassifierPattern,
		'classifier invocation found in api-tests.yml',
	);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files: ['apps/api/Modules/Auth/Services/FooService.cs'],
		changedFilesTotal: 1,
		pattern: apiTestsClassifierPattern,
	});

	assert.equal(result.relevant, true);
});
