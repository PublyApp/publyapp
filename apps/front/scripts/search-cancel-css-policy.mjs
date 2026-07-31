import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SEARCH_CANCEL_TOKEN = '::-webkit-search-cancel-button';

/**
 * Marker that exempts a single legitimate mention of the token from the source
 * scan. Put it on the same line as the mention, or on the line directly above
 * it. It is deliberately greppable, so the full set of sanctioned mentions is
 * always `grep -rn 'publy-allow search-cancel-token'`.
 *
 * It exists so a legitimate mention never has to be obfuscated: splitting the
 * token across string fragments to appease this guard is exactly the technique
 * that defeats it, and must not be taught by our own tree.
 */
export const SEARCH_CANCEL_ALLOW_MARKER = 'publy-allow search-cancel-token';

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
 *
 * Deliberately excluded because they never ship: `apps/front/scripts` (this
 * guard and its siblings), `apps/front/e2e` (Playwright), `apps/front/deploy`
 * (the separate request-counter/toxiproxy test harness images), and
 * `apps/front/dist` (the emitted artifact, asserted separately and with more
 * authority by `ARTIFACT_SEARCH_CANCEL_CANONICAL`).
 */
export const SHIPPED_SOURCE_ROOTS = [
	'apps/front/src',
	'apps/front/server.mjs',
	'apps/front/vite.config.ts',
	'packages/shared-ts',
	'packages/client-ts',
];

const IGNORED_DIRECTORY_NAMES = new Set([
	'node_modules',
	'dist',
	'.output',
	'.turbo',
]);

export const SOURCE_SEARCH_CANCEL_CANONICAL = {
	label: 'shipped frontend source',
	sourceName: 'apps/front/src/styles/app.css',
	selector: ".publy-search-input[type='search']::-webkit-search-cancel-button",
	declarations: [
		['-webkit-appearance', 'none'],
		['appearance', 'none'],
		['display', 'none'],
	],
};

export const ARTIFACT_SEARCH_CANCEL_CANONICAL = {
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
const maskComments = (source, { lineComments = false } = {}) => {
	const characters = source.split('');
	const { length } = characters;
	let index = 0;

	const blank = (from, to) => {
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

const findRuleAtToken = (source, maskedSource, tokenIndex) => {
	const openIndex = maskedSource.indexOf(
		'{',
		tokenIndex + SEARCH_CANCEL_TOKEN.length,
	);
	if (openIndex === -1) {
		return undefined;
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
		return undefined;
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

const lineNumberAt = (source, index) => {
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

const collapseWhitespace = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * A readable one-line excerpt centred on the token, used only for reporting.
 *
 * `findRuleAtToken` walks backwards to the previous `{`/`}`/`;` to find a
 * selector, which in a `.tsx` file happily drags in the whole preceding JSDoc
 * block. So a selector is only shown when it actually looks like a selector
 * (single line, not absurdly long); otherwise the token's own source line wins,
 * windowed so a minified asset does not dump its entire first line.
 */
const occurrenceContext = (source, tokenIndex, rule) => {
	const selector = rule ? collapseWhitespace(rule.selector) : undefined;
	if (
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
	{ source, sourceName },
	{ lineComments = false, honorAllowMarker = false } = {},
) => {
	const maskedSource = maskComments(source, { lineComments });
	const sourceLines = source.split('\n');
	const occurrences = [];
	const allowed = [];
	let searchFrom = 0;

	while (searchFrom < maskedSource.length) {
		const tokenIndex = maskedSource.indexOf(SEARCH_CANCEL_TOKEN, searchFrom);
		if (tokenIndex === -1) {
			break;
		}

		const rule = findRuleAtToken(source, maskedSource, tokenIndex);
		const lineNumber = lineNumberAt(source, tokenIndex);
		const occurrence = {
			context: occurrenceContext(source, tokenIndex, rule),
			lineNumber,
			rule,
			selector: rule?.selector ?? '<outside a style-rule selector>',
			sourceName,
		};

		const isAllowed =
			honorAllowMarker &&
			[sourceLines[lineNumber - 1], sourceLines[lineNumber - 2]].some((line) =>
				(line ?? '').includes(SEARCH_CANCEL_ALLOW_MARKER),
			);
		if (isAllowed) {
			allowed.push(occurrence);
		} else {
			occurrences.push(occurrence);
		}

		searchFrom = tokenIndex + SEARCH_CANCEL_TOKEN.length;
	}

	return { allowed, occurrences };
};

const parseDeclarations = (body) => {
	const declarations = [];

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

const sortedDeclarations = (declarations) =>
	[...declarations].sort(([leftProperty], [rightProperty]) =>
		leftProperty.localeCompare(rightProperty),
	);

const declarationsEqual = (left, right) =>
	JSON.stringify(sortedDeclarations(left)) ===
	JSON.stringify(sortedDeclarations(right));

const formatDeclarations = (declarations) =>
	declarations.map(([property, value]) => `${property}: ${value}`).join('; ');

const formatOccurrences = (occurrences) =>
	occurrences
		.map(
			(occurrence) =>
				`- ${occurrence.sourceName}:${occurrence.lineNumber} ${occurrence.context}`,
		)
		.join('\n');

export const assertCanonicalSearchCancelCss = (stylesheets, canonical) => {
	const occurrences = [];
	for (const stylesheet of stylesheets) {
		occurrences.push(...findTokenOccurrences(stylesheet).occurrences);
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

const collectFilesUnder = (directory, collected) => {
	const stack = [directory];

	while (stack.length > 0) {
		const currentDirectory = stack.pop();
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

export const collectShippedSourcePaths = (workspaceRoot) => {
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
					`in apps/front/scripts/search-cancel-css-policy.mjs.`,
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
 * Counts every literal, contiguous occurrence of the pseudo-element token in
 * shipped frontend source (see `SHIPPED_SOURCE_ROOTS`), ignoring comments and
 * mentions carrying `SEARCH_CANCEL_ALLOW_MARKER`, and requires the sole
 * remaining occurrence to be the canonical suppression rule in app.css.
 *
 * Ceiling, stated plainly: this is a text scan. It sees the token only where it
 * appears as contiguous ASCII. Concatenation, a backslash-newline line
 * continuation, or a unicode escape for one of its characters all hide it, and
 * no text scan can change that. Comment masking is a lexical heuristic, not a
 * parse, so a `//` inside a string literal earlier on the same line hides the
 * rest of that line too. Those are accepted limitations — the scan's
 * job is catching
 * accidental regressions in source that ships CSS via JavaScript. The emitted
 * CSS artifact assertion, not this scan, is the authority for anything that
 * reaches the CSS bundle.
 */
export const assertShippedSourceSearchCancelCss = (workspaceRoot) => {
	const sourceFiles = collectShippedSourcePaths(workspaceRoot).map(
		(sourcePath) => ({
			source: readFileSync(sourcePath, 'utf8'),
			sourceName: path
				.relative(workspaceRoot, sourcePath)
				.split(path.sep)
				.join('/'),
		}),
	);
	const occurrences = [];
	const allowlisted = [];
	for (const sourceFile of sourceFiles) {
		const found = findTokenOccurrences(sourceFile, {
			honorAllowMarker: true,
			lineComments: !sourceFile.sourceName.endsWith('.css'),
		});
		occurrences.push(...found.occurrences);
		allowlisted.push(...found.allowed);
	}

	const scannedRoots = `Scanned roots: ${SHIPPED_SOURCE_ROOTS.join(', ')}.`;

	if (occurrences.length !== 1) {
		throw new Error(
			[
				`Search cancel CSS policy failed for ${SOURCE_SEARCH_CANCEL_CANONICAL.label}.`,
				`Expected exactly 1 occurrence of ${SEARCH_CANCEL_TOKEN}; ` +
					`found ${occurrences.length} occurrences.`,
				'Occurrences mentioning the pseudo-element:',
				occurrences.length === 0
					? '- no source mentions the pseudo-element'
					: formatOccurrences(occurrences),
				`Required canonical source: ${SOURCE_SEARCH_CANCEL_CANONICAL.sourceName}`,
				`A legitimate mention is exempted by putting "${SEARCH_CANCEL_ALLOW_MARKER}" ` +
					`on its line or the line above — never by splitting the token.`,
				scannedRoots,
			].join('\n'),
		);
	}

	const [occurrence] = occurrences;
	if (occurrence.sourceName !== SOURCE_SEARCH_CANCEL_CANONICAL.sourceName) {
		throw new Error(
			[
				`Search cancel CSS policy failed for ${SOURCE_SEARCH_CANCEL_CANONICAL.label}.`,
				'The sole pseudo-element occurrence is outside the canonical source.',
				'Occurrence mentioning the pseudo-element:',
				formatOccurrences(occurrences),
				`Required source: ${SOURCE_SEARCH_CANCEL_CANONICAL.sourceName}`,
				`Actual source: ${occurrence.sourceName}`,
				scannedRoots,
			].join('\n'),
		);
	}

	const canonicalSourceFile = sourceFiles.find(
		(sourceFile) =>
			sourceFile.sourceName === SOURCE_SEARCH_CANCEL_CANONICAL.sourceName,
	);
	assertCanonicalSearchCancelCss(
		[canonicalSourceFile],
		SOURCE_SEARCH_CANCEL_CANONICAL,
	);

	return {
		allowlistedCount: allowlisted.length,
		sourceFileCount: sourceFiles.length,
	};
};
