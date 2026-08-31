#!/usr/bin/env node
/**
 * #1569 — forbid unverifiable exhaustiveness claims in PR bodies.
 *
 * A quantified coverage claim ("23 dimensions de validation vérifiées",
 * "12 tests run and all passed") or a bare exhaustiveness claim ("the
 * validation is exhaustive") is worse than a silence: it gives the next
 * reviewer a false assurance and shifts the burden of proof onto them.
 *
 * Rules (issue #1569):
 *   - a QUANTIFIED coverage claim (N + a coverage noun) must be accompanied
 *     by the list of the N items, one proof per line. Otherwise the number
 *     must go and the body must describe what was actually executed. The
 *     guard accepts the claim when the body already enumerates at least N
 *     list items (markdown bullets or numbered list lines).
 *   - a BARE exhaustiveness claim (exhaustive / exhaustively / exhaustif /
 *     exhaustive / exhaustifs / exhaustives) is not verifiable as written.
 *     It must be replaced by a precise statement of what was executed.
 *
 * The body is read from the PR_BODY environment variable, which the CI step
 * fills from the REAL GitHub API response — workflow require-linked-issue.yml,
 * job pr-body-exhaustiveness, step "Verify the PR body makes no
 * unverifiable exhaustiveness claims (#1569)":
 *
 *     PR_BODY="$(gh api "repos/$GH_REPO/pulls/$PR_NUMBER" --jq '.body // ""')"
 *
 * The guard never accepts a body handed to it by the author; the CI step
 * reads the live PR body via the API (never a fixture). PR_BODY unset is a
 * loud configuration failure.
 */
import process from 'node:process';

interface Finding {
	rule: string;
	quote: string;
	fix: string;
}

/**
 * "N <coverage noun>" — the quantified claims #1569 targets. `cas`/`turns`
 * etc. are French coverage nouns; the body may be in either language.
 */
const buildQuantifiedClaim = (): RegExp =>
	new RegExp(
		'\\b\\d{1,4}\\s+(?:' +
			[
				'dimensions?',
				'tests?',
				'cases?',
				'cas',
				'scénarios?',
				'scenarios?',
				'validations?',
				'vérifications?',
				'checks?',
				'turns?',
				'surfaces?',
				'routes?',
				'endpoints?',
				'scopes?',
			].join('|') +
			')\\b',
		'gi',
	);

/** Bare exhaustiveness claims (English + French adjectives). The noun
 * "exhaustiveness" describes the RULE, not a claim, and must not flag. */
const buildExhaustiveClaim = (): RegExp =>
	/\bexhaustiv(?:e|ely)\b|\bexhausti(?:f|fs|ves)\b/gi;

/** Code fences and inline code spans are code, not claims — a fenced or
 * backtick-quoted "23 dimensions" quoted as an EXAMPLE is not a claim. */
const stripCode = (body: string): string =>
	body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

/** Markdown list item lines (bullets + numbered) — "une preuve par ligne". */
const countListItems = (body: string): number =>
	(body.match(/^\s*(?:[-*+]|\d+[.)])\s+/gm) ?? []).length;

export const findExhaustivenessProblems = (body: string): Finding[] => {
	const findings: Finding[] = [];
	const text = stripCode(body);
	const listCount = countListItems(text);
	const seenQuotes = new Set<string>();

	for (const match of text.matchAll(buildQuantifiedClaim())) {
		const key = match[0].toLowerCase();
		if (seenQuotes.has(key)) {
			continue;
		}
		seenQuotes.add(key);
		const claimed = Number.parseInt(match[0], 10);
		if (listCount >= claimed) {
			// The body already enumerates at least N items — one proof per
			// line — so the claim is verifiable by the next reviewer.
			continue;
		}
		findings.push({
			rule: 'quantified coverage claim without an enumerated list',
			quote: match[0],
			fix:
				`The claim "${match[0]}" names ${claimed} item(s) but the body ` +
				`lists only ${listCount}. Either enumerate every claimed item ` +
				'(one per line, a proof per line) or remove the number and ' +
				'describe what was actually executed.',
		});
	}

	for (const match of text.matchAll(buildExhaustiveClaim())) {
		const key = match[0].toLowerCase();
		if (seenQuotes.has(key)) {
			continue;
		}
		seenQuotes.add(key);
		findings.push({
			rule: 'bare exhaustiveness claim',
			quote: match[0],
			fix:
				`"${match[0]}" claims exhaustiveness without any enumeration. ` +
				'Replace it with a precise statement of what was actually ' +
				'executed and how it was verified.',
		});
	}

	return findings;
};

const main = (): void => {
	const body = process.env.PR_BODY;
	if (body === undefined) {
		console.error(
			'check-pr-body-exhaustiveness: PR_BODY is not set. The CI step must ' +
				'fill it from the real GitHub API response ' +
				'(gh api repos/$GH_REPO/pulls/$PR_NUMBER --jq \'.body // ""\'); ' +
				'never run this guard with a fixture body (#1569).',
		);
		process.exit(1);
	}

	const findings = findExhaustivenessProblems(body);
	if (findings.length === 0) {
		console.log(
			'PASSED: the PR body makes no unverifiable exhaustiveness claim (#1569).',
		);
		return;
	}

	console.error(
		`FAILED: the PR body makes ${findings.length} unverifiable exhaustiveness claim(s) (#1569):`,
	);
	for (const finding of findings) {
		console.error(`- ${finding.rule}: "${finding.quote}"`);
		console.error(`    ${finding.fix}`);
	}
	console.error('');
	console.error(
		'Fix the PR body and push again: every claim must be either enumerated ' +
			'one-per-line or removed.',
	);
	process.exit(1);
};

if (
	process.argv[1] !== undefined &&
	import.meta.url.endsWith(process.argv[1])
) {
	main();
}
