import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

const isConditionalExpression = (
	node: ESTree.Expression | null | undefined,
): node is ESTree.ConditionalExpression =>
	node !== null && node !== undefined && node.type === 'ConditionalExpression';

const isIdentifier = (
	node: ESTree.Expression | null | undefined,
	name: string,
): node is ESTree.IdentifierReference =>
	node !== null &&
	node !== undefined &&
	node.type === 'Identifier' &&
	node.name === name;

const isBlockStatement = (
	node: ESTree.Expression | ESTree.Statement,
): node is ESTree.BlockStatement => node.type === 'BlockStatement';

export const preferEarlyReturn = {
	meta: {
		type: 'problem' as const,
		docs: {
			description:
				'Prefer an explicit `if` + early `return` over a ternary expression whose value is returned directly via a `return` statement, or assigned to a variable that is immediately returned.',
			recommended: false,
		},
		schema: [],
		messages: {
			preferEarlyReturn:
				'Prefer an explicit `if` + early `return` over this ternary expression. This ternary is returned directly (or assigned then returned) — replace it with a guard clause for readability (see #1666).',
		},
	},
	create(context: Context): Visitor {
		// oxlint ESTree: `VariableDeclaration` appears directly in
		// `BlockStatement.body` — no `VariableStatement` wrapper.
		const checkBodyStatements = (statements: ESTree.Statement[]): void => {
			for (let index = 0; index < statements.length; index += 1) {
				const stmt = statements[index];

				// Case 1: `return cond ? a : b;`
				if (
					stmt.type === 'ReturnStatement' &&
					isConditionalExpression(stmt.argument)
				) {
					context.report({
						node: stmt.argument,
						messageId: 'preferEarlyReturn',
					});
				}

				// Case 2: `const x = cond ? a : b; return x;`
				if (stmt.type === 'VariableDeclaration') {
					const declaration = stmt.declarations[0];
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

		return {
			FunctionDeclaration(node) {
				if (node.body) checkBodyStatements(node.body.body);
			},
			FunctionExpression(node) {
				if (node.body) checkBodyStatements(node.body.body);
			},
			ArrowFunctionExpression(node) {
				if (isBlockStatement(node.body)) checkBodyStatements(node.body.body);
			},
		};
	},
};
