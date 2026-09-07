import assert from 'node:assert/strict';
import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
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

void test('allows shadowed browser-global locals', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'src/routes.tsx'),
		`export {};
const Intl = { DateTimeFormat: class {} };
const navigator = { clipboard: { writeText: () => undefined } };
new Intl.DateTimeFormat();
navigator.clipboard.writeText();
`,
	);

	assert.deepEqual(scanUtilityBoundaries(path.join(root, 'src')), []);
});

void test('detects aliases, destructuring, computed members, wrappers, globals, and optional calls', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'src/routes.tsx'),
		`const Formatter = (Intl as typeof Intl).DateTimeFormat;
const { DateTimeFormat: DestructuredFormatter } = globalThis['Intl'];
const intl = window.Intl;
const clipboard = globalThis.navigator.clipboard;
const writeText = clipboard['writeText'].bind(clipboard);
new Formatter('en');
new DestructuredFormatter('en');
intl?.DateTimeFormat?.('en');
writeText('secret');
window.navigator.clipboard?.writeText?.('secret');
`,
	);

	const findings = scanUtilityBoundaries(path.join(root, 'src'));

	assert.equal(
		findings.filter((finding) => finding.kind === 'date-time').length,
		3,
	);
	assert.equal(
		findings.filter((finding) => finding.kind === 'clipboard').length,
		2,
	);
});

void test('resolves statically resolvable re-exports and imported wrappers', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'src/lib/format.ts'),
		`const Formatter = Intl.DateTimeFormat;
export { Formatter };
const writeText = navigator.clipboard.writeText;
export { writeText };
`,
	);
	writeFileSync(
		path.join(root, 'src/routes.tsx'),
		`import { Formatter, writeText } from './lib/format';
new Formatter('en');
writeText('secret');
`,
	);

	const findings = scanUtilityBoundaries(path.join(root, 'src'));

	assert.deepEqual(
		findings.map((finding) => finding.kind),
		['date-time', 'clipboard'],
	);
});

void test('detects protected origins in constructor binds, calls, assignments, and destructuring', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'src/routes.tsx'),
		`const BoundFormatter = Intl.DateTimeFormat.bind(Intl);
const CalledFormatter = Intl.DateTimeFormat.call(Intl, 'en');
let AssignedFormatter;
AssignedFormatter = Intl.DateTimeFormat;
const [writeText] = [navigator.clipboard.writeText];
new BoundFormatter('en');
new CalledFormatter('en');
new AssignedFormatter('en');
writeText.call(navigator.clipboard, 'secret');
`,
	);

	const findings = scanUtilityBoundaries(path.join(root, 'src'));

	assert.equal(
		findings.filter((finding) => finding.kind === 'date-time').length,
		3,
	);
	assert.equal(
		findings.filter((finding) => finding.kind === 'clipboard').length,
		2,
	);
});

void test('detects protected origins returned by imported function wrappers', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'src/lib/browser-apis.ts'),
		`export function getFormatter() {
	return Intl.DateTimeFormat;
}
export function getWriteText() {
	return navigator.clipboard.writeText;
}
`,
	);
	writeFileSync(
		path.join(root, 'src/routes.tsx'),
		`import { getFormatter, getWriteText } from './lib/browser-apis';
const Formatter = getFormatter();
const writeText = getWriteText();
new Formatter('en');
writeText('secret');
`,
	);

	const findings = scanUtilityBoundaries(path.join(root, 'src'));

	assert.equal(
		findings.filter((finding) => finding.kind === 'date-time').length,
		1,
	);
	assert.equal(
		findings.filter((finding) => finding.kind === 'clipboard').length,
		1,
	);
});

void test('does not exclude a production file merely because its name says test-helper', () => {
	const root = makeSandbox();
	mkdirSync(path.join(root, 'src/routes'), { recursive: true });
	writeFileSync(
		path.join(root, 'src/routes/production.test-helper.ts'),
		`new Intl.DateTimeFormat('en');\n`,
	);

	assert.equal(scanUtilityBoundaries(path.join(root, 'src')).length, 1);
});

void test('fails loudly on empty, invalid, escaped, and symlinked source trees', () => {
	const root = makeSandbox();
	rmSync(path.join(root, 'src'), { recursive: true, force: true });
	const empty = path.join(root, 'src');
	mkdirSync(empty);
	assert.throws(
		() => scanUtilityBoundaries(empty),
		/no TypeScript source files found/,
	);

	writeFileSync(path.join(root, 'src/invalid.ts'), 'const = ;\n');
	assert.throws(
		() => scanUtilityBoundaries(path.join(root, 'src')),
		/unparseable production source/,
	);

	const outside = path.join(root, 'outside.ts');
	writeFileSync(outside, `new Intl.DateTimeFormat('en');\n`);
	assert.throws(
		() => scanUtilityBoundaries(path.join(root, 'outside')),
		/source root must be the canonical src directory/,
	);

	mkdirSync(path.join(root, 'src/lib'), { recursive: true });
	const linked = path.join(root, 'src/lib/linked.ts');
	symlinkSync(outside, linked);
	assert.throws(
		() => scanUtilityBoundaries(path.join(root, 'src')),
		/symlink.*not allowed/,
	);
});
