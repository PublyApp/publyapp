import { execFileSync, spawnSync } from 'node:child_process';
import {
	appendFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type { JsonValue } from './json-value.ts';

// Time-balanced Playwright shards planned ONCE per queue entry.
//
// The plan is computed in `e2e-build` from the same `--list` Playwright would
// run, then every shard consumes that single JSON. The reports the shards
// upload are re-read here: `verify` proves every expected test ran exactly
// once, `record` stores per-file durations for the next plan.

export const SHARD_COUNT = 6;

export type TestRef = {
	key: string;
	file: string;
	project: string;
	title: string;
};
export type Durations = Record<string, number>;
export type Shard = {
	shard: number;
	files: string[];
	tests: number;
	weight: number;
};
export type Plan = {
	shards: Shard[];
	expected: TestRef[];
	durations: Durations;
};

type JsonNode = {
	file?: string;
	title?: string;
	suites?: JsonNode[];
	specs?: {
		file?: string;
		title?: string;
		tests?: { projectName?: string }[];
	}[];
};

export const flattenTests = (
	report: JsonNode,
	titles: string[] = [],
): TestRef[] => {
	const path = report.title ? [...titles, report.title] : titles;
	const out: TestRef[] = [];
	for (const spec of report.specs ?? []) {
		const file = spec.file ?? report.file ?? '';
		const title = [...path, spec.title ?? ''].filter(Boolean).join(' > ');
		if (file.length === 0) {
			throw new Error(
				`playwright report spec "${title}" has no file: the report is truncated or its shape changed`,
			);
		}
		for (const test of spec.tests ?? []) {
			const project = test.projectName ?? '';
			if (project === '') {
				throw new Error(
					`playwright report test "${file} > ${title}" has no projectName: the report shape changed`,
				);
			}
			if (project === 'setup') {
				continue;
			}
			out.push({ key: `${file}::${project}::${title}`, file, project, title });
		}
	}
	for (const child of report.suites ?? []) {
		out.push(...flattenTests(child, path));
	}
	return out;
};
export const partition = (
	weights: { file: string; weight: number }[],
	count: number,
): string[][] => {
	const shards = Array.from({ length: count }, () => ({
		files: [] as string[],
		load: 0,
	}));
	for (const entry of [...weights].sort(
		(a, b) => b.weight - a.weight || a.file.localeCompare(b.file),
	)) {
		let target = shards[0];
		if (target === undefined) {
			return [];
		}
		for (const shard of shards) {
			if (shard.load < target.load) {
				target = shard;
			}
		}
		target.files.push(entry.file);
		target.load += entry.weight;
	}
	return shards.map((shard) => shard.files.sort());
};
export const buildPlan = (
	tests: TestRef[],
	shardCount: number,
	durations: Durations,
) => {
	const perFile = new Map<string, number>();
	for (const test of tests) {
		perFile.set(test.file, (perFile.get(test.file) ?? 0) + 1);
	}
	const weights = [...perFile].map(([file, count]) => {
		const recorded = durations[file];
		return {
			file,
			// A recorded 0 (a report with no durations) is missing data, not a
			// weight: fall back to the test count like an absent entry.
			weight: recorded !== undefined && recorded > 0 ? recorded : count * 3,
		};
	});
	const filesByShard = partition(weights, shardCount);
	const weightOf = new Map(weights.map((entry) => [entry.file, entry.weight]));
	const countOf = new Map([...perFile].map(([file, count]) => [file, count]));
	const shards = filesByShard.map((files, index) => {
		let testsInShard = 0;
		let weight = 0;
		for (const file of files) {
			testsInShard += countOf.get(file) ?? 0;
			weight += weightOf.get(file) ?? 0;
		}
		return { shard: index + 1, files, tests: testsInShard, weight };
	});
	return { shards, expected: tests, durations } satisfies Plan;
};
const reportOf = (file: string): JsonNode =>
	JSON.parse(readFileSync(file, 'utf8')) as JsonNode;
const writeOutput = (name: string, value: string) => {
	const output = process.env.GITHUB_OUTPUT;
	if (output === undefined) {
		throw new Error('GITHUB_OUTPUT is not set');
	}
	appendFileSync(output, `${name}=${value}\n`);
};
const isDurations = (value: JsonValue): value is Durations =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every(
		(entry) =>
			typeof entry === 'number' && Number.isFinite(entry) && entry >= 0,
	);
const listSuccessfulMergeQueueRuns = (): { id: string; attempt: string }[] => {
	const listed = execFileSync(
		'gh',
		[
			'run',
			'list',
			'--workflow',
			'ci.yml',
			'--event',
			'merge_group',
			'--status',
			'success',
			'--limit',
			'10',
			'--json',
			'databaseId,runAttempt',
			'--jq',
			'.[] | "\\(.databaseId) \\(.runAttempt)"',
		],
		{ encoding: 'utf8' },
	);
	const runs: { id: string; attempt: string }[] = [];
	for (const line of listed.split('\n')) {
		const [id, attempt] = line.trim().split(/\s+/);
		if (id !== undefined && id.length > 0) {
			runs.push({ id, attempt: attempt ?? '1' });
		}
	}
	return runs;
};
const readDurationsArtifact = (
	dir: string,
	run: { id: string; attempt: string },
): Durations | undefined => {
	const download = spawnSync(
		'gh',
		[
			'run',
			'download',
			run.id,
			'-n',
			`e2e-file-durations-${run.attempt}`,
			'-D',
			dir,
		],
		{ encoding: 'utf8' },
	);
	if (download.status !== 0) {
		return undefined;
	}
	const [file] = readdirSync(dir);
	if (file === undefined) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(
			readFileSync(path.join(dir, file), 'utf8'),
		) as JsonValue;
		if (!isDurations(parsed)) {
			console.log(
				`::warning::ignoring the durations artifact of run ${run.id}: it is not a file-to-seconds map; cold-start weights`,
			);
			return undefined;
		}
		return parsed;
	} catch (error) {
		console.log(
			`::warning::ignoring the unreadable durations artifact of run ${run.id} (${String(error)}); trying an older run`,
		);
		return undefined;
	}
};
const restoreDurations = () => {
	const base = mkdtempSync(path.join(os.tmpdir(), 'e2e-durations-'));
	try {
		let runs: { id: string; attempt: string }[];
		try {
			runs = listSuccessfulMergeQueueRuns();
		} catch (error) {
			console.log(
				`::warning::could not list previous merge-queue runs (${String(error)}); cold-start weights`,
			);
			return {};
		}
		for (const run of runs) {
			const durations = readDurationsArtifact(path.join(base, run.id), run);
			if (durations !== undefined) {
				return durations;
			}
		}
		return {};
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
};
/** Absolute by design: Playwright resolves a relative outputFile against the
 * config directory (`apps/front`), not against this script's cwd. */
export const specListFile = (): string =>
	path.resolve('apps/front', 'e2e-artifacts', 'spec-list.json');
const listTests = (listFile: string): TestRef[] => {
	mkdirSync(path.dirname(listFile), { recursive: true });
	const listed = spawnSync(
		'pnpm',
		['--filter', 'front', 'exec', 'playwright', 'test', '--list'],
		{
			stdio: 'inherit',
			env: {
				...process.env,
				E2E_LANE: 'full',
				PLAYWRIGHT_JSON_OUTPUT: listFile,
			},
		},
	);
	if (listed.status !== 0) {
		throw new Error(
			`playwright --list failed with exit ${String(listed.status)}: the shard plan needs the real test list`,
		);
	}
	return flattenTests(reportOf(listFile));
};
const plan = () => {
	if (process.env.GITHUB_EVENT_NAME !== 'merge_group') {
		console.log('not a merge_queue entry: no partition to compute');
		writeOutput('plan', '');
		return;
	}
	const tests = listTests(specListFile());
	if (tests.length === 0) {
		throw new Error(
			'playwright --list returned no non-setup tests: refusing to publish an empty plan',
		);
	}
	const result = buildPlan(tests, SHARD_COUNT, restoreDurations());
	for (const shard of result.shards) {
		console.log(
			`shard ${shard.shard}/${SHARD_COUNT}: ${shard.files.length} files, ${shard.tests} tests, weight ${shard.weight}`,
		);
	}
	writeOutput('plan', JSON.stringify(result));
};
const readPlan = (): Plan => {
	const raw = process.env.E2E_SHARD_PLAN;
	if (raw === undefined || raw.length === 0) {
		throw new Error('E2E_SHARD_PLAN is not set: no shard plan to consume');
	}
	const parsed = JSON.parse(raw) as Partial<Plan>;
	if (!Array.isArray(parsed.shards) || !Array.isArray(parsed.expected)) {
		throw new Error('E2E_SHARD_PLAN is not a shard plan');
	}
	return parsed as Plan;
};
const artifactsDir = (): string => process.env.E2E_ARTIFACTS ?? 'e2e-artifacts';
const isNonMergeQueueEvent = (): boolean => {
	const event = process.env.GITHUB_EVENT_NAME;
	return event !== undefined && event !== '' && event !== 'merge_group';
};
const flattenDownloadedArtifacts = (dir: string) => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}
		const nested = path.join(dir, entry.name);
		for (const file of readdirSync(nested)) {
			renameSync(path.join(nested, file), path.join(dir, file));
		}
		rmSync(nested, { recursive: true, force: true });
	}
};
/** Downloads this attempt's shard reports; a no-op outside the merge queue. */
export const downloadShards = () => {
	if (isNonMergeQueueEvent()) {
		console.log('not a merge_queue entry: no shard reports to download');
		return;
	}
	const runId = process.env.GITHUB_RUN_ID;
	if (runId === undefined || runId.length === 0) {
		throw new Error('GITHUB_RUN_ID is not set');
	}
	const dir = artifactsDir();
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	execFileSync(
		'gh',
		[
			'run',
			'download',
			runId,
			'-p',
			`e2e-shard-report-*-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`,
			'-D',
			dir,
			'--clobber',
		],
		{ stdio: 'inherit' },
	);
	flattenDownloadedArtifacts(dir);
};
const verify = () => {
	if (isNonMergeQueueEvent()) {
		console.log('not a merge_queue entry: no coverage proof to run');
		return;
	}
	const planned = readPlan();
	const expected = planned.expected;
	if (expected.length === 0) {
		throw new Error(
			'the shard plan has no expected tests: refusing to certify an empty plan',
		);
	}
	const dir = artifactsDir();
	const observed: TestRef[] = readdirSync(dir)
		.filter((file) => file.endsWith('.json') && file.startsWith('playwright-'))
		.flatMap((file) => flattenTests(reportOf(path.join(dir, file))));
	const counts = new Map<string, number>();
	for (const test of observed) {
		counts.set(test.key, (counts.get(test.key) ?? 0) + 1);
	}
	const expectedKeys = new Set(expected.map((test) => test.key));
	const problems: string[] = [];
	for (const test of expected) {
		const seen = counts.get(test.key) ?? 0;
		if (seen !== 1) {
			problems.push(
				`${seen === 0 ? 'missing' : 'duplicated'} test ${test.key} (ran ${seen} times)`,
			);
		}
	}
	for (const [key, seen] of counts) {
		if (!expectedKeys.has(key)) {
			problems.push(`unexpected test ${key} (ran ${seen} times)`);
		}
	}
	console.log(
		`coverage: ${expected.length} expected tests, ${observed.length} executed records`,
	);
	for (const problem of problems) {
		console.error(`::error::${problem}`);
	}
	if (problems.length > 0) {
		process.exit(1);
	}
	console.log('coverage: every expected test ran exactly once');
};
const record = () => {
	if (isNonMergeQueueEvent()) {
		console.log('not a merge_queue entry: no durations to record');
		return;
	}
	const durations: Durations = {};
	const dir = artifactsDir();
	for (const file of readdirSync(dir).filter(
		(name) => name.startsWith('playwright-') && name.endsWith('.json'),
	)) {
		const walk = (node: JsonNode) => {
			for (const spec of node.specs ?? []) {
				const filePath = spec.file ?? node.file ?? '';
				const durationsOf = (spec.tests ?? []).flatMap((test) =>
					((test as { results?: { duration?: number }[] }).results ?? []).map(
						(result) => result.duration ?? 0,
					),
				);
				const seconds = Math.max(0, ...durationsOf) / 1000;
				if (filePath.length > 0) {
					durations[filePath] = (durations[filePath] ?? 0) + seconds;
				}
			}
			for (const child of node.suites ?? []) {
				walk(child);
			}
		};
		walk(reportOf(path.join(dir, file)));
	}
	writeFileSync(
		process.env.E2E_OUT ?? path.join(dir, 'playwright-file-durations.json'),
		`${JSON.stringify(durations, null, 2)}\n`,
	);
};
const escape = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Playwright matches positional filters against the ABSOLUTE test path, so the
 * anchor must allow the leading directories. `^(?:file)$` matches nothing.
 */
export const specFilter = (file: string): string => `(?:^|/)${escape(file)}$`;
export const PLAYWRIGHT_PROJECTS = [
	'chromium',
	'chromium-faults',
	'chromium-hermetic-source',
	'chromium-hermetic-counter',
] as const;
/** `--with-deps` installs the shared libraries Chromium needs on a bare runner. */
export const PLAYWRIGHT_INSTALL_ARGS = [
	'install',
	'chromium',
	'--with-deps',
] as const;
export const shardTestArgs = (entry: Shard): string[] => [
	'test',
	...PLAYWRIGHT_PROJECTS.map((project) => `--project=${project}`),
	...entry.files.map(specFilter),
];
const spawnPlaywright = (args: string[]) => {
	const result = spawnSync(
		'pnpm',
		['--filter', 'front', 'exec', 'playwright', ...args],
		{ stdio: 'inherit' },
	);
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
};
export const runShard = () => {
	const shard = Number(process.argv[2] ?? process.env.MATRIX_SHARD ?? 0);
	const plan = readPlan();
	const entry = plan.shards.find((candidate) => candidate.shard === shard);
	if (entry === undefined) {
		throw new Error(`the plan has no shard ${shard}`);
	}
	console.log(
		`shard ${shard}: ${entry.files.length} files, ${entry.tests} tests`,
	);
	if (entry.files.length > 0) {
		spawnPlaywright([...PLAYWRIGHT_INSTALL_ARGS]);
		spawnPlaywright(shardTestArgs(entry));
	}
	if (shard === 1) {
		const contrast = spawnSync(
			'pnpm',
			['--filter', 'front', 'test:drawer-contrast'],
			{
				stdio: 'inherit',
			},
		);
		if (contrast.status !== 0) {
			process.exit(contrast.status ?? 1);
		}
	}
};

if (process.argv[1]?.endsWith('ci-e2e-shard.ts')) {
	const command = process.argv[2];
	if (command === 'plan') {
		plan();
	} else if (command === 'download') {
		downloadShards();
	} else if (command === 'verify') {
		verify();
	} else if (command === 'record') {
		// A failed suite has no trustworthy durations to record; the run is
		// already red through `verify`, so skip instead of failing this step.
		if (process.env.E2E_TEST_RESULT === 'success') {
			record();
		} else {
			console.log('the full e2e lane did not succeed: skipping durations');
		}
	} else {
		throw new Error('usage: ci-e2e-shard.ts <plan|run|download|verify|record>');
	}
}
