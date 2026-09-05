import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Guard for the API-test barrier's path-filter coverage (PR #1975 round 2,
// reachability fix #2005).
//
// WHY THIS EXISTS
// ---------------
// Round 2 of #1975 removed apps/apphost from PublyApp.slnx so the quality
// gate's `dotnet build PublyApp.slnx` no longer resolves Aspire.Hosting.* on
// every PR. That left `apps/apphost/Program.cs`, which is only COMPILED by
// AppHostOrchestrationGuardSpec inside the API test suite, covered by no
// workflow path filter: a PR touching ONLY apps/apphost/ triggered api-tests
// (its classifier had no apps/apphost/ group) and the slnx build no longer
// compiled the AppHost, so a broken AppHost passed the whole barrier. Round-2
// proof (measured on real CI): an apphost-only PR with an uncompilable
// Program.cs kept api-tests-gate green while the suite was skipped.
//
// #2005 is the REACHABILITY half of the same defect class. This guard shipped
// (via #1975) only as a vitest file executed by front-ci.yml's `gate-selftest`
// job, which is gated on front-ci's own relevance classifier. A PR that added
// a project to PublyApp.slnx -- without a matching path filter -- classified as
// irrelevant to front-ci, so gate-selftest (and therefore this guard) was
// SKIPPED: the exact change that breaks the guard's invariant never ran it.
//
// THE FIX: the coverage logic lives here, in a PURE-NODE runnable script with
// no runtime dependency on `yaml` or any npm package, so a small UNCONDITIONED
// api-tests.yml job (api-tests.yml::path-coverage, #2005) runs it on every PR
// with zero install. That mirrors the repository's existing unconditioned
// guards `no-ignored-tracked` (#1513) and `no-dockerignore-shadow` (#1849):
// a guard that scans a repository for something arriving on ANY path cannot be
// gated on a classifier that only enumerates the paths known today. The vitest
// file (check-api-tests-path-coverage.test.ts) imports the same functions here
// and adds the reachability test that pins the unconditioned job's shape, so
// running the coverage guard and proving it is reachable both share ONE
// implementation -- a second vitest-only copy would drift the way #2005 proved.
//
// WHAT THIS PROVES
// ----------------
//  1. Every project dir that an API-test spec builds or runs (`--project
//     apps/<d>` or `"build", "apps/<d>"` argv forms) is covered by BOTH
//     api-tests.yml path-filter surfaces: the `push.paths` list AND the
//     changed-paths classifier regex. Losing either surface for a compiled
//     project goes RED naming the project.
//  2. The two api-tests.yml surfaces carry the SAME `apps/<seg>` groups.
//  3. Every project in the real PublyApp.slnx is covered by at least one
//     path filter of the .NET barrier workflows (quality-gate.yml or
//     api-tests.yml).
//
// FAIL-LOUD CONTRACT
// ------------------
// Any input that cannot be analyzed -- an absent push.paths list, a classifier
// invocation the guard cannot read, an empty slnx, zero spec-compiled
// references -- THROWS and fails loud; it never passes vacuously. This matches
// the vitest guard's contract and keeps the pure-node job just as strict.
//
// This script uses ONLY `node:*` built-ins so it runs with plain `node` and no
// `pnpm install`, satisfying the unconditioned-job cheapness bar the repository
// sets for no-* guards.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
);

const read = (relativePath) =>
	readFileSync(path.join(repoRoot, relativePath), 'utf8');

// --- Minimal YAML-subset reader (push.paths only) ---
//
// The coverage check reads each gate workflow's `on.push.paths` list (a YAML
// sequence of scalars) and the classifier regex inline in the changes job's
// filter step. The regex is extracted by scanning the raw text (the same
// documented `node "$CLASSIFIER" '...'` invocation shape the vitest test
// reads). The paths list is read by an indentation-aware walker over the
// file's lines -- deliberately MINIMAL, covering only the constructs the two
// gate workflow files use to express their trigger: nested mappings and
// sequences of scalars under `on.push.paths`. Anything the walker cannot
// classify THROWS rather than silently returning partial data.

/**
 * Drops a trailing YAML comment from one line, honoring single/double-quoted
 * spans so a `#` inside a quoted scalar is not mistaken for a comment. A
 * comment starts at a `#` that is at the start of the line or preceded by
 * whitespace.
 */
const stripYamlComment = (line) => {
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (inSingle) {
			if (char === "'") {
				inSingle = false;
			}
			continue;
		}
		if (inDouble) {
			if (char === '"') {
				inDouble = false;
			}
			continue;
		}
		if (char === "'") {
			inSingle = true;
		} else if (char === '"') {
			inDouble = true;
		} else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
			return line.slice(0, i);
		}
	}
	return line;
};

const leadingSpaces = (line) => {
	const match = line.match(/^\s*/);
	return match ? match[0].length : 0;
};

/**
 * Strips surrounding single or double quotes from a YAML scalar.
 */
const unquoteYamlScalar = (value) => {
	const trimmed = value.trim();
	if (trimmed.length >= 2) {
		const open = trimmed[0];
		const close = trimmed[trimmed.length - 1];
		if ((open === "'" && close === "'") || (open === '"' && close === '"')) {
			return trimmed.slice(1, -1);
		}
	}
	return trimmed;
};

/**
 * Finds the line index of the direct child key `key` of the mapping that opens
 * at `parentIdx` within `lines` (each a `{ indent, text }` token with comments
 * and blanks already removed). Direct children of a mapping share one child
 * indentation level greater than the parent's. Returns -1 when the key is not
 * a direct child.
 */
const findChildKeyIndex = (lines, parentIdx, key) => {
	const parentIndent = lines[parentIdx].indent;
	let childIndent = null;
	for (let i = parentIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.indent <= parentIndent) {
			break; // end of the parent mapping's block
		}
		if (childIndent === null) {
			childIndent = line.indent;
		}
		if (line.indent === childIndent && line.text === key) {
			return i;
		}
	}
	return -1;
};

/**
 * Reads the `on.push.paths` scalar list from a workflow YAML file's raw text.
 *
 * The walker descends `on:{}` -> `push:{}` -> `paths:` and collects the
 * `- '...'` items. It honors comments/blanks and nested-child indentation, and
 * THROWS -- never silently returns partial data -- when the key path or the
 * list is absent or the block does not have the expected scalar-list shape.
 */
export const extractPushPaths = (fileText: string): string[] => {
	const lines = fileText
		.split(/\r?\n/)
		.map((rawLine) => {
			const stripped = stripYamlComment(rawLine).trimEnd();
			const text = stripped.trim();
			return {
				indent: text.length === 0 ? -1 : leadingSpaces(rawLine),
				text,
			};
		})
		.filter((line) => line.text.length > 0);

	const onIdx = lines.findIndex(
		(line) => line.indent === 0 && line.text === 'on:',
	);
	if (onIdx === -1) {
		throw new Error(
			'extractPushPaths: workflow has no top-level `on:` mapping — cannot read the push trigger.',
		);
	}

	const pushIdx = findChildKeyIndex(lines, onIdx, 'push:');
	if (pushIdx === -1) {
		throw new Error(
			'extractPushPaths: `on:` has no `push:` child — the workflow declares no push trigger.',
		);
	}

	const pathsIdx = findChildKeyIndex(lines, pushIdx, 'paths:');
	if (pathsIdx === -1) {
		throw new Error(
			'extractPushPaths: `push:` has no `paths:` child — the workflow declares no push path filter.',
		);
	}

	const pathsIndent = lines[pathsIdx].indent;
	const items = [];
	for (let i = pathsIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.indent <= pathsIndent) {
			break; // end of the paths block
		}
		if (line.indent !== pathsIndent + 2) {
			throw new Error(
				`extractPushPaths: unexpected indentation ${line.indent} inside the paths block (expected ${pathsIndent + 2} for list items). The guard cannot certify coverage of an unanalyzable list — investigate before silencing.`,
			);
		}
		const itemMatch = line.text.match(/^-\s+(.*)$/);
		if (itemMatch === null) {
			throw new Error(
				`extractPushPaths: expected a "- <value>" list item, found \`${line.text}\`. The push.paths block is not the guarded scalar-list shape — fail loud rather than certify partial coverage.`,
			);
		}
		items.push(unquoteYamlScalar(itemMatch[1]));
	}

	if (items.length === 0) {
		throw new Error(
			'extractPushPaths: `on.push.paths` is present but empty — a workflow with no path filter cannot be certified as covering the .NET barrier. Investigate, do not silence.',
		);
	}

	return items;
};

// --- GitHub push.paths glob semantics (kept from the original vitest guard) ---

/**
 * GitHub-style glob match over a path (the semantics GitHub Actions uses for
 * `push.paths`: `*` matches any chars except `/`, `**` matches any chars
 * including `/`). Implemented as a small converter to a real RegExp so the
 * matcher itself is a faithful, testable translation of the documented rules.
 */
const globToRegExp = (pattern) => {
	const segments = pattern.split('/');
	const converted = segments
		.map((segment) => {
			if (segment === '**') {
				return '.*';
			}
			if (segment === '*') {
				return '[^/]*';
			}
			return segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
		})
		.join('/');
	return new RegExp(`^${converted}$`);
};

/** True when a `push.paths` entry matches at least one file under the dir. */
export const entryCoversDir = (entry, dir) =>
	globToRegExp(entry).test(`${dir}/Program.cs`);

const coveredByAnyEntry = (dir, entries) =>
	entries.some((entry) => entryCoversDir(entry, dir));

/** Extracts the `apps/<seg>` groups from a classifier regex's alternation text. */
const appsGroupsFromRegex = (regexText) => {
	const groups = new Set();
	for (const match of regexText.matchAll(/apps\/[A-Za-z0-9._-]+\//g)) {
		groups.add(match[0].slice(0, -1));
	}
	return groups;
};

/** Extracts the `apps/<seg>` groups from a `push.paths` entry list. */
const appsGroupsFromPathEntries = (entries) => {
	const groups = new Set();
	for (const entry of entries) {
		const match = entry.match(/^apps\/([A-Za-z0-9._-]+)(?:\/|\*\*|$)/);
		if (match !== null) {
			groups.add(`apps/${match[1]}`);
		}
	}
	return groups;
};

const yamlLines = (fileText: string) =>
	fileText
		.split(/\r?\n/)
		.map((raw) => {
			const withoutComment = stripYamlComment(raw).trimEnd();
			return {
				indent: withoutComment.trim().length === 0 ? -1 : leadingSpaces(raw),
				raw,
				text: withoutComment.trim(),
			};
		})
		.filter((line) => line.text.length > 0);

const extractChangesFilterRunBlock = (fileText: string): string => {
	const lines = yamlLines(fileText);
	const jobsIdx = lines.findIndex(
		(line) => line.indent === 0 && line.text === 'jobs:',
	);
	if (jobsIdx === -1) {
		throw new Error(
			'api-tests.yml has no top-level `jobs:` mapping — cannot locate the executable changes filter step.',
		);
	}

	const changesIdx = findChildKeyIndex(lines, jobsIdx, 'changes:');
	if (changesIdx === -1) {
		throw new Error(
			'api-tests.yml has no `jobs.changes` job — cannot locate the executable changes filter step.',
		);
	}

	const stepsIdx = findChildKeyIndex(lines, changesIdx, 'steps:');
	if (stepsIdx === -1) {
		throw new Error(
			'api-tests.yml `jobs.changes` has no `steps:` list — cannot locate the executable filter step.',
		);
	}

	const stepsIndent = lines[stepsIdx].indent;
	const stepIndent = stepsIndent + 2;
	const stepStarts = [];
	let stepsEnd = lines.length;
	for (let i = stepsIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.indent <= stepsIndent) {
			stepsEnd = i;
			break;
		}
		if (line.indent === stepIndent && line.text.startsWith('- ')) {
			stepStarts.push(i);
		}
	}

	const filterSteps = [];
	for (let i = 0; i < stepStarts.length; i++) {
		const start = stepStarts[i];
		const end = stepStarts[i + 1] ?? stepsEnd;
		const directChildIndent = stepIndent + 2;
		const directChildren = lines
			.slice(start, end)
			.filter((line, index) => index > 0 && line.indent === directChildIndent);
		if (
			directChildren.some((line) => /^id:\s*['"]?filter['"]?$/.test(line.text))
		) {
			filterSteps.push({ start, end, directChildren });
		}
	}

	if (filterSteps.length !== 1) {
		throw new Error(
			`api-tests.yml must have exactly one executable \`jobs.changes.steps[id=filter]\` step; found ${filterSteps.length}. The guard refuses to certify an ambiguous or missing filter step.`,
		);
	}

	const filterStep = filterSteps[0];
	const unsafeField = filterStep.directChildren.find((line) =>
		/^(if|continue-on-error):/.test(line.text),
	);
	if (unsafeField !== undefined) {
		throw new Error(
			`api-tests.yml \`jobs.changes.steps[id=filter]\` must execute without \`${unsafeField.text.split(':', 1)[0]}\`; found \`${unsafeField.text}\`. The guard refuses to certify a conditionally skipped or tolerated filter step.`,
		);
	}

	const runLine = filterStep.directChildren.find((line) =>
		line.text.startsWith('run:'),
	);
	if (runLine === undefined) {
		throw new Error(
			'api-tests.yml `jobs.changes.steps[id=filter]` has no `run:` block. The guard refuses to certify a non-executable filter step.',
		);
	}

	const runValue = runLine.text.slice('run:'.length).trim();
	if (runValue !== '' && runValue !== '|' && runValue !== '>') {
		return runValue;
	}

	const blockLines = [];
	for (let i = lines.indexOf(runLine) + 1; i < filterStep.end; i++) {
		const line = lines[i];
		if (line.indent <= runLine.indent) {
			break;
		}
		blockLines.push(line.raw.slice(runLine.indent + 2));
	}
	return blockLines.join('\n');
};

const classifierCommandPattern = /^node "\$CLASSIFIER" '([^']+)'$/;

export const extractClassifierCommand = (fileText: string) => {
	const runBlock = extractChangesFilterRunBlock(fileText);
	const matches = [];
	for (const line of runBlock.split(/\r?\n/)) {
		const executable = line.trim();
		if (executable === '' || executable.startsWith('#')) {
			continue;
		}
		const match = executable.match(classifierCommandPattern);
		if (match !== null) {
			matches.push({ command: executable, pattern: match[1] });
		}
	}

	if (matches.length !== 1) {
		throw new Error(
			`api-tests.yml \`jobs.changes.steps[id=filter].run\` must contain exactly one effective command matching \`node "$CLASSIFIER" '<regex>'\`; found ${matches.length}. Comments, echo/no-op commands, conditional forms, and tolerated steps are not executable classifier commands.`,
		);
	}

	return matches[0];
};

/**
 * Parses the real api-tests.yml into the two path-filter surfaces: the
 * `push.paths` list and the classifier regex from the `changes` job's filter
 * step. Both must exist and be analyzable; any absence throws and fails the
 * run loudly (never a silent pass).
 */
export const readApiTestsGateSurfaces = (
	fileText = read('.github/workflows/api-tests.yml'),
) => {
	const pushPaths = extractPushPaths(fileText);

	const { command: classifierCommand, pattern: classifierPattern } =
		extractClassifierCommand(fileText);
	let compiled;
	try {
		compiled = new RegExp(classifierPattern);
	} catch (error) {
		throw new Error(
			`api-tests.yml classifier regex does not compile: ${String(error)}`,
		);
	}

	return { pushPaths, classifierCommand, classifierPattern, compiled };
};

/** Recursively lists files under a repo-relative dir that match a suffix. */
const walkFiles = (dir, suffix, acc = []) => {
	const entries = readdirSync(path.join(repoRoot, dir), {
		withFileTypes: true,
	});
	for (const entry of entries) {
		const full = path.posix.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkFiles(full, suffix, acc);
		} else if (entry.name.endsWith(suffix)) {
			acc.push(full);
		}
	}
	return acc;
};

/** Project dirs referenced by real API-test specs via build/run argv forms. */
export const findSpecReferencedProjectDirs = (): string[] => {
	const specFiles = walkFiles('apps/api', '.Spec.cs');
	if (specFiles.length === 0) {
		throw new Error(
			"No *.Spec.cs files found under apps/api. The spec tree is the barrier's evidence — an empty tree must fail loud, not pass vacuously.",
		);
	}

	// The argv forms as they appear in the REAL specs: a C# string[] like
	// ["run", "--project", "apps/apphost", ...] spells the project path as
	// `--project", "apps/<d>` (comma + quote + space), while the guard's
	// printed advice and prose use `--project apps/<d>`. A row that appears in
	// NEITHER argv form is a mention, not a compile reference, and stays out.
	const argvProjectRef =
		/--project[",\s]+apps\/([A-Za-z0-9._-]+)|"build",\s*"apps\/([A-Za-z0-9._-]+)"/g;
	const dirs = new Set();
	for (const file of specFiles) {
		const contents = read(file);
		for (const match of contents.matchAll(argvProjectRef)) {
			dirs.add(`apps/${match[1] ?? match[2]}`);
		}
	}

	if (dirs.size === 0) {
		throw new Error(
			`No project dir built or run by any API-test spec was found across ${specFiles.length} spec files (no \`--project apps/<d>\` or ["build", "apps/<d>"] argv forms). The coverage guard is blind to an empty reference set — investigate, do not silence.`,
		);
	}

	return [...dirs].sort(compareStrings);
};

/** csproj-owning dirs from the real PublyApp.slnx. */
export const readSlnxProjectDirs = (): string[] => {
	const slnx = read('PublyApp.slnx');
	const projectPaths = [
		...slnx.matchAll(/<Project\s+Path="([^"]+\.csproj)"/g),
	].map((match) => match[1]);

	if (projectPaths.length === 0) {
		throw new Error(
			'PublyApp.slnx declares no <Project Path="..."> entries. The solution file is unreadable or empty of projects — fail loud, never pass vacuously.',
		);
	}

	return projectPaths
		.map((projectPath) => path.posix.dirname(projectPath))
		.filter((dir) => dir !== '.' && dir !== '')
		.sort(compareStrings);
};

const pushPathsFromWorkflow = (workflowFile) => {
	const paths = extractPushPaths(read(workflowFile));
	if (paths.length === 0) {
		throw new Error(
			`${workflowFile} has an empty on.push.paths list for the .NET barrier coverage check.`,
		);
	}
	return paths;
};

const barrierPushPathSurfaces = () => ({
	qualityGatePushPaths: pushPathsFromWorkflow(
		'.github/workflows/quality-gate.yml',
	),
	apiTestsPushPaths: readApiTestsGateSurfaces().pushPaths,
});

const compareStrings = (a: string, b: string): number => {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
};

const setsEqual = (a, b) =>
	a.size === b.size && [...a].every((value) => b.has(value));

/**
 * The coverage findings against the REAL tree, as human-readable problem
 * strings. Empty when green, non-empty when a project the barrier compiles has
 * lost path-filter coverage. Every reader throws on unanalyzable input rather
 * than returning partial findings, so a violation of the fail-loud contract
 * surfaces as an exception, not a false green.
 */
export const findPathCoverageProblems = (): string[] => {
	const problems = [];

	// 1. Spec-referenced projects must be covered by BOTH api-tests surfaces.
	const { pushPaths, classifierPattern, compiled } = readApiTestsGateSurfaces();
	const referencedDirs = findSpecReferencedProjectDirs();

	const missingFromPushPaths = referencedDirs.filter(
		(dir) => !coveredByAnyEntry(dir, pushPaths),
	);
	const missingFromClassifier = referencedDirs.filter(
		(dir) => !compiled.test(`${dir}/Program.cs`),
	);

	if (missingFromPushPaths.length > 0) {
		problems.push(
			'The API suite compiles these projects, but api-tests.yml `push.paths` covers none of them: ' +
				`${missingFromPushPaths.join(', ')}. An apphost-style gap: changes to ONLY that project ` +
				'would never wake the workflow that compiles it. Add an `apps/<dir>/**` entry covering ' +
				'each, in BOTH api-tests.yml surfaces.',
		);
	}
	if (missingFromClassifier.length > 0) {
		problems.push(
			'The API suite compiles these projects, but the api-tests.yml changed-paths classifier ' +
				`regex matches none of them: ${missingFromClassifier.join(', ')}. A PR touching ONLY ` +
				'their files would skip the suite. Add an `apps/<dir>/` group to the classifier regex.',
		);
	}

	// The classifier surfaces may not silently gain or lose an `apps/<seg>`
	// group relative to the push.paths list — the workflow's own comment
	// promises the two groups are deliberately identical.
	const pushPathAppsGroups = appsGroupsFromPathEntries(pushPaths);
	const classifierAppsGroups = appsGroupsFromRegex(classifierPattern);
	if (!setsEqual(pushPathAppsGroups, classifierAppsGroups)) {
		problems.push(
			'The api-tests.yml `push.paths` list and its classifier regex carry different `apps/<seg>` groups. The file states they are deliberately identical — a mutation touching only one surface recreates a half-closed gate. Keep them in lock-step.',
		);
	}

	// 2. Every slnx project must be covered by a .NET barrier path filter.
	const { qualityGatePushPaths, apiTestsPushPaths } = barrierPushPathSurfaces();
	const slnxDirs = readSlnxProjectDirs();

	const uncovered = slnxDirs.filter(
		(dir) =>
			!coveredByAnyEntry(dir, qualityGatePushPaths) &&
			!coveredByAnyEntry(dir, apiTestsPushPaths),
	);
	if (uncovered.length > 0) {
		problems.push(
			'These projects are compiled by the quality gate (they are in PublyApp.slnx) but no .NET ' +
				`barrier workflow's push.paths covers them: ${uncovered.join(', ')}. A change touching ` +
				'only such a project would never trigger the workflow that compiles it.',
		);
	}

	return problems;
};

const run = () => {
	let problems;
	try {
		problems = findPathCoverageProblems();
	} catch (error) {
		console.error(
			'[api-tests-path-coverage] guard could not analyze the real tree and fails loud:',
		);
		console.error(
			`  ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}

	if (problems.length > 0) {
		console.error(
			'[api-tests-path-coverage] the API-suite path-filter coverage invariant is broken:',
		);
		for (const problem of problems) {
			console.error(`  - ${problem}`);
		}
		console.error(
			'Action: add or fix the workflow path filters so every project the barrier compiles is reachable. See packages/scripts-ts/src/check-api-tests-path-coverage.ts.',
		);
		process.exit(1);
	}

	console.log(
		'[api-tests-path-coverage] every API-suite-compiled project is reached by a .NET barrier path filter. [OK]',
	);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	run();
}
