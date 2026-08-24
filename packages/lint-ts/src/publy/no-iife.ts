import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

/**
 * `publy/no-iife` — disallow immediately invoked function expressions
 * (IIFEs).
 *
 * Rationale (issue #1303): an IIFE hides imperative branching inside an
 * expression. Extract a named function, or compute the value with preceding
 * statements instead.
 *
 * Detection: a `CallExpression`/`NewExpression` whose callee is a function
 * literal (`ArrowFunctionExpression` | `FunctionExpression`), ignoring
 * transparent wrappers around the callee — `ParenthesizedExpression`,
 * `TSAsExpression`, `TSSatisfiesExpression`, `TSNonNullExpression`,
 * `TSTypeAssertion`, and `TSInstantiationExpression`. The comma-operator form
 * `(0, fn)()` (`SequenceExpression` callee, last expression taken) is peeled
 * too, so `(0, () => {})()` is reported. A function literal used as a tagged-
 * template tag (`(() => x)`t`)`) is an immediate invocation as well and is
 * reported via `TaggedTemplateExpression`.
 */

/**
 * Peels transparent syntactic wrappers off a callee expression until the
 * underlying expression is reached. Returns the input unchanged when there
 * are no wrappers.
 */
export const unwrapCallee = (node: ESTree.Expression): ESTree.Expression => {
	let current: ESTree.Expression = node;
	for (;;) {
		switch (current.type) {
			case 'ParenthesizedExpression':
			case 'TSAsExpression':
			case 'TSSatisfiesExpression':
			case 'TSNonNullExpression':
			case 'TSTypeAssertion': {
				current = current.expression;
				continue;
			}
			case 'TSInstantiationExpression': {
				// oxlint's ESTree typings omit the `expression` child on this
				// node; one intersect assert names the missing member without a
				// chain through unknown.
				current = (
					current as ESTree.Expression & {
						expression: ESTree.Expression;
					}
				).expression;
				continue;
			}
			case 'SequenceExpression': {
				// Comma-operator callee `(0, fn)()` — the effective callee is the
				// LAST expression in the sequence.
				const { expressions } = current;
				current = expressions[expressions.length - 1];
				continue;
			}
			default: {
				return current;
			}
		}
	}
};

const isFunctionLiteral = (node: ESTree.Expression): boolean =>
	node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';

/**
 * True when the callee is (behind transparent wrappers) an inline function
 * literal being invoked immediately.
 */
export const isIifeCallee = (callee: ESTree.Expression): boolean =>
	isFunctionLiteral(unwrapCallee(callee));
export const noIife = {
	meta: {
		type: 'suggestion' as const,
		docs: {
			description:
				'Disallow immediately invoked function expressions (IIFEs); extract a named function or compute the value with preceding statements instead.',
			recommended: false,
		},
		schema: [],
		messages: {
			noIife:
				'Avoid immediately invoked function expressions (IIFEs); extract a named function or compute the value with preceding statements.',
		},
	},
	create(context: Context): Visitor {
		const reportIfIife = (callee: ESTree.Expression, node: ESTree.Node) => {
			if (!isIifeCallee(callee)) {
				return;
			}

			context.report({ node, messageId: 'noIife' });
		};

		return {
			CallExpression(node) {
				reportIfIife(node.callee, node);
			},
			NewExpression(node) {
				reportIfIife(node.callee, node);
			},
			TaggedTemplateExpression(node) {
				// `` (() => x)`t` `` — a function literal invoked immediately as a
				// tagged-template tag.
				reportIfIife(node.tag, node);
			},
		};
	},
};
