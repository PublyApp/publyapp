import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { scanUtilityBoundaries } from './check-utility-boundaries.mts';

const sandboxes: string[] = [];

after(() => {
	for (const directory of sandboxes) {
		rmSync(directory, { recursive: true, force: true });
	}
});

const makeSandbox = () => {
	const directory = mkdtempSync(path.join(tmpdir(), 'utility-boundaries-'));
	sandboxes.push(directory);
	mkdirSync(path.join(directory, 'src/utils'), { recursive: true });
	mkdirSync(path.join(directory, 'src/lib/format'), { recursive: true });
	return directory;
};

void test('detects direct date/time and clipboard browser APIs outside canonical utilities', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'src/routes.tsx'),
		`new Intl.DateTimeFormat('en');\nnavigator.clipboard.writeText('secret');\n`,
	);

	const findings = scanUtilityBoundaries(path.join(root, 'src'));

	assert.equal(findings.length, 2);
	assert.deepEqual(
		findings.map((finding) => finding.kind),
		['date-time', 'clipboard'],
	);
});

void test('catches the held #2104 second utility shape', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'src/lib/format/zone-date-time.ts'),
		`export const formatInZone = () => new Intl.DateTimeFormat('en');\n`,
	);

	const findings = scanUtilityBoundaries(path.join(root, 'src'));

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.kind, 'date-time');
});

void test('allows canonical utilities and test files', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'src/utils/format-time.ts'),
		`new Intl.DateTimeFormat('en');\n`,
	);
	writeFileSync(
		path.join(root, 'src/utils/clipboard.ts'),
		`navigator.clipboard.writeText('secret');\n`,
	);
	writeFileSync(
		path.join(root, 'src/routes.test.tsx'),
		`new Intl.DateTimeFormat('en');\nnavigator.clipboard.writeText('secret');\n`,
	);

	assert.deepEqual(scanUtilityBoundaries(path.join(root, 'src')), []);
});
