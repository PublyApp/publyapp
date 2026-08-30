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
		// A ternary that fits on a single line is idiomatically readable
		// (e.g. a sort comparator `return a < b ? -1 : 1;`). Such
		// single-line ternaries are allowed; everything else is still
		// flagged — the paired invalid cases below keep the rule live.
		const isSingleLineTernary = (node: ESTree.ConditionalExpression): boolean =>
			node.loc.start.line === node.loc.end.line;

		const reportIfMultiLine = (node: ESTree.ConditionalExpression): void => {
			if (!isSingleLineTernary(node)) {
				context.report({
					loc: {
						start: {
							line: node.loc.start.line,
							column: node.loc.start.column,
						},
						end: {
							line: node.loc.end.line,
							column: node.loc.end.column,
						},
					},
					messageId: 'preferEarlyReturn',
				});
			}
		};

		const checkBodyStatements = (statements: ESTree.Statement[]): void => {
			for (let index = 0; index < statements.length; index += 1) {
				const stmt = statements[index];

				// Case 2: `const x = cond ? a : b; return x;`
				if (stmt.type === 'VariableDeclaration') {
					const declaration = stmt.declarations[0];
					if (
						declaration &&
						// Type narrowing, not a behaviour guard: no test can watch this clause.
						// Removing it changes nothing the rule reports — for a destructured
						// target `declaration.id.name` is `undefined`, and `isIdentifier(argument,
						// undefined)` is always false because `Identifier.name` is always a string.
						// Verified twice on #1718: by mutation (79/79 green with and without it,
						// including a deliberately added destructured case) and by enumerating
						// every node type `VariableDeclarator.id` can hold. It stays because it is
						// what lets TypeScript reach `.name` below — do not delete it as dead code.
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
							reportIfMultiLine(declaration.init);
						}
					}
				}
			}
		};

		return {
			// Case 1: `return cond ? a : b;` — the visitor reaches every
			// `ReturnStatement` at any depth, so nesting is handled for free.
			ReturnStatement(node) {
				if (isConditionalExpression(node.argument)) {
					reportIfMultiLine(node.argument);
				}
			},

			// Case 2: `const x = cond ? a : b; return x;` — the visitor reaches
			// every `BlockStatement` at any depth, so nesting is handled for
			// free. Each block examines its own adjacent statement pairs.
			BlockStatement(node) {
				checkBodyStatements(node.body);
			},

			// `SwitchCase.consequent` is a statement list but not a `BlockStatement`,
			// so it needs its own visit to catch ternaries inside `case` clauses.
			SwitchCase(node) {
				checkBodyStatements(node.consequent);
			},
		};
	},
};
