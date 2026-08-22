import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateProject, evaluateAudit } from './nuget-audit.mjs';

// ---------------------------------------------------------------------------
// Fixture builders matching real `dotnet list package --format json` shapes.
//
// Key shapes from real CLI output:
//   Inspectability call (--format json, no --vulnerable):
//     Clean project: { projects: [{ path, frameworks: [{ framework, topLevelPackages }] }] }
//     Unrestored / broken: { projects: [{ path, problems: [...] }] }  (no frameworks)
//
//   Vulnerability call (--vulnerable --include-transitive --format json):
//     Clean project: { projects: [{ path }] }   <-- NO frameworks key at all!
//     Has vulns:     { projects: [{ path, frameworks: [{ topLevelPackages: [...], transitivePackages: [...] }] }] }
// ---------------------------------------------------------------------------

function inspectableReport() {
	return {
		parsed: {
			projects: [
				{
					path: '/some/path/App.csproj',
					frameworks: [
						{
							framework: 'net10.0',
							topLevelPackages: [
								{
									id: 'Bogus',
									requestedVersion: '35.5.1',
									resolvedVersion: '35.5.1',
								},
							],
						},
					],
				},
			],
		},
		exitCode: 0,
	};
}

function cleanVulnReport() {
	// Real CLI output: no `frameworks` key when there are zero vulnerable packages.
	return {
		parsed: {
			projects: [
				{
					path: '/some/path/App.csproj',
				},
			],
		},
		exitCode: 0,
	};
}

function vulnReportWithVulnerability(pkgId) {
	return {
		parsed: {
			projects: [
				{
					path: '/some/path/App.csproj',
					frameworks: [
						{
							topLevelPackages: [
								{
									id: pkgId || 'Newtonsoft.Json',
									resolvedVersion: '12.0.1',
									vulnerabilities: [
										{
											severity: 'High',
											advisoryurl:
												'https://nvd.nist.gov/vuln/detail/CVE-2024-21907',
										},
									],
								},
							],
							transitivePackages: [],
						},
					],
				},
			],
		},
		exitCode: 0,
	};
}

function vulnReportWithTransitiveVulnerability() {
	return {
		parsed: {
			projects: [
				{
					path: '/some/path/App.csproj',
					frameworks: [
						{
							topLevelPackages: [],
							transitivePackages: [
								{
									id: 'System.Text.Encodings.Web',
									resolvedVersion: '4.5.0',
									vulnerabilities: [
										{
											severity: 'High',
											advisoryurl: 'https://example.com/advisory',
										},
									],
								},
							],
						},
					],
				},
			],
		},
		exitCode: 0,
	};
}

function uninspectableNoFrameworksReport() {
	// Real CLI: unrestored project returns problems at top level, no frameworks.
	return {
		parsed: {
			projects: [
				{
					path: '/some/path/Broken.csproj',
					problems: [
						{ code: 'NU1101', message: 'Unable to find package ZzzBogus9999' },
					],
				},
			],
		},
		exitCode: 0,
	};
}

function uninspectableEmptyFrameworksReport() {
	return {
		parsed: {
			projects: [
				{
					path: '/some/path/Broken.csproj',
					frameworks: [],
					problems: [
						{
							level: 'error',
							text: 'Unable to read a package reference from the project.',
						},
					],
				},
			],
		},
		exitCode: 0,
	};
}

function errorReport(errorMsg, exitCode) {
	return { parsed: null, error: errorMsg, exitCode: exitCode ?? 1 };
}

// ---------------------------------------------------------------------------
// evaluateProject tests
// ---------------------------------------------------------------------------

test('inspectable + clean vuln = ok with zero vulnerabilities', function () {
	var r = evaluateProject(
		inspectableReport(),
		cleanVulnReport(),
		'src/App/App.csproj',
	);
	assert.equal(r.ok, true);
	assert.equal(r.vulnerabilities.length, 0);
});

test('inspectable + vulnerable package = ok with 1 vulnerability', function () {
	var r = evaluateProject(
		inspectableReport(),
		vulnReportWithVulnerability(),
		'src/App/App.csproj',
	);
	assert.equal(r.ok, true);
	assert.equal(r.vulnerabilities.length, 1);
	assert.equal(r.vulnerabilities[0].id, 'Newtonsoft.Json');
	assert.match(r.vulnerabilities[0].severity, /High/);
});

test('inspectable + vulnerable transitive package is detected', function () {
	var r = evaluateProject(
		inspectableReport(),
		vulnReportWithTransitiveVulnerability(),
		'src/App/App.csproj',
	);
	assert.equal(r.ok, true);
	assert.equal(r.vulnerabilities.length, 1);
	assert.equal(r.vulnerabilities[0].id, 'System.Text.Encodings.Web');
});

test('uninspectable inspectability call (no frameworks) = not ok', function () {
	var r = evaluateProject(
		uninspectableNoFrameworksReport(),
		cleanVulnReport(),
		'src/Broken/Broken.csproj',
	);
	assert.equal(r.ok, false);
	assert.match(r.error, /could not inspect Broken\.csproj/);
	assert.match(r.error, /NU1101/);
});

test('uninspectable inspectability call (empty frameworks with errors) = not ok', function () {
	var r = evaluateProject(
		uninspectableEmptyFrameworksReport(),
		cleanVulnReport(),
		'src/Broken/Broken.csproj',
	);
	assert.equal(r.ok, false);
	assert.match(r.error, /could not inspect Broken\.csproj/);
	assert.match(r.error, /Unable to read a package reference/);
});

test('non-zero exit in inspectability call = not ok', function () {
	var r = evaluateProject(
		errorReport('no JSON output (exit 1)', 1),
		cleanVulnReport(),
		'src/Broken/Broken.csproj',
	);
	assert.equal(r.ok, false);
	assert.match(r.error, /could not inspect Broken\.csproj/);
});

test('empty output in inspectability call = not ok', function () {
	var r = evaluateProject(
		errorReport('empty output', 0),
		cleanVulnReport(),
		'src/Broken/Broken.csproj',
	);
	assert.equal(r.ok, false);
	assert.match(r.error, /could not inspect Broken\.csproj/);
	assert.match(r.error, /empty output/);
});

test('unparseable JSON in inspectability call = not ok', function () {
	var r = evaluateProject(
		errorReport('unparseable JSON output', 0),
		cleanVulnReport(),
		'src/Bad/Bad.csproj',
	);
	assert.equal(r.ok, false);
	assert.match(r.error, /unparseable JSON output/);
});

test('non-zero exit in vulnerability call = not ok', function () {
	// When dotnet exits non-zero with no stdout, runDotnet returns
	// { parsed: null, error: 'no JSON output (exit 1)' }. The evaluateProject
	// function appends the raw error string as-is.
	var r = evaluateProject(
		inspectableReport(),
		errorReport('no JSON output (exit 1)', 1),
		'src/App/App.csproj',
	);
	assert.equal(r.ok, false);
	assert.match(r.error, /could not inspect App\.csproj/);
	assert.match(r.error, /exit 1/);
});

test('problems with errors in vulnerability call = not ok', function () {
	var r = evaluateProject(
		inspectableReport(),
		{
			parsed: {
				projects: [
					{
						path: '/some/path/App.csproj',
						problems: [
							{ code: 'NU1101', message: 'Unable to find package Bogus999' },
						],
					},
				],
			},
			exitCode: 0,
		},
		'src/App/App.csproj',
	);
	assert.equal(r.ok, false);
	assert.match(r.error, /could not inspect App\.csproj/);
	assert.match(r.error, /NU1101/);
});

test('missing projects key in inspectability call = not ok', function () {
	var r = evaluateProject(
		{ parsed: {} },
		cleanVulnReport(),
		'src/Empty/Empty.csproj',
	);
	assert.equal(r.ok, false);
	assert.match(r.error, /could not inspect Empty\.csproj/);
});

// ---------------------------------------------------------------------------
// evaluateAudit tests (multi-project)
// ---------------------------------------------------------------------------

test('all projects clean produces exit 0', function () {
	var reports = new Map();
	reports.set('a/A.csproj', {
		inspected: inspectableReport(),
		vulnerable: cleanVulnReport(),
	});
	reports.set('b/B.csproj', {
		inspected: inspectableReport(),
		vulnerable: cleanVulnReport(),
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 0);
	assert.equal(r.vulnerabilities.length, 0);
	assert.equal(r.errors.length, 0);
});

test('one vulnerable package produces exit 1 with package name', function () {
	var reports = new Map();
	reports.set('src/App/App.csproj', {
		inspected: inspectableReport(),
		vulnerable: vulnReportWithVulnerability(),
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.vulnerabilities.length, 1);
	assert.equal(r.vulnerabilities[0].id, 'Newtonsoft.Json');
	assert.match(r.vulnerabilities[0].severity, /High/);
});

test('mixed clean, vulnerable, and uninspectable exits 1', function () {
	var reports = new Map();
	reports.set('src/Good/Good.csproj', {
		inspected: inspectableReport(),
		vulnerable: cleanVulnReport(),
	});
	reports.set('src/Vuln/Vuln.csproj', {
		inspected: inspectableReport(),
		vulnerable: vulnReportWithVulnerability(),
	});
	reports.set('src/Broken/Broken.csproj', {
		inspected: uninspectableNoFrameworksReport(),
		vulnerable: cleanVulnReport(),
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.vulnerabilities.length, 1);
	assert.equal(r.vulnerabilities[0].project, 'src/Vuln/Vuln.csproj');
	assert.equal(r.errors.length, 1);
	assert.match(r.errors[0], /could not inspect Broken\.csproj/);
});

test('multiple uninspectable projects are all reported', function () {
	var reports = new Map();
	reports.set('a/A.csproj', {
		inspected: uninspectableNoFrameworksReport(),
		vulnerable: cleanVulnReport(),
	});
	reports.set('b/B.csproj', {
		inspected: uninspectableNoFrameworksReport(),
		vulnerable: cleanVulnReport(),
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.errors.length, 2);
});

test('inspectability failures take precedence over vuln data', function () {
	// Even if the vuln report looks clean, uninspectable inspectability → fail
	var reports = new Map();
	reports.set('src/Broken/Broken.csproj', {
		inspected: uninspectableNoFrameworksReport(),
		vulnerable: cleanVulnReport(),
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.vulnerabilities.length, 0);
	assert.equal(r.errors.length, 1);
});

test('missing projects key in inspectability is uninspectable', function () {
	var reports = new Map();
	reports.set('src/Empty/Empty.csproj', {
		inspected: { parsed: {} },
		vulnerable: cleanVulnReport(),
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.errors.length, 1);
});
