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
// Paired proof (fix round 1): mutating the #880 record to a PARAPHRASED false
// attribution ("`packages/client-ts/package.json` also pins the fetch
// library") makes the second test RED, and so does the original #1331-review
// wording ("…AND `packages/client-ts/package.json` carry the patched…");
// restoring the doc makes the whole file GREEN again. Reverting either
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
		if (typeof group !== 'object' || group === null) {
			continue;
		}

		if (
			(group as Record<string, unknown>)[dependencyName] === expectedVersion
		) {
			return groupName;
		}
	}

	return null;
};

const clientTsPackagePath = 'packages/client-ts/package.json';

// A record sentence naming packages/client-ts/package.json may only EXCLUDE it
// from carrying the fetch-library pin; these are the markers such an exclusion
// can use. A plain attribution ("…also pins…", "…carry the patched…") carries
// none of them, whatever its wording.
const exclusionMarkerPattern =
	/\b(?:not|never|rather than|unlike|whereas|excluding)\b/;

// The #880 record bullet that mentions the fetch library, joined and
// whitespace-normalized: the bullet wraps across several source lines and ends
// at the next blank line.
const recordBlock = (rawDoc: string): string => {
	const lines = rawDoc.split('\n');
	const start = lines.findIndex((line) => line.includes(fetchLibrary));
	assert.ok(
		start !== -1,
		`dependency-health.md must mention ${fetchLibrary} in its #880 record`,
	);

	const blockLines = [lines[start]];
	for (let index = start + 1; index < lines.length; index += 1) {
		if (lines[index].trim() === '') {
			break;
		}
		blockLines.push(lines[index]);
	}

	return normalizeWhitespace(blockLines.join(' '));
};

// Sentence-shaped chunks of a normalized block. Version numbers are masked
// first (dots become middle dots) so "1.0.0-preview.103" cannot pose as a
// sentence boundary; a sentence then ends only at a period followed by
// whitespace and a capital letter, backtick, asterisk, or em dash. Residual
// limit, stated honestly: two claims fused into ONE sentence — a true
// exclusion and a false attribution — read as one sentence here, so an editor
// must keep them in separate sentences for the guard to see both.
const sentencesOf = (block: string): string[] =>
	block
		.replace(/\d+(?:\.\d+)+/g, (version) => version.replaceAll('.', '·'))
		.split(/\.\s+(?=[A-Z`*—])/)
		.map((sentence) => sentence.replaceAll('·', '.'));

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
	const rawDoc = await readFile(docPath, 'utf8');
	const block = recordBlock(rawDoc);
	const recordSentences = sentencesOf(block).filter((sentence) =>
		sentence.includes(fetchLibrary),
	);

	// Direction 1 (must hold): the #880 record names apps/front/package.json as
	// THE carrier, in carry-the-patched language, and the canonical corrected
	// sentence survives somewhere in the doc.
	const carrierSentence = recordSentences.find((sentence) =>
		/`apps\/front\/package\.json`\s+carries\b/.test(sentence),
	);
	assert.ok(
		carrierSentence,
		'the #880 fetch-library record must name `apps/front/package.json` as the manifest carrying the patched pin',
	);

	const correctClaim =
		'`apps/front/package.json` carries the patched `1.0.0-preview.103`';
	assert.ok(
		normalizeWhitespace(rawDoc).includes(correctClaim),
		`dependency-health.md must state the pin location as: ${correctClaim}`,
	);

	// Direction 2 (must never come back, in ANY wording): a record sentence
	// naming packages/client-ts/package.json must explicitly exclude it from
	// carrying the pin ("…but not this fetch library"). A plain attribution —
	// the #1331-review wording or any paraphrase of it — has no exclusion
	// marker and fails here regardless of phrasing.
	for (const sentence of sentencesOf(block)) {
		if (!sentence.includes(clientTsPackagePath)) {
			continue;
		}

		assert.match(
			sentence,
			exclusionMarkerPattern,
			`a #880-record sentence naming ${clientTsPackagePath} must explicitly exclude it from carrying the fetch-library pin (e.g. "…but not this fetch library"), never attribute the pin to it: ${sentence}`,
		);
	}
});
