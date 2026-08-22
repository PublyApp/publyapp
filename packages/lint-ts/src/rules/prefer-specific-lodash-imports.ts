import type { Context, Fix, Fixer, Visitor } from '@oxlint/plugins';

/**
 * `publy/prefer-specific-lodash-imports` — enforce targeted `lodash/<helper>`
 * imports over importing the full `lodash` package.
 *
 * Rule shape (oxlint 1.79.0): `{ meta, create(context) }` returning an AST
 * visitor. See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 */

const LODASH_PACKAGE = 'lodash';

/**
 * Resolve the textual name of a `ModuleExportName` node (`Identifier` or string
 * literal form, e.g. `import { "map" as m }`).
 */
const exportedName = (node: {
	type: string;
	name?: string;
	value?: unknown;
}): string =>
	(node.type === 'Literal' ? (node.value as string) : node.name) ?? '';

const getContextFilename = (context: Context): string => {
	if (typeof context.filename === 'string') {
		return context.filename;
	}
	return '';
};

/**
 * Build the replacement source for a fully-named, VALUE-only lodash import
 * declaration.
 */
interface LodashImportSpecifier {
	type: string;
	imported: { type: string; name?: string; value?: unknown };
	local: { name: string };
}

const buildSpecificImports = (
	specifiers: LodashImportSpecifier[],
	importPathExtension: string,
): string => {
	const lines = specifiers.map((specifier) => {
		const imported = exportedName(specifier.imported);
		const local = specifier.local.name;
		return `import ${local} from '${LODASH_PACKAGE}/${imported}${importPathExtension}';`;
	});
	return lines.join('\n');
};

export const preferSpecificLodashImports = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Enforce targeted `lodash/<helper>` imports instead of importing the full `lodash` package.',
			recommended: true,
		},
		fixable: 'code' as const,
		schema: [],
		messages: {
			named:
				"Import lodash helpers individually (e.g. `import map from 'lodash/map'`) instead of from the full `lodash` package.",
			whole:
				'Do not import the whole `lodash` package; import only the helpers you need from their individual `lodash/<helper>` paths.',
		},
	},
	create(context: Context): Visitor {
		return {
			ImportDeclaration(node) {
				if (node.source.value !== LODASH_PACKAGE) {
					return;
				}

				const specifiers = node.specifiers;
				const hasOnlyNamedSpecifiers =
					specifiers.length > 0 &&
					specifiers.every((s) => s.type === 'ImportSpecifier');

				const isTypeOnlyDecl = node.importKind === 'type';

				if (isTypeOnlyDecl || !hasOnlyNamedSpecifiers) {
					context.report({ node, messageId: 'whole' });
					return;
				}

				const typedSpecifiers =
					specifiers as unknown as LodashImportSpecifier[];

				const hasTypeOnlySpecifier = typedSpecifiers.some(
					(s: LodashImportSpecifier & { importKind?: string }) =>
						s.importKind === 'type',
				);

				const filename = getContextFilename(context);
				const importPathExtension = filename.endsWith('.mjs') ? '.js' : '';

				if (hasTypeOnlySpecifier) {
					context.report({ node, messageId: 'named' });
					return;
				}

				context.report({
					node,
					messageId: 'named',
					fix(fixer: Fixer): Fix[] {
						const replacement = buildSpecificImports(
							typedSpecifiers,
							importPathExtension,
						);
						return [fixer.replaceText(node, replacement)];
					},
				});
			},
		};
	},
};
