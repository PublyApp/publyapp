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
// Exit 0 on clean, exit 1 on vulnerability found or unparseable output.
// All errors are loud — unparseable input must fail, not silently pass.

import { execSync } from 'node:child_process';
import { argv } from 'node:process';

const NO_RESTORE = argv.includes('--no-restore');

const csprojFiles = execSync("git ls-files '*.csproj'", { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

if (csprojFiles.length === 0) {
  console.error('nuget-audit: no .csproj files found');
  process.exit(1);
}

// Restore all projects once (advisory DB is needed for --vulnerable).
// Each project is restored independently so a failure on one (e.g. NU1903
// promoted to error) does not skip the others.
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
      // Restore may exit non-zero when TreatWarningsAsErrors is active and
      // a vulnerable package is found — NU1903 becomes a hard error. That's
      // fine: the advisory database IS populated at that point, and
      // `dotnet list --vulnerable --no-restore` still produces valid JSON.
      // Log and continue to the scan.
      const output = (err.stdout ?? '') + (err.stderr ?? '');
      if (output.trim()) {
        restoreErrors.push(`${proj}: ${output.trim()}`);
      }
    }
  }
  if (restoreErrors.length > 0) {
    console.error('(restore reported issues — continuing with scan):');
    for (const e of restoreErrors) console.error(`  ${e}`);
  }
}

const vulnerabilities = [];
const errors = [];

for (const proj of csprojFiles) {
  let stdout;
  try {
    stdout = execSync(
      `dotnet list "${proj}" package --vulnerable --include-transitive --no-restore --format json`,
      { encoding: 'utf8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (err) {
    // dotnet list may exit non-zero when TreatWarningsAsErrors is active —
    // that's expected. The JSON output is still valid. Log the non-zero but
    // do NOT fail here; the JSON parsing below decides the outcome.
    stdout = err.stdout ?? '';
    if (!stdout) {
      errors.push(`${proj}: no JSON output (exit ${err.status ?? 'unknown'})`);
      continue;
    }
  }

  if (!stdout.trim()) {
    errors.push(`${proj}: empty output`);
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    errors.push(`${proj}: unparseable JSON output`);
    continue;
  }

  for (const project of parsed.projects ?? []) {
    for (const framework of project.frameworks ?? []) {
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
  }
}

if (errors.length > 0) {
  console.error('nuget-audit: scanning errors (unparseable output must fail loud):');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

if (vulnerabilities.length > 0) {
  console.error('nuget-audit: VULNERABLE packages detected:');
  for (const v of vulnerabilities) {
    console.error(`  ${v.id}@${v.version} (${v.severity}) in ${v.project}`);
    for (const url of v.advisories) console.error(`    ${url}`);
  }
  console.error('');
  console.error(
    'Bump to a patched version in Directory.Packages.props.',
  );
  process.exit(1);
}

console.log('nuget-audit: no vulnerable packages found.');
process.exit(0);
