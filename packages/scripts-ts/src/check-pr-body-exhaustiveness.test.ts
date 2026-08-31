import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

import { findExhaustivenessProblems } from './check-pr-body-exhaustiveness.ts';

// ---------------------------------------------------------------------------
// #1569 — unverifiable exhaustiveness claims in PR bodies
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
);

const scriptPath = path.join(
	repoRoot,
	'packages/scripts-ts/src/check-pr-body-exhaustiveness.ts',
);

/** Runs the REAL guard script with a given PR_BODY (exit code + output). */
const runGuard = (body: string | undefined) => {
	const env: NodeJS.ProcessEnv = { ...process.env };
	if (body !== undefined) {
		env.PR_BODY = body;
	} else {
		delete env.PR_BODY;
	}
	const out = spawnSync(process.execPath, [scriptPath], {
		env,
		encoding: 'utf-8',
	});
	return { code: out.status ?? 1, stdout: out.stdout, stderr: out.stderr };
};

test('#1569 RED: the verbatim example from the issue is named in plain words', () => {
	const body =
		'23 dimensions de validation vérifiées, la validation est exhaustive et concluante.';
	const findings = findExhaustivenessProblems(body);
	assert.ok(
		findings.some((f) => f.quote === '23 dimensions'),
		findings.map((f) => f.quote).join(', '),
	);
	assert.ok(
		findings.some((f) => f.quote === 'exhaustive'),
		findings.map((f) => f.quote).join(', '),
	);
});

test('#1569 RED: the second verbatim example (bare exhaustive claim) is named', () => {
	const body = 'validation exhaustive et complète across all turns';
	const findings = findExhaustivenessProblems(body);
	assert.ok(
		findings.some((f) => f.quote === 'exhaustive'),
		findings.map((f) => f.quote).join(', '),
	);
});

test('#1569 RED: a quantified claim without an enumerated list is flagged', () => {
	const body = '12 tests run and all passed. Nothing else to verify.';
	const findings = findExhaustivenessProblems(body);
	assert.ok(
		findings.some((f) => f.rule.includes('quantified coverage claim')),
		findings.map((f) => f.quote).join(', '),
	);
	assert.ok(
		findings.some(
			(f) => f.fix.includes('12') && f.fix.includes('lists only 0'),
		),
		findings.map((f) => f.fix).join('\n'),
	);
});

test('#1569 GREEN: a quantified claim with an enumerated list of N items passes', () => {
	const body =
		'5 dimensions validated:\n' +
		'- auth: session lifetimes\n' +
		'- tenants: header scope\n' +
		'- projects: membership\n' +
		'- posts: publish flow\n' +
		'- invitations: expiry';
	const findings = findExhaustivenessProblems(body);
	assert.deepEqual(findings, []);
});

test('#1569 GREEN: a claim inside a code fence is not a claim', () => {
	const body =
		'Reproduction steps:\n' +
		'```sh\n' +
		'# runs 12 tests and all passed\n' +
		'$ pnpm test --count 12\n' +
		'```\n' +
		'Behaviour confirmed manually.';
	const findings = findExhaustivenessProblems(body);
	assert.deepEqual(findings, []);
});

test('#1569 GREEN: an example quoted in inline code is not a claim', () => {
	// CI false positive (PR #1996 round 1): the guard flagged the literal
	// example in the PR body while it was quoted inside backticks. A
	// backtick-quoted claim is an EXAMPLE, not an assertion.
	const body =
		'The guard flags claims like `23 dimensions` or `N tests` when they ' +
		'are made without an enumerated list.';
	const findings = findExhaustivenessProblems(body);
	assert.deepEqual(findings, []);
});

test('#1569 GREEN: the noun "exhaustiveness" (describing the rule) is not a claim', () => {
	// CI false positive (PR #1996 round 1): the guard flagged its own
	// description, "unverifiable exhaustiveness claims", because the over-
	// broad regex matched the noun. The adjective claim forms (exhaustive,
	// exhaustively, exhaustif(s)(e)(s)) are the flag targets, never the noun.
	const body =
		'This guard forbids unverifiable exhaustiveness claims in PR bodies.';
	const findings = findExhaustivenessProblems(body);
	assert.deepEqual(findings, []);
});

test('#1569 GREEN: a clean body with no claims passes', () => {
	const findings = findExhaustivenessProblems(
		'Fixes the drawer focus trap. Verified manually on the staff tenant page.',
	);
	assert.deepEqual(findings, []);
});

test('#1569 LOUD: the real script fails loud when PR_BODY is not set', () => {
	const { code, stderr } = runGuard(undefined);
	assert.equal(code, 1, stderr);
	assert.ok(stderr.includes('PR_BODY is not set'), stderr);
});

test('#1569 executed: the real script exits 1 on the issue example and 0 on a clean body', () => {
	const red = runGuard(
		'23 dimensions de validation vérifiées, la validation est exhaustive et concluante.',
	);
	assert.equal(red.code, 1, red.stderr);
	assert.ok(red.stderr.includes('23 dimensions'), red.stderr);
	assert.ok(red.stderr.includes('exhaustive'), red.stderr);

	const green = runGuard(
		'Fixes the drawer focus trap. Verified manually on the staff tenant page.',
	);
	assert.equal(green.code, 0, green.stderr);
	assert.ok(green.stdout.includes('PASSED'), green.stdout);
});

// ---------------------------------------------------------------------------
// CI wiring pin: the guard reads the REAL PR body via the GitHub API
// ---------------------------------------------------------------------------

const workflowFile = '.github/workflows/require-linked-issue.yml';

test('#1569: the CI job reads the real body via gh api and invokes the guard script', async () => {
	const raw = await readFile(path.join(repoRoot, workflowFile), 'utf8');
	const document = parse(raw);
	const job = document?.jobs?.['pr-body-exhaustiveness'];
	assert.ok(
		job,
		'require-linked-issue.yml must have a pr-body-exhaustiveness job',
	);

	const steps = Array.isArray(job?.steps) ? job.steps : [];
	const step = steps.find(
		(s) =>
			typeof s?.run === 'string' &&
			s.run.includes('check-pr-body-exhaustiveness'),
	);
	assert.ok(step, 'the job must run check-pr-body-exhaustiveness in a step');
	const run = (step as { run: string }).run;

	// The body must come from the LIVE GitHub API for THIS pull request —
	// never a fixture, never a hardcoded body, never an event-payload echo
	// that the author could have written.
	assert.ok(
		run.includes('gh api') &&
			run.includes('repos/$GH_REPO/pulls/$PR_NUMBER') &&
			run.includes('.body'),
		`the step must read the real body via the GitHub API:\n${run}`,
	);
	assert.ok(
		run.includes('check-pr-body-exhaustiveness.ts'),
		`the step must invoke the guard script:\n${run}`,
	);
	// The body must be handed to the script via the environment, and the
	// script must be the ONLY reader of the claim content.
	assert.ok(
		run.includes('export PR_BODY'),
		`PR_BODY must be exported:\n${run}`,
	);
});
