import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

const isConditionalExpression = (
	node: ESTree.Expression | null | undefined,
): node is ESTree.ConditionalExpression =>
	node !== null && node !== undefined && node.type === 'ConditionalExpression';

const isIdentifier = (
	node: ESTree.Expression | null | undefined,
	name: string,
): node is ESTree.Identifier =>
	node !== null &&
	node !== undefined &&
	node.type === 'Identifier' &&
	node.name === name;

export const preferEarlyReturn = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Prefer an explicit `if` + early `return` over a ternary expression whose value is returned directly, or assigned to a variable that is immediately returned.',
			recommended: false,
		},
		schema: [],
		messages: {
			preferEarlyReturn:
				'Prefer an explicit `if` + early `return` over this ternary expression. This ternary is returned directly (or assigned then returned) — replace it with a guard clause for readability (see #1666).',
		},
	},
	create(context: Context): Visitor {
		const checkReturn = (
			node: ESTree.ReturnStatement | null | undefined,
		): void => {
			if (node && isConditionalExpression(node.argument)) {
				context.report({ node: node.argument, messageId: 'preferEarlyReturn' });
			}
		};

		const checkBodyStatements = (statements: ESTree.Statement[]): void => {
			for (let index = 0; index < statements.length; index += 1) {
				const stmt = statements[index];
				checkReturn(stmt as ESTree.ReturnStatement);

				// oxlint ESTree: `VariableDeclaration` appears directly in
				// `BlockStatement.body` — no `VariableStatement` wrapper.
				if (stmt.type === 'VariableDeclaration') {
					const declaration = (stmt as ESTree.VariableDeclaration)
						.declarations[0];
					if (
						declaration &&
						declaration.id.type === 'Identifier' &&
						isConditionalExpression(declaration.init)
					) {
						const varName = declaration.id.name;
						const nextStmt = statements[index + 1];
						if (
							nextStmt &&
							nextStmt.type === 'ReturnStatement' &&
							isIdentifier(nextStmt.argument, varName)
						) {
							context.report({
								node: declaration.init,
								messageId: 'preferEarlyReturn',
							});
						}
					}
				}
			}
		};

		const walk = (node: ESTree.Node): void => {
			if (node.type === 'FunctionDeclaration' && node.body) {
				checkBodyStatements(node.body.body);
			} else if (node.type === 'FunctionExpression' && node.body) {
				checkBodyStatements(node.body.body);
			} else if (node.type === 'ArrowFunctionExpression') {
				if (node.body.type === 'BlockStatement') {
					checkBodyStatements(node.body.body);
				} else if (isConditionalExpression(node.body)) {
					context.report({
						node: node.body,
						messageId: 'preferEarlyReturn',
					});
				}
			}

			for (const key of Object.keys(node)) {
				if (
					key === 'parent' ||
					key === 'loc' ||
					key === 'range' ||
					key === 'start' ||
					key === 'end'
				) {
					continue;
				}
				const value = (node as Record<string, unknown>)[key];
				if (Array.isArray(value)) {
					for (const child of value) {
						if (child && typeof child === 'object' && 'type' in child) {
							walk(child as ESTree.Node);
						}
					}
				} else if (value && typeof value === 'object' && 'type' in value) {
					walk(value as ESTree.Node);
				}
			}
		};

		return {
			Program(node) {
				walk(node);
			},
		};
	},
};
