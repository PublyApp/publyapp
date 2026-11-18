import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ZONES = [
	'api',
	'front',
	'tests-api',
	'tests-front',
	'tooling',
] as const;
export type Zone = (typeof ZONES)[number];

export type ZoneBaseline = Record<
	'complexityPer1k' | 'duplicationPer1k',
	number
>;
export interface Baseline {
	functionCap: number;
	prSizeMaxLines: number;
	sizeExceptionLabel: string;
	baselineExceptionLabel: string;
	tolerancePer1k: number;
	zones: Record<Zone, ZoneBaseline>;
	exceptions: { path: string; name: string; reason: string }[];
}

const isNum = (v: number | string | undefined): boolean =>
	typeof v === 'number' && Number.isFinite(v);

/** Strict schema: a quoted, deleted or mistyped threshold must fail, never silently disable a check. */
export const parseBaseline = (text: string): Baseline => {
	const b = JSON.parse(text);
	const nums = [b.functionCap, b.prSizeMaxLines, b.tolerancePer1k];
	for (const z of ZONES) {
		nums.push(b.zones?.[z]?.complexityPer1k, b.zones?.[z]?.duplicationPer1k);
	}
	const namedWaivers = (w: Baseline['exceptions'] | undefined) =>
		Array.isArray(w) && w.every((e) => e.reason && e.name !== '<anonymous>');
	const labels = [b.sizeExceptionLabel, b.baselineExceptionLabel];
	if (
		!nums.every(isNum) ||
		!labels.every(Boolean) ||
		!namedWaivers(b.exceptions)
	) {
		throw new Error(
			'quality-baseline.json is invalid: numbers, labels, all zones and named waivers are required',
		);
	}
	return b;
};

export interface CoderotFunction {
	name: string;
	start: number;
	end: number;
	cognitive: number;
}
export interface CoderotBlob {
	parsed?: boolean;
	unmeasuredFunctions?: number;
	sloc: number;
	functions: CoderotFunction[];
}
export interface CoderotSnapshot {
	files: { path: string; blob: string; test: boolean }[];
	blobs: Record<string, CoderotBlob>;
	clones?: { locations: { path: string; start: number; end: number }[] }[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const baselinePath = path.join(here, 'quality-baseline.json');
const coderotBin = path.resolve(
	here,
	'../node_modules/@coderot-ai/cli/dist/coderot.js',
);

const EXCLUDED =
	/(\.g\.cs$|routeTree\.gen\.ts$|\/generated\/|\/Migrations\/|^packages\/client-ts\/|\/openapi\.json$|^\.worktrees\/|\/node_modules\/)/;
const TEST_TS =
	/(^(apps\/front\/src|packages\/shared-ts)(\/.*\.(test|spec)\.[cm]?[tj]sx?$|\/(.*\/)?__tests__\/)|^apps\/front\/(e2e|tests)\/)/;
const TEST_CS = /(\.Spec\.cs$|^apps\/api\/(Lib\/Testing|Tests)\/)/;
const TOOLING =
	/^(packages\/(scripts-ts|lint-ts|lint-cs|scripts-cs)\/|apps\/front\/(scripts|tools)\/)/;
const CODE = /\.(cs|[cm]?[tj]sx?)$/;

/** Zone of a source file (zones of AGENTS.md "Code quality"), or null when not judged. */
export const classifyPath = (file: string): Zone | null => {
	if (!CODE.test(file) || EXCLUDED.test(file)) {
		return null;
	}
	if (TOOLING.test(file)) {
		return 'tooling';
	}
	if (file.startsWith('apps/api/')) {
		return TEST_CS.test(file) ? 'tests-api' : 'api';
	}
	if (TEST_TS.test(file)) {
		return 'tests-front';
	}
	if (/^(apps\/front\/src|packages\/shared-ts)\//.test(file)) {
		return 'front';
	}
	return null;
};

/** Files that never count toward the PR size budget. */
const SIZE_EXEMPT =
	/(pnpm-lock\.yaml$|package-lock\.json$|packages\.lock\.json$|\.lock$|\.snap$|\/__snapshots__\/)/;
export const isSizeExempt = (file: string): boolean =>
	SIZE_EXEMPT.test(file) ||
	EXCLUDED.test(file) ||
	TEST_CS.test(file) ||
	TEST_TS.test(file) ||
	/(\/__tests__\/|\.(test|spec)\.[cm]?[tj]sx?$)/.test(file);

export type ZoneMetrics = Record<
	Zone,
	{ sloc: number; cognitive: number; duplicated: number }
>;

const unionLength = (ranges: [number, number][]): number => {
	let total = 0;
	let end = 0;
	for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
		total += Math.max(0, to - Math.max(from - 1, end));
		end = Math.max(end, to);
	}
	return total;
};

const cloneRanges = (snap: CoderotSnapshot) => {
	const byPath = new Map<string, [number, number][]>();
	for (const loc of (snap.clones ?? []).flatMap((c) => c.locations)) {
		byPath.set(loc.path, [
			...(byPath.get(loc.path) ?? []),
			[loc.start, loc.end],
		]);
	}
	return byPath;
};

/** Fails closed: an empty, partial or unparsed scan must never pass vacuously. */
export const assertSnapshot = (snap: CoderotSnapshot): void => {
	if (!snap.files?.length || !Array.isArray(snap.clones)) {
		throw new Error('coderot snapshot is empty or has no clone data');
	}
	for (const file of snap.files) {
		const blob = snap.blobs[file.blob];
		const broken = !blob || blob.parsed === false || blob.unmeasuredFunctions;
		if (broken && classifyPath(file.path)) {
			throw new Error(`coderot could not fully measure ${file.path}`);
		}
	}
};

/** Every tracked file the gate judges must be in the scan (coderot silently skips e.g. "generated by" files). */
export const assertCoverage = (
	tracked: string[],
	snap: CoderotSnapshot,
): void => {
	const seen = new Set(snap.files.map((f) => f.path));
	const missing = tracked.filter((f) => classifyPath(f) && !seen.has(f));
	if (missing.length > 0) {
		throw new Error(
			'coderot did not measure judged file(s): ' + missing.join(', '),
		);
	}
};

export const measureZones = (snap: CoderotSnapshot): ZoneMetrics => {
	const out = Object.fromEntries(
		ZONES.map((z) => [z, { sloc: 0, cognitive: 0, duplicated: 0 }]),
	) as ZoneMetrics;
	const clones = cloneRanges(snap);
	for (const file of snap.files) {
		const zone = classifyPath(file.path);
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

/** The PR baseline may only get stricter than the base branch's (owner label aside). */
export const checkBaselineNotRaised = (
	before: Baseline | null,
	after: Baseline,
	labels: string[],
): string[] => {
	if (labels.includes((before ?? after).baselineExceptionLabel)) {
		return [];
	}
	if (!before) {
		return [
			`BASELINE introduced: the base branch has no quality-baseline.json; only the owner can allow it with the "${after.baselineExceptionLabel}" label.`,
		];
	}
	const raised: string[] = [];
	const cmp = (name: string, was: number, now: number) => {
		if (now > was) {
			raised.push(name + ' ' + was + ' -> ' + now);
		}
	};
	cmp('functionCap', before.functionCap, after.functionCap);
	cmp('prSizeMaxLines', before.prSizeMaxLines, after.prSizeMaxLines);
	cmp('tolerancePer1k', before.tolerancePer1k, after.tolerancePer1k);
	for (const zone of ZONES) {
		for (const k of ['complexityPer1k', 'duplicationPer1k'] as const) {
			cmp(zone + '.' + k, before.zones[zone][k], after.zones[zone][k]);
		}
	}
	const known = new Set(before.exceptions.map((e) => e.path + '::' + e.name));
	for (const e of after.exceptions) {
		if (!known.has(e.path + '::' + e.name)) {
			raised.push('new exception ' + e.path + '::' + e.name);
		}
	}
	if (after.sizeExceptionLabel !== before.sizeExceptionLabel) {
		raised.push('sizeExceptionLabel changed');
	}
	return raised.map(
		(r) =>
			`BASELINE raised (${r}). A baseline never rises; only the owner can allow it with the "${before.baselineExceptionLabel}" label.`,
	);
};

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

/** Innermost function whose body holds the line: a nested function is judged alone. */
const ownerOf = (fns: CoderotFunction[], line: number) => {
	let best: CoderotFunction | undefined;
	for (const fn of fns) {
		const inside = line >= fn.start && line <= fn.end;
		if (inside && (!best || fn.end - fn.start < best.end - best.start)) {
			best = fn;
		}
	}
	return best;
};

/** Functions of one file whose own body holds a touched line. */
const touchedFunctions = (fns: CoderotFunction[], touches: Touch[]) => {
	const hit = new Set<CoderotFunction>();
	for (const t of touches) {
		const last = t.between ? t.start : t.end;
		for (let line = t.start; line <= last; line++) {
			const owner = ownerOf(fns, line);
			const spansBoth = !t.between || owner === ownerOf(fns, t.end);
			if (owner && spansBoth) {
				hit.add(owner);
			}
		}
	}
	return hit;
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
		if (!fileTouches || !blob || !classifyPath(file.path)) {
			continue;
		}
		for (const fn of touchedFunctions(blob.functions, fileTouches)) {
			const waived = baseline.exceptions.some(
				(e) => e.path === file.path && e.name === fn.name,
			);
			if (fn.cognitive > baseline.functionCap && !waived) {
				errors.push(
					`FUNCTION ${file.path}:${fn.start} ${fn.name}: cognitive complexity ${fn.cognitive} > ${baseline.functionCap}. A new or modified function must be <= ${baseline.functionCap}: split it.`,
				);
			}
		}
	}
	return errors;
};

/** `git diff --numstat -M` prints renames as `a => b` or `d/{a => b}/x`: keep the new path. */
export const renamedTo = (name: string): string =>
	name
		.replace(/\{[^{}]* => ([^{}]*)\}/, '$1')
		.replace(/^.* => /, '')
		.replace('//', '/');

export const countSizedLines = (numstat: string): number => {
	let total = 0;
	for (const line of numstat.split('\n')) {
		const [added, deleted, ...rest] = line.split('\t');
		const file = renamedTo(rest.join('\t'));
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
	if (
		lines <= baseline.prSizeMaxLines ||
		labels.includes(baseline.sizeExceptionLabel)
	) {
		return [];
	}
	return [
		`SIZE ${lines} changed lines (excluding tests, generated files, migrations, lockfiles, snapshots) > ${baseline.prSizeMaxLines}. Split the PR; only the owner may allow it with the "${baseline.sizeExceptionLabel}" label.`,
	];
};

const run = (cmd: string, args: string[]): string => {
	const r = spawnSync(cmd, args, {
		cwd: repoRoot,
		encoding: 'utf8',
		maxBuffer: 512 * 1024 * 1024,
		timeout: 10 * 60 * 1000,
	});
	if (r.error || r.status !== 0) {
		throw new Error(
			`${cmd} ${args.join(' ')} failed:\n${r.error ?? ''}${r.stderr}${r.stdout}`,
		);
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
	return (pr?.labels ?? []).map((l: { name: string }) => l.name);
};

const resolveBase = (): string =>
	process.env.QUALITY_BASE ??
	run('git', ['merge-base', 'HEAD', 'origin/develop']).trim();

/** Label-based PR policy (size, baseline) is enforced on the PR event; the merge queue carries no labels. */
const prPolicy = (): boolean =>
	process.env.GITHUB_EVENT_NAME === undefined ||
	process.env.GITHUB_EVENT_NAME === 'pull_request';

const baselineRel = 'packages/scripts-ts/src/quality-baseline.json';

const readBaselineAt = (base: string): Baseline | null => {
	const exists = spawnSync(
		'git',
		['cat-file', '-e', base + ':' + baselineRel],
		{ cwd: repoRoot },
	);
	if (exists.status !== 0) {
		return null;
	}
	return parseBaseline(run('git', ['show', base + ':' + baselineRel]));
};

const main = (): number => {
	const baseline = parseBaseline(fs.readFileSync(baselinePath, 'utf8'));
	const snap = readSnapshot();
	assertSnapshot(snap);
	assertCoverage(run('git', ['ls-files']).split('\n'), snap);
	const measured = toBaselineZones(measureZones(snap));
	console.log(JSON.stringify(measured));
	const base = resolveBase();
	const labels = prLabels();
	const errors = [
		...(prPolicy()
			? checkBaselineNotRaised(readBaselineAt(base), baseline, labels)
			: []),
		...checkRatchet(measured, baseline),
		...checkFunctionCap(
			snap,
			parseTouches(run('git', ['diff', '-U0', '-M', base, 'HEAD'])),
			baseline,
		),
		...(prPolicy()
			? checkPrSize(
					countSizedLines(
						run('git', ['diff', '--numstat', '-M', base, 'HEAD']),
					),
					labels,
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
