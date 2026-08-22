import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

// Guard for policy #1240 (owner decision 2026-08-22): dependabot[bot] PRs are
// waived from the require-linked-issue gate, every other author keeps the
// existing behaviour. The waiver MUST be keyed on exactly the
// `dependabot[bot]` login — not github.actor, not a label, and not a wider
// pattern like `endsWith('[bot]')` that would silently cover every other bot.
//
// This test pins that exact shape both ways: the real workflow passes the
// assertion, and any widening (removing the condition, or matching any
// `*-[bot]` author) FAILS it. That is the load-bearing property — a mutation
// that drops or loosens the waiver must not slip through green.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
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

	return step.run;
};

/**
 * The exact policy shape. Throws if the waiver is absent, keyed on the wrong
 * source, or wider than `dependabot[bot]` alone.
 *
 * @param {string} runBody
 */
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
	if (!/waived by policy #1240/.test(runBody)) {
		throw new Error(
			'the waived branch must log "dependabot PR — linked-issue requirement waived by policy #1240"',
		);
	}

	if (
		!/dependabot PR — linked-issue requirement waived by policy #1240/.test(
			runBody,
		)
	) {
		throw new Error(
			'the waived branch must emit the exact plain-words log line for the #1240 waiver',
		);
	}
};

test('the real workflow waives EXACTLY dependabot[bot] and no other author', async () => {
	const runBody = await readRunBody();

	// Must not throw — the real file satisfies the exact shape.
	assert.doesNotThrow(() => assertExactlyDependabotBot(runBody));
});

test('a waiver widened to any *[bot]* author is rejected', async () => {
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

	assert.throws(() => assertExactlyDependabotBot(widened));
});

test('removing the waiver condition entirely is rejected', async () => {
	const runBody = await readRunBody();

	// Drop the whole waiver branch (the PR_AUTHOR assignment through its `fi`).
	const withoutWaiver = runBody
		.replace(/PR_AUTHOR="[^"]*"\n/, '')
		.replace(
			/if \[ "\$PR_AUTHOR" = "dependabot\[bot\]" \]; then\n(?:.*\n)*?  fi\n/,
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
