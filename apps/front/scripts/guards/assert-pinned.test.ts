/**
 * Tests for the hand catalog reader behind `assert-pinned.ts` (#2326,
 * review E1/M1e).
 *
 * The reader runs as front's `preinstall` with no node_modules, so it cannot
 * use the `yaml` package — which is exactly why it must be unit-tested: the
 * old loop silently dropped every catalog entry after a line it did not
 * recognise (an inline comment, a quoted value) and turned an indented
 * comment into a bogus entry, then failed the whole guard on valid YAML.
 *
 * Coverage: inline ` # comment`, single/double-quoted names and values,
 * indented comment lines, blank lines, the block terminator (only a
 * non-indented, non-comment line closes it), fail-loud on unknown shapes,
 * and the real `pnpm-workspace.yaml` (every entry an exact version, no
 * `pnpm.overrides`-pinned dependency catalogued — the M1 clause now written
 * in AGENTS.md / docs/guides/dependency-health.md).
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { parseCatalog, parseCatalogs } from './assert-pinned-catalog.ts';

const doc = (body: string): string =>
	`packages:\n  - "apps/*"\n\ncatalog:\n${body}\n`;

void test('keeps parsing after an inline comment on a value', () => {
	const catalog = parseCatalog(
		doc('  vitest: 4.1.12 # keep for node24\n  zod: 4.6.7\n'),
	);
	assert.deepEqual(
		[...catalog],
		[
			['vitest', '4.1.12'],
			['zod', '4.6.7'],
		],
	);
});

void test('strips single- and double-quoted values', () => {
	const catalog = parseCatalog(doc('  oxlint: "1.90.0"\n  yaml: \'2.9.1\'\n'));
	assert.deepEqual(
		[...catalog],
		[
			['oxlint', '1.90.0'],
			['yaml', '2.9.1'],
		],
	);
});

void test('accepts quoted names (scoped packages)', () => {
	const catalog = parseCatalog(
		doc('  "@types/node": 24.19.2\n  \'@scope/pkg\': 1.0.0\n'),
	);
	assert.deepEqual(
		[...catalog],
		[
			['@types/node', '24.19.2'],
			['@scope/pkg', '1.0.0'],
		],
	);
});

void test('ignores indented comment lines, including one with a colon', () => {
	const catalog = parseCatalog(doc('  # zod: pinned\n  zod: 4.6.7\n'));
	assert.deepEqual([...catalog], [['zod', '4.6.7']]);
	assert.equal(catalog.has('# zod'), false);
});

void test('blank lines and top-level comments do not close the block', () => {
	const catalog = parseCatalog(
		doc(
			'  i18next: 26.6.0\n' +
				'\n' +
				'# a top-level comment between entries\n' +
				'  zod: 4.6.7\n' +
				'packages:\n' +
				'  ignored: 1.0.0\n',
		),
	);
	assert.deepEqual(
		[...catalog],
		[
			['i18next', '26.6.0'],
			['zod', '4.6.7'],
		],
	);
	assert.equal(catalog.has('ignored'), false);
});

void test('a non-indented key closes the block', () => {
	const catalog = parseCatalog(
		doc('  a: 1.0.0\n\ncatalogs:\n  named:\n    b: 2.0.0\n'),
	);
	assert.deepEqual([...catalog], [['a', '1.0.0']]);
});

void test('an unknown indented shape fails loud instead of dropping entries', () => {
	assert.throws(
		() => parseCatalog(doc('  a: 1.0.0\n  not-an-entry\n  b: 2.0.0\n')),
		/unknown catalog line:.*not-an-entry/,
	);
	assert.throws(() => parseCatalog(doc('  a:\n')), /unknown catalog line/);
});

void test('the real pnpm-workspace.yaml: exact entries, nothing overridden catalogued', () => {
	const workspaceYaml = readFileSync(
		new URL('../../../../pnpm-workspace.yaml', import.meta.url),
		'utf8',
	);
	const catalog = parseCatalog(workspaceYaml);
	assert.ok(catalog.size > 0, 'the real catalog must not be empty');

	const EXACT = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
	// Named catalogs: web is held to the same exact rule; mobile keeps
	// Expo-compatible ranges (e.g. `~19.3.0`) and is not exactness-checked.
	const web = parseCatalogs(workspaceYaml).get('web') ?? new Map();
	for (const [name, version] of [...catalog, ...web]) {
		assert.match(
			version,
			EXACT,
			`catalog entry ${name} must be one exact version, got ${version}`,
		);
	}

	const rootPkg: { pnpm?: { overrides?: Record<string, string> } } = JSON.parse(
		readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
	);
	const overrides = Object.keys(rootPkg.pnpm?.overrides ?? {});
	const cataloguedOverrides = overrides.filter((name) => catalog.has(name));
	assert.deepEqual(
		cataloguedOverrides,
		[],
		'a pnpm.overrides-pinned dependency stays in the override, not the catalog',
	);
});

void test('parseCatalogs reads named catalogs next to the default one (#2447)', () => {
	const catalogs = parseCatalogs(
		doc('  zod: 4.6.7\n') +
			'catalogs:\n  web:\n    react: 19.3.1\n    "@types/react": 19.3.0\n' +
			'  # comment\n  mobile:\n    react: 19.3.0\n',
	);
	assert.deepEqual([...catalogs.keys()], ['', 'web', 'mobile']);
	assert.equal(catalogs.get('')?.get('zod'), '4.6.7');
	assert.equal(catalogs.get('web')?.get('@types/react'), '19.3.0');
	assert.equal(catalogs.get('mobile')?.get('react'), '19.3.0');
});

// Enforcement (#2447): a dependency declared in two or more manifests must
// route through a catalog in every one of them. pnpm 10's `catalogMode:
// strict` cannot do this — it also forbids single-workspace deps.
void test('every dependency shared by 2+ package.json goes through a catalog', () => {
	const root = new URL('../../../../', import.meta.url);
	const manifests = [
		'package.json',
		...['apps', 'packages'].flatMap((dir) =>
			readdirSync(new URL(dir, root)).map((d) => `${dir}/${d}/package.json`),
		),
	].filter((path) => existsSync(new URL(path, root)));
	const rootPkg: { pnpm?: { overrides?: Record<string, string> } } = JSON.parse(
		readFileSync(new URL('package.json', root), 'utf8'),
	);
	// An override wins over any catalog entry, so those stay exact pins.
	const overridden = new Set(Object.keys(rootPkg.pnpm?.overrides ?? {}));
	const specs = new Map<string, string[]>();
	for (const path of manifests) {
		const pkg: Record<string, Record<string, string> | undefined> = JSON.parse(
			readFileSync(new URL(path, root), 'utf8'),
		);
		for (const group of [
			'dependencies',
			'devDependencies',
			'optionalDependencies',
		]) {
			for (const [name, spec] of Object.entries(pkg[group] ?? {})) {
				specs.set(name, [...(specs.get(name) ?? []), spec]);
			}
		}
	}
	const offenders = [...specs]
		.filter(([name, list]) => list.length > 1 && !overridden.has(name))
		.filter(([, list]) =>
			list.some(
				(s) => !s.startsWith('catalog:') && !s.startsWith('workspace:'),
			),
		)
		.map(([name, list]) => `${name} (${list.join(', ')})`);
	assert.deepEqual(
		offenders,
		[],
		'declare these once in pnpm-workspace.yaml and reference them as "catalog:" / "catalog:<name>"',
	);
});
