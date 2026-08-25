import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { test } from 'vitest';

// Contract test for docs/guides/dependency-health.md (#1334): the runbook's
// "#880 moderate advisories" section claims WHERE the patched
// `@microsoft/kiota-http-fetchlibrary` pin lives. That claim is checked here
// against the real manifests, so the doc cannot drift from the tree again:
// a doc naming the wrong package.json fails this suite, and so does the doc
// or a manifest dropping the pin entirely.
//
// Paired proof: with the doc saying `apps/front/package.json` AND
// `packages/client-ts/package.json` carry the patched version (the
// #1331-review state) the second test is RED; after correcting it to
// `apps/front/package.json` alone the whole file is GREEN. Reverting either
// manifest's pin makes the first test RED.

const docPath = new URL(
	'../../../docs/guides/dependency-health.md',
	import.meta.url,
);
const frontManifestPath = new URL(
	'../../../apps/front/package.json',
	import.meta.url,
);
const clientTsManifestPath = new URL(
	'../../../packages/client-ts/package.json',
	import.meta.url,
);

const fetchLibrary = '@microsoft/kiota-http-fetchlibrary';
const pinnedVersion = '1.0.0-preview.103';

const readJson = async (url: URL): Promise<Record<string, unknown>> =>
	JSON.parse(await readFile(url, 'utf8'));

// Markdown wraps sentences across lines, so every phrase assertion below runs
// against the doc with runs of whitespace collapsed to single spaces.
const normalizeWhitespace = (value: string): string =>
	value.replace(/\s+/g, ' ');

// The dependency group where a manifest carries the exact pin, or null when
// none of them does.
const findExactPinGroup = (
	manifest: Record<string, unknown>,
	dependencyName: string,
	expectedVersion: string,
): string | null => {
	for (const groupName of [
		'dependencies',
		'devDependencies',
		'optionalDependencies',
		'peerDependencies',
	]) {
		const group = manifest[groupName];
		if (typeof group !== 'object' || group === null) continue;

		if (
			(group as Record<string, unknown>)[dependencyName] === expectedVersion
		) {
			return groupName;
		}
	}

	return null;
};

test('both manifests still declare exactly where the kiota chain pins live', async () => {
	const frontManifest = await readJson(frontManifestPath);
	const clientTsManifest = await readJson(clientTsManifestPath);

	assert.ok(
		findExactPinGroup(frontManifest, fetchLibrary, pinnedVersion),
		`apps/front/package.json must keep the exact ${fetchLibrary}@${pinnedVersion} pin`,
	);

	// client-ts declares the rest of the pinned preview chain but NOT the
	// fetch library itself; if that ever changes, this contract and the runbook
	// sentence must be revisited together.
	assert.equal(
		findExactPinGroup(clientTsManifest, fetchLibrary, pinnedVersion),
		null,
		`packages/client-ts/package.json must not declare ${fetchLibrary}; the pin lives in apps/front/package.json`,
	);
});

test('dependency-health.md attributes the fetch-library pin to apps/front/package.json only', async () => {
	const doc = normalizeWhitespace(await readFile(docPath, 'utf8'));

	// Direction 1 (must hold): the corrected sentence names front as THE carrier.
	const correctClaim =
		'`apps/front/package.json` carries the patched `1.0.0-preview.103`';
	assert.ok(
		doc.includes(correctClaim),
		`dependency-health.md must state the pin location as: ${correctClaim}`,
	);

	// Direction 2 (must never come back): the #1331-review wording that credited
	// BOTH manifests with carrying the patched fetch library.
	const wrongClaim =
		'`apps/front/package.json` and `packages/client-ts/package.json` carry the patched';
	assert.ok(
		!doc.includes(wrongClaim),
		'dependency-health.md must not attribute the fetch-library pin to packages/client-ts/package.json',
	);
});
