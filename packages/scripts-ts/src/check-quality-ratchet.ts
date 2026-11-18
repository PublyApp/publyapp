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
/** Owner-only controls: constants here (CODEOWNED), never read from the PR-editable baseline. */
export const SIZE_LABEL = 'size-exception';
export const OWNER_LABEL = 'quality-baseline-exception';

export interface Baseline {
	functionCap: number;
	prSizeMaxLines: number;
	tolerancePer1k: number;
	zones: Record<Zone, ZoneBaseline>;
	exceptions: { path: string; name: string; reason: string }[];
	/** Raises the owner approved, reviewed through CODEOWNERS: `<key>=<new value>` or `exception:<path>::<name>`. */
	ownerApproved?: string[];
}

/** Strict schema: a quoted, deleted or mistyped threshold must fail, never silently disable a check. */
export const parseBaseline = (text: string): Baseline => {
	const b = JSON.parse(text);
	const nums = [b.functionCap, b.prSizeMaxLines, b.tolerancePer1k];
	for (const z of ZONES) {
		nums.push(b.zones?.[z]?.complexityPer1k, b.zones?.[z]?.duplicationPer1k);
	}
	const namedWaivers = (w: Baseline['exceptions'] | undefined) =>
		Array.isArray(w) &&
		w.every((e) => e.path && e.name && e.reason && e.name !== '<anonymous>');
	const approvals = b.ownerApproved ?? [];
	const strings =
		Array.isArray(approvals) &&
		approvals.every((a: string) => typeof a === 'string');
	if (!nums.every(Number.isFinite) || !namedWaivers(b.exceptions) || !strings) {
		throw new Error(
			'quality-baseline.json is invalid: numbers, all zones and named waivers are required',
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
interface CloneLocation {
	path: string;
	start: number;
	end: number;
}
export interface CoderotSnapshot {
	files: { path: string; blob: string; test: boolean }[];
	blobs: Record<string, CoderotBlob>;
	clones?: { locations: CloneLocation[] }[];
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
	/(pnpm-lock\.yaml$|package-lock\.json$|packages\.lock\.json$|\.lock$|\.snap$|\/__snapshots__\/|reason-guard-ref\.json$)/;
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
const validBlob = (b?: CoderotBlob): boolean =>
	!!b &&
	b.parsed !== false &&
	!b.unmeasuredFunctions &&
	Number.isFinite(b.sloc) &&
	b.sloc >= 0 &&
	(b.functions.length === 0 || b.sloc > 0) &&
	b.functions.every(
		(f) =>
			Number.isFinite(f.start) &&
			f.start >= 1 &&
			f.start <= f.end &&
			Number.isFinite(f.cognitive) &&
			f.cognitive >= 0,
	);

const validClone = (paths: Set<string>, locations: CloneLocation[]) =>
	locations.length > 1 &&
	locations.every(
		(l) =>
			paths.has(l.path) &&
			Number.isFinite(l.end) &&
			l.start >= 1 &&
			l.start <= l.end,
	);

export const assertSnapshot = (snap: CoderotSnapshot): void => {
	const paths = new Set((snap.files ?? []).map((f) => f.path));
	const clones = snap.clones ?? [];
	if (paths.size === 0 || !clones.some((c) => validClone(paths, c.locations))) {
		throw new Error(
			'coderot snapshot is empty or has no valid clone (a real tree always has some)',
		);
	}
	if (
		clones.some((c) =>
			c.locations.some(
				(l) => !paths.has(l.path) || !(l.start >= 1 && l.start <= l.end),
			),
		)
	) {
		throw new Error(
			'coderot snapshot has a clone location outside the scan or out of range',
		);
	}
	for (const file of snap.files) {
		if (classifyPath(file.path) && !validBlob(snap.blobs[file.blob])) {
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

const KEYS = ['complexityPer1k', 'duplicationPer1k'] as const;
const zoneNums = (zones: Record<Zone, ZoneBaseline>): Record<string, number> =>
	Object.fromEntries(
		ZONES.flatMap((z) => KEYS.map((k) => [z + '.' + k, zones[z][k]])),
	);

/** Ratchet: every zone metric must stay <= committed baseline + tolerance. */
export const checkRatchet = (
	measured: Record<Zone, ZoneBaseline>,
	baseline: Baseline,
): string[] => {
	const limit = zoneNums(baseline.zones);
	const now = zoneNums(measured);
	return Object.keys(limit)
		.filter((k) => !(now[k] <= limit[k] + baseline.tolerancePer1k))
		.map(
			(k) =>
				`RATCHET ${k}: ${now[k]} > baseline ${limit[k]} (+${baseline.tolerancePer1k} tolerance). Reduce complexity/duplication in this zone; never raise the baseline without an owner exception.`,
		);
};

const waiverKey = (e: { path: string; name: string }) => e.path + '::' + e.name;
const thresholds = (b: Baseline) =>
	new Map([
		['functionCap', b.functionCap],
		['prSizeMaxLines', b.prSizeMaxLines],
		['tolerancePer1k', b.tolerancePer1k],
		...Object.entries(zoneNums(b.zones)),
	]);

/** The PR baseline may only get stricter than the base branch's (owner label aside). */
export const checkBaselineNotRaised = (
	before: Baseline | null,
	after: Baseline,
	labels: string[],
): string[] => {
	if (labels.includes(OWNER_LABEL)) {
		return [];
	}
	if (!before) {
		return [
			`BASELINE introduced: the base branch has no quality-baseline.json; only the owner can allow it with the "${OWNER_LABEL}" label.`,
		];
	}
	const was = thresholds(before);
	const now = thresholds(after);
	const known = new Set(before.exceptions.map(waiverKey));
	const approved = new Set(after.ownerApproved ?? []);
	const raised = [
		...[...was]
			.filter(([k, v]) => (now.get(k) ?? 0) > v)
			.map(([k, v]) => ({
				id: k + '=' + now.get(k),
				text: k + ' ' + v + ' -> ' + now.get(k),
			})),
		...after.exceptions
			.filter((e) => !known.has(waiverKey(e)))
			.map((e) => ({
				id: 'exception:' + waiverKey(e),
				text: 'new exception ' + waiverKey(e),
			})),
	].filter((r) => !approved.has(r.id));
	return raised.map(
		(r) =>
			`BASELINE raised (${r.text}). A baseline never rises; only the owner can allow it: the "${OWNER_LABEL}" label on the PR, or "${r.id}" in ownerApproved (CODEOWNERS review).`,
	);
};

export interface Touch {
	start: number;
	end: number;
	/** Pure deletion between lines start and end: only touches a function spanning both. */
	between: boolean;
	/** Pure deletion of only blank/comment lines: no function is modified. */
	trivial?: boolean;
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
	let current: Touch[] = [];
	let deletion: Touch | undefined;
	for (const line of diff.split('\n')) {
		const touch = hunkToTouch(line);
		if (line.startsWith('+++ ')) {
			current = [];
			if (line.startsWith('+++ b/')) {
				touches.set(line.slice(6), current);
			}
		} else if (touch) {
			deletion = touch.between ? { ...touch } : undefined;
			current.push(deletion ?? touch);
		} else if (deletion && line.startsWith('-')) {
			// trivial only when every deleted line is blank or a comment
			const blank = /^-\s*(\/\/|\/\*|\*|#|$)/.test(line);
			deletion.trivial = deletion.trivial !== false && blank;
		}
	}
	return touches;
};

/** Innermost function whose body holds the line: a nested function is judged alone. */
const ownerOf = (fns: CoderotFunction[], line: number) =>
	fns
		.filter((fn) => line >= fn.start && line <= fn.end)
		.sort((a, b) => a.end - a.start - (b.end - b.start))[0];

const touchedLines = (t: Touch): number[] => {
	if (t.between) {
		return t.trivial ? [] : [t.start, t.end];
	}
	return Array.from({ length: t.end - t.start + 1 }, (_, i) => t.start + i);
};

/** Functions of one file whose own body holds a touched line. */
const touchedFunctions = (fns: CoderotFunction[], touches: Touch[]) => {
	const lines = touches.flatMap(touchedLines);
	return new Set(lines.map((line) => ownerOf(fns, line)).filter(Boolean));
};

export const checkFunctionCap = (
	snap: CoderotSnapshot,
	touches: Map<string, Touch[]>,
	baseline: Baseline,
): string[] =>
	snap.files.flatMap((file) => {
		const fileTouches = touches.get(file.path);
		const blob = snap.blobs[file.blob];
		if (!fileTouches || !blob || !classifyPath(file.path)) {
			return [];
		}
		return [...touchedFunctions(blob.functions, fileTouches)]
			.filter(
				(fn) =>
					fn?.cognitive > baseline.functionCap &&
					!baseline.exceptions.some(
						(e) => waiverKey(e) === file.path + '::' + fn.name,
					),
			)
			.map(
				(fn) =>
					`FUNCTION ${file.path}:${fn?.start} ${fn?.name}: cognitive complexity ${fn?.cognitive} > ${baseline.functionCap}. A new or modified function must be <= ${baseline.functionCap}: split it.`,
			);
	});

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
	if (lines <= baseline.prSizeMaxLines || labels.includes(SIZE_LABEL)) {
		return [];
	}
	return [
		`SIZE ${lines} changed lines (excluding tests, generated files, migrations, lockfiles, snapshots) > ${baseline.prSizeMaxLines}. Split the PR; only the owner may allow it with the "${SIZE_LABEL}" label.`,
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

type EventPayload = {
	pull_request?: { base?: { sha?: string }; labels?: { name: string }[] };
	merge_group?: { base_sha?: string };
};

const readEvent = (): EventPayload => {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	return eventPath ? JSON.parse(fs.readFileSync(eventPath, 'utf8')) : {};
};

/** The branch the PR targets (event base sha), not a hardcoded develop. */
export const baseRef = (event: EventPayload): string =>
	event.pull_request?.base?.sha ??
	event.merge_group?.base_sha ??
	'origin/develop';

/** Diff base: merge-base with the target (QUALITY_BASE overrides both this and the baseline tip). */
const resolveBase = (event: EventPayload): string =>
	process.env.QUALITY_BASE ??
	run('git', ['merge-base', 'HEAD', baseRef(event)]).trim();

/** Baseline-not-raised runs on the PR event and in the merge queue (no labels there: only ownerApproved lets a raise land); size on PRs and locally. */
export const policyFor = (eventName?: string) => ({
	baseline: eventName === 'pull_request' || eventName === 'merge_group',
	size: eventName === undefined || eventName === 'pull_request',
});

const baselineRel = 'packages/scripts-ts/src/quality-baseline.json';

/** Only "file absent in a readable base tree" means bootstrap; an unreadable base throws. */
/** Only a clean "path not in tree" means bootstrap; an unreadable base, tree or blob throws. */
export const readBaselineAt = (
	base: string,
	cwd = repoRoot,
): Baseline | null => {
	const git = (args: string[]) => {
		const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
		if (r.status !== 0) {
			throw new Error(
				'cannot read ' + base + ' (shallow or corrupt checkout?): ' + r.stderr,
			);
		}
		return r.stdout;
	};
	git(['rev-parse', '--verify', base + '^{commit}']);
	if (git(['ls-tree', base, '--', baselineRel]).trim() === '') {
		return null;
	}
	return parseBaseline(git(['show', base + ':' + baselineRel]));
};

const main = (): number => {
	const baseline = parseBaseline(fs.readFileSync(baselinePath, 'utf8'));
	const snap = readSnapshot();
	assertSnapshot(snap);
	assertCoverage(run('git', ['ls-files']).split('\n'), snap);
	const metrics = measureZones(snap);
	const measured = toBaselineZones(metrics);
	console.log(JSON.stringify(measured));
	const event = readEvent();
	const base = resolveBase(event);
	const policy = policyFor(process.env.GITHUB_EVENT_NAME);
	const local = process.env.GITHUB_EVENT_NAME === undefined;
	const labels = [
		...(event.pull_request?.labels ?? []).map((l) => l.name),
		...(local && process.env.QUALITY_SIZE_EXCEPTION ? [SIZE_LABEL] : []),
	];
	const tip = readBaselineAt(process.env.QUALITY_BASE ?? baseRef(event));
	// Introduction was gated (label) on the PR event; the queue only re-checks later raises.
	const queueIntro = process.env.GITHUB_EVENT_NAME === 'merge_group' && !tip;
	const errors = [
		...(policy.baseline
			? checkBaselineNotRaised(
					tip,
					baseline,
					queueIntro ? [OWNER_LABEL] : labels,
				)
			: []),
		...checkRatchet(measured, baseline),
		...checkFunctionCap(
			snap,
			parseTouches(run('git', ['diff', '-U0', '-M', base, 'HEAD'])),
			baseline,
		),
		...(policy.size
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
