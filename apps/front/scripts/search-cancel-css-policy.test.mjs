import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	ARTIFACT_SEARCH_CANCEL_CANONICAL,
	SEARCH_CANCEL_ALLOW_MARKER,
	SHIPPED_SOURCE_ROOTS,
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

/**
 * Builds a throwaway workspace that satisfies every entry in
 * SHIPPED_SOURCE_ROOTS, so the fixture exercises the same root set the real
 * scan uses. `files` are workspace-relative paths.
 */
const createWorkspace = (files) => {
	const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'search-cancel-'));

	const write = (relativePath, contents) => {
		const fullPath = path.join(workspaceRoot, relativePath);
		mkdirSync(path.dirname(fullPath), { recursive: true });
		writeFileSync(fullPath, contents);
	};

	write('apps/front/src/styles/app.css', canonicalSourceCss);
	write('apps/front/server.mjs', 'export default {};\n');
	write('apps/front/vite.config.ts', 'export default {};\n');
	write('packages/shared-ts/lib/placeholder.ts', 'export const noop = 0;\n');
	write('packages/client-ts/src/placeholder.ts', 'export const noop = 0;\n');

	for (const [relativePath, contents] of Object.entries(files ?? {})) {
		write(relativePath, contents);
	}

	return { workspaceRoot, write };
};

test('accepts the sole canonical source rule', () => {
	assert.doesNotThrow(() =>
		assertCanonicalSearchCancelCss(
			[{ source: canonicalSourceCss, sourceName: 'src/styles/app.css' }],
			{ ...SOURCE_SEARCH_CANCEL_CANONICAL, sourceName: 'src/styles/app.css' },
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
						sourceName: 'apps/front/src/styles/app.css',
					},
				],
				SOURCE_SEARCH_CANCEL_CANONICAL,
			),
		(error) => {
			assert.match(error.message, /canonical declarations/i);
			assert.match(error.message, /display: none !important/);
			assert.match(error.message, /apps\/front\/src\/styles\/app\.css:\d+/);
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

test('accepts a clean workspace across every shipped source root', () => {
	const { workspaceRoot } = createWorkspace();

	try {
		const result = assertShippedSourceSearchCancelCss(workspaceRoot);
		assert.equal(result.allowlistedCount, 0);
		assert.equal(result.sourceFileCount, 5);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('rejects the token in a shipped TSX style constant and reports every source occurrence', () => {
	const { workspaceRoot } = createWorkspace({
		'apps/front/src/components/search-input.tsx': `
const SEARCH_CANCEL_OVERRIDE = \`
	input[type='search']::-webkit-search-cancel-button {
		appearance: auto;
		display: inline-block;
	}
\`;

export const SearchInput = () => <style>{SEARCH_CANCEL_OVERRIDE}</style>;
`,
	});

	try {
		assert.throws(
			() => assertShippedSourceSearchCancelCss(workspaceRoot),
			(error) => {
				assert.match(error.message, /found 2 occurrences/i);
				assert.match(error.message, /apps\/front\/src\/styles\/app\.css:\d+/);
				assert.match(
					error.message,
					/apps\/front\/src\/components\/search-input\.tsx:\d+/,
				);
				assert.match(
					error.message,
					/input\[type='search'\]::-webkit-search-cancel-button/,
				);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('rejects a sole canonical rule outside app.css and reports its actual location', () => {
	const { workspaceRoot, write } = createWorkspace();

	try {
		write('apps/front/src/styles/app.css', 'body {}\n');
		write('apps/front/src/styles/other.css', canonicalSourceCss);

		assert.throws(
			() => assertShippedSourceSearchCancelCss(workspaceRoot),
			(error) => {
				assert.match(
					error.message,
					/required source: apps\/front\/src\/styles\/app\.css/i,
				);
				assert.match(
					error.message,
					/actual source: apps\/front\/src\/styles\/other\.css/i,
				);
				assert.match(error.message, /apps\/front\/src\/styles\/other\.css:\d+/);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('rejects the reviewer route: an override bundled from packages/shared-ts', () => {
	const { workspaceRoot } = createWorkspace({
		'packages/shared-ts/lib/profile-style/search-cancel-style.ts': `
export const SEARCH_CANCEL_OVERRIDE_CSS = \`
	.publy-search-wrapper
		> .publy-search-input[type='search']::-webkit-search-cancel-button {
		-webkit-appearance: auto;
		appearance: auto;
		display: inline-block;
	}
\`;
`,
	});

	try {
		assert.throws(
			() => assertShippedSourceSearchCancelCss(workspaceRoot),
			(error) => {
				assert.match(error.message, /found 2 occurrences/i);
				assert.match(
					error.message,
					/packages\/shared-ts\/lib\/profile-style\/search-cancel-style\.ts:\d+/,
				);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('rejects an override in packages/client-ts, apps/front/server.mjs and vite.config.ts', () => {
	const override = `
const css = \`
	input[type='search']::-webkit-search-cancel-button {
		appearance: auto;
	}
\`;
`;

	for (const relativePath of [
		'packages/client-ts/src/probe.ts',
		'apps/front/server.mjs',
		'apps/front/vite.config.ts',
	]) {
		const { workspaceRoot } = createWorkspace({ [relativePath]: override });

		try {
			assert.throws(
				() => assertShippedSourceSearchCancelCss(workspaceRoot),
				(error) => {
					assert.match(error.message, /found 2 occurrences/i);
					assert.ok(
						error.message.includes(relativePath),
						`expected the failure to name ${relativePath}:\n${error.message}`,
					);
					return true;
				},
			);
		} finally {
			rmSync(workspaceRoot, { recursive: true, force: true });
		}
	}
});

test('does not count the token inside comments, which cannot ship CSS', () => {
	const { workspaceRoot } = createWorkspace({
		'apps/front/src/components/notes.tsx': `
// The native ::-webkit-search-cancel-button is suppressed in app.css.
/**
 * Prose may also name ::-webkit-search-cancel-button freely.
 */
export const Notes = () => null;
`,
		'apps/front/src/styles/notes.css': `
/* A commented-out ::-webkit-search-cancel-button rule is not a rule. */
`,
	});

	try {
		const result = assertShippedSourceSearchCancelCss(workspaceRoot);
		assert.equal(result.allowlistedCount, 0);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('exempts a legitimate mention carrying the allow marker, on its line or the line above', () => {
	const { workspaceRoot } = createWorkspace({
		'apps/front/src/components/search-input.test.tsx': `
// ${SEARCH_CANCEL_ALLOW_MARKER}: the selector this suite asserts.
const SELECTOR = "::-webkit-search-cancel-button";
const SAME_LINE = "::-webkit-search-cancel-button"; // ${SEARCH_CANCEL_ALLOW_MARKER}
export { SAME_LINE, SELECTOR };
`,
	});

	try {
		const result = assertShippedSourceSearchCancelCss(workspaceRoot);
		assert.equal(result.allowlistedCount, 2);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('still rejects an unmarked mention in a file that also carries an allow marker', () => {
	const { workspaceRoot } = createWorkspace({
		'apps/front/src/components/search-input.test.tsx': `
// ${SEARCH_CANCEL_ALLOW_MARKER}: the selector this suite asserts.
const SELECTOR = "::-webkit-search-cancel-button";

const OVERRIDE = \`
	input[type='search']::-webkit-search-cancel-button {
		appearance: auto;
	}
\`;
export { OVERRIDE, SELECTOR };
`,
	});

	try {
		assert.throws(
			() => assertShippedSourceSearchCancelCss(workspaceRoot),
			(error) => {
				assert.match(error.message, /found 2 occurrences/i);
				assert.match(error.message, new RegExp(SEARCH_CANCEL_ALLOW_MARKER));
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('fails closed when a shipped source root is missing', () => {
	const { workspaceRoot } = createWorkspace();

	try {
		rmSync(path.join(workspaceRoot, 'packages/shared-ts'), {
			force: true,
			recursive: true,
		});

		assert.throws(
			() => assertShippedSourceSearchCancelCss(workspaceRoot),
			(error) => {
				assert.match(error.message, /missing root "packages\/shared-ts"/);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('reports the token line, not the preceding JSDoc block, as the context for a TSX hit', () => {
	const { workspaceRoot } = createWorkspace({
		'apps/front/src/components/search-input.tsx': `/**
 * A long documentation block that mentions no braces, no semicolons and no
 * closing punctuation at all, so the CSS rule walker would otherwise drag the
 * whole of it in as the reported selector for the occurrence below, which is
 * exactly the unreadable failure output this test pins down for good
 */
const OVERRIDE = \`
	input[type='search']::-webkit-search-cancel-button { appearance: auto; }
\`;
export { OVERRIDE };
`,
	});

	try {
		assert.throws(
			() => assertShippedSourceSearchCancelCss(workspaceRoot),
			(error) => {
				assert.match(
					error.message,
					/apps\/front\/src\/components\/search-input\.tsx:8 input\[type='search'\]::-webkit-search-cancel-button \{ appearance: auto; \}/,
				);
				assert.doesNotMatch(error.message, /documentation block/);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('the shipped source roots stay pinned to what the build actually ships', () => {
	assert.deepEqual(SHIPPED_SOURCE_ROOTS, [
		'apps/front/src',
		'apps/front/server.mjs',
		'apps/front/vite.config.ts',
		'packages/shared-ts',
		'packages/client-ts',
	]);
});
