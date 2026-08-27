/**
 * Shared AST type guards for PublyApp lint rules.
 *
 * Imports the real ESTree node types from `@oxlint/plugins` and provides
 * narrowing helpers so rule code can navigate the AST with proper types
 * instead of escape hatches.
 */
import type { ESTree } from '@oxlint/plugins';

// ---------------------------------------------------------------------------
// Identifier guards
// ---------------------------------------------------------------------------

type IdentifierNode =
	| ESTree.IdentifierName
	| ESTree.IdentifierReference
	| ESTree.BindingIdentifier;

/** Narrow to any Identifier variant (name-bearing node with `type === "Identifier"`). */
export const isIdentifier = (
	node: ESTree.Node | null | undefined,
): node is IdentifierNode =>
	node !== null && node !== undefined && node.type === 'Identifier';

// ---------------------------------------------------------------------------
// Literal guards
// ---------------------------------------------------------------------------

/** Narrow to a Literal whose `value` is a string. */
export const isStringLiteral = (node: ESTree.Node): node is ESTree.StringLiteral =>
	node.type === 'Literal' &&
	typeof (node as ESTree.StringLiteral).value === 'string';

/** Narrow to a Literal whose `value` is `null`. */
export const isNullLiteral = (node: ESTree.Node): node is ESTree.NullLiteral =>
	node.type === 'Literal' && (node as ESTree.NullLiteral).value === null;

// ---------------------------------------------------------------------------
// Expression narrowers
// ---------------------------------------------------------------------------

/** True when `node` is a `MemberExpression` (any variant). */
export const isMemberExpression = (
	node: ESTree.Expression,
): node is ESTree.MemberExpression => node.type === 'MemberExpression';

/** True when `node` is a `CallExpression`. */
export const isCallExpression = (
	node: ESTree.Expression,
): node is ESTree.CallExpression => node.type === 'CallExpression';

// ---------------------------------------------------------------------------
// Static-member narrowing helpers
// ---------------------------------------------------------------------------

/**
 * After a `callee.type === 'MemberExpression'` guard, narrow to the
 * `StaticMemberExpression` variant (non-computed, property is IdentifierName).
 */
export const isStaticMemberExpression = (
	node: ESTree.MemberExpression,
): node is ESTree.StaticMemberExpression =>
	!node.computed && node.type === 'MemberExpression';

// ---------------------------------------------------------------------------
// Statement / declaration narrowers
// ---------------------------------------------------------------------------

/** True when `node` is an `ImportDeclaration`. */
export const isImportDeclaration = (
	node: ESTree.Node,
): node is ESTree.ImportDeclaration => node.type === 'ImportDeclaration';

/** True when `node` is any of the function-like declaration types. */
export const isFunctionNode = (node: ESTree.Node): node is ESTree.Function =>
	node.type === 'FunctionDeclaration' ||
	node.type === 'FunctionExpression' ||
	node.type === 'ArrowFunctionExpression' ||
	node.type === 'TSDeclareFunction' ||
	node.type === 'TSEmptyBodyFunctionExpression';

// ---------------------------------------------------------------------------
// Fixer-compatible nodes
// ---------------------------------------------------------------------------

/**
 * The oxlint `Fixer.replaceText` / `insertTextBefore` methods accept any object
 * with a `range: [number, number]` field. All ESTree nodes satisfy this through
 * `Span`, but the Fixer signature expects a loose structural match. This helper
 * extracts the range from any Span-extended node for use with fixer methods.
 */
export const nodeRange = (node: ESTree.Node): [number, number] => node.range;
