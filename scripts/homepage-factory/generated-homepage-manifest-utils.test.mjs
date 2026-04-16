import assert from 'node:assert/strict';
import test from 'node:test';

import {
	findGeneratedHomepageManifestEntry,
	normalizeGeneratedHomepageId,
} from '../../apps/front/src/generated/homepage-gen/manifest-utils.js';

const TEST_MANIFEST = [
	{
		id: 1,
		title: 'Generated Homepage 1',
		fileName: 'generated-homepage-0001.tsx',
		routePath: '/homepage-gen/1',
	},
	{
		id: 7,
		title: 'Generated Homepage 7',
		fileName: 'generated-homepage-0007.tsx',
		routePath: '/homepage-gen/7',
	},
];

test('normalizeGeneratedHomepageId accepts positive integer route ids', () => {
	assert.equal(normalizeGeneratedHomepageId('7'), 7);
	assert.equal(normalizeGeneratedHomepageId('0007'), 7);
});

test('normalizeGeneratedHomepageId rejects invalid route ids', () => {
	assert.equal(normalizeGeneratedHomepageId(''), null);
	assert.equal(normalizeGeneratedHomepageId('abc'), null);
	assert.equal(normalizeGeneratedHomepageId('-1'), null);
	assert.equal(normalizeGeneratedHomepageId('1.5'), null);
});

test('findGeneratedHomepageManifestEntry resolves the matching generated homepage', () => {
	assert.deepEqual(findGeneratedHomepageManifestEntry(TEST_MANIFEST, '7'), {
		id: 7,
		title: 'Generated Homepage 7',
		fileName: 'generated-homepage-0007.tsx',
		routePath: '/homepage-gen/7',
	});
});

test('findGeneratedHomepageManifestEntry returns null for unknown ids', () => {
	assert.equal(findGeneratedHomepageManifestEntry(TEST_MANIFEST, '2'), null);
	assert.equal(findGeneratedHomepageManifestEntry(TEST_MANIFEST, 'wat'), null);
});
