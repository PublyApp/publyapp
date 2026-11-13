import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

import {
	CLOSING_REFERENCES_QUERY,
	isClosingRelationship,
	parseRelationships,
	waivesIssueRequirement,
} from './require-linked-issue.ts';

// Guard for policy #1240 (owner decision 2026-08-22): Dependabot PRs are
// waived from the require-linked-issue gate, every other author keeps the
// existing behaviour. The waiver MUST be keyed on exactly the two author
// logins emitted by GitHub integrations: `dependabot[bot]` and
// `app/dependabot` — not github.actor, not a label, and not a wider pattern
// like `endsWith('[bot]')` that would silently cover every other bot.
//
// Since #2306 the policy lives in packages/scripts-ts/src/require-linked-issue.ts
// and the step is one line calling it, so these tests execute the REAL script
// (never a copy) against a mock `gh` on PATH and assert the EXIT CODE: a green
// run is evidence, not a claim. The waiver and parser predicates are also
// unit-tested directly, so dropping `exit 0` or widening the waiver is caught
// without depending on the shell text that no longer exists.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const workflowFile = '.github/workflows/ci.yml';
const scriptPath = path.join(
	repoRoot,
	'packages/scripts-ts/src/require-linked-issue.ts',
);

/** Pins the wiring: the gate step must call this script and nothing else. */
test('the gate step is one line calling the linked-issue script', () => {
	const document = parse(
		readFileSync(path.join(repoRoot, workflowFile), 'utf8'),
	);
	const step = (document.jobs.gate.steps ?? []).find(
		(s: { name?: string }) => s.name === 'Verify linked issue relationship',
	);

	assert.equal(
		step?.run?.trim(),
		'node packages/scripts-ts/src/require-linked-issue.ts',
	);
	assert.equal(step?.env?.CI_LIVE_PR_RECORD_PATH, 'ci-live-pr-record.json');
	assert.ok(
		!JSON.stringify(step).includes('github.event.pull_request.body'),
		'the gate must read the canonical live record, never the event body',
	);
});

// #2306 review B1: the shell→.ts move dropped the last `}` of the GraphQL
// query, so every `Closes #N` PR would fail the gate at runtime. `gh` is not
// called here — the constant is pinned, so a re-typo fails this test.
test('the closing-references GraphQL query is brace-balanced', () => {
	let depth = 0;

	for (const character of CLOSING_REFERENCES_QUERY) {
		if (character === '{') {
			depth++;
		}

		if (character === '}') {
			depth--;
			assert.ok(
				depth >= 0,
				'the query must never close a brace it did not open',
			);
		}
	}

	assert.equal(depth, 0, 'the query must end with every brace closed');
	assert.equal(
		CLOSING_REFERENCES_QUERY,
		'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){closingIssuesReferences(first:100){nodes{number}}}}}',
	);
});

const MOCK_PRS = new Set([2032, 2003]);
const MOCK_MISSING_NUMBERS = new Set([9001]);

/**
 * Creates a mock `gh` on PATH so the script's three call shapes can be
 * exercised without a live token.
 */
const createMockGhDir = () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'require-linked-issue-'));
	const prPattern = [...MOCK_PRS].join('|');
	const missingPattern = [...MOCK_MISSING_NUMBERS].join('|');
	const mockGh = `#!/usr/bin/env bash
# Mock gh for require-linked-issue tests.
#   gh api graphql -F query=... -F number=N --jq '...nodes[].number'
#   gh api repos/OWNER/REPO/issues/N --jq '.pull_request != null'
#   gh issue view N --json state --jq '.state'
if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  if [[ "$MOCK_GRAPHQL_FAILURE" == "true" ]]; then
    echo "mock GraphQL failure" >&2
    exit 1
  fi
  pr_number=""
  for argument in "$@"; do
    case "$argument" in
      number=*) pr_number="\${argument#number=}" ;;
    esac
  done
  case "$pr_number" in
    2032) printf '1458\\n' ;;
    9999) printf '1458\\n2003\\n' ;;
    *) : ;;
  esac
  exit 0
fi
if [[ "$1" == "api" && "$2" == repos/*/issues/* && "$3" == "--jq" ]]; then
  num="$(echo "$2" | grep -oE '[0-9]+$')"
  case "$num" in
    ${prPattern}) echo "true" ;;
    ${missingPattern}) exit 1 ;;
    *) echo "false" ;;
  esac
  exit 0
fi
if [[ "$1" == "issue" && "$2" == "view" && "$4" == "--json" && "$5" == "state" ]]; then
  echo "OPEN"
  exit 0
fi
exit 0
`;
	writeFileSync(path.join(dir, 'gh'), mockGh, { mode: 0o755 });
	return dir;
};

// #2406: the live GitHub call is network-bound; the default 5 s vitest timeout
// flaked CI. Each live call gets an explicit bound, the first live test retries
// once, and the test budget is derived from the call budget. Vitest only checks
// elapsed time after a synchronous body returns, so the per-call bound is what
// actually stops a hung call. The recorded boundary (mock gh answering "true"
// for PRs) is asserted by the non-live tests below.
const LIVE_CALL_TIMEOUT_MS = 12_000;
const LIVE_TEST_TIMEOUT_MS = 2 * LIVE_CALL_TIMEOUT_MS + 5_000;

type RunStepOptions = {
	author: string;
	body: string;
	graphqlFailure?: boolean;
	prNumber?: string;
	useRealGh?: boolean;
};

/**
 * Executes the real script with a canonical live PR record and a mock `gh`,
 * returning the exit code and captured stdout.
 */
const runStep = ({
	author,
	body,
	graphqlFailure = false,
	prNumber = '2032',
	useRealGh = false,
}: RunStepOptions) => {
	const directory = mkdtempSync(
		path.join(os.tmpdir(), 'require-linked-issue-'),
	);
	const recordPath = path.join(directory, 'ci-live-pr-record.json');
	writeFileSync(
		recordPath,
		JSON.stringify({
			pr: { author_login: author, body },
			pr_number: Number(prNumber),
		}),
	);

	const mockGhDir = useRealGh ? null : createMockGhDir();
	const result = spawnSync(process.execPath, [scriptPath], {
		encoding: 'utf8',
		// Only the real-gh run touches the network; bound the whole script run.
		timeout: useRealGh ? 2 * LIVE_CALL_TIMEOUT_MS : undefined,
		env: {
			...process.env,
			CI_LIVE_PR_RECORD_PATH: recordPath,
			GH_REPO: 'PublyApp/publyapp',
			GH_TOKEN: useRealGh ? (process.env.GH_TOKEN ?? '') : 'x',
			MOCK_GRAPHQL_FAILURE: graphqlFailure ? 'true' : 'false',
			PATH:
				mockGhDir === null
					? (process.env.PATH ?? '')
					: `${mockGhDir}:${process.env.PATH ?? ''}`,
		},
	});

	return { code: result.status ?? 1, stdout: result.stdout ?? '' };
};

// ---------------------------------------------------------------------------
// The waived authors, exactly (#1240) — unit-level, so a widening is caught
// even if the behavioural matrix below were weakened.
// ---------------------------------------------------------------------------

test('only the two exact Dependabot logins are waived', () => {
	assert.equal(waivesIssueRequirement('dependabot[bot]'), true);
	assert.equal(waivesIssueRequirement('app/dependabot'), true);
	assert.equal(waivesIssueRequirement('renovate[bot]'), false);
	assert.equal(waivesIssueRequirement('dependabot'), false);
	assert.equal(waivesIssueRequirement('app/dependabot[bot]'), false);
});

test('the relationship parser keeps only its own anchored keywords', () => {
	assert.deepEqual(parseRelationships('Closes #1458\nRefs #2032'), [
		'Closes #1458',
		'Refs #2032',
	]);
	assert.deepEqual(parseRelationships('Touches #647'), []);
	assert.deepEqual(parseRelationships('fixed #647 twice\nfixed #647'), [
		'fixed #647',
	]);
	assert.equal(isClosingRelationship('Closes #1'), true);
	assert.equal(isClosingRelationship('Part of #1'), false);
	assert.equal(isClosingRelationship('Refs #1'), false);
});

test.runIf(process.env.GITHUB_ACTIONS === 'true')(
	'#2003 live boundary: GitHub exposes known PR #1987 through the issues endpoint',
	{ timeout: LIVE_TEST_TIMEOUT_MS },
	() => {
		const callLive = () =>
			spawnSync(
				'gh',
				[
					'api',
					'repos/PublyApp/publyapp/issues/1987',
					'--jq',
					'.pull_request != null',
				],
				{ encoding: 'utf8', timeout: LIVE_CALL_TIMEOUT_MS },
			);
		let result = callLive();
		if (result.status !== 0) {
			result = callLive();
		}

		assert.equal(
			result.status,
			0,
			result.stderr ||
				result.error?.message ||
				`gh exited without a status (signal ${result.signal})`,
		);
		assert.equal(
			result.stdout.trim(),
			'true',
			'the live API must identify the known PR as a pull request',
		);
	},
);

test.runIf(process.env.GITHUB_ACTIONS === 'true')(
	'#2003 live boundary: the real gate rejects a known PR number',
	{ timeout: LIVE_TEST_TIMEOUT_MS },
	() => {
		const { code, stdout } = runStep({
			author: 'octocat',
			body: 'Closes #1987',
			prNumber: '9999',
			useRealGh: true,
		});

		assert.equal(code, 1);
		assert.match(stdout, /pull request/);
	},
);

test('the real waiver PASSES (exit 0) for dependabot[bot] with an empty body', () => {
	const { code, stdout } = runStep({ author: 'dependabot[bot]', body: '' });

	assert.equal(code, 0, 'the dependabot[bot] waiver must exit 0');
	assert.match(
		stdout,
		/dependabot PR — linked-issue requirement waived by policy #1240/,
		'the waived branch must emit the exact plain-words log line',
	);
});

test('the real waiver PASSES (exit 0) for app/dependabot with an empty body', () => {
	const { code, stdout } = runStep({ author: 'app/dependabot', body: '' });

	assert.equal(code, 0, 'the app/dependabot waiver must exit 0');
	assert.match(
		stdout,
		/dependabot PR — linked-issue requirement waived by policy #1240/,
	);
});

test('the real workflow FAILS (exit 1) for a human author with an empty body', () => {
	const { code } = runStep({ author: 'octocat', body: '' });

	assert.equal(code, 1, 'a human author with no linked issue must exit 1');
});

test('the real workflow does NOT waive renovate[bot] (exit 1) with an empty body', () => {
	const { code } = runStep({ author: 'renovate[bot]', body: '' });

	assert.equal(
		code,
		1,
		'renovate[bot] must NOT be waived — the waiver is exactly the two Dependabot forms',
	);
});

// #2003: `gh issue view <PR-number>` succeeds and returns the PR's state, so a
// body like "Closes #<any-PR>" satisfies the gate falsely. The discriminator
// rejects closing PR targets while allowing non-closing citations.

test('the real workflow FAILS (exit 1) for a body that closes only a PR (#2003 regression)', () => {
	const { code, stdout } = runStep({
		author: 'octocat',
		body: 'Closes #2032',
		prNumber: '9999',
	});

	assert.equal(code, 1);
	assert.match(stdout, /pull request/);
});

test('the real workflow names a self-reference explicitly', () => {
	const { code, stdout } = runStep({ author: 'octocat', body: 'Closes #2032' });

	assert.equal(code, 1);
	assert.match(stdout, /references itself/);
});

test('the real workflow PASSES (exit 0) for a body that closes a real issue', () => {
	const { code } = runStep({ author: 'octocat', body: 'Closes #1458' });

	assert.equal(code, 0, 'a body closing a real issue must pass the gate');
});

test('the real workflow fails loud when GraphQL closing-reference verification fails', () => {
	const { code, stdout } = runStep({
		author: 'octocat',
		body: 'Closes #1458',
		graphqlFailure: true,
	});

	assert.equal(code, 1, 'a failed closing-reference lookup must fail the gate');
	assert.match(stdout, /could not verify GitHub closingIssuesReferences/);
});

test('the real workflow rejects an existing issue absent from successful closing references', () => {
	const { code, stdout } = runStep({
		author: 'octocat',
		body: 'Closes #647',
		prNumber: '2032',
	});

	assert.equal(code, 1);
	assert.match(
		stdout,
		/#647 is not present in GitHub closingIssuesReferences — rejecting the closing declaration\./,
	);
});

test.each(['Part of #647', 'Refs #647', 'References #647'])(
	'the real workflow PASSES for an honest non-closing issue link: %s',
	(body) => {
		const { code } = runStep({ author: 'octocat', body });

		assert.equal(
			code,
			0,
			'a partial slice must be allowed to link its parent without falsely closing it',
		);
	},
);

test('the real workflow still FAILS for an unqualified bare issue number', () => {
	const { code } = runStep({ author: 'octocat', body: 'Touches #647' });

	assert.equal(code, 1);
});

test('the real workflow does not turn a negated closing claim into a link', () => {
	const { code } = runStep({
		author: 'octocat',
		body: 'This deliberately does not claim to close #647.',
	});

	assert.equal(code, 1);
});

test('the real workflow rejects a non-closing PR citation when it is the only relationship', () => {
	const { code, stdout } = runStep({
		author: 'octocat',
		body: 'Part of #2032',
		prNumber: '9999',
	});

	assert.equal(
		code,
		1,
		'a non-closing link must still resolve to a real issue',
	);
	assert.match(stdout, /does not satisfy the issue requirement/);
});

test('the real workflow allows a non-closing PR citation beside a real issue', () => {
	const { code } = runStep({
		author: 'octocat',
		body: 'Closes #1458\nRefs #2032',
		prNumber: '9999',
	});

	assert.equal(code, 0);
});

test('the real workflow diagnoses an unverifiable number without calling it a PR', () => {
	const { code, stdout } = runStep({
		author: 'octocat',
		body: 'Closes #9001',
		prNumber: '9999',
	});

	assert.equal(code, 1);
	assert.match(stdout, /could not be verified as an existing issue/);
	assert.doesNotMatch(stdout, /is a pull request/);
});

test('the real workflow FAILS the whole declaration when it mixes a PR and a real issue', () => {
	const { code } = runStep({
		author: 'octocat',
		body: 'Closes #2032\nCloses #1458',
		prNumber: '9999',
	});

	assert.equal(code, 1);
});

test('the real workflow FAILS (exit 1) for a body closing two PRs and no real issue', () => {
	const { code } = runStep({
		author: 'octocat',
		body: 'Closes #2032\nCloses #2003',
		prNumber: '9999',
	});

	assert.equal(code, 1);
});
