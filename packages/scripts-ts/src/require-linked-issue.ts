import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Verifies that a pull request declares a real issue relationship, against the
// live GitHub API.
//
// Formerly the `run:` block of ci.yml::gate::Verify linked issue relationship: a
// 110-line `bash <<'LINKED_ISSUE_SCRIPT'` here-doc — jq extraction, a Dependabot
// waiver (#1240), a relationship keyword parser, a `while read` loop, and three
// different `gh` call shapes including the closing-reference lookup (#2003).
// docs/guides/languages.md: that is a program, so it is a `.ts` script.
//
// Reads the ONE canonical live PR record the `Read live PR snapshot` step
// wrote, never `github.event.pull_request.*` (which can be stale on an edited
// PR).

interface LivePullRequestRecord {
	pr_number: number;
	pr: { author_login: string; body: string };
}

/** The only author logins waived from the linked-issue requirement (#1240). */
const DEPENDABOT_AUTHORS = ['dependabot[bot]', 'app/dependabot'];

/** A relationship keyword at the start of a line, followed by an issue number. */
const RELATIONSHIP =
	/^\s*(?:-\s*)?(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|part\s+of|refs?|references?)[\s:]+#\d+/i;

/** A relationship keyword that claims to CLOSE the issue it names. */
const CLOSING_RELATIONSHIP =
	/^\s*(?:-\s*)?(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[\s:]+/i;

const CLOSING_REFERENCES_QUERY =
	'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){closingIssuesReferences(first:100){nodes{number}}}}';

/** The Dependabot waiver is exact equality against the two integration logins. */
export const waivesIssueRequirement = (author: string): boolean =>
	DEPENDABOT_AUTHORS.includes(author);

/** Every `Closes/Fixes/Resolves/Part of/Refs/References #N` declaration, deduped and sorted. */
export const parseRelationships = (body: string): string[] => {
	const declarations: string[] = [];

	for (const line of body.split('\n')) {
		const match = RELATIONSHIP.exec(line);

		if (match !== null) {
			declarations.push(match[0]);
		}
	}

	return [...new Set(declarations)].sort();
};

/** True when the declaration claims to CLOSE its issue rather than cite it. */
export const isClosingRelationship = (relationship: string): boolean =>
	CLOSING_RELATIONSHIP.test(relationship);

/**
 * Runs `gh`, returning stdout, or null when it exits non-zero (the shell
 * version's `if ! x=$(gh …)`). stderr is dropped, exactly as the step did.
 */
const gh = (args: string[]): string | null => {
	try {
		return execFileSync('gh', args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	} catch {
		return null;
	}
};

const readLiveRecord = (path: string): LivePullRequestRecord => {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as LivePullRequestRecord;
	} catch (error) {
		throw new Error(
			`cannot read the live PR record at ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

const run = () => {
	const record = readLiveRecord(
		process.env.CI_LIVE_PR_RECORD_PATH ?? 'ci-live-pr-record.json',
	);
	const repository = process.env.GH_REPO ?? '';
	const prNumber = String(record.pr_number);
	const author = record.pr.author_login;
	const body = record.pr.body;

	if (waivesIssueRequirement(author)) {
		console.log(
			'dependabot PR — linked-issue requirement waived by policy #1240',
		);
		process.exit(0);
	}

	if (body.trim() === '') {
		console.log(
			'::error::PR body is empty — it must link an issue (e.g. "Closes #123" or "Part of #123").',
		);
		process.exit(1);
	}

	const relationships = parseRelationships(body);

	if (relationships.length === 0) {
		console.log(
			'::error::This PR has no explicit issue relationship on its own line. Add "Closes #123" for complete work or "Part of #123"/"Refs #123" for a partial slice.',
		);
		process.exit(1);
	}

	let closingIssueNumbers: string[] | null = null;

	const verifyClosingIssue = (number: string): boolean => {
		if (closingIssueNumbers === null) {
			const [owner, name] = repository.split('/');
			const output = gh([
				'api',
				'graphql',
				'-f',
				`query=${CLOSING_REFERENCES_QUERY}`,
				'-F',
				`owner=${owner ?? ''}`,
				'-F',
				`name=${name ?? ''}`,
				'-F',
				`number=${prNumber}`,
				'--jq',
				'.data.repository.pullRequest.closingIssuesReferences.nodes[].number',
			]);

			if (output === null) {
				console.log(
					`  could not verify GitHub closingIssuesReferences for PR #${prNumber} — rejecting the closing declaration.`,
				);
				return false;
			}

			closingIssueNumbers = output
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line !== '');
		}

		if (!closingIssueNumbers.includes(number)) {
			console.log(
				`  #${number} is not present in GitHub closingIssuesReferences — rejecting the closing declaration.`,
			);
			return false;
		}

		return true;
	};

	let invalidRelationship = false;
	let linkedIssue = false;

	for (const relationship of relationships) {
		const number = /[0-9]+$/.exec(relationship)?.[0] ?? '';
		const closing = isClosingRelationship(relationship);

		if (number === prNumber) {
			console.log(
				`  #${number} references itself — a pull request cannot satisfy its own issue-link requirement.`,
			);
			invalidRelationship = true;
			continue;
		}

		const isPullRequest = gh([
			'api',
			`repos/${repository}/issues/${number}`,
			'--jq',
			'.pull_request != null',
		]);

		if (isPullRequest === null) {
			console.log(
				`  #${number} could not be verified as an existing issue — rejecting the declaration.`,
			);
			invalidRelationship = true;
			continue;
		}

		if (isPullRequest.trim() === 'true') {
			if (closing) {
				console.log(
					`  #${number} is a pull request, not an issue — rejecting the closing declaration (#2003).`,
				);
				invalidRelationship = true;
			} else {
				console.log(
					`  #${number} is a non-closing pull-request reference — it does not satisfy the issue requirement.`,
				);
			}

			continue;
		}

		if (closing && !verifyClosingIssue(number)) {
			invalidRelationship = true;
			continue;
		}

		const state = gh([
			'issue',
			'view',
			number,
			'--json',
			'state',
			'--jq',
			'.state',
		]);

		if (state !== null) {
			console.log(`✓ PR links issue #${number} (state: ${state.trim()}).`);
			linkedIssue = true;
			continue;
		}

		console.log(
			`  #${number} is not an existing issue — rejecting the declaration.`,
		);
		invalidRelationship = true;
	}

	if (invalidRelationship) {
		console.log(
			'::error::A closing relationship to a PR, a self-reference, an unverifiable number, or a failed closing-reference lookup invalidates the declaration.',
		);
		process.exit(1);
	}

	if (linkedIssue) {
		process.exit(0);
	}

	console.log(
		'::error::The relationship keyword(s) reference no existing issue. Link a real issue with "Closes #N" or "Part of #N".',
	);
	process.exit(1);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	run();
}
