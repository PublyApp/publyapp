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
// Usage: node scripts/nuget-audit.mjs [--no-restore]
//   --no-restore   Skip `dotnet restore` (caller already restored)
//
// Exit 0 on clean, exit 1 on vulnerability found, unparseable output, or
// uninspectable project.

import { execSync } from 'node:child_process';
import path from 'node:path';
import { argv } from 'node:process';

/**
 * Evaluate paired inspectability + vulnerability reports for one project.
 *
 * @param {{ parsed: object | null, error?: string, exitCode?: number }} inspected
 *   Report from `dotnet list <csproj> package --format json` (no --vulnerable).
 * @param {{ parsed: object | null, error?: string, exitCode?: number }} vulnerable
 *   Report from `dotnet list <csproj> package --vulnerable --include-transitive --format json`.
 * @param {string} proj
 *   Path to the csproj.
 * @returns {{ ok: boolean, vulnerabilities?: object[], error?: string }}
 */
export const evaluateProject = (inspected, vulnerable, proj) => {
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

	// Check for vulnerable packages in the frameworks.
	const vulnerabilities = [];
	for (const framework of vulnFrameworks) {
		for (const pkg of framework.topLevelPackages ?? []) {
			if (pkg.vulnerabilities?.length > 0) {
				vulnerabilities.push({
					project: proj,
					id: pkg.id,
					version: pkg.resolvedVersion,
					severity: pkg.vulnerabilities.map((v) => v.severity).join(', '),
					advisories: pkg.vulnerabilities.map((v) => v.advisoryurl),
				});
			}
		}
		for (const pkg of framework.transitivePackages ?? []) {
			if (pkg.vulnerabilities?.length > 0) {
				vulnerabilities.push({
					project: proj,
					id: pkg.id,
					version: pkg.resolvedVersion,
					severity: pkg.vulnerabilities.map((v) => v.severity).join(', '),
					advisories: pkg.vulnerabilities.map((v) => v.advisoryurl),
				});
			}
		}
	}

	return { ok: true, vulnerabilities };
};

/**
 * Evaluate pre-parsed audit reports (paired per-project) and produce a decision.
 *
 * @param {Map<string, { inspected: { parsed: object | null, error?: string, exitCode?: number }, vulnerable: { parsed: object | null, error?: string, exitCode?: number } }>} reportsByProject
 * @returns {{ exitCode: number, vulnerabilities: object[], errors: string[] }}
 */
export const evaluateAudit = (reportsByProject) => {
	const vulnerabilities = [];
	const errors = [];

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
			for (const url of v.advisories) console.error(`    ${url}`);
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

function runDotnet(args, proj) {
	let stdout;
	let dotnetExitCode = 0;
	try {
		stdout = execSync(`dotnet list "${proj}" ${args} --format json`, {
			encoding: 'utf8',
			timeout: 120_000,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	} catch (err) {
		stdout = err.stdout ?? '';
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
}

// ---------------------------------------------------------------------------
// Direct-run mode: discover csproj files via git, run dotnet, evaluate.
// ---------------------------------------------------------------------------

const isDirectRun =
	process.argv[1] && process.argv[1].endsWith('scripts/nuget-audit.mjs');

if (isDirectRun) {
	const NO_RESTORE = argv.includes('--no-restore');

	const csprojFiles = execSync("git ls-files '*.csproj'", {
		encoding: 'utf8',
	})
		.trim()
		.split('\n')
		.filter(Boolean);

	if (csprojFiles.length === 0) {
		console.error('nuget-audit: no .csproj files found');
		process.exit(1);
	}

	if (!NO_RESTORE) {
		console.log('Restoring .NET projects for vulnerability scan...');
		const restoreErrors = [];
		for (const proj of csprojFiles) {
			try {
				execSync(`dotnet restore "${proj}"`, {
					encoding: 'utf8',
					stdio: 'pipe',
				});
			} catch (err) {
				const output = (err.stdout ?? '') + (err.stderr ?? '');
				if (output.trim()) {
					restoreErrors.push(`${proj}: ${output.trim()}`);
				}
			}
		}
		if (restoreErrors.length > 0) {
			console.error('(restore reported issues -- continuing with scan):');
			for (const e of restoreErrors) console.error(`  ${e}`);
		}
	}

	const reportsByProject = new Map();

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
