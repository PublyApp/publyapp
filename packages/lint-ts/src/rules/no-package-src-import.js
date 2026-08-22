/**
 * `publy/no-package-src-import` — forbid `@org/client-ts/src/…` and
 * `@org/shared-ts/src/…` import paths. Consumers must import through the
 * package exports map (`@org/client-ts/<path>`, `@org/shared-ts/<path>`)
 * instead of reaching into the `src/` directory directly.
 *
 * Scoped to `apps/**` and `packages/**` source files (excluding the two
 * packages themselves, whose internal code may legitimately reference `src/`).
 */
import { normalizeFilename } from './path-scopes.js';

const BANNED_PREFIXES = ['@org/client-ts/src/', '@org/shared-ts/src/'];

const BANNED_MESSAGE =
	'Do not import from `@org/…/src/…`; use the package exports map (`@org/{{pkg}}/<path>`) instead.';

const isConsumerFile = (filename) => {
	const n = normalizeFilename(filename);
	return (
		n.startsWith('apps/') ||
		n.includes('/apps/') ||
		n.startsWith('packages/') ||
		n.includes('/packages/')
	);
};

const isOwnPackageFile = (filename) => {
	const n = normalizeFilename(filename);
	return (
		n.includes('/packages/client-ts/') ||
		n.startsWith('packages/client-ts/') ||
		n.includes('/packages/shared-ts/') ||
		n.startsWith('packages/shared-ts/')
	);
};

const matchBannedPrefix = (value) => {
	for (const prefix of BANNED_PREFIXES) {
		if (value.startsWith(prefix)) {
			return prefix;
		}
	}

	return null;
};

export const noPackageSrcImport = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Forbid @org/client-ts/src/ and @org/shared-ts/src/ import paths; use the exports map instead.',
			recommended: false,
		},
		schema: [],
		messages: {
			banned:
				'Do not import from `@org/…/src/…`; use the package exports map (`@org/{{pkg}}/<path>`) instead.',
		},
	},
	create(context) {
		const filename = getContextFilename(context);

		if (!isConsumerFile(filename) || isOwnPackageFile(filename)) {
			return {};
		}

		return {
			ImportDeclaration(node) {
				const source = node.source?.value;

				if (typeof source !== 'string') {
					return;
				}

				const bannedPrefix = matchBannedPrefix(source);

				if (bannedPrefix === null) {
					return;
				}

				const pkg = bannedPrefix.startsWith('@org/client-ts/')
					? 'client-ts'
					: 'shared-ts';

				context.report({
					node: node.source,
					messageId: 'banned',
					data: { pkg },
				});
			},
		};
	},
};

const getContextFilename = (context) => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}

	if (typeof context.getFilename === 'function') {
		return context.getFilename();
	}

	return '';
};
