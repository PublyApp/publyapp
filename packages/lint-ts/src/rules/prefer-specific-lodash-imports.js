/**
 * `publy/prefer-specific-lodash-imports` — enforce targeted `lodash/<helper>`
 * imports over importing the full `lodash` package.
 *
 * Rationale (AGENTS.md → "JavaScript/TypeScript Conventions"):
 *   "Import specific helpers such as `lodash/map`, `lodash/trim`, `lodash/isEqual`,
 *    and `lodash/capitalize` instead of the full `lodash` package."
 *
 * Pulling in the full `lodash` barrel defeats tree-shaking and ships the entire
 * library; the per-method entrypoints (`lodash/map`, …) are individually
 * importable and far cheaper.
 *
 * What it flags (the import source is exactly `lodash`):
 *   - `import _ from 'lodash'`              (default import)        → message only
 *   - `import * as _ from 'lodash'`         (namespace import)      → message only
 *   - `import { map, trim } from 'lodash'`  (named imports)         → auto-fixable
 *   - `import _, { map } from 'lodash'`     (mixed default + named) → message only
 *   - `import 'lodash'`                     (side-effect-only)      → message only
 *
 * What it allows:
 *   - `import map from 'lodash/map'`        (already a sub-path import)
 *   - `import isEqual from 'lodash/isEqual'`
 *   - any non-lodash import.
 *
 * Fix strategy: only the *unambiguous* case is rewritten — a declaration whose
 * specifiers are ALL named (`ImportSpecifier`). Each member becomes its own
 * `import <local> from 'lodash/<imported>'` line (aliases and `type` modifiers
 * preserved). Default/namespace/side-effect/mixed imports are reported with a
 * message only, because the correct sub-paths cannot be inferred mechanically.
 *
 * Rule shape (oxlint 1.64.0, `oxlint/plugins-dev`): `{ meta, create(context) }`
 * returning an AST visitor. See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 *
 * Note: this plugin module deliberately uses native `Array.prototype.map` rather
 * than `lodash/map`. The `publy/*` plugin must load with zero runtime deps so
 * Oxlint can `import()` it reliably; `specifiers` is always a real array here, so
 * lodash's nullish-safety buys nothing.
 */

const LODASH_PACKAGE = 'lodash';

/**
 * Resolve the textual name of a `ModuleExportName` node (`Identifier` or string
 * literal form, e.g. `import { "map" as m }`).
 */
const exportedName = (node) =>
	node.type === 'Literal' ? node.value : node.name;

/**
 * Build the replacement source for a fully-named lodash import declaration.
 * `import { map, trim as t, type Dictionary } from 'lodash'`
 *   → `import map from 'lodash/map';\nimport t from 'lodash/trim';\n...`
 */
const buildSpecificImports = (specifiers, declarationIsTypeOnly) => {
	const lines = specifiers.map((specifier) => {
		const imported = exportedName(specifier.imported);
		const local = specifier.local.name;
		const isTypeOnly = declarationIsTypeOnly || specifier.importKind === 'type';
		const keyword = isTypeOnly ? 'import type' : 'import';

		return `${keyword} ${local} from '${LODASH_PACKAGE}/${imported}';`;
	});

	return lines.join('\n');
};

export const preferSpecificLodashImports = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Enforce targeted `lodash/<helper>` imports instead of importing the full `lodash` package.',
			recommended: true,
		},
		fixable: 'code',
		schema: [],
		messages: {
			named:
				"Import lodash helpers individually (e.g. `import map from 'lodash/map'`) instead of from the full `lodash` package.",
			whole:
				"Do not import the whole `lodash` package; import the specific helpers you need (e.g. `import map from 'lodash/map'`).",
		},
	},
	create(context) {
		return {
			ImportDeclaration(node) {
				if (node.source.value !== LODASH_PACKAGE) {
					return;
				}

				const { specifiers } = node;
				const allNamed =
					specifiers.length > 0 &&
					specifiers.every((specifier) => specifier.type === 'ImportSpecifier');

				// Unambiguous, auto-fixable case: every specifier is a named import.
				if (allNamed) {
					context.report({
						node,
						messageId: 'named',
						fix(fixer) {
							const replacement = buildSpecificImports(
								specifiers,
								node.importKind === 'type',
							);

							return fixer.replaceText(node, replacement);
						},
					});

					return;
				}

				// Default / namespace / mixed / side-effect-only imports: the correct
				// sub-paths cannot be inferred mechanically, so report message-only.
				context.report({ node, messageId: 'whole' });
			},
		};
	},
};
