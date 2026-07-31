import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SEARCH_CANCEL_TOKEN = '::-webkit-search-cancel-button';

export const SOURCE_SEARCH_CANCEL_CANONICAL = {
	label: 'shipped frontend source',
	sourceName: 'src/styles/app.css',
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

const EXCLUDED_SOURCE_DIRECTORIES = new Set([
	'.output',
	'.tanstack',
	'coverage',
	'dist',
	'node_modules',
	'playwright-report',
	'test-results',
]);

const TEST_ONLY_SOURCE_PATH =
	/(?:^|\/)(?:__fixtures__|__tests__)(?:\/|$)|(?:^|\/)[^/]+\.(?:spec|test)\.[^/]+$|(?:^|\/)[^/]+-test-support\.[^/]+$/;

const maskComments = (source) => {
	const characters = [...source];
	let index = 0;

	while (index < characters.length - 1) {
		if (characters[index] !== '/' || characters[index + 1] !== '*') {
			index += 1;
			continue;
		}

		characters[index] = ' ';
		characters[index + 1] = ' ';
		index += 2;
		while (
			index < characters.length - 1 &&
			(characters[index] !== '*' || characters[index + 1] !== '/')
		) {
			if (characters[index] !== '\n') {
				characters[index] = ' ';
			}
			index += 1;
		}
		if (index < characters.length - 1) {
			characters[index] = ' ';
			characters[index + 1] = ' ';
			index += 2;
		}
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

const findTokenOccurrences = (
	{ source, sourceName },
	{ includeComments = false } = {},
) => {
	const maskedSource = includeComments ? source : maskComments(source);
	const occurrences = [];
	let searchFrom = 0;

	while (searchFrom < maskedSource.length) {
		const tokenIndex = maskedSource.indexOf(SEARCH_CANCEL_TOKEN, searchFrom);
		if (tokenIndex === -1) {
			break;
		}

		const rule = findRuleAtToken(source, maskedSource, tokenIndex);
		occurrences.push({
			lineNumber: lineNumberAt(source, tokenIndex),
			rule,
			selector: rule?.selector ?? '<outside a style-rule selector>',
			sourceName,
		});
		searchFrom = tokenIndex + SEARCH_CANCEL_TOKEN.length;
	}

	return occurrences;
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
				`- ${occurrence.sourceName}:${occurrence.lineNumber} ${occurrence.selector}`,
		)
		.join('\n');

export const assertCanonicalSearchCancelCss = (stylesheets, canonical) => {
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

const collectShippedSourcePaths = (frontRoot) => {
	const sourceRoot = path.join(frontRoot, 'src');
	const sourcePaths = [];
	const stack = [sourceRoot];

	while (stack.length > 0) {
		const currentDirectory = stack.pop();
		for (const entry of readdirSync(currentDirectory, {
			withFileTypes: true,
		})) {
			if (entry.isDirectory() && EXCLUDED_SOURCE_DIRECTORIES.has(entry.name)) {
				continue;
			}

			const fullPath = path.join(currentDirectory, entry.name);
			if (entry.isDirectory()) {
				stack.push(fullPath);
			} else if (entry.isFile()) {
				const sourceName = path
					.relative(frontRoot, fullPath)
					.split(path.sep)
					.join('/');
				if (!TEST_ONLY_SOURCE_PATH.test(sourceName)) {
					sourcePaths.push(fullPath);
				}
			}
		}
	}

	return sourcePaths.sort((leftPath, rightPath) =>
		leftPath.localeCompare(rightPath),
	);
};

export const assertShippedSourceSearchCancelCss = (frontRoot) => {
	const sourceFiles = collectShippedSourcePaths(frontRoot).map(
		(sourcePath) => ({
			source: readFileSync(sourcePath, 'utf8'),
			sourceName: path
				.relative(frontRoot, sourcePath)
				.split(path.sep)
				.join('/'),
		}),
	);
	const occurrences = [];
	for (const sourceFile of sourceFiles) {
		occurrences.push(
			...findTokenOccurrences(sourceFile, { includeComments: true }),
		);
	}

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

	return sourceFiles.length;
};
