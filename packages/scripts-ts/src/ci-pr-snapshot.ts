import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export type PrSnapshotInput = {
	pr_number: number;
	head_sha: string;
	base_ref_name: string;
	potential_merge_commit_oid: string;
	body: string;
	is_draft: boolean;
	event_name: string;
	event_sha: string;
	workflow_path: string;
	workflow_id: number;
	workflow_action: string;
	run_id: number;
	run_attempt: number;
};

/**
 * Content identity of a merge commit: the tree it records and its parents
 * (first parent = base tip, second parent = PR head). Two merge commits with
 * the same tree and parents are the same merge even when GitHub minted a new
 * object id for them (#2216).
 */
export type MergeCommitContent = {
	tree: string;
	parents: string[];
};

export type LivePotentialMergeCommit = {
	oid?: string;
	tree?: { oid?: string } | null;
	parents?: { nodes?: Array<{ oid?: string } | null> | null } | null;
};

export type LivePrSnapshotBinding = {
	pr: {
		headRefOid: string;
		baseRefName: string;
		potentialMergeCommit?: LivePotentialMergeCommit | null;
		body?: string | null;
		isDraft: boolean;
	};
	run: {
		head_sha: string;
		path: string;
		workflow_id: number;
		event: string;
		id: number;
		run_attempt: number;
	};
	eventSha: string;
	/**
	 * Tree and parents of the event merge commit (`GITHUB_SHA`). Only consulted
	 * when the event SHA differs from the live potential merge commit's oid.
	 */
	eventMergeCommit?: MergeCommitContent | null;
	eventName?: string;
	runId: number;
	runAttempt: number;
};

export type LivePrRecord = {
	headRefOid: string;
	baseRefName: string;
	mergeOid: string;
	mergeTree?: string;
	mergeParents?: string[];
	body: string;
	isDraft: boolean;
};

const sameParents = (a: string[], b: string[]): boolean =>
	a.length === b.length && a.every((oid, index) => oid === b[index]);

const isSameMergeContent = (before: LivePrRecord, after: LivePrRecord) =>
	before.mergeTree !== undefined &&
	before.mergeParents !== undefined &&
	before.mergeTree === after.mergeTree &&
	after.mergeParents !== undefined &&
	sameParents(before.mergeParents, after.mergeParents);

export const liveMergeCommitContent = (
	commit: LivePotentialMergeCommit | null | undefined,
): MergeCommitContent | undefined => {
	const tree = commit?.tree?.oid;
	const parents = (commit?.parents?.nodes ?? []).map((node) => node?.oid);
	if (!tree || parents.some((oid) => !oid)) {
		return undefined;
	}
	return { tree, parents: parents as string[] };
};

/**
 * Binds the event merge commit to the live potential merge commit by content
 * rather than object id. GitHub recreates the test merge commit (new oid, new
 * timestamp) on ready_for_review, description edits and similar events without
 * changing what is being merged; a re-run keeps the old event SHA, so an
 * oid-equality check could never recover (#2216). A real head move or base move
 * still changes the parents, and any content change changes the tree.
 */
const assertEventMergeMatchesLive = (
	eventSha: string,
	mergeOid: string,
	event: MergeCommitContent | null | undefined,
	live: MergeCommitContent | undefined,
	headRefOid: string,
): void => {
	const stale = (detail: string): Error =>
		new Error(
			`stale event SHA does not match merge commit: event ${eventSha} vs live ${mergeOid} (${detail})`,
		);
	if (event === null || event === undefined || live === undefined) {
		throw stale('merge commit tree and parents are unavailable to compare');
	}
	if (event.parents.length !== 2 || live.parents.length !== 2) {
		throw stale('expected a two-parent merge commit on both sides');
	}
	if (event.parents[1] !== headRefOid || live.parents[1] !== headRefOid) {
		throw stale('the PR head moved since the event merge commit was created');
	}
	if (event.parents[0] !== live.parents[0]) {
		throw stale(
			`the base branch moved: event base ${event.parents[0]}, live base ${live.parents[0]}`,
		);
	}
	if (event.tree !== live.tree) {
		throw stale(
			`the merge tree differs: event ${event.tree}, live ${live.tree}`,
		);
	}
};

export const assertLivePrRecordUnchanged = (
	before: LivePrRecord,
	after: LivePrRecord,
): void => {
	for (const field of [
		'headRefOid',
		'baseRefName',
		'mergeOid',
		'body',
		'isDraft',
	] as const) {
		if (
			field === 'mergeOid' &&
			before.mergeOid !== after.mergeOid &&
			isSameMergeContent(before, after)
		) {
			// GitHub re-minted the test merge commit with the same tree and parents.
			continue;
		}
		if (before[field] !== after[field]) {
			throw new Error(
				`live PR ${field} changed between policy read and snapshot`,
			);
		}
	}
};

export const validatePrSnapshotBinding = ({
	pr,
	run,
	eventSha,
	eventMergeCommit,
	eventName,
	runId,
	runAttempt,
}: LivePrSnapshotBinding): void => {
	const mergeOid = pr.potentialMergeCommit?.oid;
	if (!mergeOid) {
		throw new Error('live PR has no potential merge commit');
	}
	if (pr.headRefOid !== run.head_sha) {
		throw new Error('live PR head does not match workflow run head');
	}
	if (eventSha !== mergeOid) {
		assertEventMergeMatchesLive(
			eventSha,
			mergeOid,
			eventMergeCommit,
			liveMergeCommitContent(pr.potentialMergeCommit),
			pr.headRefOid,
		);
	}
	if (eventName !== undefined && eventName !== run.event) {
		throw new Error('workflow event does not match the current event');
	}
	if (run.path !== '.github/workflows/ci.yml') {
		throw new Error('workflow path does not match the central workflow');
	}
	if (run.event !== 'pull_request') {
		throw new Error('workflow action is not pull_request');
	}
	if (run.id !== runId || run.run_attempt !== runAttempt) {
		throw new Error('workflow run identity does not match the current attempt');
	}
};

export const createPrSnapshot = (input: PrSnapshotInput) => ({
	schema_version: 1 as const,
	pr_number: input.pr_number,
	head_sha: input.head_sha,
	base_ref_name: input.base_ref_name,
	potential_merge_commit_oid: input.potential_merge_commit_oid,
	body_sha256: createHash('sha256').update(input.body).digest('hex'),
	is_draft: input.is_draft,
	event_name: input.event_name,
	event_sha: input.event_sha,
	workflow_path: input.workflow_path,
	workflow_id: input.workflow_id,
	workflow_action: input.workflow_action,
	run_id: input.run_id,
	run_attempt: input.run_attempt,
});

const ghJson = <T>(args: string[]): T =>
	JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));

const POTENTIAL_MERGE_COMMIT_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){potentialMergeCommit{oid tree{oid} parents(first:3){nodes{oid}}}}}}`;

// One GraphQL read so the oid, tree and parents describe the same merge commit.
const readLivePotentialMergeCommit = (
	repo: string,
	prNumber: string,
): LivePotentialMergeCommit | null => {
	const [owner = '', name = ''] = repo.split('/');
	const response = ghJson<{
		data?: {
			repository?: {
				pullRequest?: {
					potentialMergeCommit?: LivePotentialMergeCommit | null;
				} | null;
			} | null;
		};
	}>([
		'api',
		'graphql',
		'-f',
		`query=${POTENTIAL_MERGE_COMMIT_QUERY}`,
		'-F',
		`owner=${owner}`,
		'-F',
		`name=${name}`,
		'-F',
		`number=${prNumber}`,
	]);
	return response.data?.repository?.pullRequest?.potentialMergeCommit ?? null;
};

const git = (args: string[]): string =>
	execFileSync('git', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

// The gate job checks out the event merge commit with `fetch-depth: 0`, so the
// object is local even after GitHub has re-minted the live merge commit. The
// REST commits API is the fallback if the checkout lacks it.
export const readEventMergeCommit = (
	repo: string,
	eventSha: string,
): MergeCommitContent | null => {
	try {
		const [, ...parents] = git(['rev-list', '--parents', '-n', '1', eventSha])
			.split(/\s+/)
			.filter(Boolean);
		const tree = git(['rev-parse', `${eventSha}^{tree}`]);
		if (tree) {
			return { tree, parents };
		}
	} catch {
		// fall through to the REST API
	}
	try {
		const commit = ghJson<{
			commit?: { tree?: { sha?: string } };
			parents?: Array<{ sha?: string }>;
		}>(['api', `repos/${repo}/commits/${eventSha}`]);
		const tree = commit.commit?.tree?.sha;
		if (tree) {
			return {
				tree,
				parents: (commit.parents ?? []).map((parent) => parent.sha ?? ''),
			};
		}
	} catch {
		// unavailable: the binding check reports it as stale
	}
	return null;
};

type LivePrApiResponse = LivePrSnapshotBinding['pr'] & {
	author?: { login?: string | null } | null;
};

type LivePrRecordEnvelope = {
	schema_version: 1;
	pr_number: number;
	pr: LivePrRecord & { author_login: string };
	run: LivePrSnapshotBinding['run'];
	event_sha: string;
	event_name: string;
};

const readLivePrRecord = (
	repo: string,
	prNumber: string,
	runId: number,
	runAttempt: number,
	eventSha: string,
	eventName: string,
): LivePrRecordEnvelope => {
	const pr = ghJson<LivePrApiResponse>([
		'pr',
		'view',
		prNumber,
		'--repo',
		repo,
		'--json',
		'headRefOid,baseRefName,potentialMergeCommit,body,isDraft,author',
	]);
	pr.potentialMergeCommit = readLivePotentialMergeCommit(repo, prNumber);
	const run = ghJson<LivePrSnapshotBinding['run']>([
		'api',
		`repos/${repo}/actions/runs/${runId}`,
	]);
	const mergeOid = pr.potentialMergeCommit?.oid;
	if (!mergeOid) {
		throw new Error('live PR has no potential merge commit');
	}
	validatePrSnapshotBinding({
		pr,
		run,
		eventSha,
		eventMergeCommit:
			eventSha === mergeOid ? undefined : readEventMergeCommit(repo, eventSha),
		eventName,
		runId,
		runAttempt,
	});
	return {
		schema_version: 1,
		pr_number: Number(prNumber),
		pr: {
			headRefOid: pr.headRefOid,
			baseRefName: pr.baseRefName,
			mergeOid,
			mergeTree: liveMergeCommitContent(pr.potentialMergeCommit)?.tree,
			mergeParents: liveMergeCommitContent(pr.potentialMergeCommit)?.parents,
			body: pr.body ?? '',
			isDraft: pr.isDraft,
			author_login: pr.author?.login ?? '',
		},
		run,
		event_sha: eventSha,
		event_name: eventName,
	};
};

export const assertRunUnchanged = (
	before: LivePrSnapshotBinding['run'],
	after: LivePrSnapshotBinding['run'],
): void => {
	for (const field of [
		'head_sha',
		'path',
		'workflow_id',
		'event',
		'id',
		'run_attempt',
	] as const) {
		if (before[field] !== after[field]) {
			throw new Error(
				`workflow run ${field} changed between policy read and snapshot`,
			);
		}
	}
};

const isDirectRun =
	process.argv[1]
		?.replaceAll('\\', '/')
		.endsWith('packages/scripts-ts/src/ci-pr-snapshot.ts') ?? false;

if (isDirectRun) {
	const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY;
	const prNumber =
		process.env.PR_NUMBER ?? process.env.GITHUB_EVENT_PULL_REQUEST_NUMBER;
	const eventSha = process.env.GITHUB_SHA;
	const runId = Number(process.env.GITHUB_RUN_ID ?? 0);
	const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT ?? 1);
	if (!repo || !prNumber || !eventSha) {
		throw new Error(
			'GH_REPO, PR_NUMBER, and GITHUB_SHA are required for a PR snapshot',
		);
	}
	const eventName = process.env.GITHUB_EVENT_NAME ?? 'pull_request';
	const outputDirectory = process.env.CI_RESULT_DIR ?? 'ci-results';
	const liveRecordPath =
		process.env.CI_LIVE_PR_RECORD_PATH ??
		path.join(outputDirectory, 'ci-live-pr.json');
	const phase = process.env.CI_PR_PHASE ?? 'snapshot';
	const canonical =
		phase === 'snapshot'
			? (JSON.parse(
					await readFile(liveRecordPath, 'utf8'),
				) as LivePrRecordEnvelope)
			: undefined;
	const live = readLivePrRecord(
		repo,
		prNumber,
		runId,
		runAttempt,
		eventSha,
		eventName,
	);
	if (canonical !== undefined) {
		assertLivePrRecordUnchanged(canonical.pr, live.pr);
		assertRunUnchanged(canonical.run, live.run);
		if (canonical.event_sha !== live.event_sha) {
			throw new Error('event SHA changed between policy read and snapshot');
		}
		if (canonical.event_name !== live.event_name) {
			throw new Error('event name changed between policy read and snapshot');
		}
	} else {
		await mkdir(path.dirname(liveRecordPath), { recursive: true });
		await writeFile(liveRecordPath, `${JSON.stringify(live, null, 2)}\n`);
		process.exit(0);
	}
	const mergeOid = live.pr.mergeOid;
	const snapshot = createPrSnapshot({
		pr_number: live.pr_number,
		head_sha: live.pr.headRefOid,
		base_ref_name: live.pr.baseRefName,
		potential_merge_commit_oid: mergeOid,
		body: live.pr.body,
		is_draft: live.pr.isDraft,
		event_name: eventName,
		event_sha: eventSha,
		workflow_path: live.run.path,
		workflow_id: live.run.workflow_id,
		workflow_action: live.run.event,
		run_id: live.run.id,
		run_attempt: live.run.run_attempt,
	});
	const output = path.join(outputDirectory, 'ci-pr-snapshot.json');
	await mkdir(path.dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
}
