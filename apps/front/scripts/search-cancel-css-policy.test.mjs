import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ARTIFACT_SEARCH_CANCEL_CANONICAL,
	SOURCE_SEARCH_CANCEL_CANONICAL,
	assertCanonicalSearchCancelCss,
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
