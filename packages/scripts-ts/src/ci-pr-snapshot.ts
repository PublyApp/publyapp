import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
	runId: number;
	runAttempt: number;
};

export const validatePrSnapshotBinding = ({
	pr,
	run,
	eventSha,
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
	const pr = ghJson<LivePrSnapshotBinding['pr']>([
		'pr',
		'view',
		prNumber,
		'--repo',
		repo,
		'--json',
		'headRefOid,baseRefName,potentialMergeCommit,body,isDraft',
	]);
	const run = ghJson<LivePrSnapshotBinding['run']>([
		'api',
		`repos/${repo}/actions/runs/${runId}`,
	]);
	const mergeOid = pr.potentialMergeCommit?.oid;
	if (!mergeOid) {
		throw new Error('live PR has no potential merge commit');
	}
	validatePrSnapshotBinding({ pr, run, eventSha, runId, runAttempt });
	const snapshot = createPrSnapshot({
		pr_number: Number(prNumber),
		head_sha: pr.headRefOid,
		base_ref_name: pr.baseRefName,
		potential_merge_commit_oid: mergeOid,
		body: pr.body ?? '',
		is_draft: pr.isDraft,
		event_name: process.env.GITHUB_EVENT_NAME ?? 'pull_request',
		event_sha: eventSha,
		workflow_path: run.path,
		workflow_id: run.workflow_id,
		workflow_action: run.event,
		run_id: run.id,
		run_attempt: run.run_attempt,
	});
	const output = path.join(
		process.env.CI_RESULT_DIR ?? 'ci-results',
		'ci-pr-snapshot.json',
	);
	await mkdir(path.dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
}
