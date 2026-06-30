/**
 * `publy/no-direct-dayjs-in-components` — prevent React component files from
 * importing `dayjs` directly.
 *
 * Rationale (AGENTS.md -> "Frontend Coding Standards"):
 *   "Day.js via `format-time.ts` utilities - never import dayjs directly in
 *    components."
 *
 * What it flags in component `.tsx` files:
 *   - `import dayjs from 'dayjs'`
 *   - `import { isDayjs } from 'dayjs'`
 *   - `import * as dayjs from 'dayjs'`
 *   - `import utc from 'dayjs/plugin/utc'`
 *   - `import fr from 'dayjs/locale/fr'`
 *
 * Component file heuristic:
 *   - file extension is `.tsx`
 *   - path is under `apps/front/src/components`, `apps/front-2/src/components`,
 *     `apps/front/src/_parts`, `apps/front-2/src/_parts`,
 *     `apps/front/src/_components`, `apps/front-2/src/_components`,
 *     `apps/front/src/routes`, or `apps/front-2/src/routes`
 *
 * This rule deliberately has no fixer: the correct `format-time` utility depends
 * on how the component formats or parses the value.
 */
import {
	FRONT_SOURCE_PREFIXES,
	isFrontComponentTsxFile,
	normalizeFilename,
} from './path-scopes.js';

const DAYJS_PACKAGE = 'dayjs';
const DAYJS_SUBPATH_PREFIX = 'dayjs/';
const FORMAT_TIME_LIB_PREFIXES = FRONT_SOURCE_PREFIXES.map(
	(prefix) => prefix + 'lib/',
);

const basename = (filename) => {
	const parts = filename.split('/');

	return parts[parts.length - 1] ?? '';
};

const isFormatTimeUtility = (filename) =>
	FORMAT_TIME_LIB_PREFIXES.some((prefix) => filename.includes(prefix)) &&
	basename(filename).startsWith('format-time') &&
	filename.endsWith('.ts');

const getContextFilename = (context) => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}

	if (typeof context.getFilename === 'function') {
		return context.getFilename();
	}

	return '';
};

const isComponentTsxFile = (filename) =>
	isFrontComponentTsxFile(filename) && !isFormatTimeUtility(filename);

const isForbiddenDayjsImport = (source) =>
	source === DAYJS_PACKAGE || source.startsWith(DAYJS_SUBPATH_PREFIX);

export const noDirectDayjsInComponents = {
	meta: {
		type: 'problem',
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
	create(context) {
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
