import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	ARTIFACT_SEARCH_CANCEL_CANONICAL,
	EMITTED_BUNDLE_FILE_EXTENSIONS,
	SEARCH_CANCEL_MENTION_INVENTORY,
	SHIPPED_SOURCE_ROOTS,
	SOURCE_SEARCH_CANCEL_CANONICAL,
	assertCanonicalSearchCancelCss,
	assertEmittedBundlesFreeOfSearchCancel,
	assertShippedSourceSearchCancelCss,
} from './search-cancel-css-policy.mts';

const canonicalSourceCss = `
.publy-search-input[type='search']::-webkit-search-cancel-button {
	-webkit-appearance: none;
	appearance: none;
	display: none;
}
`;

/** Extracts the thrown Error so its message can be asserted. */
const thrownError = (error: unknown): Error => {
	assert.ok(error instanceof Error);
	return error;
};

const canonicalArtifactCss =
	'.publy-search-input[type=search]::-webkit-search-cancel-button' +
	'{appearance:none;display:none}';

/**
 * Builds a throwaway workspace that satisfies every entry in
 * SHIPPED_SOURCE_ROOTS, so the fixture exercises the same root set the real
 * scan uses. `files` are workspace-relative paths.
 */
/** A throwaway workspace root plus its writer. */
interface SearchCancelWorkspace {
	workspaceRoot: string;
	write: (relativePath: string, contents: string) => void;
}

const createWorkspace = (
	files: Record<string, string> = {},
): SearchCancelWorkspace => {
	const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'search-cancel-'));

	const write = (relativePath: string, contents: string): void => {
		const fullPath = path.join(workspaceRoot, relativePath);
		mkdirSync(path.dirname(fullPath), { recursive: true });
		writeFileSync(fullPath, contents);
	};

	write('apps/front/src/styles/app.css', canonicalSourceCss);
	write('apps/front/server.mjs', 'export default {};\n');
	write('apps/front/vite.config.ts', 'export default {};\n');
	write('apps/front/scripts/guards/placeholder.mts', 'export const noop = 0;\n');
	write(
		'packages/shared-ts/src/lib/placeholder.ts',
		'export const noop = 0;\n',
	);
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
			assert.match(thrownError(error).message, /found 2 occurrences/i);
			assert.match(
				thrownError(error).message,
				/src\/styles\/app\.css:\d+ .*\.publy-search-input/,
			);
			assert.match(
				thrownError(error).message,
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
			assert.match(thrownError(error).message, /found 2 occurrences/i);
			assert.match(
				thrownError(error).message,
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
			assert.match(thrownError(error).message, /canonical declarations/i);
			assert.match(thrownError(error).message, /display: none !important/);
			assert.match(thrownError(error).message, /apps\/front\/src\/styles\/app\.css:\d+/);
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
			assert.match(thrownError(error).message, /found 2 occurrences/i);
			assert.match(thrownError(error).message, /dist\/client\/assets\/app-mutated\.css:1/);
			assert.match(thrownError(error).message, /\[class~=publy-search-input\]/);
			return true;
		},
	);
});

test('accepts a clean workspace across every shipped source root', () => {
	const { workspaceRoot } = createWorkspace();

	try {
		const result = assertShippedSourceSearchCancelCss(workspaceRoot);
		// app.css is inventoried, and its sole mention is the canonical rule.
		assert.equal(result.inventoriedMentionCount, 1);
		assert.equal(result.inventorySize, SEARCH_CANCEL_MENTION_INVENTORY.length);
		assert.equal(result.sourceFileCount, 6);
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
				assert.match(
					thrownError(error).message,
					/found 1 occurrence\(s\).*outside the committed mention inventory/is,
				);
				assert.match(
					thrownError(error).message,
					/apps\/front\/src\/components\/search-input\.tsx:\d+/,
				);
				assert.match(
					thrownError(error).message,
					/input\[type='search'\]::-webkit-search-cancel-button/,
				);
				// The inventoried canonical stylesheet is not itself a violation.
				assert.doesNotMatch(
					thrownError(error).message,
					/- apps\/front\/src\/styles\/app\.css:\d+/,
				);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('rejects a sole canonical rule moved out of app.css into another stylesheet', () => {
	const { workspaceRoot, write } = createWorkspace();

	try {
		write('apps/front/src/styles/app.css', 'body {}\n');
		write('apps/front/src/styles/other.css', canonicalSourceCss);

		assert.throws(
			() => assertShippedSourceSearchCancelCss(workspaceRoot),
			(error) => {
				assert.match(thrownError(error).message, /outside the committed mention inventory/i);
				assert.match(thrownError(error).message, /apps\/front\/src\/styles\/other\.css:\d+/);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('rejects a canonical stylesheet that has lost the suppression rule entirely', () => {
	const { workspaceRoot, write } = createWorkspace();

	try {
		write('apps/front/src/styles/app.css', 'body {}\n');

		assert.throws(
			() => assertShippedSourceSearchCancelCss(workspaceRoot),
			(error) => {
				assert.match(thrownError(error).message, /found 0 occurrences/i);
				assert.match(
					thrownError(error).message,
					/required canonical rule: \.publy-search-input/i,
				);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('rejects the reviewer route: an override bundled from packages/shared-ts', () => {
	const { workspaceRoot } = createWorkspace({
		'packages/shared-ts/src/lib/profile-style/search-cancel-style.ts': `
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
				assert.match(thrownError(error).message, /outside the committed mention inventory/i);
				assert.match(
					thrownError(error).message,
					/packages\/shared-ts\/src\/lib\/profile-style\/search-cancel-style\.ts:\d+/,
				);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('rejects an override in client-ts, server.mjs, vite.config.ts and a local Vite plugin under apps/front/scripts', () => {
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
		// Round 11's route: a local Vite plugin imported by the scanned
		// vite.config.ts, living in a directory the guard used to claim never
		// ships. It shipped a restoring rule into the real client bundle.
		'apps/front/scripts/vite-runtime-style.ts',
	]) {
		const { workspaceRoot } = createWorkspace({ [relativePath]: override });

		try {
			assert.throws(
				() => assertShippedSourceSearchCancelCss(workspaceRoot),
				(error) => {
					assert.match(
						thrownError(error).message,
						/outside the committed mention inventory/i,
					);
					assert.ok(
						thrownError(error).message.includes(relativePath),
						`expected the failure to name ${relativePath}:\n${thrownError(error).message}`,
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
		assert.equal(result.inventoriedMentionCount, 1);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('permits mentions in an inventoried file', () => {
	const { workspaceRoot } = createWorkspace({
		'apps/front/src/components/ui/search-input.test.tsx': `
const SELECTOR = "::-webkit-search-cancel-button";
const OTHER = "input[type='search']::-webkit-search-cancel-button";
export { OTHER, SELECTOR };
`,
	});

	try {
		const result = assertShippedSourceSearchCancelCss(workspaceRoot);
		// two here plus the canonical app.css rule
		assert.equal(result.inventoriedMentionCount, 3);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

// Round 11 reproduction, pinned: the retired `publy-allow search-cancel-token`
// marker exempted any line carrying it, in any scanned file. Both abuses below
// passed every required check while shipping a restoring rule to the client.
// The marker mechanism is gone, so neither is exempt now.
test('rejects a restoring rule carrying the retired allow marker in a production component', () => {
	const { workspaceRoot } = createWorkspace({
		'apps/front/src/components/ui/search-input.tsx': `
const SEARCH_CANCEL_OVERRIDE = \`
	.publy-search-wrapper
		> .publy-search-input[type='search']::-webkit-search-cancel-button /* publy-allow search-cancel-token */ {
		-webkit-appearance: auto;
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
				assert.match(thrownError(error).message, /outside the committed mention inventory/i);
				assert.match(
					thrownError(error).message,
					/apps\/front\/src\/components\/ui\/search-input\.tsx:\d+/,
				);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('rejects a restoring rule carrying the retired allow marker on the line above, in packages/shared-ts', () => {
	const { workspaceRoot } = createWorkspace({
		'packages/shared-ts/src/lib/search-cancel-override.ts': `
export const SEARCH_CANCEL_OVERRIDE = \`
	.publy-search-wrapper
		/* publy-allow search-cancel-token */
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
				assert.match(thrownError(error).message, /outside the committed mention inventory/i);
				assert.match(
					thrownError(error).message,
					/packages\/shared-ts\/src\/lib\/search-cancel-override\.ts:\d+/,
				);
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
				assert.match(thrownError(error).message, /missing root "packages\/shared-ts"/);
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
					thrownError(error).message,
					/apps\/front\/src\/components\/search-input\.tsx:8 input\[type='search'\]::-webkit-search-cancel-button \{ appearance: auto; \}/,
				);
				assert.doesNotMatch(thrownError(error).message, /documentation block/);
				return true;
			},
		);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test('the shipped source roots stay pinned to what the build actually ships', () => {
	assert.deepEqual(SHIPPED_SOURCE_ROOTS, [
		'apps/front/scripts',
		'apps/front/src',
		'apps/front/server.mjs',
		'apps/front/vite.config.ts',
		'packages/shared-ts',
		'packages/client-ts',
	]);
});

/**
 * Pins the mention inventory the same way the roots are pinned. This is the
 * whole point of replacing the free-floating `publy-allow` marker: permitting
 * one more file to name the token has to be a visible diff here, reviewed
 * against the four legitimate sites, rather than a comment an author drops next
 * to a restoring rule in a component.
 */
test('the mention inventory stays pinned to the four legitimate sites', () => {
	assert.deepEqual(SEARCH_CANCEL_MENTION_INVENTORY, [
		'apps/front/scripts/guards/search-cancel-css-policy.mts',
		'apps/front/scripts/guards/search-cancel-css-policy.test.mts',
		'apps/front/src/components/ui/search-input.test.tsx',
		'apps/front/src/styles/app.css',
	]);
});

test('the emitted-bundle scan covers every executable and document artifact extension', () => {
	assert.deepEqual(EMITTED_BUNDLE_FILE_EXTENSIONS, [
		'.cjs',
		'.html',
		'.htm',
		'.js',
		'.mjs',
	]);
});

test('accepts emitted JavaScript that never mentions the token', () => {
	const result = assertEmittedBundlesFreeOfSearchCancel([
		{
			source: 'const a=1;export{a};\n',
			sourceName: 'dist/client/assets/index-abc.js',
		},
		{
			source: 'export const render=()=>null;\n',
			sourceName: 'dist/server/assets/router-abc.js',
		},
	]);

	assert.equal(result.scannedFileCount, 2);
});

// Round 11's BLOCKER: a Vite plugin in a directory outside every scanned source
// root appended a runtime `<style>` injection to the compiled router. Nothing
// in any scanned source root contained the token; the compiled bundles did.
test('rejects a runtime style injection compiled into the client and server bundles', () => {
	const clientChunk =
		"\n\t.publy-search-wrapper\n\t\t> .publy-search-input[type='search']" +
		'::-webkit-search-cancel-button {\n\t\tappearance: auto;\n\t}\n';

	assert.throws(
		() =>
			assertEmittedBundlesFreeOfSearchCancel([
				{
					source: `const style=document.createElement("style");style.textContent=${JSON.stringify(clientChunk)};`,
					sourceName: 'dist/server/assets/router-D21ze5za.js',
				},
				{
					source: `const css = \`${clientChunk}\`;`,
					sourceName: 'dist/client/assets/index-DUlSrzKh.js',
				},
			]),
		(error) => {
			assert.match(thrownError(error).message, /expected 0 occurrences/i);
			assert.match(thrownError(error).message, /found 2/i);
			assert.match(
				thrownError(error).message,
				/dist\/server\/assets\/router-D21ze5za\.js:\d+/,
			);
			assert.match(
				thrownError(error).message,
				/dist\/client\/assets\/index-DUlSrzKh\.js:\d+/,
			);
			return true;
		},
	);
});

// The emitted-bundle scan is raw on purpose. Emitted output is not source, so
// a comment there is not prose a human wrote to explain a rule — it is whatever
// the bundler kept, and exempting it would reopen the hole this closes.
test('rejects the token in emitted output even inside comment syntax', () => {
	assert.throws(
		() =>
			assertEmittedBundlesFreeOfSearchCancel([
				{
					source: '/* ::-webkit-search-cancel-button */\nconst a=1;\n',
					sourceName: 'dist/client/assets/index-abc.js',
				},
			]),
		(error) => {
			assert.match(thrownError(error).message, /expected 0 occurrences/i);
			assert.match(thrownError(error).message, /dist\/client\/assets\/index-abc\.js:1/);
			return true;
		},
	);
});

test('rejects the token in emitted HTML', () => {
	assert.throws(
		() =>
			assertEmittedBundlesFreeOfSearchCancel([
				{
					source:
						'<html><head><style>input::-webkit-search-cancel-button{appearance:auto}</style></head></html>',
					sourceName: 'dist/client/index.html',
				},
			]),
		(error) => {
			assert.match(thrownError(error).message, /dist\/client\/index\.html:1/);
			return true;
		},
	);
});
