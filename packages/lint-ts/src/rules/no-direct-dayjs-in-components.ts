import type { Context, Visitor } from '@oxlint/plugins';

import {
	FRONT_SOURCE_PREFIXES,
	isFrontComponentTsxFile,
	normalizeFilename,
} from './path-scopes.js';

/**
 * `publy/no-direct-dayjs-in-components` — prevent React component files from
 * importing `dayjs` directly.
 *
 * Rationale (AGENTS.md -> "Frontend Coding Standards"):
 *   "Day.js via `format-time.ts` utilities - never import dayjs directly in
 *    components."
 */
const DAYJS_PACKAGE = 'dayjs';
const DAYJS_SUBPATH_PREFIX = 'dayjs/';
const FORMAT_TIME_LIB_PREFIXES: string[] = FRONT_SOURCE_PREFIXES.map(
	(prefix) => prefix + 'lib/',
);

const basename = (filename: string): string => {
	const parts = filename.split('/');
	return parts[parts.length - 1] ?? '';
};

const isFormatTimeUtility = (filename: string): boolean =>
	FORMAT_TIME_LIB_PREFIXES.some((prefix) => filename.includes(prefix)) &&
	basename(filename).startsWith('format-time') &&
	filename.endsWith('.ts');

const getContextFilename = (context: Context): string => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}
	return '';
};

const isComponentTsxFile = (filename: string): boolean =>
	isFrontComponentTsxFile(filename) && !isFormatTimeUtility(filename);

const isForbiddenDayjsImport = (source: string): boolean =>
	source === DAYJS_PACKAGE || source.startsWith(DAYJS_SUBPATH_PREFIX);

export const noDirectDayjsInComponents = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Disallow direct dayjs imports in React component files; use format-time utilities instead.',
			recommended: false,
		},
		schema: [],
		messages: {
			directDayjsImport:
				'Import from the format-time utilities instead of importing dayjs directly in components.',
		},
	},
	create(context: Context): Visitor {
		const filename = normalizeFilename(getContextFilename(context));

		if (!isComponentTsxFile(filename)) {
			return {};
		}

		return {
			ImportDeclaration(node) {
				if (!isForbiddenDayjsImport(node.source.value)) {
					return;
				}

				context.report({ node, messageId: 'directDayjsImport' });
			},
		};
	},
};
