import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';

import {
	compareClassifierFreshness,
	parseClassifierAlternatives,
} from './check-guard-freshness.ts';

// ---------------------------------------------------------------------------
// #1889: a pull request that branches from a base predating a guard
// widening inherits the OLD classifier pattern from its own HEAD's
// workflow file, so a check that ran green on the PR's tree can become
// red on develop the moment both land. The historical incident is #1886
// (develop went red on 2026-08-30 because a docs-archive widening from
// PR #1874 met in-flight PRs whose bases predated the widening).
//
// The structural test pins the freshness check's verdict property: given
// two real classifier patterns read from the workflow YAML — one the
// "base" (the workflow at the PR's base SHA, which the PR's own
// `changes` job inherited) and one the "develop" (the workflow at
// develop's tip) — the check reports stale=true with the exact
// alternatives develop added and the base did NOT carry, and the
// accompanying GITHUB_OUTPUT write names the cause in plain text so the
// PR author is told to refresh rather than to debug a check that does
// not actually apply to their branch.
//
// RED phase: a fixture simulating the pre-#1874 base (which lacked
// `audit-docs-prune` alternatives) vs the post-#1874 develop (which has
// them) must report stale with the missing alternatives named. The
// test enforces both the verdict and the error string shape (so a
// future maintainer who refactors the verdict without preserving the
// cause-naming contract catches it here).
// ---------------------------------------------------------------------------

const docsArchiveWorkflow = readFileSync(
	new URL('../../../.github/workflows/docs-archive.yml', import.meta.url),
	'utf8',
);

const readLiveDocsArchiveClassifierPattern = (): string | undefined => {
	const match = /node "\$CLASSIFIER" '([^']*)'/.exec(docsArchiveWorkflow);
	if (match === null) {
		return undefined;
	}
	return match[1];
};

const liveClassifierPattern = readLiveDocsArchiveClassifierPattern();

test('#1889: a PR whose base predates a docs-archive widening reports stale with the missing alternatives named', () => {
	assert.ok(
		liveClassifierPattern,
		'live classifier pattern found in docs-archive.yml',
	);

	// Simulate the pre-#1874 base: a classifier pattern that lacks the
	// `audit-docs-prune` and `check-doc-links` alternatives PR #1874
	// introduced. The develop pattern is the live one read from the
	// workflow on disk. The difference between them is the exact
	// widening #1889 must catch.
	const baseAlternatives = parseClassifierAlternatives(liveClassifierPattern);
	assert.ok(
		baseAlternatives,
		'live classifier pattern must parse to literal alternatives',
	);
	const narrowedAlternatives = baseAlternatives.filter(
		(alternative) =>
			!/audit-docs-prune/.test(alternative) &&
			!/check-doc-links/.test(alternative),
	);
	const basePattern = `^(${narrowedAlternatives.join('|')})`;

	const verdict = compareClassifierFreshness({
		basePattern,
		developPattern: liveClassifierPattern,
	});

	assert.equal(verdict.comparable, true);
	assert.equal(
		verdict.stale,
		true,
		'a base whose classifier lacks the audit-docs-prune alternatives must be reported stale against current develop',
	);
	assert.ok(
		verdict.missingFromBase.some((path) => /audit-docs-prune/.test(path)),
		`#1889: the verdict must NAME the missing audit-docs-prune alternatives so the PR author knows what to refresh against. Got: ${JSON.stringify(verdict.missingFromBase)}`,
	);
	assert.ok(
		verdict.missingFromBase.some((path) => /check-doc-links/.test(path)),
		`#1889: the verdict must NAME the missing check-doc-links alternatives. Got: ${JSON.stringify(verdict.missingFromBase)}`,
	);
});

test('#1889: a PR whose base equals develop is not stale', () => {
	assert.ok(
		liveClassifierPattern,
		'live classifier pattern found in docs-archive.yml',
	);

	const verdict = compareClassifierFreshness({
		basePattern: liveClassifierPattern,
		developPattern: liveClassifierPattern,
	});

	assert.equal(
		verdict.stale,
		false,
		'identical patterns must not be reported stale',
	);
	assert.equal(verdict.missingFromBase.length, 0);
	assert.equal(verdict.comparable, true);
});

test('#1889: a develop-narrowed classifier (base is broader than develop) is not stale in the widening direction', () => {
	// The check exists to catch develop-WIDENING. A develop-narrowing
	// means the PR's base is already stricter than develop, so the PR
	// sees MORE checks than develop will, not fewer. That is the safe
	// direction: the PR cannot get green-on-PR-red-on-develop from a
	// narrowing, only from a widening. The check must not over-fire.
	assert.ok(
		liveClassifierPattern,
		'live classifier pattern found in docs-archive.yml',
	);

	const developAlternatives = parseClassifierAlternatives(
		liveClassifierPattern,
	);
	assert.ok(developAlternatives);
	// Develop pattern: a STRICT SUBSET of the live one (we drop the
	// audit-docs-prune alternatives). The base carries the full live
	// pattern, so develop is narrower than the base — the PR would
	// see MORE checks than develop will, which is the safe direction.
	const developPattern = `^(${developAlternatives
		.filter((alt) => !/audit-docs-prune/.test(alt))
		.join('|')})`;

	const verdict = compareClassifierFreshness({
		basePattern: liveClassifierPattern,
		developPattern,
	});

	assert.equal(
		verdict.stale,
		false,
		'develop-narrowed patterns must not be reported stale in the widening direction — the PR sees MORE checks than develop will, so it cannot get green-on-PR-red-on-develop from this shape',
	);
	assert.equal(verdict.missingFromBase.length, 0);
	assert.equal(verdict.comparable, true);
});

test('#1889: an unparseable pattern fails loud (parseClassifierAlternatives returns undefined) rather than certify not-stale', () => {
	const verdict = compareClassifierFreshness({
		basePattern: 'not-a-real-classifier-regex',
		developPattern: liveClassifierPattern,
	});

	assert.equal(
		verdict.comparable,
		false,
		'unparseable patterns must NOT be reported as comparable — failing closed is the contract',
	);
	assert.equal(
		verdict.stale,
		false,
		'unparseable patterns must not be reported stale either; the verdict object signals "could not compare" so the CLI fails loud at exit time',
	);
});
