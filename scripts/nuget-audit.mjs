#!/usr/bin/env node
// NuGet vulnerability audit using `dotnet list package --vulnerable --format json`.
//
// Replaces the broken text-grep approach that missed vulnerabilities when
// TreatWarningsAsErrors converted NU1903 warnings into errors (the grep pattern
// never matched). This script parses the machine-readable JSON output instead.
//
// Usage: node scripts/nuget-audit.mjs [--no-restore]
//   --no-restore   Skip `dotnet restore` (caller already restored)
//
// Exit 0 on clean, exit 1 on vulnerability found, unparseable output, or
// uninspectable project. All errors are loud -- the gate must distinguish
// "inspected and clean" from "unable to inspect".

import { execSync } from 'node:child_process';
import path from 'node:path';
import { argv } from 'node:process';

/**
 * Evaluate pre-parsed audit reports and produce a decision.
 *
 * @param {Map<string, { parsed: object | null, error?: string }>} reportsByProject
 *   Map of csproj path -> parsed JSON (or null with an error string).
 * @returns {{ exitCode: number, vulnerabilities: object[], errors: string[], uninspectable: string[] }}
 */
export const evaluateAudit = (reportsByProject) => {
  const vulnerabilities = [];
  const errors = [];
  const uninspectable = [];

  for (const [proj, report] of reportsByProject) {
    const name = path.basename(proj);

    if (report.error) {
      errors.push(`${proj}: ${report.error}`);
      continue;
    }

    const frameworks = report.parsed?.projects?.[0]?.frameworks;

    if (!frameworks || frameworks.length === 0) {
      const problems =
        report.parsed?.problems ??
        report.parsed?.projects?.[0]?.problems ??
        [];
      const reason =
        problems.length > 0
          ? problems.map((p) => `${p.code ?? p.level}: ${p.text ?? p.message}`).join('; ')
          : 'no frameworks returned';
      uninspectable.push(`${proj}: could not inspect ${name}: ${reason}`);
      continue;
    }

    let vulnCount = 0;
    for (const framework of frameworks) {
      for (const pkg of framework.topLevelPackages ?? []) {
        if (pkg.vulnerabilities?.length > 0) {
          vulnCount++;
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
          vulnCount++;
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

    console.log(`${proj}: inspected, ${vulnCount} vulnerable`);
  }

  for (const u of uninspectable) {
    console.error(`  ${u}`);
  }
  for (const e of errors) {
    console.error(`  ${e}`);
  }

  if (uninspectable.length > 0 || errors.length > 0) {
    const exitCode = 1;
    return { exitCode, vulnerabilities, errors, uninspectable };
  }

  if (vulnerabilities.length > 0) {
    console.error('nuget-audit: VULNERABLE packages detected:');
    for (const v of vulnerabilities) {
      console.error(`  ${v.id}@${v.version} (${v.severity}) in ${v.project}`);
      for (const url of v.advisories) console.error(`    ${url}`);
    }
    console.error('');
    console.error('Bump to a patched version in Directory.Packages.props.');
    return { exitCode: 1, vulnerabilities, errors, uninspectable };
  }

  console.log('nuget-audit: no vulnerable packages found.');
  return { exitCode: 0, vulnerabilities, errors, uninspectable };
};

// ---------------------------------------------------------------------------
// Direct-run mode: discover csproj files via git, run dotnet, evaluate.
// ---------------------------------------------------------------------------

const isDirectRun =
  process.argv[1] &&
  process.argv[1].endsWith('scripts/nuget-audit.mjs');

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
    let stdout;
    try {
      stdout = execSync(
        `dotnet list "${proj}" package --vulnerable --include-transitive --no-restore --format json`,
        { encoding: 'utf8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (err) {
      stdout = err.stdout ?? '';
      if (!stdout) {
        reportsByProject.set(proj, {
          parsed: null,
          error: `no JSON output (exit ${err.status ?? 'unknown'})`,
        });
        continue;
      }
    }

    if (!stdout.trim()) {
      reportsByProject.set(proj, { parsed: null, error: 'empty output' });
      continue;
    }

    try {
      reportsByProject.set(proj, { parsed: JSON.parse(stdout) });
    } catch {
      reportsByProject.set(proj, { parsed: null, error: 'unparseable JSON output' });
    }
  }

  const result = evaluateAudit(reportsByProject);
  process.exit(result.exitCode);
}
