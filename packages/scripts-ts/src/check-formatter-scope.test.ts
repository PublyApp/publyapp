/**
 * @vitest-environment node
 *
 * #1875 — formatter scope pinning.
 *
 * The `format` and `format:write` scripts in package.json pass an explicit
 * list of glob patterns to `oxfmt --check` / `oxfmt --write`. The
 * `.oxfmtrc.json` config file ALSO carries an `ignorePatterns` list. These
 * two declarations must stay in sync:
 *
 *   - If a glob is added to the package.json scripts but not reflected in
 *     `.oxfmtrc.json` (or vice versa), the scope silently drifts — files
 *     that should be formatted are skipped, or excluded files slip through.
 *   - There is no single source of truth; the scripts and the config are
 *     maintained independently, so the drift is invisible until someone
 *     notices formatting regressions in a PR.
 *
 * HOW THIS TEST WITNESSES THE REAL ARTIFACT (round 2, #1960)
 * ---------------------------------------------------------
 * The round-1 version compared STRING PREFIXES:
 *
 *     globPrefix.startsWith(ignore + '/')
 *
 * That model diverges from what oxfmt actually does. A directory-level
 * exclusion that EXACTLY matches the glob's directory prefix — e.g.
 * `packages/lint-ts` in `ignorePatterns` vs the format script's glob for
 * that tree (recursive over `packages/lint-ts`, brace-extension
 * `{js,mjs,cjs,ts,mts,cts,json}`) — is a silent no-op for the string check
 * (the glob prefix does not start with `packages/lint-ts/`), while oxfmt
 * genuinely skips every lint-ts file. The exact bypass #1875 describes
 * sailed through all three tests green.
 *
 * This version does not model oxfmt's ignore semantics at all. Every verdict
 * comes from running `oxfmt --check` itself against the real `.oxfmtrc.json`
 * from the repo root (the same cwd and config discovery the format scripts
 * rely on), and parsing the statistics line that oxfmt prints ("Finished in
 * Nms on M files"):
 *
 *  1. EVERY glob the format scripts pass must actually process files: exit 0
 *     and a non-zero file count. When every file matched by a glob is
 *     excluded by `ignorePatterns`, oxfmt exits 2 with "Expected at least one
 *     target file. All matched files may have been excluded by ignore rules."
 *     — the test goes RED naming the glob's directory prefix.
 *
 *  2. EVERY non-wildcard `ignorePatterns` entry that sits inside a glob's
 *     directory scope (equal to its prefix or below it) is probed twice:
 *     once with the real config, once with a config that drops ONLY that
 *     entry (written beside the real config so oxfmt anchors the remaining
 *     patterns the same way). If oxfmt processes MORE files without the
 *     entry, that entry is silently swallowing formatted files — the test
 *     goes RED naming the entry. The structural exclusions below are the
 *     only allowed swallows: they exist precisely because the files they
 *     cover are generated, vendored, or local and must never be formatted.
 *
 * A change that adds a glob to one declaration without the other — or an
 * exclusion that eats a directory the globs explicitly enumerate — fails the
 * test, naming the directory that left scope.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const REPO_ROOT = dirname(
	dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);

// oxfmt is a JS shim (node_modules/oxfmt/bin/oxfmt) that spawns the platform
// binary, so spawning it through process.execPath is cross-platform.
const OXFMT_BIN = join(REPO_ROOT, 'node_modules', 'oxfmt', 'bin', 'oxfmt');

/**
 * The full structural exclusion set of `.oxfmtrc.json`, frozen by test 2.
 *
 * These entries exist because the files they cover must never be formatted
 * by the repo formatter: generated output (client-ts, routeTree.gen.ts,
 * openapi.json, Migrations, ResponseKeys.g.cs), build artifacts (node_modules,
 * build, dist, .turbo, .react-router, .artifacts), and local tooling/config
 * (.config/dotnet-tools.json, .dump, .mcp.json, .claude/settings.local.json).
 *
 * A change to `ignorePatterns` is a deliberate scope change: it must add or
 * remove the entry HERE, in the same commit, so the change is reviewed as
 * what it is. Freezing the set (rather than sampling a few entries) is what
 * makes the added `packages/lint-ts` variant of the #1875 bypass a named red
 * test instead of a silent one.
 */
const STRUCTURAL_IGNORES = [
	'**/node_modules',
	'**/build',
	'**/dist',
	'**/.turbo',
	'**/.react-router',
	'**/routeTree.gen.ts',
	'packages/client-ts',
	'apps/api/openapi.json',
	'apps/api/Migrations',
	'apps/*/.artifacts',
	'packages/*/.artifacts',
	'.config/dotnet-tools.json',
	'apps/api/Localization/ResponseKeys.g.cs',
	'.dump',
	'.mcp.json',
	'.claude/settings.local.json',
];

/** Extract the explicit glob list from an `oxfmt --check "glob1" "glob2" ...` script. */
const extractFormatGlobs = (script: string): string[] => {
	// The format script has a `|| node -e "..."` fallback after the globs.
	// Only parse everything before the `||` — the fallback is not a glob.
	const beforePipe = script.split('||')[0]!;
	const oxfmtMatch = beforePipe.match(/oxfmt\s+(?:--check|--write)\s+(.*)$/);
	if (!oxfmtMatch) {
		return [];
	}
	// The globs are quoted strings in the shell command. Split on the
	// double-quote delimiter and take every odd-indexed segment.
	const parts = oxfmtMatch[1]!.split('"');
	const globs: string[] = [];
	for (let i = 1; i < parts.length; i += 2) {
		globs.push(parts[i]!);
	}
	return globs;
};

/** Extract the directory prefix from a format glob. */
const globDirectoryPrefix = (glob: string): string =>
	glob.replace(/\/\*\*.*$/, '');

/**
 * oxfmt's real verdict for one probe: its exit code, the raw output, and the
 * number of files it reports processing.
 */
type OxfmtCheckResult = {
	exitCode: number;
	count: number;
	output: string;
};

/**
 * Run oxfmt's own `--check` on the given target with the given config file
 * (`undefined` = config discovery, exactly like the format scripts).
 * Returns oxfmt's real verdict: exit code, raw output, and how many files it
 * actually processed (parsed from its own statistics line). A target whose
 * every file is excluded prints "Expected at least one target file" and
 * NO statistics line — that is the zero-file signal, not a parse failure.
 * Anything else unrecognizable is a LOUD failure: the guard must not guess
 * what oxfmt did.
 */
const runOxfmtCheck = (target: string, config?: string): OxfmtCheckResult => {
	const args = config ? ['-c', config, '--check', target] : ['--check', target];
	const result = spawnSync(process.execPath, [OXFMT_BIN, ...args], {
		cwd: REPO_ROOT,
		encoding: 'utf-8',
	});

	if (result.error) {
		throw new Error(
			`cannot run oxfmt ${args.join(' ')}: ${result.error.message}`,
		);
	}

	const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

	// Normal run: oxfmt prints the count of files it actually processed.
	const stats = output.match(
		/Finished in \d+(?:\.\d+)?ms on (\d+) files? using/,
	);
	if (stats) {
		return { exitCode: result.status ?? -1, count: Number(stats[1]), output };
	}

	// Fully excluded / unmatched target: oxfmt prints ONLY this message and
	// no statistics line. Count zero files processed — the scope signal.
	if (output.includes('Expected at least one target file')) {
		return { exitCode: result.status ?? -1, count: 0, output };
	}

	throw new Error(
		`unparseable oxfmt output for ${target} (neither a file-count line nor ` +
			`the zero-target message):\n${output}`,
	);
};

/** Write the real config minus one ignorePatterns entry, beside the real config. */
const writeProbeConfig = (droppedPattern: string): string => {
	const config = JSON.parse(
		readFileSync(join(REPO_ROOT, '.oxfmtrc.json'), 'utf-8'),
	) as { ignorePatterns: string[] };
	config.ignorePatterns = config.ignorePatterns.filter(
		(p) => p !== droppedPattern,
	);
	// Unique name so parallel vitest workers never collide, and the file is
	// never picked up as a discovered config by the real runs (only the exact
	// .oxfmtrc.json name is discovered).
	const probePath = join(
		REPO_ROOT,
		`.oxfmtrc.probe-${process.pid}-${Math.random().toString(36).slice(2)}.json`,
	);
	writeFileSync(probePath, `${JSON.stringify(config, null, '\t')}\n`);
	return probePath;
};

describe('#1875 — formatter scope consistency (package.json scripts vs .oxfmtrc.json)', () => {
	test('format and format:write scripts use the same glob list', () => {
		const pkg = JSON.parse(
			readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'),
		) as { scripts: Record<string, string> };

		const assertPkg = pkg.scripts.format;
		const assertWrite = pkg.scripts['format:write'];

		expect(assertPkg, 'package.json must define a format script').toBeDefined();
		expect(
			assertWrite,
			'package.json must define a format:write script',
		).toBeDefined();

		const checkGlobs = extractFormatGlobs(assertPkg!);
		const writeGlobs = extractFormatGlobs(assertWrite!);

		// The two scripts must cover the same set of files — adding a glob to
		// one but not the other is a scope drift that silently skips formatting.
		expect(writeGlobs).toEqual(checkGlobs);

		// Sanity: the format globs must be non-empty (the formatter is not
		// accidentally pointed at nothing).
		expect(checkGlobs.length).toBeGreaterThan(0);
	});

	test('.oxfmtrc.json ignorePatterns are exactly the frozen structural set', () => {
		// Pin the structural exclusions so they cannot be accidentally removed,
		// AND so a new entry cannot be added silently. Any change to the set is
		// a deliberate scope change: update STRUCTURAL_IGNORES in this file in
		// the same commit, with a reason.
		const config = JSON.parse(
			readFileSync(join(REPO_ROOT, '.oxfmtrc.json'), 'utf-8'),
		) as { ignorePatterns?: string[] };

		expect(config.ignorePatterns ?? []).toEqual(STRUCTURAL_IGNORES);
	});

	test('every format glob survives the real oxfmt scope, and no ignorePatterns entry swallows a glob directive', () => {
		const pkg = JSON.parse(
			readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'),
		) as { scripts: Record<string, string> };
		const config = JSON.parse(
			readFileSync(join(REPO_ROOT, '.oxfmtrc.json'), 'utf-8'),
		) as { ignorePatterns?: string[] };

		const formatGlobs = extractFormatGlobs(pkg.scripts.format ?? '');
		const ignorePatterns = config.ignorePatterns ?? [];
		const problems: string[] = [];

		// 1. Real-behavior alive check: every glob the scripts pass must
		// actually process files under the real config. A glob whose whole
		// scope is excluded makes oxfmt print "Expected at least one target
		// file" and process zero files. (Format issues, exit 1, still mean
		// oxfmt DID process the files — that is a different gate's job.)
		for (const glob of formatGlobs) {
			const { exitCode, count, output } = runOxfmtCheck(glob);
			if (exitCode === 2 || count < 1) {
				const prefix = globDirectoryPrefix(glob);
				problems.push(
					`format glob "${glob}" processed ${count} file(s) under the real ` +
						`.oxfmtrc.json (exit ${exitCode}) — the directory "${prefix}" ` +
						`slipped out of formatter scope. oxfmt says: ${output.trim()}`,
				);
			}
		}

		// 2. Pattern-level probe: every non-wildcard ignorePatterns entry that
		// sits inside a glob's directory scope must not swallow files. Ask
		// oxfmt twice — real config vs real config minus that one entry — and
		// compare the counts it reports. Structural exclusions (generated /
		// vendored / local files) are the only allowed swallows.
		for (const pattern of ignorePatterns) {
			if (pattern.includes('*')) {
				continue;
			}
			const inScope = formatGlobs.some((glob) => {
				const prefix = globDirectoryPrefix(glob);
				return pattern === prefix || pattern.startsWith(`${prefix}/`);
			});
			if (!inScope || STRUCTURAL_IGNORES.includes(pattern)) {
				continue;
			}

			const probePath = writeProbeConfig(pattern);
			try {
				const withEntry = runOxfmtCheck(pattern);
				const withoutEntry = runOxfmtCheck(pattern, probePath);
				if (withoutEntry.count > withEntry.count) {
					problems.push(
						`ignorePatterns entry "${pattern}" silently swallows ` +
							`${withoutEntry.count - withEntry.count} file(s) that the format ` +
							`globs explicitly cover (oxfmt processes ${withEntry.count} with the ` +
							`entry, ${withoutEntry.count} without it) — "${pattern}" is inside the ` +
							`scope of a format glob. Remove the entry, or if the files are ` +
							`generated/vendored, pin it in STRUCTURAL_IGNORES with a reason.`,
					);
				}
			} finally {
				try {
					unlinkSync(probePath);
				} catch {
					// Already gone; nothing to clean.
				}
			}
		}

		expect(problems).toEqual([]);
	});
});
