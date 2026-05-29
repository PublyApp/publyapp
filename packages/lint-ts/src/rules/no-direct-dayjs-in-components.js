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
 *   - path is under `apps/front/src/components`, `apps/front/src/_parts`,
 *     `apps/front/src/_components`, or the `apps/front/src/routes` tree
 *
 * This rule deliberately has no fixer: the correct `format-time` utility depends
 * on how the component formats or parses the value.
 */

const DAYJS_PACKAGE = 'dayjs';
const DAYJS_SUBPATH_PREFIX = 'dayjs/';
const FRONT_SRC_PREFIX = 'apps/front/src/';
const FORMAT_TIME_LIB_PREFIX = 'apps/front/src/lib/';

const getContextFilename = (context) => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}

	if (typeof context.getFilename === 'function') {
		return context.getFilename();
	}

	return '';
};

const normalizePath = (filename) => filename.replaceAll('\\', '/');

const basename = (filename) => {
	const parts = filename.split('/');

	return parts[parts.length - 1] ?? '';
};

const isFormatTimeUtility = (filename) =>
	filename.includes(FORMAT_TIME_LIB_PREFIX) &&
	basename(filename).startsWith('format-time') &&
	filename.endsWith('.ts');

const getFrontSrcRelativePath = (filename) => {
	const frontSrcIndex = filename.indexOf(FRONT_SRC_PREFIX);

	if (frontSrcIndex === -1) {
		return '';
	}

	return filename.slice(frontSrcIndex + FRONT_SRC_PREFIX.length);
};

const isComponentPath = (filename) => {
	const frontSrcRelativePath = getFrontSrcRelativePath(filename);

	if (frontSrcRelativePath === '') {
		return false;
	}

	return (
		frontSrcRelativePath.startsWith('components/') ||
		frontSrcRelativePath.startsWith('_parts/') ||
		frontSrcRelativePath.startsWith('_components/') ||
		frontSrcRelativePath.startsWith('routes/')
	);
};

const isComponentTsxFile = (filename) =>
	filename.endsWith('.tsx') &&
	!isFormatTimeUtility(filename) &&
	isComponentPath(filename);

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
		const filename = normalizePath(getContextFilename(context));

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
