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

export type LivePrSnapshotBinding = {
	pr: {
		headRefOid: string;
		baseRefName: string;
		potentialMergeCommit?: { oid?: string } | null;
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
	eventName?: string;
	runId: number;
	runAttempt: number;
};

export type LivePrRecord = {
	headRefOid: string;
	baseRefName: string;
	mergeOid: string;
	body: string;
	isDraft: boolean;
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
		throw new Error('stale event SHA does not match merge commit');
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
