import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

// Guard for policy #1240 (owner decision 2026-08-22): dependabot[bot] PRs are
// waived from the require-linked-issue gate, every other author keeps the
// existing behaviour. The waiver MUST be keyed on exactly the
// `dependabot[bot]` login — not github.actor, not a label, and not a wider
// pattern like `endsWith('[bot]')` that would silently cover every other bot.
//
// This test pins that exact shape both ways AND executes the real shell:
//  - a green run is evidence, not a claim: we actually run the step's `run:`
//    block under a faked env and assert the EXIT CODE. A mutation that drops
//    `exit 0` (keeping the echo + fi) now fails, because the bot PR would no
//    longer exit 0 — the guard would have been vacuous before.
//  - a widening (removing the condition, or matching any `*-[bot]` author)
//    must make the step exit 1 for an author it should NOT waive.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
);

const workflowFile = '.github/workflows/require-linked-issue.yml';

/** Extracts the single `run:` shell body of the verify step. */
const readRunBody = async () => {
	const raw = await readFile(path.join(repoRoot, workflowFile), 'utf8');
	const document = parse(raw);
	const steps = document?.jobs?.['require-linked-issue']?.steps ?? [];
	const step = steps.find((s) => typeof s?.run === 'string');

	if (step === undefined) {
		throw new Error(`${workflowFile}: expected a step with a \`run:\` block.`);
	}

	return step.run as string;
};

/**
 * The exact policy shape. Throws if the waiver is absent, keyed on the wrong
 * source, wider than `dependabot[bot]` alone, or missing its exit 0.
 */
// @ts-expect-error rung-0: add proper type in later rung
const assertExactlyDependabotBot = (runBody) => {
	// The author must come from the PR's author login, never the runner actor.
	if (
		!/PR_AUTHOR="\$\{\{ github\.event\.pull_request\.user\.login \}\}"/.test(
			runBody,
		)
	) {
		throw new Error(
			'the waiver must read the PR author from github.event.pull_request.user.login, not github.actor',
		);
	}

	// The waiver condition must be an EXACT equality against the single literal
	// `dependabot[bot]`. A glob/wildcard (e.g. `*"[bot]"*`) is a widening and
	// must NOT satisfy this assertion.
	//
	// The widened-pattern check runs on CODE only, never on the explanatory
	// comment lines (the policy comment itself mentions `endsWith('[bot]')`,
	// which is not executable waiver logic).
	const codeBody = runBody
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('#'))
		.join('\n');

	const exactEquality =
		/\[\s*"\$PR_AUTHOR"\s*=\s*"dependabot\[bot\]"\s*\]/.test(codeBody);
	const widenedPattern =
		/\[\s*"\$PR_AUTHOR"\s*==?\s*\*?"\[bot\]"\*?\s*\]/.test(codeBody) ||
		/endsWith\(\s*'\[bot\]'\s*\)/.test(codeBody);

	if (!exactEquality) {
		throw new Error(
			'the waiver must test PR_AUTHOR with EXACT equality against the literal "dependabot[bot]"',
		);
	}

	if (widenedPattern) {
		throw new Error(
			'the waiver must match exactly "dependabot[bot]", not a wider *[bot]* pattern',
		);
	}

	// The waived branch must carry the plain-words log line and then exit 0.
	if (
		!/dependabot PR — linked-issue requirement waived by policy #1240/.test(
			runBody,
		)
	) {
		throw new Error(
			'the waived branch must emit the exact plain-words log line for the #1240 waiver',
		);
	}

	// The waived branch MUST terminate the step with exit 0. A guard that only
	// checks the echo would stay green if `exit 0` were deleted (keeping the
	// echo + fi), which would silently break the waiver. Assert the exit code
	// is literally present on its own line in the waived branch.
	if (!/^\s*exit 0\s*$/m.test(runBody)) {
		throw new Error('the waived branch must end with `exit 0`');
	}
};

/**
 * Executes the step's `run:` shell under a faked environment, overriding the
 * PR author login and body. Returns the exit code and captured stdout.
 */
// @ts-expect-error rung-0: add proper type in later rung
const runStep = (runBody, { author, body }) => {
	// The real step reads PR_AUTHOR from `${{ github... }}`; substitute that
	// literal so plain `bash` can run the body under our faked author.
	const script = runBody.replace(
		/^PR_AUTHOR="[^"]*"\s*$/m,
		`PR_AUTHOR="${author}"`,
	);

	const result = spawnSync('bash', ['-s'], {
		input: script,
		env: {
			...process.env,
			PR_AUTHOR: author,
			PR_BODY: body,
			GH_TOKEN: 'x',
			GH_REPO: 'radandevist/publyapp',
		},
		encoding: 'utf8',
	});

	return {
		code: result.status ?? 1,
		stdout: result.stdout ?? '',
	};
};

test('the real workflow waives EXACTLY dependabot[bot] and no other author', async () => {
	const runBody = await readRunBody();

	// Must not throw — the real file satisfies the exact shape.
	assert.doesNotThrow(() => assertExactlyDependabotBot(runBody));
});

test('the real waiver PASSES (exit 0) for dependabot[bot] with an empty body', async () => {
	const runBody = await readRunBody();

	const { code, stdout } = runStep(runBody, {
		author: 'dependabot[bot]',
		body: '',
	});

	assert.equal(code, 0, 'the dependabot[bot] waiver must exit 0');
	assert.match(
		stdout,
		/dependabot PR — linked-issue requirement waived by policy #1240/,
		'the waived branch must emit the exact plain-words log line',
	);
});

test('the real workflow FAILS (exit 1) for a human author with an empty body', async () => {
	const runBody = await readRunBody();

	const { code } = runStep(runBody, { author: 'octocat', body: '' });

	assert.equal(code, 1, 'a human author with no linked issue must exit 1');
});

// Behavioural guards below assert the CORRECT outcome on the real file. They are
// the load-bearing evidence: if a mutation is introduced (dropping `exit 0`,
// widening the match), the real workflow behaves wrong and these tests go RED.
//
// The explicit "mutation" checks further prove the guard is not vacuous by
// applying each mutation in-memory and confirming the broken behaviour is
// caught — the drop-exit-0 mutation now makes dependabot[bot] fail to exit 0,
// and the widening mutation now makes renovate[bot] wrongly waived.

test('the real workflow does NOT waive renovate[bot] (exit 1) with an empty body', async () => {
	const runBody = await readRunBody();

	const { code } = runStep(runBody, { author: 'renovate[bot]', body: '' });

	assert.equal(
		code,
		1,
		'renovate[bot] must NOT be waived — the waiver is exactly dependabot[bot]',
	);
});

test('mutation: dropping `exit 0` breaks the dependabot[bot] waiver (step no longer exits 0)', async () => {
	const runBody = await readRunBody();

	// Drop ONLY the `exit 0` line (keeping the echo + fi). The round-1 guard
	// stayed green here because it only matched the echo — the bot PR would then
	// fall through to the linked-issue checks and fail silently. Now the real
	// behavioural test above (dependabot[bot] -> exit 0) goes red for this file,
	// and we additionally confirm the mutation itself fails on the spot.
	const dropped = runBody.replace(/^  exit 0\n/m, '');

	assert.notEqual(
		dropped,
		runBody,
		'test setup: the drop-exit-0 mutation must actually change the run body',
	);

	const { code } = runStep(dropped, { author: 'dependabot[bot]', body: '' });

	assert.equal(
		code,
		1,
		'dropping `exit 0` must break the waiver (the step must no longer exit 0)',
	);
});

test('mutation: widening to any *[bot]* author wrongly waives renovate[bot] (step exits 0)', async () => {
	const runBody = await readRunBody();

	// The round-1 widening mutation a reviewer would reach for: match every bot.
	const widened = runBody.replace(
		'if [ "$PR_AUTHOR" = "dependabot[bot]" ]; then',
		'if [[ "$PR_AUTHOR" == *"[bot]"* ]]; then',
	);

	assert.notEqual(
		widened,
		runBody,
		'test setup: the widening mutation must actually change the run body',
	);

	// Under the widened logic renovate[bot] matches and exits 0 — the real
	// behavioural test above (renovate[bot] -> exit 1) goes red, and we confirm
	// the mutation itself is caught here.
	const { code } = runStep(widened, { author: 'renovate[bot]', body: '' });

	assert.equal(
		code,
		0,
		'the widened waiver must wrongly waive renovate[bot] (exit 0) — proving the guard catches it',
	);
});

test('removing the waiver condition entirely is rejected (static shape)', async () => {
	const runBody = await readRunBody();

	// Drop the whole waiver branch precisely: the PR_AUTHOR assignment plus the
	// if/echo/exit 0/fi block (nothing beyond the waiver's own `fi`).
	const withoutWaiver = runBody
		.replace(/^PR_AUTHOR="[^"]*"\n/m, '')
		.replace(
			/if \[ "\$PR_AUTHOR" = "dependabot\[bot\]" \]; then\n  echo[^\n]*\n  exit 0\n  fi\n/,
			'',
		);

	assert.notEqual(
		withoutWaiver,
		runBody,
		'test setup: the removal mutation must actually change the run body',
	);

	assert.throws(() => assertExactlyDependabotBot(withoutWaiver));
});

test('a non-dependabot author still falls through to the existing linked-issue check', async () => {
	const runBody = await readRunBody();

	// The waiver must be a short-circuit BEFORE the existing empty-body / keyword
	// checks, so a human author is never waived. The existing logic must remain
	// present and must run only when PR_AUTHOR is not dependabot[bot].
	assert.ok(
		/if \[ -z "\$\{PR_BODY\/\/\[\[:space:\]\]\/\}" \]; then/.test(runBody),
		'the existing empty-body check must still be present after the waiver',
	);
	assert.ok(
		runBody.indexOf('dependabot PR — linked-issue requirement waived') <
			runBody.indexOf('if [ -z "${PR_BODY'),
		'the waiver short-circuit must come before the existing linked-issue checks',
	);
});
