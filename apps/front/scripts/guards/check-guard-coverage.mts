/**
 * Guard-coverage gate for the front guard family (issue #1525, round 2).
 *
 * The timeout wrapper `apps/front/scripts/run-guarded.mts` only protects the
 * guards that actually go through it. Issue #1525 exists because a bare
 * `node --test <guard>` runner has NO upper bound and holds the CI gate lock
 * forever when it freezes; the round-1 review found 9 of 39 pnpm scripts not
 * routed through the wrapper at all, with `test:typecheck-coverage-guard`
 * sitting bare inside the main `pnpm --filter front test` chain — and NOTHING
 * in the repo failed when a new guard bypassed the wrapper. knip cannot see
 * wrapper usage: it traces bare `node --test` scripts natively, so the knip
 * pairing (drop the invocation -> report the file unused) cannot see a guard
 * that was never wrapped. This gate closes that class for good.
 *
 * Two rules, both failing loud with the offending script NAMED:
 *
 * RULE 1 (all scripts) — every `node` invocation in every pnpm script must
 * be a `node scripts/run-guarded.mts ...` invocation. This catches the bare
 * node runners wherever they hide: `test:typecheck-coverage-guard`'s
 * `node --test`, `typecheck`'s inner check script, `preinstall`'s
 * assert-pinned, `generate:route-tree`.
 *
 * RULE 2 (guard families) — every `test:*` / `check:*` / `verify:*` script
 * must invoke `run-guarded.mts`. This also catches non-node runners inside
 * the guard families (`vitest run --config ...` and `playwright test --grep`
 * are now wrapped through the wrapper's `--` passthrough; a future bare one
 * fails here).
 *
 * EXEMPTIONS — long-running processes that must NOT be time-bounded (a 300s
 * wrapper would kill them mid-session). Each entry carries its reason.
 * `dev` (vite dev) does not invoke `node` by name, so it needs no entry;
 * `start` (node server.mjs) does, so it is exempted here.
 *
 * FAIL-CLOSED: an unreadable or unparseable `apps/front/package.json`, a
 * package.json without a `scripts` object, or an EMPTY guard family (every
 * guard deleted) is a loud failure, never a compliant green.
 *
 * CI: runs inside `pnpm --filter front test` (front supply-chain workflow,
 * `supply-chain` job, "Test front" step) as `pnpm check:guard-coverage`; its
 * own unit tests run as `test:guard-coverage-guard` in the same chain.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(HERE, '..', '..');
const PACKAGE_JSON_PATH = path.join(FRONT_DIR, 'package.json');

export type GuardCoverageFinding = {
	/** The pnpm script name that violates the rule. */
	script: string;
	/** Human-readable cause: which command bypassed the wrapper, and why. */
	detail: string;
};

/**
 * Scripts that run for the life of a session and MUST NOT be wrapped in a
 * timeout (the wrapper would SIGKILL them mid-session). Each entry names its
 * reason; the guard prints the list on every green run so it stays visible.
 */
export const LONG_RUNNING_EXEMPTIONS = {
	start:
		'production server (`node server.mjs`): runs until stopped; a 300s bound would kill it mid-session',
} as const satisfies Readonly<Record<string, string>>;

const FAMILY_PREFIXES = ['test:', 'check:', 'verify:'] as const;

export const isGuardFamilyScript = (name: string): boolean =>
	FAMILY_PREFIXES.some((prefix) => name.startsWith(prefix));

/** Splits a pnpm script value into its `&&` / `||` / `|` / `;` commands. */
const splitCommands = (script: string): string[] =>
	script.split(/\s+(?:&&|\|\||[|;])\s+/).map((command) => command.trim());

const WRAPPER_INVOCATION = /^node\s+scripts\/run-guarded\.mts(?:\s|$)/;

/**
 * Analyzes the given pnpm scripts against the two rules above.
 * `packageJsonPath` is reported verbatim in throw messages and never in
 * findings; the analyzer itself is pure over the scripts record.
 */
export const analyzeScripts = (
	scripts: Record<string, string>,
): GuardCoverageFinding[] => {
	const familyCount = Object.keys(scripts).filter(isGuardFamilyScript).length;
	if (familyCount === 0) {
		throw new Error(
			'check-guard-coverage: no test:/check:/verify: scripts found in apps/front/package.json. ' +
				'An empty guard family means the coverage claim verifies nothing; refusing to report green.',
		);
	}

	const findings: GuardCoverageFinding[] = [];
	for (const [name, script] of Object.entries(scripts)) {
		// Rule 1: every `node` invocation must route through the wrapper.
		for (const command of splitCommands(script)) {
			if (command.startsWith('node ')) {
				if (WRAPPER_INVOCATION.test(command)) {
					continue;
				}
				if (Object.hasOwn(LONG_RUNNING_EXEMPTIONS, name)) {
					continue;
				}
				findings.push({
					script: name,
					detail: `bare node invocation not routed through run-guarded.mts: "${command}"`,
				});
			}
		}

		// Rule 2: guard-family scripts must be wrapped, whatever the runner.
		if (isGuardFamilyScript(name) && !script.includes('run-guarded.mts')) {
			findings.push({
				script: name,
				detail: `guard-family script (test:*/check:*/verify:*) does not invoke run-guarded.mts: "${script}"`,
			});
		}
	}
	return findings;
};

/**
 * Loads the pnpm scripts from the given package.json. Throws a loud,
 * named error on: unreadable file, unparseable JSON, missing/non-object
 * `scripts`, or a scripts value that is not a string map. Never returns an
 * empty-because-something-failed record that would render "all green".
 */
export const loadScripts = (
	packageJsonPath: string,
): Record<string, string> => {
	let raw: string;
	try {
		raw = readFileSync(packageJsonPath, 'utf8');
	} catch (error) {
		throw new Error(
			`check-guard-coverage: cannot read ${packageJsonPath}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch (error) {
		throw new Error(
			`check-guard-coverage: cannot parse ${packageJsonPath} as JSON: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
	if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) {
		throw new Error(
			`check-guard-coverage: ${packageJsonPath} has no "scripts" object; the guard families cannot be enumerated.`,
		);
	}
	const scripts = (parsed as { scripts: unknown }).scripts;
	if (typeof scripts !== 'object' || scripts === null) {
		throw new Error(
			`check-guard-coverage: ${packageJsonPath} "scripts" is not an object; the guard families cannot be enumerated.`,
		);
	}
	for (const [name, value] of Object.entries(
		scripts as Record<string, unknown>,
	)) {
		if (typeof value !== 'string') {
			throw new Error(
				`check-guard-coverage: ${packageJsonPath} script "${name}" is not a string; the guard families cannot be analyzed.`,
			);
		}
	}
	return scripts as Record<string, string>;
};

export const main = (): void => {
	const scripts = loadScripts(PACKAGE_JSON_PATH);
	try {
		const findings = analyzeScripts(scripts);
		if (findings.length > 0) {
			console.error('check-guard-coverage: GUARD COVERAGE VIOLATIONS:');
			for (const finding of findings) {
				console.error(` - ${finding.script}: ${finding.detail}`);
			}
			process.exitCode = 1;
			return;
		}
		const familyCount = Object.keys(scripts).filter(isGuardFamilyScript).length;
		console.log(
			`check-guard-coverage: ${familyCount} guard-family scripts, all via run-guarded.mts.`,
		);
		const exempt = Object.entries(LONG_RUNNING_EXEMPTIONS);
		if (exempt.length > 0) {
			console.log(' exempt (long-running, must not be bounded):');
			for (const [name, reason] of exempt) {
				console.log(` - ${name}: ${reason}`);
			}
		}
	} catch (error) {
		console.error(
			`check-guard-coverage: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
	}
};

main();
