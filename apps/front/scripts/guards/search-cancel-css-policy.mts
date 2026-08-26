import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

interface ParsedRule {
	body: string;
	selector: string;
}

interface SourceRecord {
	source: string;
	sourceName: string;
}

interface TokenOccurrence {
	context: string;
	lineNumber: number;
	rule: ParsedRule | undefined;
	selector: string;
	sourceName: string;
}

interface SearchCancelCanonical {
	declarations: [property: string, value: string][];
	label: string;
	selector: string;
	sourceName?: string;
}

const SEARCH_CANCEL_TOKEN = '::-webkit-search-cancel-button';

/**
 * The exact, committed set of files permitted to mention the token in scanned
 * source. A mention in any other scanned file is a failure — there is no
 * in-file escape hatch, no marker, no comment an author can drop next to a
 * restoring rule to exempt it.
 *
 * This replaced a free-floating `publy-allow` marker that exempted any line
 * carrying it, anywhere. Review round 11 put that marker in the real
 * `apps/front/src/components/ui/search-input.tsx` next to a restoring rule, and
 * in a `packages/shared-ts` module, and both shipped the rule into the client
 * bundle with every required check green. Adding a file here is a reviewed diff
 * against a pinned list (see the inventory test in
 * `search-cancel-css-policy.test.mjs`), not a comment in a component.
 *
 * Paths are workspace-relative and use `/` on every platform.
 */
export const SEARCH_CANCEL_MENTION_INVENTORY = [
	'apps/front/scripts/guards/search-cancel-css-policy.mts',
	'apps/front/scripts/guards/search-cancel-css-policy.test.mts',
	'apps/front/src/components/ui/search-input.test.tsx',
	'apps/front/src/styles/app.css',
];

/**
 * Source roots that reach production. Derived from the build configuration, not
 * from guesswork:
 *
 *  - `apps/front/src` — what `vite build` compiles (`apps/front/vite.config.ts`).
 *  - `packages/shared-ts`, `packages/client-ts` — the only two workspace
 *    packages `apps/front/package.json` depends on, and both are listed in
 *    `ssr.noExternal`, so they are bundled into the client and server output
 *    rather than externalized.
 *  - `apps/front/server.mjs` — the production process entry: `"start": "node
 *    server.mjs"`, and `apps/front/Dockerfile` copies it into the runtime image
 *    as the container `CMD`.
 *  - `apps/front/vite.config.ts` — not itself bundled, but it is the build
 *    configuration that decides what is, so a module injected from here reaches
 *    the bundle.
 *  - `apps/front/scripts` — this guard and its siblings. Previously excluded
 *    with the claim that it "never ships", which review round 11 disproved: a
 *    local Vite plugin under this directory, imported by the scanned
 *    `vite.config.ts`, executes during the real build and injected a restoring
 *    rule into shipped client JavaScript.
 *
 * Not scanned: `apps/front/e2e` (Playwright), `apps/front/deploy` (the separate
 * request-counter/toxiproxy test harness images), and `apps/front/dist` (the
 * emitted artifact, asserted separately and with more authority by
 * `ARTIFACT_SEARCH_CANCEL_CANONICAL` and
 * `assertEmittedBundlesFreeOfSearchCancel`). No claim is made that those three
 * cannot reach production; the emitted-artifact assertions, not this list, are
 * what covers anything that does.
 */
export const SHIPPED_SOURCE_ROOTS = [
	'apps/front/scripts',
	'apps/front/src',
	'apps/front/server.mjs',
	'apps/front/vite.config.ts',
	'packages/shared-ts',
	'packages/client-ts',
];

/**
 * File extensions of emitted, executable build output scanned by
 * `assertEmittedBundlesFreeOfSearchCancel`. The canonical suppression lives in
 * CSS, so the permitted count in these is zero.
 */
export const EMITTED_BUNDLE_FILE_EXTENSIONS = [
	'.cjs',
	'.html',
	'.htm',
	'.js',
	'.mjs',
];

const IGNORED_DIRECTORY_NAMES = new Set([
	'node_modules',
	'dist',
	'.output',
	'.turbo',
]);

export const SOURCE_SEARCH_CANCEL_CANONICAL: SearchCancelCanonical = {
	label: 'shipped frontend source',
	sourceName: 'apps/front/src/styles/app.css',
	selector: ".publy-search-input[type='search']::-webkit-search-cancel-button",
	declarations: [
		['-webkit-appearance', 'none'],
		['appearance', 'none'],
		['display', 'none'],
	],
};

export const ARTIFACT_SEARCH_CANCEL_CANONICAL: SearchCancelCanonical = {
	label: 'emitted production CSS',
	selector: '.publy-search-input[type=search]::-webkit-search-cancel-button',
	declarations: [
		['appearance', 'none'],
		['display', 'none'],
	],
};

/**
 * Blanks out comments so they are not counted, while preserving every byte
 * offset and line break so reported line numbers stay exact.
 *
 * A comment cannot ship CSS, so prose that names the pseudo-element is not a
 * regression and must not red the build. `//` handling is opt-in because CSS
 * has no line comments; the `:` lookbehind keeps `https://` from swallowing the
 * rest of its line.
 */
const maskComments = (
	source: string,
	{ lineComments = false }: { lineComments?: boolean } = {},
): string => {
	const characters = source.split('');
	const { length } = characters;
	let index = 0;

	const blank = (from: number, to: number): void => {
		for (let cursor = from; cursor < to; cursor += 1) {
			if (characters[cursor] !== '\n') {
				characters[cursor] = ' ';
			}
		}
	};

	while (index < length - 1) {
		if (characters[index] === '/' && characters[index + 1] === '*') {
			let end = index + 2;
			while (
				end < length - 1 &&
				!(characters[end] === '*' && characters[end + 1] === '/')
			) {
				end += 1;
			}
			const commentEnd = end < length - 1 ? end + 2 : length;
			blank(index, commentEnd);
			index = commentEnd;
			continue;
		}

		if (
			lineComments &&
			characters[index] === '/' &&
			characters[index + 1] === '/' &&
			characters[index - 1] !== ':'
		) {
			let end = index;
			while (end < length && characters[end] !== '\n') {
				end += 1;
			}
			blank(index, end);
			index = end;
			continue;
		}

		index += 1;
	}

	return characters.join('');
};

const findRuleAtToken = (
	source: string,
	maskedSource: string,
	tokenIndex: number,
): ParsedRule | undefined => {
	const openIndex = maskedSource.indexOf(
		'{',
		tokenIndex + SEARCH_CANCEL_TOKEN.length,
	);
	if (openIndex === -1) {
		return;
	}

	const previousBoundaries = [
		maskedSource.lastIndexOf('{', tokenIndex),
		maskedSource.lastIndexOf('}', tokenIndex),
		maskedSource.lastIndexOf(';', tokenIndex),
	];
	const selectorBoundary = Math.max(...previousBoundaries);
	const rawSelector = maskedSource.slice(selectorBoundary + 1, openIndex);
	const leadingWhitespace = rawSelector.search(/\S/);
	const selectorStart =
		leadingWhitespace === -1
			? openIndex
			: selectorBoundary + 1 + leadingWhitespace;
	const selector = source.slice(selectorStart, openIndex).trim();
	if (!selector.includes(SEARCH_CANCEL_TOKEN)) {
		return;
	}

	let depth = 1;
	let index = openIndex + 1;
	while (index < maskedSource.length && depth > 0) {
		const character = maskedSource[index];
		if (character === '"' || character === "'") {
			const quote = character;
			index += 1;
			while (index < maskedSource.length && maskedSource[index] !== quote) {
				index += maskedSource[index] === '\\' ? 2 : 1;
			}
		} else if (character === '{') {
			depth += 1;
		} else if (character === '}') {
			depth -= 1;
		}
		index += 1;
	}

	const bodyEnd = depth === 0 ? index - 1 : maskedSource.length;
	return {
		body: source.slice(openIndex + 1, bodyEnd),
		selector,
	};
};

const lineNumberAt = (source: string, index: number): number => {
	let lineNumber = 1;
	for (let cursor = 0; cursor < index; cursor += 1) {
		if (source[cursor] === '\n') {
			lineNumber += 1;
		}
	}
	return lineNumber;
};

const CONTEXT_LIMIT = 120;
const CONTEXT_WINDOW = 40;

const collapseWhitespace = (text: string): string =>
	text.replace(/\s+/g, ' ').trim();

/**
 * A readable one-line excerpt centred on the token, used only for reporting.
 *
 * `findRuleAtToken` walks backwards to the previous `{`/`}`/`;` to find a
 * selector, which in a `.tsx` file happily drags in the whole preceding JSDoc
 * block. So a selector is only shown when it actually looks like a selector
 * (single line, not absurdly long); otherwise the token's own source line wins,
 * windowed so a minified asset does not dump its entire first line.
 */
const occurrenceContext = (
	source: string,
	tokenIndex: number,
	rule: ParsedRule | undefined,
): string => {
	const selector = rule ? collapseWhitespace(rule.selector) : undefined;
	if (
		rule !== undefined &&
		selector &&
		!rule.selector.includes('\n') &&
		selector.length <= CONTEXT_LIMIT
	) {
		return selector;
	}

	const lineStart = source.lastIndexOf('\n', tokenIndex) + 1;
	const nextBreak = source.indexOf('\n', tokenIndex);
	const lineEnd = nextBreak === -1 ? source.length : nextBreak;
	const line = source.slice(lineStart, lineEnd);
	const collapsedLine = collapseWhitespace(line);
	if (collapsedLine.length <= CONTEXT_LIMIT) {
		return collapsedLine;
	}

	const column = tokenIndex - lineStart;
	const from = Math.max(0, column - CONTEXT_WINDOW);
	const to = Math.min(
		line.length,
		column + SEARCH_CANCEL_TOKEN.length + CONTEXT_WINDOW,
	);
	return [
		from > 0 ? '…' : '',
		collapseWhitespace(line.slice(from, to)),
		to < line.length ? '…' : '',
	].join('');
};

const findTokenOccurrences = (
	{ source, sourceName }: SourceRecord,
	{
		lineComments = false,
		maskCommentSyntax = true,
	}: { lineComments?: boolean; maskCommentSyntax?: boolean } = {},
): TokenOccurrence[] => {
	const maskedSource = maskCommentSyntax
		? maskComments(source, { lineComments })
		: source;
	const occurrences = [];
	let searchFrom = 0;

	while (searchFrom < maskedSource.length) {
		const tokenIndex = maskedSource.indexOf(SEARCH_CANCEL_TOKEN, searchFrom);
		if (tokenIndex === -1) {
			break;
		}

		const rule = findRuleAtToken(source, maskedSource, tokenIndex);
		occurrences.push({
			context: occurrenceContext(source, tokenIndex, rule),
			lineNumber: lineNumberAt(source, tokenIndex),
			rule,
			selector: rule?.selector ?? '<outside a style-rule selector>',
			sourceName,
		});

		searchFrom = tokenIndex + SEARCH_CANCEL_TOKEN.length;
	}

	return occurrences;
};

const parseDeclarations = (body: string): [string, string][] => {
	const declarations: [string, string][] = [];

	for (const rawDeclaration of body.split(';')) {
		const declaration = rawDeclaration.trim();
		if (!declaration) {
			continue;
		}

		const separatorIndex = declaration.indexOf(':');
		if (separatorIndex === -1) {
			declarations.push([declaration, '<missing value>']);
			continue;
		}

		const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
		const value = declaration
			.slice(separatorIndex + 1)
			.trim()
			.replace(/\s+/g, ' ');
		declarations.push([property, value]);
	}

	return declarations;
};

const sortedDeclarations = (declarations: [string, string][]) =>
	[...declarations].sort(([leftProperty], [rightProperty]) =>
		leftProperty.localeCompare(rightProperty),
	);

const declarationsEqual = (
	left: [string, string][],
	right: [string, string][],
) =>
	JSON.stringify(sortedDeclarations(left)) ===
	JSON.stringify(sortedDeclarations(right));

const formatDeclarations = (declarations: [string, string][]) =>
	declarations.map(([property, value]) => `${property}: ${value}`).join('; ');

const formatOccurrences = (occurrences: TokenOccurrence[]) =>
	occurrences
		.map(
			(occurrence) =>
				`- ${occurrence.sourceName}:${occurrence.lineNumber} ${occurrence.context}`,
		)
		.join('\n');

export const assertCanonicalSearchCancelCss = (
	stylesheets: SourceRecord[],
	canonical: SearchCancelCanonical,
): void => {
	const occurrences = [];
	for (const stylesheet of stylesheets) {
		occurrences.push(...findTokenOccurrences(stylesheet));
	}

	const occurrenceDetails =
		occurrences.length === 0
			? '- no rule mentions the pseudo-element'
			: formatOccurrences(occurrences);
	const expectedRule =
		`${canonical.selector} { ` +
		`${formatDeclarations(canonical.declarations)} }`;

	if (occurrences.length !== 1) {
		throw new Error(
			[
				`Search cancel CSS policy failed for ${canonical.label}.`,
				`Expected exactly 1 occurrence of ${SEARCH_CANCEL_TOKEN}; ` +
					`found ${occurrences.length} occurrences.`,
				'Rules mentioning the pseudo-element:',
				occurrenceDetails,
				`Required canonical rule: ${expectedRule}`,
			].join('\n'),
		);
	}

	const [occurrence] = occurrences;
	const actualDeclarations = occurrence.rule
		? parseDeclarations(occurrence.rule.body)
		: [];
	if (
		(canonical.sourceName && occurrence.sourceName !== canonical.sourceName) ||
		occurrence.selector !== canonical.selector ||
		!declarationsEqual(actualDeclarations, canonical.declarations)
	) {
		throw new Error(
			[
				`Search cancel CSS policy failed for ${canonical.label}.`,
				'The sole pseudo-element occurrence is not the canonical rule.',
				'Rule mentioning the pseudo-element:',
				occurrenceDetails,
				...(canonical.sourceName
					? [
							`Required source: ${canonical.sourceName}`,
							`Actual source: ${occurrence.sourceName}`,
						]
					: []),
				`Required selector: ${canonical.selector}`,
				`Actual selector: ${occurrence.selector}`,
				`Required canonical declarations: ${formatDeclarations(canonical.declarations)}`,
				`Actual declarations: ${formatDeclarations(actualDeclarations) || '<none>'}`,
			].join('\n'),
		);
	}
};

const collectFilesUnder = (directory: string, collected: string[]): void => {
	const stack = [directory];

	while (stack.length > 0) {
		const currentDirectory = stack.pop();
		if (currentDirectory === undefined) {
			break;
		}
		for (const entry of readdirSync(currentDirectory, {
			withFileTypes: true,
		})) {
			const fullPath = path.join(currentDirectory, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
					stack.push(fullPath);
				}
			} else if (entry.isFile()) {
				collected.push(fullPath);
			}
		}
	}
};

export const collectShippedSourcePaths = (workspaceRoot: string): string[] => {
	const sourcePaths = [];

	for (const root of SHIPPED_SOURCE_ROOTS) {
		const rootPath = path.join(workspaceRoot, root);
		let stats;
		try {
			stats = statSync(rootPath);
		} catch {
			throw new Error(
				`Search cancel CSS policy cannot scan shipped source: ` +
					`missing root "${root}". If it moved, update SHIPPED_SOURCE_ROOTS ` +
					`in apps/front/scripts/guards/search-cancel-css-policy.mts.`,
			);
		}

		if (stats.isDirectory()) {
			collectFilesUnder(rootPath, sourcePaths);
		} else {
			sourcePaths.push(rootPath);
		}
	}

	return sourcePaths.sort((leftPath, rightPath) =>
		leftPath.localeCompare(rightPath),
	);
};

/**
 * Rejects every literal, contiguous occurrence of the pseudo-element token in
 * scanned source (see `SHIPPED_SOURCE_ROOTS`) that is not in a comment and not
 * in a file on `SEARCH_CANCEL_MENTION_INVENTORY`, and separately requires
 * app.css to contain exactly the canonical suppression rule.
 *
 * Ceiling, stated plainly: this is a text scan over a fixed list of roots. It
 * sees the token only where it appears as contiguous ASCII, so concatenation, a
 * backslash-newline line continuation inside one literal, or a unicode escape
 * for one of its characters all hide it from this scan; no text scan can change
 * that. Comment masking is a lexical heuristic, not a parse, so a raw `//` or
 * `/*` inside a string, template literal or JSX text puts the masker into
 * comment state and hides later real occurrences. And a file outside these
 * roots is not seen at all.
 *
 * This scan is therefore the SECONDARY net: its value is naming a file and a
 * line, which a bundle scan cannot. The authorities over what actually ships
 * are `assertCanonicalSearchCancelCss` over the emitted CSS and
 * `assertEmittedBundlesFreeOfSearchCancel` over the emitted JS/HTML, both of
 * which read the real built output. The masking blind spots above are fully
 * covered there, because the token is still contiguous in the file. The
 * escaping ones are covered whenever the rule reaches a CSS asset, since
 * escapes are resolved by the time CSS is emitted; when such a rule ships
 * inside JavaScript instead, the bundle scan catches it only if the bundler
 * folded the pieces back into one literal. See the exact ceiling in
 * `apps/front/src/components/ui/search-input.test.tsx`.
 */
/** Count report of the shipped-source scan across the workspace roots. */
interface ShippedSourceScanReport {
	inventoriedMentionCount: number;
	inventorySize: number;
	sourceFileCount: number;
}

export const assertShippedSourceSearchCancelCss = (
	workspaceRoot: string,
): ShippedSourceScanReport => {
	const sourceFiles = collectShippedSourcePaths(workspaceRoot).map(
		(sourcePath) => ({
			source: readFileSync(sourcePath, 'utf8'),
			sourceName: path
				.relative(workspaceRoot, sourcePath)
				.split(path.sep)
				.join('/'),
		}),
	);
	const inventory = new Set(SEARCH_CANCEL_MENTION_INVENTORY);
	const violations: TokenOccurrence[] = [];
	const inventoried: TokenOccurrence[] = [];
	for (const sourceFile of sourceFiles) {
		const found = findTokenOccurrences(sourceFile, {
			lineComments: !sourceFile.sourceName.endsWith('.css'),
		});
		if (inventory.has(sourceFile.sourceName)) {
			inventoried.push(...found);
		} else {
			violations.push(...found);
		}
	}

	const scannedRoots = `Scanned roots: ${SHIPPED_SOURCE_ROOTS.join(', ')}.`;

	if (violations.length > 0) {
		throw new Error(
			[
				`Search cancel CSS policy failed for ${SOURCE_SEARCH_CANCEL_CANONICAL.label}.`,
				`Found ${violations.length} occurrence(s) of ${SEARCH_CANCEL_TOKEN} ` +
					`outside the committed mention inventory.`,
				'Occurrences mentioning the pseudo-element:',
				formatOccurrences(violations),
				`Required canonical source: ${SOURCE_SEARCH_CANCEL_CANONICAL.sourceName}`,
				'Only these files may mention the token:',
				SEARCH_CANCEL_MENTION_INVENTORY.map((entry) => `- ${entry}`).join('\n'),
				'There is no in-file exemption marker. Adding a file to ' +
					'SEARCH_CANCEL_MENTION_INVENTORY in ' +
					'apps/front/scripts/guards/search-cancel-css-policy.mts is a reviewed diff ' +
					'that must also update the pinning test — never split the token to ' +
					'hide it from this scan.',
				scannedRoots,
			].join('\n'),
		);
	}

	const canonicalSourceFile = sourceFiles.find(
		(sourceFile) =>
			sourceFile.sourceName === SOURCE_SEARCH_CANCEL_CANONICAL.sourceName,
	);
	if (!canonicalSourceFile) {
		throw new Error(
			[
				`Search cancel CSS policy failed for ${SOURCE_SEARCH_CANCEL_CANONICAL.label}.`,
				`The canonical stylesheet ${SOURCE_SEARCH_CANCEL_CANONICAL.sourceName} ` +
					`was not found in any scanned root.`,
				scannedRoots,
			].join('\n'),
		);
	}
	assertCanonicalSearchCancelCss(
		[canonicalSourceFile],
		SOURCE_SEARCH_CANCEL_CANONICAL,
	);

	return {
		inventoriedMentionCount: inventoried.length,
		inventorySize: SEARCH_CANCEL_MENTION_INVENTORY.length,
		sourceFileCount: sourceFiles.length,
	};
};

/**
 * THE SECOND AUTHORITY. Asserts that the pseudo-element token appears nowhere
 * in the emitted client and server JavaScript, or in any emitted HTML, after a
 * real production build.
 *
 * The canonical suppression lives in a CSS asset, which
 * `assertCanonicalSearchCancelCss` covers. There is no legitimate reason for
 * the token to be in emitted JavaScript at all, so the permitted count here is
 * zero.
 *
 * This is an assertion over the real built thing. It covers whatever put the
 * rule there — a runtime `<style>` injection, a `<style>{CONSTANT}</style>`
 * render, a Vite plugin transform from a file in no scanned root, a future
 * source directory nobody added to `SHIPPED_SOURCE_ROOTS` — without a
 * hand-maintained source list that the next reviewer defeats by finding root
 * number seven.
 *
 * Deliberately a raw scan: emitted output is not source, so nothing here is
 * comment-masked and nothing is exempt.
 *
 * `bundles` are `{ source, sourceName }` records for every emitted file whose
 * extension is in `EMITTED_BUNDLE_FILE_EXTENSIONS`.
 */
/** Count report of the emitted-bundle scan: how many emitted files were
 * checked for the search-cancel token. */
interface EmittedBundleScanReport {
	scannedFileCount: number;
}

export const assertEmittedBundlesFreeOfSearchCancel = (
	bundles: SourceRecord[],
): EmittedBundleScanReport => {
	const occurrences = [];
	for (const bundle of bundles) {
		occurrences.push(
			...findTokenOccurrences(bundle, { maskCommentSyntax: false }),
		);
	}

	if (occurrences.length > 0) {
		throw new Error(
			[
				'Search cancel CSS policy failed for emitted production JavaScript/HTML.',
				`Expected 0 occurrences of ${SEARCH_CANCEL_TOKEN}; ` +
					`found ${occurrences.length}.`,
				'The canonical suppression belongs in the CSS bundle, so this token ' +
					'must never reach emitted JavaScript or HTML.',
				'Occurrences mentioning the pseudo-element:',
				formatOccurrences(occurrences),
			].join('\n'),
		);
	}

	return { scannedFileCount: bundles.length };
};
