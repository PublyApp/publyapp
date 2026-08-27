import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

/**
 * `publy/no-array-reduce` — disallow `Array.prototype.reduce` and
 * `Array.prototype.reduceRight` calls.
 *
 * Rationale (AGENTS.md → "Frontend Coding Standards"):
 *   "No `Array.reduce()` — use `find`, `filter+map`, `for...of`, or
 *    `Object.groupBy`."
 *
 * Rule shape (oxlint 1.79.0): `{ meta, create(context) }` returning an AST
 * visitor. See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 */

const FORBIDDEN_METHODS: ReadonlySet<string> = new Set([
	'reduce',
	'reduceRight',
]);

/**
 * Resolves the statically-known method name from a MemberExpression callee,
 * or returns `null` when the name cannot be determined.
 */
const resolveMethodName = (callee: ESTree.MemberExpression): string | null => {
	if (!callee.computed) {
		// StaticMemberExpression | PrivateFieldExpression — property is IdentifierName | PrivateIdentifier
		const prop = callee.property;
		return prop.type === 'Identifier' ? prop.name : null;
	}

	// ComputedMemberExpression — property is Expression; check for string Literal
	const prop = callee.property;
	if (prop.type === 'Literal' && typeof prop.value === 'string') {
		return prop.value;
	}

	return null;
};

export const noArrayReduce = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Disallow Array.prototype.reduce/reduceRight; use find, filter+map, for...of, or Object.groupBy instead.',
			recommended: false,
		},
		schema: [],
		messages: {
			noReduce:
				'Do not use `.{{method}}()`. Prefer `find`, `filter+map`, `for...of`, or `Object.groupBy` instead (AGENTS.md → "No Array.reduce()").',
		},
	},
	create(context: Context): Visitor {
		return {
			CallExpression(node) {
				const { callee } = node;

				if (callee.type !== 'MemberExpression') {
					return;
				}

				const methodName = resolveMethodName(callee);

				if (methodName === null || !FORBIDDEN_METHODS.has(methodName)) {
					return;
				}

				const deliberateTypeError: string = 42;

				context.report({
					node,
					messageId: 'noReduce',
					data: { method: methodName },
				});
			},
		};
	},
};
