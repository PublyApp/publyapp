import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Quality palier 1 gate (#2438): function cap, per-zone ratchet, PR size.
// All thresholds live in quality-baseline.json; see docs/guides/quality-ratchet.md.
// Numbers come from `coderot analyze` (local, never `ci`: that mode uploads) so
// the weekly figures and this gate agree.

export type Zone = 'api' | 'front' | 'tests-api' | 'tests-front' | 'tooling';
export const ZONES: readonly Zone[] = [
	'api',
	'front',
	'tests-api',
	'tests-front',
	'tooling',
];

export interface ZoneBaseline {
	complexityPer1k: number;
	duplicationPer1k: number;
}
export interface FunctionException {
	path: string;
	name: string;
	reason: string;
}
export interface Baseline {
	functionCap: number;
	prSizeMaxLines: number;
	sizeExceptionLabel: string;
	tolerancePer1k: number;
	zones: Record<Zone, ZoneBaseline>;
	exceptions: FunctionException[];
}

export interface CoderotFunction {
	name: string;
	start: number;
	end: number;
	cognitive: number;
	sloc: number;
}
export interface CoderotBlob {
	sloc: number;
	functions: CoderotFunction[];
}
export interface CoderotSnapshot {
	files: { path: string; blob: string; test: boolean }[];
	blobs: Record<string, CoderotBlob>;
	clones?: { locations: { path: string; start: number; end: number }[] }[];
}

const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, '../../..');
const baselinePath = path.join(here, 'quality-baseline.json');
const coderotBin = path.resolve(
	here,
	'../node_modules/@coderot-ai/cli/dist/coderot.js',
);

// ---------------------------------------------------------------- classify

const EXCLUDED =
	/(\.g\.cs$|routeTree\.gen\.ts$|\/generated\/|\/Migrations\/|^packages\/client-ts\/|\/openapi\.json$|^\.worktrees\/|\/node_modules\/)/;
const TEST_CS = /(\.Spec\.cs$|^apps\/api\/Tests\/)/;
const TEST_TS =
	/(\.(test|spec)\.[cm]?[tj]sx?$|\/__tests__\/|^apps\/front\/(e2e|tests|deploy)\/)/;
const TOOLING =
	/^(packages\/(scripts-ts|lint-ts|lint-cs|scripts-cs)\/|apps\/front\/(scripts|tools)\/)/;
const CODE = /\.(cs|[cm]?[tj]sx?)$/;

/** Zone of a source file, or null when the file is out of the gate's scope. */
export const classifyPath = (
	file: string,
	coderotTest = false,
): Zone | null => {
	if (!CODE.test(file) || EXCLUDED.test(file)) {
		return null;
	}
	if (TEST_CS.test(file)) {
		return 'tests-api';
	}
	if (TEST_TS.test(file) || (coderotTest && !file.endsWith('.cs'))) {
		return 'tests-front';
	}
	if (TOOLING.test(file)) {
		return 'tooling';
	}
	if (file.startsWith('apps/api/')) {
		return 'api';
	}
	if (/^(apps\/front\/src\/|packages\/shared-ts\/|apps\/mobile\/)/.test(file)) {
		return 'front';
	}
	return file.startsWith('apps/front/') ? 'tooling' : null;
};

/** Files that never count toward the PR size budget. */
const SIZE_EXEMPT =
	/(pnpm-lock\.yaml$|package-lock\.json$|packages\.lock\.json$|\.lock$|\.snap$|\/__snapshots__\/)/;
export const isSizeExempt = (file: string): boolean => {
	if (SIZE_EXEMPT.test(file) || EXCLUDED.test(file)) {
		return true;
	}
	return TEST_CS.test(file) || TEST_TS.test(file);
};

// ----------------------------------------------------------------- metrics

export type ZoneMetrics = Record<
	Zone,
	{ sloc: number; cognitive: number; duplicated: number }
>;

const unionLength = (ranges: [number, number][]): number => {
	let total = 0;
	let end = 0;
	for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
		if (to > end) {
			total += to - Math.max(from, end + 1) + 1;
		}
		end = Math.max(end, to);
	}
	return total;
};

const cloneRanges = (
	snap: CoderotSnapshot,
): Map<string, [number, number][]> => {
	const byPath = new Map<string, [number, number][]>();
	for (const clone of snap.clones ?? []) {
		for (const loc of clone.locations) {
			const list = byPath.get(loc.path) ?? [];
			list.push([loc.start, loc.end]);
			byPath.set(loc.path, list);
		}
	}
	return byPath;
};

export const measureZones = (snap: CoderotSnapshot): ZoneMetrics => {
	const out = Object.fromEntries(
		ZONES.map((z) => [z, { sloc: 0, cognitive: 0, duplicated: 0 }]),
	) as ZoneMetrics;
	const clones = cloneRanges(snap);
	for (const file of snap.files) {
		const zone = classifyPath(file.path, file.test);
		const blob = snap.blobs[file.blob];
		if (!zone || !blob) {
			continue;
		}
		out[zone].sloc += blob.sloc;
		for (const fn of blob.functions) {
			out[zone].cognitive += fn.cognitive;
		}
		out[zone].duplicated += unionLength(clones.get(file.path) ?? []);
	}
	return out;
};

const per1k = (value: number, sloc: number): number =>
	sloc === 0 ? 0 : Math.round((value / sloc) * 10000) / 10;

export const toBaselineZones = (m: ZoneMetrics): Record<Zone, ZoneBaseline> =>
	Object.fromEntries(
		ZONES.map((z) => [
			z,
			{
				complexityPer1k: per1k(m[z].cognitive, m[z].sloc),
				duplicationPer1k: per1k(m[z].duplicated, m[z].sloc),
			},
		]),
	) as Record<Zone, ZoneBaseline>;

/** Ratchet: every zone metric must stay <= committed baseline + tolerance. */
export const checkRatchet = (
	measured: Record<Zone, ZoneBaseline>,
	baseline: Baseline,
): string[] => {
	const errors: string[] = [];
	for (const zone of ZONES) {
		for (const key of ['complexityPer1k', 'duplicationPer1k'] as const) {
			const limit = baseline.zones[zone][key] + baseline.tolerancePer1k;
			if (measured[zone][key] > limit) {
				errors.push(
					`RATCHET ${zone}.${key}: ${measured[zone][key]} > baseline ${baseline.zones[zone][key]} (+${baseline.tolerancePer1k} tolerance). Reduce complexity/duplication in this zone; never raise the baseline without an owner exception.`,
				);
			}
		}
	}
	return errors;
};

/** Lowers (never raises) baseline values that the measure beats; rounds up. */
export const lowerBaseline = (
	measured: Record<Zone, ZoneBaseline>,
	baseline: Baseline,
): Baseline => {
	const zones = { ...baseline.zones };
	for (const zone of ZONES) {
		zones[zone] = {
			complexityPer1k: Math.min(
				baseline.zones[zone].complexityPer1k,
				measured[zone].complexityPer1k,
			),
			duplicationPer1k: Math.min(
				baseline.zones[zone].duplicationPer1k,
				measured[zone].duplicationPer1k,
			),
		};
	}
	return { ...baseline, zones };
};

// ------------------------------------------------------------ function cap

export interface Touch {
	start: number;
	end: number;
	/** Pure deletion between lines start and end: only touches a function spanning both. */
	between: boolean;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

const hunkToTouch = (line: string): Touch | null => {
	const m = HUNK.exec(line);
	if (!m) {
		return null;
	}
	const start = Number(m[1]);
	const count = m[2] === undefined ? 1 : Number(m[2]);
	if (count === 0) {
		return { start, end: start + 1, between: true };
	}
	return { start, end: start + count - 1, between: false };
};

/** Parses `git diff -U0` output into touched new-file line ranges per path. */
export const parseTouches = (diff: string): Map<string, Touch[]> => {
	const touches = new Map<string, Touch[]>();
	let current: Touch[] | null = null;
	for (const line of diff.split('\n')) {
		if (line.startsWith('+++ ')) {
			const file = line.slice(4);
			current = file.startsWith('b/') ? [] : null;
			if (current) {
				touches.set(file.slice(2), current);
			}
			continue;
		}
		const touch = hunkToTouch(line);
		if (touch && current) {
			current.push(touch);
		}
	}
	return touches;
};

const within = (inner: CoderotFunction, outer: CoderotFunction): boolean =>
	inner !== outer && inner.start >= outer.start && inner.end <= outer.end;

const lineInside = (line: number, fn: CoderotFunction): boolean =>
	line >= fn.start && line <= fn.end;

const touchHitsOwnLines = (
	fn: CoderotFunction,
	touch: Touch,
	children: CoderotFunction[],
): boolean => {
	if (touch.between) {
		const both = (c: CoderotFunction) =>
			lineInside(touch.start, c) && lineInside(touch.end, c);
		return both(fn) && !children.some(both);
	}
	const last = Math.min(touch.end, fn.end);
	for (let line = Math.max(touch.start, fn.start); line <= last; line++) {
		if (!children.some((c) => lineInside(line, c))) {
			return true;
		}
	}
	return false;
};

/**
 * A function is modified when a touched line sits in its own body. Lines of a
 * nested function (e.g. an `it` callback in a huge `describe`) belong to that
 * nested function, which is judged on its own.
 */
const functionTouched = (
	fn: CoderotFunction,
	touches: Touch[],
	all: CoderotFunction[],
): boolean => {
	const children = all.filter((c) => within(c, fn));
	return touches.some((t) => touchHitsOwnLines(fn, t, children));
};

export const checkFunctionCap = (
	snap: CoderotSnapshot,
	touches: Map<string, Touch[]>,
	baseline: Baseline,
): string[] => {
	const errors: string[] = [];
	for (const file of snap.files) {
		const fileTouches = touches.get(file.path);
		const blob = snap.blobs[file.blob];
		if (!fileTouches || !blob || !classifyPath(file.path, file.test)) {
			continue;
		}
		for (const fn of blob.functions) {
			const waived = baseline.exceptions.some(
				(e) => e.path === file.path && e.name === fn.name,
			);
			if (
				fn.cognitive > baseline.functionCap &&
				!waived &&
				functionTouched(fn, fileTouches, blob.functions)
			) {
				errors.push(
					`FUNCTION ${file.path}:${fn.start} ${fn.name}: cognitive complexity ${fn.cognitive} > ${baseline.functionCap}. A new or modified function must be <= ${baseline.functionCap}: split it.`,
				);
			}
		}
	}
	return errors;
};

// ----------------------------------------------------------------- PR size

export const countSizedLines = (numstat: string): number => {
	let total = 0;
	for (const line of numstat.split('\n')) {
		const [added, deleted, ...rest] = line.split('\t');
		const file = rest.join('\t');
		if (!file || isSizeExempt(file) || added === '-') {
			continue;
		}
		total += Number(added) + Number(deleted);
	}
	return total;
};

export const checkPrSize = (
	lines: number,
	labels: string[],
	baseline: Baseline,
): string[] => {
	if (lines <= baseline.prSizeMaxLines) {
		return [];
	}
	if (labels.includes(baseline.sizeExceptionLabel)) {
		return [];
	}
	return [
		`SIZE ${lines} changed lines (excluding tests, generated files, migrations, lockfiles, snapshots) > ${baseline.prSizeMaxLines}. Split the PR; only the owner may allow it with the "${baseline.sizeExceptionLabel}" label.`,
	];
};

// --------------------------------------------------------------------- I/O

const run = (cmd: string, args: string[]): string => {
	const r = spawnSync(cmd, args, {
		cwd: repoRoot,
		encoding: 'utf8',
		maxBuffer: 512 * 1024 * 1024,
	});
	if (r.status !== 0) {
		throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr}${r.stdout}`);
	}
	return r.stdout;
};

const readSnapshot = (): CoderotSnapshot => {
	const out = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-'));
	try {
		run(process.execPath, [
			coderotBin,
			'analyze',
			'--since-commit',
			'HEAD',
			'--out',
			out,
		]);
		const dir = path.join(out, 'snapshots');
		const [name] = fs.readdirSync(dir);
		return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
	} finally {
		fs.rmSync(out, { recursive: true, force: true });
	}
};

const prLabels = (): string[] => {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath || process.env.GITHUB_EVENT_NAME !== 'pull_request') {
		return [];
	}
	const pr = JSON.parse(fs.readFileSync(eventPath, 'utf8')).pull_request;
	const payload: string[] = (pr?.labels ?? []).map(
		(l: { name: string }) => l.name,
	);
	if (!process.env.GH_TOKEN || !process.env.GITHUB_REPOSITORY) {
		return payload;
	}
	// A re-run keeps the original payload: ask GitHub for the live labels.
	const live = spawnSync(
		'gh',
		[
			'api',
			`repos/${process.env.GITHUB_REPOSITORY}/issues/${pr.number}/labels`,
			'-q',
			'.[].name',
		],
		{ encoding: 'utf8' },
	);
	return live.status === 0 ? live.stdout.split('\n').filter(Boolean) : payload;
};

const resolveBase = (): string =>
	process.env.QUALITY_BASE ??
	run('git', ['merge-base', 'HEAD', 'origin/develop']).trim();

const sizeApplies = (): boolean =>
	process.env.GITHUB_EVENT_NAME === undefined ||
	process.env.GITHUB_EVENT_NAME === 'pull_request';

const readBaseline = (): Baseline =>
	JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

const writeBaseline = (b: Baseline): void => {
	const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
	fs.writeFileSync(
		baselinePath,
		JSON.stringify({ ...raw, ...b }, null, '\t') + '\n',
	);
};

const main = (): number => {
	const baseline = readBaseline();
	const snap = readSnapshot();
	const measured = toBaselineZones(measureZones(snap));
	for (const z of ZONES) {
		console.log(`${z}: ${JSON.stringify(measured[z])}`);
	}
	if (process.argv.includes('--write')) {
		writeBaseline(lowerBaseline(measured, baseline));
		console.log('quality-baseline.json lowered where improved.');
		return 0;
	}
	const base = resolveBase();
	const errors = [
		...checkRatchet(measured, baseline),
		...checkFunctionCap(
			snap,
			parseTouches(run('git', ['diff', '-U0', '--no-renames', base, 'HEAD'])),
			baseline,
		),
		...(sizeApplies()
			? checkPrSize(
					countSizedLines(
						run('git', ['diff', '--numstat', '--no-renames', base, 'HEAD']),
					),
					prLabels(),
					baseline,
				)
			: []),
	];
	for (const e of errors) {
		console.error(e);
	}
	return errors.length === 0 ? 0 : 1;
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	process.exit(main());
}
