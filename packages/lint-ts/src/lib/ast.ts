/**
 * Shared AST type guards for PublyApp lint rules.
 *
 * Imports the real ESTree node types from `@oxlint/plugins` and provides
 * narrowing helpers so rule code can navigate the AST with proper types
 * instead of escape hatches.
 */
import type { ESTree } from '@oxlint/plugins';

// ---------------------------------------------------------------------------
// Statement / declaration narrowers
// ---------------------------------------------------------------------------

/** True when `node` is an `ImportDeclaration`. */
export const isImportDeclaration = (
	node: ESTree.Node,
): node is ESTree.ImportDeclaration => node.type === 'ImportDeclaration';
