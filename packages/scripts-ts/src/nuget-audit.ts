#!/usr/bin/env node
// NuGet vulnerability audit using two separate `dotnet list package` calls.
//
// Call 1 (inspectability): `dotnet list <csproj> package --format json`
//   Validates the project is inspectable: `frameworks` must be non-empty.
//   If absent/empty, or `problems` contains errors, the project is uninspectable.
//
// Call 2 (vulnerability): `dotnet list <csproj> package --vulnerable --include-transitive --format json`
//   Checks for vulnerable packages. Empty/absent `frameworks` here = clean
//   (no vulnerable packages). `problems` with errors = uninspectable.
//
// This two-call design is required because `--vulnerable` OMITS `frameworks`
// entirely when there are zero vulnerable packages — "no frameworks" in the
// vulnerable call is the CLEAN case, not the uninspectable case.
//
// Usage: node packages/scripts-ts/src/nuget-audit.ts [--no-restore]
//   --no-restore   Skip `dotnet restore` (caller already restored)
//
// Exit 0 on clean, exit 1 on vulnerability found, unparseable output,
// uninspectable project, or a listed package carrying an empty vulnerabilities
// array (output dotnet never emits today; #1348).

import { execSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
// `argv` backs the direct-run CLI branch below; dropping this import in the
// .mjs->.ts conversion passed vitest (tests never execute that branch) but
// crashed the workflow's bare-`node` invocation with ReferenceError.
import { argv } from 'node:process';

/** One `problem` entry as emitted by `dotnet list package --format json`. */
type DotnetProblem = {
	code?: string;
	level?: string;
	message?: string;
	text?: string;
};

/** One package entry inside a framework's top-level/transitive package lists. */
type DotnetPackage = {
	id?: string;
	requestedVersion?: string;
	resolvedVersion?: string;
	vulnerabilities?: Array<{
		advisoryurl?: string;
		severity?: string;
	}>;
};

/** One target-framework entry inside a `projects[]` element. */
type DotnetFramework = {
	framework?: string;
	topLevelPackages?: DotnetPackage[];
	transitivePackages?: DotnetPackage[];
};

/** Parsed shape of `dotnet list package --format json` output. */
type DotnetListJson = {
	problems?: DotnetProblem[];
	projects?: Array<{
		frameworks?: DotnetFramework[];
		path?: string;
		problems?: DotnetProblem[];
	}>;
};

/**
 * Report returned by one `dotnet list` invocation: the parsed JSON when the
 * output was parseable, otherwise the failure mode and dotnet's exit code.
 */
export type DotnetReport = {
	error?: string;
	exitCode?: number;
	parsed: DotnetListJson | null;
};

/** A confirmed vulnerable dependency in one project. */
type Vulnerability = {
	advisories: Array<string | undefined>;
	id?: string;
	project: string;
	severity: string;
	version?: string;
};

/** Audit verdict for one project (paired inspectability + vulnerability). */
type ProjectAuditResult =
	| { ok: true; vulnerabilities: Vulnerability[] }
	| { error: string; ok: false };

/** Paired reports for one project, keyed by its csproj path. */
type ProjectReports = { inspected: DotnetReport; vulnerable: DotnetReport };

/** Aggregate decision across every audited project. */
type AuditResult = {
	errors: string[];
	exitCode: number;
	vulnerabilities: Vulnerability[];
};

/**
 * Evaluate paired inspectability + vulnerability reports for one project.
 *
 * @param inspected
 *   Report from `dotnet list <csproj> package --format json` (no --vulnerable).
 * @param vulnerable
 *   Report from `dotnet list <csproj> package --vulnerable --include-transitive --format json`.
 * @param proj
 *   Path to the csproj.
 */
export const evaluateProject = (
	inspected: DotnetReport,
	vulnerable: DotnetReport,
	proj: string,
): ProjectAuditResult => {
	const name = path.basename(proj);

	// --- Inspectability checks (call 1) ---

	if (inspected.error) {
		return {
			ok: false,
			error: `${proj}: could not inspect ${name}: ${inspected.error}`,
		};
	}

	if (inspected.exitCode && inspected.exitCode !== 0) {
		return {
			ok: false,
			error: `${proj}: could not inspect ${name}: dotnet list exited with code ${inspected.exitCode}`,
		};
	}

	const inspectProblems =
		inspected.parsed?.projects?.[0]?.problems ??
		inspected.parsed?.problems ??
		[];
	const inspectErrors = inspectProblems.filter(
		(p) => p.level === 'error' || p.code,
	);
	if (inspectErrors.length > 0) {
		const reason = inspectErrors
			.map((p) => `${p.code ?? p.level}: ${p.text ?? p.message}`)
			.join('; ');
		return {
			ok: false,
			error: `${proj}: could not inspect ${name}: ${reason}`,
		};
	}

	const inspectFrameworks = inspected.parsed?.projects?.[0]?.frameworks;
	if (!inspectFrameworks || inspectFrameworks.length === 0) {
		return {
			ok: false,
			error: `${proj}: could not inspect ${name}: no frameworks returned (project may not be restored)`,
		};
	}

	// --- Vulnerability checks (call 2) ---

	if (vulnerable.error) {
		return {
			ok: false,
			error: `${proj}: could not inspect ${name}: ${vulnerable.error}`,
		};
	}

	if (vulnerable.exitCode && vulnerable.exitCode !== 0) {
		return {
			ok: false,
			error: `${proj}: could not inspect ${name}: dotnet list exited with code ${vulnerable.exitCode}`,
		};
	}

	const vulnProblems =
		vulnerable.parsed?.projects?.[0]?.problems ??
		vulnerable.parsed?.problems ??
		[];
	const vulnErrors = vulnProblems.filter((p) => p.level === 'error' || p.code);
	if (vulnErrors.length > 0) {
		const reason = vulnErrors
			.map((p) => `${p.code ?? p.level}: ${p.text ?? p.message}`)
			.join('; ');
		return {
			ok: false,
			error: `${proj}: could not inspect ${name}: ${reason}`,
		};
	}

	// Empty/absent frameworks in the --vulnerable call = clean (no vulnerable packages).
	const vulnFrameworks = vulnerable.parsed?.projects?.[0]?.frameworks;
	if (!vulnFrameworks || vulnFrameworks.length === 0) {
		return { ok: true, vulnerabilities: [] };
	}

	// Check for vulnerable packages in the frameworks. A LISTED package with
	// an empty/missing vulnerabilities array is output dotnet never emits
	// today (#1348) — the guard cannot interpret it as clean, so it fails loud
	// naming the package instead of silently passing.
	const vulnerabilities: Vulnerability[] = [];
	const uninterpretable: string[] = [];
	for (const framework of vulnFrameworks) {
		for (const pkg of framework.topLevelPackages ?? []) {
			collectPackageVerdict(pkg, proj, vulnerabilities, uninterpretable);
		}
		for (const pkg of framework.transitivePackages ?? []) {
			collectPackageVerdict(pkg, proj, vulnerabilities, uninterpretable);
		}
	}

	if (uninterpretable.length > 0) {
		return {
			ok: false,
			error:
				`${proj}: could not inspect ${name}: ` +
				`listed package(s) with an empty vulnerabilities array (feed cannot be interpreted): ` +
				uninterpretable.join(', '),
		};
	}

	return { ok: true, vulnerabilities };
};

/**
 * Evaluate pre-parsed audit reports (paired per-project) and produce a decision.
 */
export const evaluateAudit = (
	reportsByProject: Map<string, ProjectReports>,
): AuditResult => {
	const vulnerabilities: Vulnerability[] = [];
	const errors: string[] = [];

	for (const [proj, { inspected, vulnerable }] of reportsByProject) {
		const result = evaluateProject(inspected, vulnerable, proj);
		if (result.ok) {
			console.log(
				`${proj}: inspected, ${result.vulnerabilities.length} vulnerable`,
			);
			vulnerabilities.push(...result.vulnerabilities);
		} else {
			console.error(`  ${result.error}`);
			errors.push(result.error);
		}
	}

	if (errors.length > 0) {
		return { exitCode: 1, vulnerabilities, errors };
	}

	if (vulnerabilities.length > 0) {
		console.error('nuget-audit: VULNERABLE packages detected:');
		for (const v of vulnerabilities) {
			console.error(`  ${v.id}@${v.version} (${v.severity}) in ${v.project}`);
			for (const url of v.advisories) {
				console.error(`    ${url}`);
			}
		}
		console.error('');
		console.error('Bump to a patched version in Directory.Packages.props.');
		return { exitCode: 1, vulnerabilities, errors };
	}

	console.log('nuget-audit: no vulnerable packages found.');
	return { exitCode: 0, vulnerabilities, errors };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sort one listed package (top-level or transitive) from the vulnerability
 * call: packages WITH advisories become `Vulnerability` entries; a package
 * LISTED with an empty/missing vulnerabilities array is output the guard
 * cannot interpret as clean (#1348), so its id lands in `uninterpretable`
 * for the fail-loud verdict.
 */
const collectPackageVerdict = (
	pkg: DotnetPackage,
	proj: string,
	vulnerabilities: Vulnerability[],
	uninterpretable: string[],
): void => {
	if ((pkg.vulnerabilities?.length ?? 0) > 0) {
		vulnerabilities.push({
			project: proj,
			id: pkg.id,
			version: pkg.resolvedVersion,
			severity: pkg.vulnerabilities.map((v) => v.severity).join(', '),
			advisories: pkg.vulnerabilities.map((v) => v.advisoryurl),
		});
	} else {
		uninterpretable.push(pkg.id ?? '<unnamed package>');
	}
};

const runDotnet = (args: string, proj: string): DotnetReport => {
	let stdout: string;
	let dotnetExitCode = 0;
	try {
		stdout = execSync(`dotnet list "${proj}" ${args} --format json`, {
			encoding: 'utf8',
			timeout: 120_000,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	} catch (err) {
		// @ts-expect-error rung-0: TS18046 (err is unknown)
		stdout = err.stdout ?? '';
		// @ts-expect-error rung-0: TS18046 (err is unknown)
		dotnetExitCode = err.status ?? 1;
		if (!stdout) {
			return {
				parsed: null,
				error: `no JSON output (exit ${dotnetExitCode})`,
				exitCode: dotnetExitCode,
			};
		}
	}

	if (!stdout.trim()) {
		return { parsed: null, error: 'empty output', exitCode: dotnetExitCode };
	}

	try {
		return { parsed: JSON.parse(stdout), exitCode: dotnetExitCode };
	} catch {
		return {
			parsed: null,
			error: 'unparseable JSON output',
			exitCode: dotnetExitCode,
		};
	}
};

// ---------------------------------------------------------------------------
// Direct-run mode: discover csproj files via git, run dotnet, evaluate.
// ---------------------------------------------------------------------------

/**
 * Parse `git ls-files '*.csproj'` stdout into the list of projects the audit
 * must scan: one path per line, blank/whitespace-only lines dropped,
 * duplicates removed, sorted so scan order is deterministic.
 *
 * Exported because this contract decides WHICH projects get audited — an
 * untested regression here could silently shrink the scan set (the exact
 * silent-pass class the JSON-based rewrite in #1199 exists to prevent).
 *
 * Discovery boundary (deliberate, #1348): this scans COMMITTED .csproj files
 * only — `git ls-files` never walks the filesystem, so an untracked or
 * ignored csproj is invisible to the audit. Accepted because CI commits
 * before running the gate; do not "fix" this into a filesystem walk without
 * thinking: a walk would silently widen (or, via ignore rules, wobble) the
 * scan set the gate was proven against.
 */
export const parseGitLsFilesCsproj = (lsFilesStdout: string): string[] =>
	[
		...new Set(
			lsFilesStdout
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0),
		),
	].sort();

// @ts-expect-error rung-0: add proper type in later rung
const toPosixPath = (value) => value.split(path.sep).join('/');

const isDirectRun =
	process.argv[1] &&
	toPosixPath(process.argv[1]).endsWith(
		'packages/scripts-ts/src/nuget-audit.ts',
	);

if (isDirectRun) {
	const NO_RESTORE = argv.includes('--no-restore');

	const csprojFiles = parseGitLsFilesCsproj(
		execSync("git ls-files '*.csproj'", {
			encoding: 'utf8',
		}),
	);

	if (csprojFiles.length === 0) {
		console.error('nuget-audit: no .csproj files found');
		process.exit(1);
	}

	if (!NO_RESTORE) {
		console.log('Restoring .NET projects for vulnerability scan...');
		const restoreErrors: string[] = [];
		for (const proj of csprojFiles) {
			try {
				execSync(`dotnet restore "${proj}"`, {
					encoding: 'utf8',
					stdio: 'pipe',
				});
			} catch (err) {
				// @ts-expect-error rung-0: TS18046 (err is unknown)
				const output = (err.stdout ?? '') + (err.stderr ?? '');
				if (output.trim()) {
					restoreErrors.push(`${proj}: ${output.trim()}`);
				}
			}
		}
		if (restoreErrors.length > 0) {
			console.error('(restore reported issues -- continuing with scan):');
			for (const e of restoreErrors) {
				console.error(`  ${e}`);
			}
		}
	}

	const reportsByProject = new Map<string, ProjectReports>();

	for (const proj of csprojFiles) {
		// Call 1: inspectability (no --vulnerable)
		const inspected = runDotnet('package', proj);
		// Call 2: vulnerability scan
		const vulnerable = runDotnet(
			'package --vulnerable --include-transitive --no-restore',
			proj,
		);

		reportsByProject.set(proj, { inspected, vulnerable });
	}

	const result = evaluateAudit(reportsByProject);
	process.exit(result.exitCode);
}
