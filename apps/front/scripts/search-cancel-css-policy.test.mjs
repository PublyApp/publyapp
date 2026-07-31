import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	ARTIFACT_SEARCH_CANCEL_CANONICAL,
	SOURCE_SEARCH_CANCEL_CANONICAL,
	assertCanonicalSearchCancelCss,
	assertShippedSourceSearchCancelCss,
} from './search-cancel-css-policy.mjs';

const canonicalSourceCss = `
.publy-search-input[type='search']::-webkit-search-cancel-button {
	-webkit-appearance: none;
	appearance: none;
	display: none;
}
`;

const canonicalArtifactCss =
	'.publy-search-input[type=search]::-webkit-search-cancel-button' +
	'{appearance:none;display:none}';

test('accepts the sole canonical source rule', () => {
	assert.doesNotThrow(() =>
		assertCanonicalSearchCancelCss(
			[{ source: canonicalSourceCss, sourceName: 'src/styles/app.css' }],
			SOURCE_SEARCH_CANCEL_CANONICAL,
		),
	);
});

test('accepts the sole canonical emitted rule', () => {
	assert.doesNotThrow(() =>
		assertCanonicalSearchCancelCss(
			[
				{
					source: canonicalArtifactCss,
					sourceName: 'dist/client/assets/app-built.css',
				},
			],
			ARTIFACT_SEARCH_CANCEL_CANONICAL,
		),
	);
});

test('rejects an attribute-selector spelling and reports both selectors and sources', () => {
	const attributeOverride = `
[class~='publy-search-input'][type='search']::-webkit-search-cancel-button {
	-webkit-appearance: auto;
	appearance: auto;
	display: inline-block;
}
`;

	assert.throws(
		() =>
			assertCanonicalSearchCancelCss(
				[
					{ source: canonicalSourceCss, sourceName: 'src/styles/app.css' },
					{
						source: attributeOverride,
						sourceName: 'src/styles/review-override.css',
					},
				],
				SOURCE_SEARCH_CANCEL_CANONICAL,
			),
		(error) => {
			assert.match(error.message, /found 2 occurrences/i);
			assert.match(
				error.message,
				/src\/styles\/app\.css:\d+ .*\.publy-search-input/,
			);
			assert.match(
				error.message,
				/src\/styles\/review-override\.css:\d+ \[class~=/,
			);
			return true;
		},
	);
});

test('rejects a second rule inside a conditional at-rule', () => {
	const conditionalOverride = `
@supports (appearance: auto) {
	input[type='search']::-webkit-search-cancel-button {
		appearance: auto !important;
		display: inline-block !important;
	}
}
`;

	assert.throws(
		() =>
			assertCanonicalSearchCancelCss(
				[
					{
						source: `${canonicalSourceCss}${conditionalOverride}`,
						sourceName: 'src/styles/app.css',
					},
				],
				SOURCE_SEARCH_CANCEL_CANONICAL,
			),
		(error) => {
			assert.match(error.message, /found 2 occurrences/i);
			assert.match(
				error.message,
				/src\/styles\/app\.css:\d+ input\[type='search'\]/,
			);
			return true;
		},
	);
});

test('rejects important on the canonical source declarations', () => {
	const importantCanonical = canonicalSourceCss.replace(
		'display: none;',
		'display: none !important;',
	);

	assert.throws(
		() =>
			assertCanonicalSearchCancelCss(
				[
					{
						source: importantCanonical,
						sourceName: 'src/styles/app.css',
					},
				],
				SOURCE_SEARCH_CANCEL_CANONICAL,
			),
		(error) => {
			assert.match(error.message, /canonical declarations/i);
			assert.match(error.message, /display: none !important/);
			assert.match(error.message, /src\/styles\/app\.css:\d+/);
			return true;
		},
	);
});

test('rejects a second emitted rule and identifies the built asset', () => {
	const emittedOverride =
		'[class~=publy-search-input][type=search]::-webkit-search-cancel-button' +
		'{appearance:auto;display:inline-block}';

	assert.throws(
		() =>
			assertCanonicalSearchCancelCss(
				[
					{
						source: `${canonicalArtifactCss}${emittedOverride}`,
						sourceName: 'dist/client/assets/app-mutated.css',
					},
				],
				ARTIFACT_SEARCH_CANCEL_CANONICAL,
			),
		(error) => {
			assert.match(error.message, /found 2 occurrences/i);
			assert.match(error.message, /dist\/client\/assets\/app-mutated\.css:1/);
			assert.match(error.message, /\[class~=publy-search-input\]/);
			return true;
		},
	);
});

test('rejects the token in a shipped TSX style constant and reports every source occurrence', () => {
	const frontRoot = mkdtempSync(path.join(tmpdir(), 'search-cancel-source-'));

	try {
		const stylesDirectory = path.join(frontRoot, 'src/styles');
		const componentsDirectory = path.join(frontRoot, 'src/components');
		mkdirSync(stylesDirectory, { recursive: true });
		mkdirSync(componentsDirectory, { recursive: true });
		writeFileSync(path.join(stylesDirectory, 'app.css'), canonicalSourceCss);
		writeFileSync(
			path.join(componentsDirectory, 'search-input.tsx'),
			`
const SEARCH_CANCEL_OVERRIDE = \`
	input[type='search']::-webkit-search-cancel-button {
		appearance: auto;
		display: inline-block;
	}
\`;

export const SearchInput = () => <style>{SEARCH_CANCEL_OVERRIDE}</style>;
`,
		);

		assert.throws(
			() => assertShippedSourceSearchCancelCss(frontRoot),
			(error) => {
				assert.match(error.message, /found 2 occurrences/i);
				assert.match(error.message, /src\/styles\/app\.css:\d+/);
				assert.match(error.message, /src\/components\/search-input\.tsx:\d+/);
				assert.match(
					error.message,
					/input\[type='search'\]::-webkit-search-cancel-button/,
				);
				return true;
			},
		);
	} finally {
		rmSync(frontRoot, { recursive: true, force: true });
	}
});

test('rejects a sole canonical rule outside app.css and reports its actual location', () => {
	const frontRoot = mkdtempSync(path.join(tmpdir(), 'search-cancel-source-'));

	try {
		const stylesDirectory = path.join(frontRoot, 'src/styles');
		mkdirSync(stylesDirectory, { recursive: true });
		writeFileSync(path.join(stylesDirectory, 'app.css'), 'body {}\n');
		writeFileSync(path.join(stylesDirectory, 'other.css'), canonicalSourceCss);

		assert.throws(
			() => assertShippedSourceSearchCancelCss(frontRoot),
			(error) => {
				assert.match(error.message, /required source: src\/styles\/app\.css/i);
				assert.match(error.message, /actual source: src\/styles\/other\.css/i);
				assert.match(error.message, /src\/styles\/other\.css:\d+/);
				return true;
			},
		);
	} finally {
		rmSync(frontRoot, { recursive: true, force: true });
	}
});
