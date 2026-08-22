import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateAudit } from './nuget-audit.mjs';

// Helper report builders that mirror `dotnet list --format json` structure.

function cleanReport() {
	return {
		parsed: {
			projects: [
				{
					frameworks: [{ topLevelPackages: [], transitivePackages: [] }],
				},
			],
		},
	};
}

function vulnerableReport(pkgId) {
	return {
		parsed: {
			projects: [
				{
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
	};
}

function uninspectableReport(problems) {
	return {
		parsed: {
			projects: [
				{
					frameworks: [],
					problems: problems || [],
				},
			],
		},
	};
}

function topProblemsReport(problems) {
	return {
		parsed: {
			problems: problems || [],
			projects: [{ path: '/some/path/Proj.csproj' }],
		},
	};
}

function emptyProjectsReport() {
	return { parsed: { projects: [] } };
}

// --- Tests ---

test('clean output produces exit 0', function () {
	var reports = new Map([['src/App/App.csproj', cleanReport()]]);
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 0);
	assert.equal(r.vulnerabilities.length, 0);
	assert.equal(r.errors.length, 0);
	assert.equal(r.uninspectable.length, 0);
});

test('one vulnerable package produces exit 1 with package name', function () {
	var reports = new Map([['src/App/App.csproj', vulnerableReport()]]);
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.vulnerabilities.length, 1);
	assert.equal(r.vulnerabilities[0].id, 'Newtonsoft.Json');
	assert.match(r.vulnerabilities[0].severity, /High/);
});

test('vulnerable transitive package is also detected', function () {
	var reports = new Map();
	reports.set('src/App/App.csproj', {
		parsed: {
			projects: [
				{
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
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.vulnerabilities[0].id, 'System.Text.Encodings.Web');
});

test('zero frameworks is uninspectable and exits 1', function () {
	var reports = new Map([['src/Broken/Broken.csproj', uninspectableReport()]]);
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.uninspectable.length, 1);
	assert.match(r.uninspectable[0], /could not inspect Broken\.csproj/);
	assert.match(r.uninspectable[0], /no frameworks returned/);
});

test('restore problems are uninspectable with reason', function () {
	var reports = new Map();
	reports.set(
		'src/Broken/Broken.csproj',
		uninspectableReport([
			{ code: 'NU1101', message: 'Unable to find package ZzzBogus9999' },
		]),
	);
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.match(r.uninspectable[0], /NU1101/);
	assert.match(r.uninspectable[0], /Unable to find package/);
});

test('top-level dotnet problems are surfaced as uninspectable', function () {
	var reports = new Map();
	reports.set(
		'src/Broken/Broken.csproj',
		topProblemsReport([
			{
				level: 'error',
				text: 'Unable to read a package reference from the project.',
			},
		]),
	);
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.match(r.uninspectable[0], /could not inspect Broken\.csproj/);
	assert.match(r.uninspectable[0], /Unable to read a package reference/);
});

test('missing projects key is uninspectable', function () {
	var reports = new Map([['src/Empty/Empty.csproj', { parsed: {} }]]);
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.uninspectable.length, 1);
});

test('empty projects array is uninspectable', function () {
	var reports = new Map([['src/Empty/Empty.csproj', emptyProjectsReport()]]);
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.uninspectable.length, 1);
});

test('unparseable JSON is an error and exits 1', function () {
	var reports = new Map();
	reports.set('src/Bad/Bad.csproj', {
		parsed: null,
		error: 'unparseable JSON output',
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.match(r.errors[0], /unparseable JSON output/);
});

test('empty output is an error and exits 1', function () {
	var reports = new Map();
	reports.set('src/Bad/Bad.csproj', { parsed: null, error: 'empty output' });
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.match(r.errors[0], /empty output/);
});

test('mixed clean vulnerable and uninspectable exits 1', function () {
	var reports = new Map();
	reports.set('src/Good/Good.csproj', cleanReport());
	reports.set('src/Vuln/Vuln.csproj', vulnerableReport());
	reports.set('src/Broken/Broken.csproj', uninspectableReport());
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.vulnerabilities.length, 1);
	assert.equal(r.vulnerabilities[0].project, 'src/Vuln/Vuln.csproj');
	assert.equal(r.uninspectable.length, 1);
});

test('all projects clean produces exit 0', function () {
	var reports = new Map();
	reports.set('a/A.csproj', cleanReport());
	reports.set('b/B.csproj', cleanReport());
	reports.set('c/C.csproj', cleanReport());
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 0);
	assert.equal(r.vulnerabilities.length, 0);
});

test('multiple uninspectable projects are all reported', function () {
	var reports = new Map();
	reports.set('a/A.csproj', uninspectableReport());
	reports.set('b/B.csproj', uninspectableReport());
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.uninspectable.length, 2);
});

test('non-zero dotnet exit is uninspectable even with valid JSON', function () {
	var reports = new Map();
	reports.set('src/Broken/Broken.csproj', {
		parsed: {
			projects: [
				{
					frameworks: [{ topLevelPackages: [], transitivePackages: [] }],
				},
			],
		},
		exitCode: 1,
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 1);
	assert.equal(r.uninspectable.length, 1);
	assert.match(r.uninspectable[0], /could not inspect Broken\.csproj/);
	assert.match(r.uninspectable[0], /dotnet list exited with code 1/);
});

test('zero dotnet exit is not flagged as uninspectable', function () {
	var reports = new Map();
	reports.set('src/App/App.csproj', {
		parsed: {
			projects: [
				{
					frameworks: [{ topLevelPackages: [], transitivePackages: [] }],
				},
			],
		},
		exitCode: 0,
	});
	var r = evaluateAudit(reports);
	assert.equal(r.exitCode, 0);
	assert.equal(r.uninspectable.length, 0);
});
