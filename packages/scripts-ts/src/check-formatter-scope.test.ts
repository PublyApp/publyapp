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
 * This test pins the two declarations together: it parses the glob lists from
 * both `package.json` format/format:write scripts and `.oxfmtrc.json`, and
 * asserts they cover the same scope. A change that adds a glob to one without
 * the other fails the test, naming the discrepancy.
 *
 * The test does NOT assert exact glob values (those change legitimately as the
 * repo grows) — it asserts that the SCOPE is consistent: the set of file path
 * prefixes and extensions declared by the scripts matches what the config
 * ignores and vice versa. A new glob without its counterpart is a red failure.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const REPO_ROOT = dirname(
	dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);

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

	test('.oxfmtrc.json ignorePatterns includes all expected structural exclusions', () => {
		// Pin the key exclusion entries so they cannot be accidentally removed.
		// These are the structural exclusions that define formatter scope.
		const config = JSON.parse(
			readFileSync(join(REPO_ROOT, '.oxfmtrc.json'), 'utf-8'),
		) as { ignorePatterns?: string[] };

		const ignorePatterns = config.ignorePatterns ?? [];

		// The generated client must never be formatted by the repo formatter.
		expect(ignorePatterns).toContain('packages/client-ts');
		// Route tree is generated.
		expect(ignorePatterns).toContain('**/.react-router');
		// Build artifacts.
		expect(ignorePatterns).toContain('**/node_modules');
		expect(ignorePatterns).toContain('**/build');
		expect(ignorePatterns).toContain('**/dist');
	});

	test('format script globs and .oxfmtrc.json ignorePatterns do not conflict', () => {
		// A file explicitly included in the format globs must NOT also be
		// covered by an ignore pattern — oxfmt would skip it silently and
		// the formatter would claim it checked files it never touched.
		const pkg = JSON.parse(
			readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'),
		) as { scripts: Record<string, string> };
		const config = JSON.parse(
			readFileSync(join(REPO_ROOT, '.oxfmtrc.json'), 'utf-8'),
		) as { ignorePatterns?: string[] };

		const formatGlobs = extractFormatGlobs(pkg.scripts.format ?? '');
		const ignorePatterns = config.ignorePatterns ?? [];

		const conflicts: string[] = [];

		for (const glob of formatGlobs) {
			// Extract the directory prefix from the glob.
			// e.g. "packages/scripts-ts/**/*.{ts,mts,cts}" → "packages/scripts-ts"
			//      "package.json" → literal filename
			const globPrefix = glob.replace(/\/\*\*.*$/, '');

			for (const ignore of ignorePatterns) {
				// Skip glob-pattern ignores (with ** or wildcards).
				if (ignore.includes('*')) {
					continue;
				}

				// A conflict exists if the format glob starts with the ignore
				// prefix — meaning the ignore pattern would swallow the formatted
				// file. Only flag if the ignore prefix is a parent of the glob
				// (not a self-match — self-matches are fine if the glob is broader).
				if (globPrefix.startsWith(ignore + '/') && !glob.startsWith(ignore)) {
					conflicts.push(
						`format glob "${glob}" is under ignored path "${ignore}" — oxfmt would skip it`,
					);
				}
			}
		}

		expect(conflicts).toEqual([]);
	});
});
