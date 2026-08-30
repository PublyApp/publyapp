/**
 * Module-evaluation order analysis for the func-style guard (issue #1898).
 *
 * `func-style: ["error", "expression"]` forces every non-method function to
 * be an arrow (or function) EXPRESSION bound to a const/let. A `function`
 * declaration is hoisted; a const arrow is not. A conversion that moves the
 * declaration but not the call sites can therefore produce code where a
 * module-level call reaches the binding BEFORE its declaration initialises:
 * a `ReferenceError: Cannot access 'x' before initialization` at module load
 * time — invisible to the compiler, to the typechecker, and often to tests.
 *
 * This module statically finds those call sites. For every source file it:
 *
 *   1. parses the file with ts-morph's vendored TypeScript compiler (pure
 *      syntax analysis, no program, no type resolution — fast enough to run
 *      over the whole production tree).
 *   2. collects every module-level `const`/`let` binding whose initializer is
 *      a function expression (arrow or function expression) — the exact
 *      binding class #1834's conversions produce. Hoisted `function`
 *      declarations are collected too, as intermediate hops only (they can
 *      never be a TDZ target).
 *   3. walks the module-level statements in source order and finds every
 *      call site that EXECUTES AT MODULE EVALUATION TIME (direct statements,
 *      declarator initializers, immediately-executed blocks, loop
 *      conditions, class heritage/decorators/static blocks, enum member
 *      initializers, tagged templates, top-level await...), descending into
 *      bodies that also execute at module-evaluation time: immediately-invoked
 *      function bodies (IIFEs, including their parameter defaults) and getter
 *      bodies triggered by a property access at module-eval time. It never
 *      descends into a deferred function body (function/arrow/method bodies
 *      that are not immediately invoked, class field initializers, parameter
 *      defaults of functions called later).
 *   4. when such a call site invokes a tracked binding, it walks that
 *      binding's body the same way, transitively: an arrow called during
 *      module evaluation runs its whole body during module evaluation, so
 *      the reviewer's construction — `const isEntry = () => toPosixPath(x)`
 *      with `isEntry()` invoked before `const toPosixPath` is initialised —
 *      is caught too.
 *   5. reports a violation when a call executes before the initializer of
 *      the binding it resolves to has run, comparing positions within the
 *      correct execution scope: a binding in the module scope or in a scope
 *      that encloses an invoked body is compared against the OUTERMOST
 *      invocation position (the moment the body runs during module
 *      evaluation), a binding in a body-local scope against the local call
 *      position.
 *
 * The walker is deliberately scope-aware. A block-scoped binding that
 * shadows a later module-level name is never reported (the call resolves to
 * the closer binding, not the module one), and a call inside a deferred body
 * is never reported even when the body textually precedes the declaration.
 *
 * Deferred boundaries (never reported): function/arrow/method/accessor/
 * constructor bodies that are not immediately invoked, class field initialisers
 * (deferred to instantiation), getter/setter bodies (deferred to property
 * access — only tracked when the getter is on a module-level const object
 * that is accessed at module-eval time), parameter defaults of functions that
 * are not themselves immediately invoked.
 *
 * Known gaps — deliberate, declared for review (see the adverse-mutation
 * section of the PR). The #1956 call shapes describe block in
 * func-style-config.test.ts ("one red test per declared gap") is the single
 * source of truth for which call shapes the guard follows; the bullets below
 * name only what remains open:
 * - plain REFERENCES before the declaration (`const x = f;` — a TDZ read,
 *   not a call) are not reported; the guard's mandate is the call defect.
 * - bindings whose initializer is not directly a function expression are
 *   not tracked (`const f = [() => {}][0]`, re-exports); the bind chain
 *   `const f = g.bind(null)` IS tracked (#1956 shape 2).
 * - invocations through sequence callees (`(0, f)()`) are not followed as
 *   hops; member callees on module-level const object literals ARE followed
 *   (#1956 shape 1).
 * - getter bodies on class declarations, class instances, or computed
 *   property names are not tracked (only object-literal getters on
 *   module-level const bindings are analysed).
 * - decorator expressions that are member-access calls (`@ns.dec`) are
 *   not resolved to a named binding (only bare identifier decorators are
 *   treated as calls).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ts } from 'ts-morph';

export interface ModuleOrderViolation {
	/** Relative path of the file, as passed to `analyzeModuleOrder`. */
	file: string;
	/** 1-based line of the offending call site. */
	line: number;
	/** 1-based column of the offending call site. */
	column: number;
	/** Name of the binding that is called before its initialisation. */
	callee: string;
	/** 1-based line of the binding's declaration. */
	declaredAtLine: number;
	/** 1-based column of the binding's declaration. */
	declaredAtColumn: number;
	/** `direct` for a call directly in module-evaluation code; `transitive`
	 * for a call reached through an immediately-invoked function body. */
	kind: 'direct' | 'transitive';
	/** The invocation path to the call, outermost first (e.g.
	 * `["isEntry", "toPosixPath"]` when `isEntry()` is invoked at module
	 * level and its body calls `toPosixPath`). */
	chain: string[];
}

type FunctionLike =
	| ts.ArrowFunction
	| ts.FunctionExpression
	| ts.FunctionDeclaration;

/** A getter accessor tracked on an object literal assigned to a const binding.
 * When the const is accessed for that property at module-eval time, the
 * getter body runs at module-eval time. */
interface ObjectGetter {
	/** The GetAccessor node whose body runs when the property is read. */
	node: ts.GetAccessorDeclaration;
}

/** A lexical binding that holds a function value (tracked by the guard). */
interface FunctionBinding {
	name: string;
	/** Position of the binding name in the source file. */
	declPos: number;
	/** Function declarations are hoisted: never a TDZ target, but usable as
	 * intermediate hops in an invocation chain. */
	hoisted: boolean;
	/** The function node whose body runs when the binding is invoked. */
	node: FunctionLike;
}

/** A lexical binding of any kind (tracked function or shadowing name). */
interface ScopeBinding {
	name: string;
	pos: number;
	/** True when the binding is a `const`/`let` holding a function value, or
	 * a (hoisted) function declaration. */
	fn: boolean;
	/** Function declarations are hoisted, const/let arrows are not. */
	hoisted?: boolean;
	/** The function node, when `fn` is true. */
	node?: FunctionLike;
}

interface Scope {
	names: Map<string, ScopeBinding>;
}

/** ts-morph's SourceFile type omits parseDiagnostics, but its vendored
 * compiler always populates it (same widening as
 * apps/front/scripts/guards/check-design-system.mts). */
interface SourceFileWithParseDiagnostics extends ts.SourceFile {
	parseDiagnostics: readonly ts.Diagnostic[];
}

/** The file extensions the module-order scan analyses (oxlint's scope). */
type SourceFileExtension =
	| '.ts'
	| '.mts'
	| '.cts'
	| '.tsx'
	| '.js'
	| '.mjs'
	| '.cjs'
	| '.jsx';

const SCRIPT_KIND_BY_EXTENSION = {
	'.ts': ts.ScriptKind.TS,
	'.mts': ts.ScriptKind.TS,
	'.cts': ts.ScriptKind.TS,
	'.tsx': ts.ScriptKind.TSX,
	'.js': ts.ScriptKind.JS,
	'.mjs': ts.ScriptKind.JS,
	'.cjs': ts.ScriptKind.JS,
	'.jsx': ts.ScriptKind.JSX,
} satisfies Record<SourceFileExtension, ts.ScriptKind>;

const scriptKindForFile = (fileName: string): ts.ScriptKind =>
	SCRIPT_KIND_BY_EXTENSION[
		fileName.slice(
			fileName.lastIndexOf('.'),
		) as keyof typeof SCRIPT_KIND_BY_EXTENSION
	] ?? ts.ScriptKind.TS;

/** Raised when the guard's input cannot be analysed — an unanalysable file
 * must fail the guard loudly, never count as healthy by silence. */
export class ModuleOrderAnalysisError extends Error {
	readonly file: string;
	readonly diagnostics: string[];

	constructor(file: string, diagnostics: string[]) {
		super(`cannot analyse module order in ${file}: ${diagnostics.join('; ')}`);
		this.name = 'ModuleOrderAnalysisError';
		this.file = file;
		this.diagnostics = diagnostics;
	}
}

const isDeclared = (node: ts.Node): boolean =>
	ts.canHaveModifiers(node) &&
	(ts.getModifiers(node) ?? []).some(
		(modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword,
	);

const position = (node: ts.Node): number => node.getStart();

const functionInitializer = (
	initializer: ts.Expression | undefined,
): FunctionLike | undefined => {
	if (initializer === undefined) {
		return undefined;
	}
	if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
		return initializer;
	}
	return undefined;
};

/** The target of a `.bind(...)` call on a plain identifier object
 * (`g.bind(null)`): calling the bound function invokes `g`, so a call whose
 * callee is the bind call resolves to `g` (and a binding initialised with
 * it is a hop to `g`). Only the property-access form on an identifier is
 * followed; computed `g['bind']` stays unresolved (declared boundary). */
const resolveBindTarget = (call: ts.CallExpression): string | undefined => {
	if (
		!ts.isPropertyAccessExpression(call.expression) ||
		!ts.isIdentifier(call.expression.name) ||
		call.expression.name.text !== 'bind' ||
		!ts.isIdentifier(call.expression.expression)
	) {
		return undefined;
	}
	return call.expression.expression.text;
};

/** Alias target of a module binding initializer that hops to another
 * function binding (the binding's value is a bound copy of the target).
 * #1956 shape 2 recognises the bind chain `const f = g.bind(null)`; the
 * plain-identifier alias (`const g = f`) is shape 6 and lands separately. */
const bindAliasTarget = (
	initializer: ts.Expression | undefined,
): string | undefined => {
	if (initializer === undefined) {
		return undefined;
	}
	const unwrapped = unwrapParens(initializer);
	if (!ts.isCallExpression(unwrapped)) {
		return undefined;
	}
	return resolveBindTarget(unwrapped);
};

const addScopeDeclaration = (
	scope: Scope,
	name: string,
	namePos: number,
	fn: FunctionLike | undefined,
	hoisted: boolean,
): void => {
	scope.names.set(name, {
		name,
		pos: namePos,
		fn: fn !== undefined,
		hoisted: fn !== undefined ? hoisted : false,
		node: fn,
	});
};

/**
 * Records the parameters of a function-like node as scope bindings. Parameters
 * are NOT statements (`ts.isVariableStatement`/`isFunctionDeclaration`/
 * `isClassDeclaration` all reject them), so `collectDeclarations` cannot
 * accept them. They DO introduce names into the surrounding scope, exactly
 * like variable declarations do — a reference to the parameter name must
 * resolve through this scope when the body runs. This helper exists so the
 * intent ("a function parameter, not a statement, introduces a name") is
 * named in the type and the call site cannot be mistaken for a statement
 * collection that would later read `.statements` on a parameter.
 */
const collectParameterDeclarations = (
	parameters: readonly ts.ParameterDeclaration[],
	scope: Scope,
): void => {
	for (const parameter of parameters) {
		if (!ts.isIdentifier(parameter.name)) {
			continue;
		}
		addScopeDeclaration(
			scope,
			parameter.name.text,
			position(parameter.name),
			undefined,
			false,
		);
	}
};

/**
 * Collects the direct lexical declarations of the statements in `statements`
 * into `scope`. Bindings are collected BEFORE the statements are walked, so
 * resolution is static (TDZ semantics: a `const` binding exists for the whole
 * block even textually before its declaration line).
 */
const collectDeclarations = (
	statements: readonly ts.Statement[],
	scope: Scope,
): void => {
	for (const statement of statements) {
		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name)) {
					continue;
				}
				addScopeDeclaration(
					scope,
					declaration.name.text,
					position(declaration.name),
					functionInitializer(declaration.initializer),
					false,
				);
			}
		} else if (
			ts.isFunctionDeclaration(statement) &&
			statement.name !== undefined
		) {
			addScopeDeclaration(
				scope,
				statement.name.text,
				position(statement.name),
				statement,
				true,
			);
		} else if (
			ts.isClassDeclaration(statement) &&
			statement.name !== undefined
		) {
			addScopeDeclaration(
				scope,
				statement.name.text,
				position(statement.name),
				undefined,
				false,
			);
		}
	}
};

/** The lexical context of the binding that was resolved. */
type ResolvedBinding =
	| { kind: 'scope'; scopeIndex: number; binding: ScopeBinding }
	| { kind: 'module'; binding: FunctionBinding }
	| { kind: 'none' };

const resolveBinding = (
	name: string,
	scopes: Scope[],
	context: WalkContext,
): ResolvedBinding => {
	for (let index = scopes.length - 1; index >= 0; index--) {
		const binding = scopes[index]!.names.get(name);
		if (binding !== undefined) {
			return { kind: 'scope', scopeIndex: index, binding };
		}
	}
	// Module bindings, following bind-alias hops (`const f = g.bind(null)`
	// makes `f` a hop to `g`) with a cycle guard. The reported binding is
	// the ultimate target; a call before its initializer ran is the defect.
	const visited = new Set<string>();
	let current = name;
	while (!visited.has(current)) {
		visited.add(current);
		const moduleBinding = context.moduleBindings.get(current);
		if (moduleBinding !== undefined) {
			return { kind: 'module', binding: moduleBinding };
		}
		const next = context.aliasTargets.get(current);
		if (next === undefined) {
			return { kind: 'none' };
		}
		current = next;
	}
	return { kind: 'none' };
};

interface WalkContext {
	file: string;
	sourceFile: SourceFileWithParseDiagnostics;
	moduleBindings: Map<string, FunctionBinding>;
	/** For each module-level const binding whose initializer is an object
	 * literal, maps property name → getter accessor node. When the const is
	 * read for that property at module-eval time, the getter body runs and is
	 * walked for TDZ violations. */
	getterIndex: Map<string, Map<string, ObjectGetter>>;
	/** For each module-level const/let binding whose initializer is an object
	 * literal, the literal itself. Member callee resolution (`obj.run()`,
	 * `obj['run']()`) reads the function-expression property off it. */
	objectLiteralInitializers: Map<string, ts.ObjectLiteralExpression>;
	/** Module bindings whose initializer is a hop to another function
	 * binding instead of a function expression itself. The bind chain
	 * (`const f = g.bind(null)`) records name → target; a call through
	 * `f` resolves to `g` (shape 2). The plain-identifier alias
	 * (`const g = f`) is shape 6 and is recorded separately there. */
	aliasTargets: Map<string, string>;
	violations: ModuleOrderViolation[];
}

const isFunctionLikeBodyNode = (node: ts.Node): boolean =>
	ts.isFunctionDeclaration(node) ||
	ts.isFunctionExpression(node) ||
	ts.isArrowFunction(node) ||
	ts.isMethodDeclaration(node) ||
	ts.isGetAccessorDeclaration(node) ||
	ts.isSetAccessorDeclaration(node) ||
	node.kind === ts.SyntaxKind.Constructor;

const walkImmediate = (
	node: ts.Node,
	context: WalkContext,
	scopes: Scope[],
	bodyRootIndex: number,
	executionPos: number,
	chain: string[],
	visitedBindings: Set<string>,
): void => {
	// Deferred boundaries: a function-like body never runs during the
	// current module-evaluation moment; everything nested inside it
	// (including parameter defaults) is deferred with it.
	if (isFunctionLikeBodyNode(node)) {
		return;
	}

	if (ts.isVariableStatement(node)) {
		// Each declarator's initializer executes, in order, before the
		// binding is initialised; a later declarator in the SAME statement
		// can therefore already see an earlier one.
		for (const declaration of node.declarationList.declarations) {
			if (declaration.initializer !== undefined) {
				walkImmediate(
					declaration.initializer,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
		}
		return;
	}

	if (ts.isExpressionStatement(node)) {
		walkImmediate(
			node.expression,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	if (ts.isBlock(node)) {
		const scope: Scope = { names: new Map() };
		collectDeclarations(node.statements, scope);
		scopes.push(scope);
		for (const statement of node.statements) {
			walkImmediate(
				statement,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
		scopes.pop();
		return;
	}

	if (ts.isIfStatement(node)) {
		walkImmediate(
			node.expression,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		walkImmediate(
			node.thenStatement,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		if (node.elseStatement !== undefined) {
			walkImmediate(
				node.elseStatement,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
		return;
	}

	if (ts.isForStatement(node)) {
		const scope: Scope = { names: new Map() };
		if (
			node.initializer !== undefined &&
			ts.isVariableDeclarationList(node.initializer)
		) {
			for (const declaration of node.initializer.declarations) {
				if (!ts.isIdentifier(declaration.name)) {
					continue;
				}
				addScopeDeclaration(
					scope,
					declaration.name.text,
					position(declaration.name),
					functionInitializer(declaration.initializer),
					false,
				);
			}
		}
		// The for-head initialiser expression evaluates immediately.
		if (node.initializer !== undefined && ts.isExpression(node.initializer)) {
			walkImmediate(
				node.initializer,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
		if (node.condition !== undefined) {
			walkImmediate(
				node.condition,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
		if (node.incrementor !== undefined) {
			walkImmediate(
				node.incrementor,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
		scopes.push(scope);
		walkImmediate(
			node.statement,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		scopes.pop();
		return;
	}

	if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
		const scope: Scope = { names: new Map() };
		if (ts.isVariableDeclarationList(node.initializer)) {
			for (const declaration of node.initializer.declarations) {
				if (!ts.isIdentifier(declaration.name)) {
					continue;
				}
				addScopeDeclaration(
					scope,
					declaration.name.text,
					position(declaration.name),
					functionInitializer(declaration.initializer),
					false,
				);
			}
		}
		// The iterable expression evaluates immediately.
		walkImmediate(
			node.expression,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		scopes.push(scope);
		walkImmediate(
			node.statement,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		scopes.pop();
		return;
	}

	if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
		walkImmediate(
			node.expression,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		walkImmediate(
			node.statement,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	if (ts.isSwitchStatement(node)) {
		walkImmediate(
			node.expression,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		// The switch body is a single lexical scope (JS semantics).
		const scope: Scope = { names: new Map() };
		for (const clause of node.caseBlock.clauses) {
			collectDeclarations(clause.statements, scope);
		}
		scopes.push(scope);
		for (const clause of node.caseBlock.clauses) {
			if (ts.isCaseClause(clause) && clause.expression !== undefined) {
				walkImmediate(
					clause.expression,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
			for (const statement of clause.statements) {
				walkImmediate(
					statement,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
		}
		scopes.pop();
		return;
	}

	if (ts.isTryStatement(node)) {
		walkImmediate(
			node.tryBlock,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		if (node.catchClause !== undefined) {
			const scope: Scope = { names: new Map() };
			if (
				node.catchClause.variableDeclaration !== undefined &&
				ts.isIdentifier(node.catchClause.variableDeclaration.name)
			) {
				const name = node.catchClause.variableDeclaration.name.text;
				scope.names.set(name, { name, pos: 0, fn: false });
			}
			scopes.push(scope);
			walkImmediate(
				node.catchClause.block,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
			scopes.pop();
		}
		if (node.finallyBlock !== undefined) {
			walkImmediate(
				node.finallyBlock,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
		return;
	}

	if (ts.isThrowStatement(node) || ts.isReturnStatement(node)) {
		if (node.expression !== undefined) {
			walkImmediate(
				node.expression,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
		return;
	}

	if (ts.isLabeledStatement(node)) {
		walkImmediate(
			node.statement,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
		walkClass(
			node,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	if (ts.isEnumDeclaration(node)) {
		for (const member of node.members) {
			if (ts.isComputedPropertyName(member.name)) {
				walkImmediate(
					member.name.expression,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
			if (member.initializer !== undefined) {
				walkImmediate(
					member.initializer,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
		}
		return;
	}

	if (
		ts.isModuleDeclaration(node) &&
		node.body !== undefined &&
		!isDeclared(node)
	) {
		// A non-ambient namespace compiles to an IIFE that runs at module
		// load: its body executes at module-evaluation time.
		if (ts.isModuleBlock(node.body)) {
			const scope: Scope = { names: new Map() };
			collectDeclarations(node.body.statements, scope);
			scopes.push(scope);
			for (const statement of node.body.statements) {
				walkImmediate(
					statement,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
			scopes.pop();
		}
		return;
	}

	if (ts.isPropertyAccessExpression(node)) {
		// A property access can trigger a getter accessor defined on an
		// object literal assigned to a module-level const. The getter body
		// runs at the moment of access — module-evaluation time when the
		// access is at module level.
		walkGetterAccess(
			node,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
		handleInvocation(
			node.expression,
			node.arguments === undefined ? [] : node.arguments,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	if (ts.isTaggedTemplateExpression(node)) {
		// A tagged template is a call in the TDZ sense: the tag expression
		// executes at this moment.
		handleInvocation(
			node.tag,
			[],
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	// Default: walk every child. Function-like children are pruned at the top
	// of this function; scoped constructs are handled by their own cases.
	node.forEachChild((child) => {
		walkImmediate(
			child,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
	});
};

/** Walks the getters on an object literal initializer (if any), registering
 * them in the context's `getterIndex` keyed by the const binding name.
 * When the const is later accessed at module-eval time, the getter body
 * runs and is walked for TDZ violations. */
const collectGetters = (
	bindingName: string,
	initializer: ts.Expression | undefined,
	context: WalkContext,
): void => {
	if (initializer === undefined || !ts.isObjectLiteralExpression(initializer)) {
		return;
	}
	const gettersForBinding = context.getterIndex.get(bindingName);
	if (gettersForBinding === undefined) {
		context.getterIndex.set(bindingName, new Map());
	}
	const target = context.getterIndex.get(bindingName)!;
	for (const property of initializer.properties) {
		if (
			ts.isGetAccessorDeclaration(property) &&
			property.name !== undefined &&
			ts.isIdentifier(property.name)
		) {
			target.set(property.name.text, { node: property });
		}
	}
};

/** Walks a property access that may trigger an object-literal getter. A
 * getter `get value() { ... }` on an object literal assigned to a module-level
 * const runs when the property is read. If the read happens at module-eval
 * time, the getter body runs at module-eval time and must be checked for TDZ.
 *
 * The getter body is a deferred function-like node, so it is pruned by
 * `walkImmediate` — we walk it explicitly here, using the scopes surrounding
 * the property-access site and the access position as the execution moment. */
const walkGetterAccess = (
	node: ts.PropertyAccessExpression,
	context: WalkContext,
	scopes: Scope[],
	bodyRootIndex: number,
	executionPos: number,
	chain: string[],
	visitedBindings: Set<string>,
): void => {
	// Only track `obj.prop` patterns where `obj` is a simple identifier that
	// resolves to a module-level const binding with tracked getters. But we
	// ALWAYS walk the object expression — it may contain a call (e.g.
	// `toPosixPath(x).endsWith('y')`) whose callee needs checking.
	if (!ts.isIdentifier(node.expression)) {
		walkImmediate(
			node.expression,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}
	const objectName = node.expression.text;
	// The getterIndex only ever holds module-level const bindings whose
	// initializer is an object literal with getter properties. A simple
	// presence check is sufficient — if the key exists, the object was
	// registered during module-binding collection.
	const gettersForBinding = context.getterIndex.get(objectName);
	if (gettersForBinding === undefined) {
		return;
	}
	const property = node.name;
	if (property === undefined || !ts.isIdentifier(property)) {
		return;
	}
	const propertyName = property.text;
	const getter = gettersForBinding.get(propertyName);
	if (getter === undefined) {
		// No getter on this binding/property — but the object expression
		// (`obj`) may itself contain a call that needs checking (e.g.
		// `toPosixPath(x).endsWith('y')` where `.endsWith` is a non-tracked
		// member access). Walk the object expression so nested invocation
		// callees are still analysed.
		walkImmediate(
			node.expression,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	// The getter body runs at the moment of property access.
	const getterScope: Scope = { names: new Map() };
	collectParameterDeclarations(getter.node.parameters, getterScope);
	scopes.push(getterScope);
	for (const statement of getter.node.body?.statements ?? []) {
		walkImmediate(
			statement,
			context,
			scopes,
			scopes.length,
			executionPos,
			chain,
			visitedBindings,
		);
	}
	scopes.pop();
};

/** Resolves an object-literal member access (`obj.run` / `obj['run']`) to
 * the function-expression property on a module-level const object literal.
 * When the member is invoked at module-eval time, that body runs at
 * module-eval time, so it is walked as an immediate invocation. Only
 * identifier/string-literal property names and function-expression values
 * are followed; computed indexes and method-definition shorthand stay
 * unresolved (declared boundary, not silently claimed as covered). */
const resolveObjectLiteralMethod = (
	access: ts.PropertyAccessExpression | ts.ElementAccessExpression,
	context: WalkContext,
): { name: string; fn: FunctionLike } | undefined => {
	if (!ts.isIdentifier(access.expression)) {
		return undefined;
	}
	const propertyName =
		ts.isPropertyAccessExpression(access) && ts.isIdentifier(access.name)
			? access.name.text
			: ts.isElementAccessExpression(access) &&
				  (ts.isStringLiteral(access.argumentExpression) ||
						ts.isNoSubstitutionTemplateLiteral(access.argumentExpression))
				? access.argumentExpression.text
				: undefined;
	if (propertyName === undefined) {
		return undefined;
	}
	const objectLiteral = context.objectLiteralInitializers.get(
		access.expression.text,
	);
	if (objectLiteral === undefined) {
		return undefined;
	}
	for (const property of objectLiteral.properties) {
		if (!ts.isPropertyAssignment(property)) {
			continue;
		}
		const matches =
			(ts.isIdentifier(property.name) && property.name.text === propertyName) ||
			(ts.isStringLiteral(property.name) &&
				property.name.text === propertyName);
		if (!matches) {
			continue;
		}
		const fn = functionInitializer(property.initializer);
		if (fn === undefined) {
			return undefined;
		}
		return {
			name: `${access.expression.text}.${propertyName}`,
			fn,
		};
	}
	return undefined;
};

/** Walks a decorator expression at class-definition time. A decorator
 * `@expr` is sugar for `expr(class)` — the decorator function executes at
 * class definition time (module-evaluation time when the class is at module
 * level). For a bare identifier decorator, the identifier IS the callee, so
 * `handleInvocation` resolves it against the scope chain and reports a TDZ
 * violation when the referenced const arrow is declared after the class.
 * For call-expression decorators (`@run()`) and member-expression decorators
 * (`@ns.dec`), the existing `handleInvocation` machinery reaches them through
 * the callee expression. */
const walkDecorator = (
	decorator: ts.Decorator,
	context: WalkContext,
	scopes: Scope[],
	bodyRootIndex: number,
	executionPos: number,
	chain: string[],
	visitedBindings: Set<string>,
): void => {
	handleInvocation(
		decorator.expression,
		[],
		context,
		scopes,
		bodyRootIndex,
		executionPos,
		chain,
		visitedBindings,
	);
};

/** Walks the module-evaluation-time parts of a class: decorators, heritage
 * clauses, static blocks, and computed member names. Field initialisers and
 * method bodies run at instantiation/call time, never at module load. */
const walkClass = (
	node: ts.ClassDeclaration | ts.ClassExpression,
	context: WalkContext,
	scopes: Scope[],
	bodyRootIndex: number,
	executionPos: number,
	chain: string[],
	visitedBindings: Set<string>,
): void => {
	for (const decorator of ts.getDecorators(node) ?? []) {
		walkDecorator(
			decorator,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
	}
	for (const clause of node.heritageClauses ?? []) {
		for (const type of clause.types) {
			walkImmediate(
				type.expression,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
	}
	for (const member of node.members) {
		if (ts.isClassStaticBlockDeclaration(member)) {
			// Static blocks run when the class definition is evaluated.
			const scope: Scope = { names: new Map() };
			collectDeclarations(member.body.statements, scope);
			scopes.push(scope);
			for (const statement of member.body.statements) {
				walkImmediate(
					statement,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
			scopes.pop();
			continue;
		}
		if (ts.canHaveDecorators(member)) {
			for (const decorator of ts.getDecorators(member) ?? []) {
				walkDecorator(
					decorator,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
		}
		const name = member.name;
		if (name !== undefined && ts.isComputedPropertyName(name)) {
			walkImmediate(
				name.expression,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
		// Field initialisers and method/accessor/constructor bodies are
		// deferred to instantiation/call time.
	}
};

/** Unwraps parenthesized expressions to get the inner expression. */
const unwrapParens = (node: ts.Expression): ts.Expression => {
	let current = node;
	while (ts.isParenthesizedExpression(current)) {
		current = current.expression;
	}
	return current;
};

/** Type guard: a callee expression (post-unwrap of parens) is the function
 * expression of an IIFE — either a function expression or an arrow function.
 * The caller must already have stripped any parenthesized wrappers; the
 * surrounding `isParenthesizedExpression` nodes carry no function body of
 * their own. Returning a type guard lets the compiler narrow the callee
 * to `ts.ArrowFunction | ts.FunctionExpression` so `walkIIFE` accepts it
 * without an `as` cast. */
export const isImmediatelyInvokedCallee = (
	node: ts.Expression,
): node is ts.ArrowFunction | ts.FunctionExpression => {
	return ts.isFunctionExpression(node) || ts.isArrowFunction(node);
};

/** Walks the body of an immediately-invoked anonymous function (an IIFE). The
 * body executes at the moment the call occurs — which, when the IIFE is at
 * module-evaluation time, is module-evaluation time. Parameter defaults and
 * body statements are walked with the lexical scopes surrounding the IIFE's
 * declaration site. The `executionPos` stays the outermost invocation position.
 *
 * This is separate from `invokeBinding` because an IIFE has no named binding
 * to track — it is an anonymous function expression that is immediately
 * invoked, not a const arrow resolved through the scope chain. */
const walkIIFE = (
	functionNode: ts.FunctionExpression | ts.ArrowFunction,
	context: WalkContext,
	scopes: Scope[],
	bodyRootIndex: number,
	executionPos: number,
	chain: string[],
	visitedBindings: Set<string>,
): void => {
	const key = `${position(functionNode)}:${executionPos}`;
	if (visitedBindings.has(key)) {
		return;
	}
	visitedBindings.add(key);

	// Parameter defaults run when the function is invoked — which, for an
	// immediately-invoked anonymous function, is module-evaluation time.
	for (const parameter of functionNode.parameters) {
		if (parameter.initializer !== undefined) {
			walkImmediate(
				parameter.initializer,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
	}

	if (ts.isArrowFunction(functionNode)) {
		if (ts.isBlock(functionNode.body)) {
			const scope: Scope = { names: new Map() };
			collectDeclarations(functionNode.body.statements, scope);
			scopes.push(scope);
			for (const statement of functionNode.body.statements) {
				walkImmediate(
					statement,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
			scopes.pop();
		} else {
			walkImmediate(
				functionNode.body,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
	} else if (functionNode.body !== undefined) {
		const scope: Scope = { names: new Map() };
		collectDeclarations(functionNode.body.statements, scope);
		scopes.push(scope);
		for (const statement of functionNode.body.statements) {
			walkImmediate(
				statement,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
		}
		scopes.pop();
	}
};

/** Handles a call/construct/tag invocation whose callee expression is
 * `calleeExpression`. Resolves a plain-identifier callee against the lexical
 * scopes, reports the violation when the binding is not yet initialised, and
 * follows the invoked binding's body (chain analysis). */
const handleInvocation = (
	calleeExpression: ts.Expression,
	argumentsList: readonly ts.Expression[],
	context: WalkContext,
	scopes: Scope[],
	bodyRootIndex: number,
	executionPos: number,
	chain: string[],
	visitedBindings: Set<string>,
): void => {
	if (ts.isIdentifier(calleeExpression)) {
		handleResolvedIdentifier(
			calleeExpression.text,
			position(calleeExpression),
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	// IIFE: the callee is a function expression (possibly wrapped in
	// parentheses). Its body (and parameter defaults) executes at this
	// moment — module-evaluation time when the IIFE is at module level.
	// The local binding carries the narrowed type from the type guard,
	// so `walkIIFE` accepts it without a cast.
	const fn = unwrapParens(calleeExpression);
	if (isImmediatelyInvokedCallee(fn)) {
		walkIIFE(
			fn,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
		return;
	}

	// Bind-call callee: `g.bind(null)()` — the bound function invokes `g`
	// when called, so the call resolves to `g`. #1956 shape 2 (inline form;
	// the aliased form is resolved at binding-collection time).
	const bindCallee = unwrapParens(calleeExpression);
	if (ts.isCallExpression(bindCallee)) {
		const boundTarget = resolveBindTarget(bindCallee);
		if (boundTarget !== undefined) {
			handleResolvedIdentifier(
				boundTarget,
				position(calleeExpression),
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
			for (const argument of bindCallee.arguments) {
				walkImmediate(
					argument,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
			return;
		}
	}

	// Member callee: `obj.run()` / `obj['run']()` where `obj` is a
	// module-level const object literal and the property a
	// function-expression value. The method body runs at the moment of the
	// call — module-evaluation time when the call is at module level — so
	// it is walked as an immediate invocation (inner calls to later
	// bindings are reported transitively).
	const memberCallee = unwrapParens(calleeExpression);
	if (
		ts.isPropertyAccessExpression(memberCallee) ||
		ts.isElementAccessExpression(memberCallee)
	) {
		const method = resolveObjectLiteralMethod(memberCallee, context);
		if (method !== undefined) {
			invokeBinding(
				method.fn,
				method.name,
				0,
				context,
				scopes,
				position(calleeExpression),
				chain,
				visitedBindings,
			);
			walkImmediate(
				memberCallee.expression,
				context,
				scopes,
				bodyRootIndex,
				executionPos,
				chain,
				visitedBindings,
			);
			for (const argument of argumentsList) {
				walkImmediate(
					argument,
					context,
					scopes,
					bodyRootIndex,
					executionPos,
					chain,
					visitedBindings,
				);
			}
			return;
		}
	}

	// Member/expression callees can still carry immediately-executed
	// parts (e.g. `obj[f()]()`); walk them, but not as a tracked
	// invocation.
	walkImmediate(
		calleeExpression,
		context,
		scopes,
		bodyRootIndex,
		executionPos,
		chain,
		visitedBindings,
	);

	for (const argument of argumentsList) {
		walkImmediate(
			argument,
			context,
			scopes,
			bodyRootIndex,
			executionPos,
			chain,
			visitedBindings,
		);
	}
};

const handleResolvedIdentifier = (
	name: string,
	callPos: number,
	context: WalkContext,
	scopes: Scope[],
	bodyRootIndex: number,
	executionPos: number,
	chain: string[],
	visitedBindings: Set<string>,
): void => {
	const resolved = resolveBinding(name, scopes, context);
	if (resolved.kind === 'none') {
		return;
	}

	let base: number;
	let bindingNode: FunctionLike | undefined;
	let bindingDeclPos: number;
	let hoisted = false;
	let bindingName: string;
	if (resolved.kind === 'scope') {
		const { scopeIndex, binding } = resolved;
		// A binding living in a scope that encloses the currently-walked
		// invoked body is compared against the moment the body runs (the
		// outermost invocation position); a binding in a body-local scope
		// against the local call position.
		base = scopeIndex < bodyRootIndex ? executionPos : callPos;
		bindingNode = binding.node;
		bindingDeclPos = binding.pos;
		hoisted = binding.hoisted === true;
		bindingName = binding.name;
	} else {
		const { binding } = resolved;
		// Module bindings: the execution moment of a DIRECT call is the call
		// site itself (module order is textual order); inside an invoked body
		// it is the outermost invocation position.
		base = chain.length === 0 ? callPos : executionPos;
		bindingNode = binding.node;
		bindingDeclPos = binding.declPos;
		hoisted = binding.hoisted;
		bindingName = binding.name;
	}

	if (bindingNode !== undefined && !hoisted && bindingDeclPos > base) {
		reportViolation(context, callPos, bindingName, bindingDeclPos, chain);
	}

	if (bindingNode !== undefined) {
		// The body of an invoked binding runs at the outermost DIRECT call
		// position (a direct call executes at its own textual position, even
		// inside a module-level loop/block); deeper chain hops keep that same
		// moment.
		const triggerPos = chain.length === 0 ? callPos : executionPos;
		invokeBinding(
			bindingNode,
			bindingName,
			resolved.kind === 'scope' ? resolved.scopeIndex : 0,
			context,
			scopes,
			triggerPos,
			chain,
			visitedBindings,
		);
	}
};

const reportViolation = (
	context: WalkContext,
	callPos: number,
	callee: string,
	declaredPos: number,
	chain: string[],
): void => {
	const callLocation =
		context.sourceFile.getLineAndCharacterOfPosition(callPos);
	const declaredLocation =
		context.sourceFile.getLineAndCharacterOfPosition(declaredPos);
	context.violations.push({
		file: context.file,
		line: callLocation.line + 1,
		column: callLocation.character + 1,
		callee,
		declaredAtLine: declaredLocation.line + 1,
		declaredAtColumn: declaredLocation.character + 1,
		kind: chain.length > 0 ? 'transitive' : 'direct',
		chain: [...chain],
	});
};

/** Walks the body of an immediately-invoked binding. The body sees the
 * lexical scopes that surround the binding's DECLARATION, not the scopes at
 * the call site. The execution moment stays the outermost invocation. */
const invokeBinding = (
	functionNode: FunctionLike,
	name: string,
	scopeIndex: number,
	context: WalkContext,
	scopes: Scope[],
	executionPos: number,
	chain: string[],
	visitedBindings: Set<string>,
): void => {
	const key = `${scopeIndex}:${name}:${position(functionNode)}`;
	if (visitedBindings.has(key)) {
		return;
	}
	visitedBindings.add(key);

	const bodyScopes = scopes.slice(0, scopeIndex + 1);
	const nextChain = [...chain, name];

	// Parameter defaults run when the binding is invoked — which, for an
	// immediately-invoked binding, is module-evaluation time.
	for (const parameter of functionNode.parameters) {
		if (parameter.initializer !== undefined) {
			walkImmediate(
				parameter.initializer,
				context,
				bodyScopes,
				bodyScopes.length,
				executionPos,
				nextChain,
				visitedBindings,
			);
		}
	}

	// Arrow bodies can be a concise expression, and declaration bodies can be
	// absent (overload signatures); walk whatever actually executes. The body
	// root is itself a scope: `const inner = () => f(); inner();` inside an
	// invoked body must resolve `inner` through it.
	if (ts.isArrowFunction(functionNode)) {
		if (ts.isBlock(functionNode.body)) {
			const scope: Scope = { names: new Map() };
			collectDeclarations(functionNode.body.statements, scope);
			bodyScopes.push(scope);
			for (const statement of functionNode.body.statements) {
				walkImmediate(
					statement,
					context,
					bodyScopes,
					bodyScopes.length,
					executionPos,
					nextChain,
					visitedBindings,
				);
			}
			bodyScopes.pop();
		} else {
			walkImmediate(
				functionNode.body,
				context,
				bodyScopes,
				bodyScopes.length,
				executionPos,
				nextChain,
				visitedBindings,
			);
		}
	} else if (functionNode.body !== undefined) {
		const scope: Scope = { names: new Map() };
		collectDeclarations(functionNode.body.statements, scope);
		bodyScopes.push(scope);
		for (const statement of functionNode.body.statements) {
			walkImmediate(
				statement,
				context,
				bodyScopes,
				bodyScopes.length,
				executionPos,
				nextChain,
				visitedBindings,
			);
		}
		bodyScopes.pop();
	}
};

/** Parses `source` and returns the module-order call violations, or throws a
 * `ModuleOrderAnalysisError` when the source cannot be parsed. */
export const analyzeModuleOrder = (
	file: string,
	source: string,
): ModuleOrderViolation[] => {
	const sourceFile = ts.createSourceFile(
		file,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKindForFile(file),
	) as SourceFileWithParseDiagnostics;
	if (sourceFile.parseDiagnostics.length > 0) {
		throw new ModuleOrderAnalysisError(
			file,
			sourceFile.parseDiagnostics.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
			),
		);
	}

	const context: WalkContext = {
		file,
		sourceFile,
		moduleBindings: new Map(),
		getterIndex: new Map(),
		objectLiteralInitializers: new Map(),
		aliasTargets: new Map(),
		violations: [],
	};

	// Module-level bindings are collected BEFORE the walk so resolution is
	// static (TDZ semantics: a `const` binding exists for the whole module,
	// even textually before its declaration line).
	for (const statement of sourceFile.statements) {
		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name)) {
					continue;
				}
				const fn = functionInitializer(declaration.initializer);
				if (
					declaration.initializer !== undefined &&
					ts.isObjectLiteralExpression(declaration.initializer)
				) {
					// Object literals are not function bindings, but member
					// callee resolution (`obj.run()`) needs the literal.
					context.objectLiteralInitializers.set(
						declaration.name.text,
						declaration.initializer,
					);
				}
				const aliasTarget = bindAliasTarget(declaration.initializer);
				if (aliasTarget !== undefined) {
					context.aliasTargets.set(declaration.name.text, aliasTarget);
				}
				if (fn === undefined) {
					// Still collect getters from non-function initializers (object
					// literals with getter properties).
					collectGetters(
						declaration.name.text,
						declaration.initializer,
						context,
					);
					continue;
				}
				context.moduleBindings.set(declaration.name.text, {
					name: declaration.name.text,
					declPos: position(declaration.name),
					hoisted: false,
					node: fn,
				});
				collectGetters(declaration.name.text, declaration.initializer, context);
			}
		} else if (
			ts.isFunctionDeclaration(statement) &&
			statement.name !== undefined
		) {
			context.moduleBindings.set(statement.name.text, {
				name: statement.name.text,
				declPos: position(statement.name),
				hoisted: true,
				node: statement,
			});
		}
	}

	const scopes: Scope[] = [];
	for (const statement of sourceFile.statements) {
		if (isDeclared(statement)) {
			// `declare` emits nothing at runtime; nothing executes.
			continue;
		}
		walkImmediate(
			statement,
			context,
			scopes,
			0,
			position(statement),
			[],
			new Set(),
		);
	}

	// Deduplicate (the same violation can be reached through several chains).
	const seen = new Set<string>();
	const unique: ModuleOrderViolation[] = [];
	for (const violation of context.violations) {
		const key = `${violation.line}:${violation.column}:${violation.callee}:${violation.chain.join('>')}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		unique.push(violation);
	}
	return unique;
};

const SOURCE_EXTENSIONS = new Set<string>([
	'.ts',
	'.mts',
	'.cts',
	'.tsx',
	'.js',
	'.mjs',
	'.cjs',
	'.jsx',
] satisfies SourceFileExtension[]);

// Mirrors the `ignorePatterns` of the root .oxlintrc.json (same list the
// suppression scanner in func-style-config.test.ts uses) so the real-tree
// leg analyses exactly the files oxlint lints. The config leg of the guard
// pins additions to that list, so this copy cannot silently drift: a new
// ignorePattern would trip the baseline test before it could hide a file
// from this scanner.
const IGNORED_PREFIXES = [
	'**/node_modules',
	'**/build',
	'**/dist',
	'**/.turbo',
	'**/.husky/_',
	'**/.react-router',
	'**/routeTree.gen.ts',
	'packages/client-ts',
	'apps/api/openapi',
	'apps/api/Migrations',
	'apps/api/bin',
	'.config/dotnet-tools.json',
	'apps/api/Generated',
	'.dump',
	'.mcp.json',
	'.claude/settings.local.json',
	'.agent/**',
	'.agents/**',
	'.claude/**',
	'.codex/**',
	'.continue/**',
	'.cursor/**',
	'.gemini/**',
	'.opencode/**',
	'.pi/**',
	'.roo/**',
	'.windsurf/**',
	'packages/lint-ts/src/anti-slop/**',
	'.tmp',
];

const matchIgnoredPattern = (pattern: string, path: string): boolean => {
	const normalizedPattern = pattern.replace(/\*\*/g, '').replace(/^\//, '');
	if (pattern.startsWith('**/')) {
		return (
			path.endsWith(normalizedPattern) || path.includes(normalizedPattern + '/')
		);
	}
	if (pattern.endsWith('/**')) {
		return path.startsWith(pattern.slice(0, -2));
	}
	if (pattern.includes('**')) {
		return path.includes(pattern.replace(/\*\*/g, ''));
	}
	return path === normalizedPattern || path.endsWith('/' + normalizedPattern);
};

const isSourceIgnored = (relativePath: string): boolean =>
	IGNORED_PREFIXES.some((pattern) =>
		matchIgnoredPattern(pattern, relativePath),
	);

/** Enumerates the source files under `root` that oxlint lints, as relative
 * paths (forward slashes). Skips gitignored surfaces and the generated
 * client. A file that does not exist or cannot be read fails loudly (the
 * caller must surface the error, never silently skip). */
const collectSourceFiles = (root: string): string[] => {
	const files: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			const relative = full
				.slice(root.length)
				.replace(/^[/\\]/, '')
				.replace(/\\/g, '/');
			if (isSourceIgnored(relative)) {
				continue;
			}
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			const extension = entry.name.slice(entry.name.lastIndexOf('.'));
			if (SOURCE_EXTENSIONS.has(extension)) {
				files.push(relative);
			}
		}
	};
	walk(root);
	return files;
};

export interface ModuleOrderScanResult {
	violations: ModuleOrderViolation[];
	scannedFileCount: number;
}

/** Scans every source file under `root` and returns the module-order
 * violations, ordered by file then line. A file that cannot be read or
 * parsed raises `ModuleOrderAnalysisError` naming the file — the real-tree
 * leg must never count an unanalysable file as healthy. */
export const scanModuleOrderViolations = (
	root: string,
): ModuleOrderScanResult => {
	const files = collectSourceFiles(root);
	const violations: ModuleOrderViolation[] = [];
	for (const relative of files) {
		const source = readFileSync(join(root, relative), 'utf8');
		violations.push(...analyzeModuleOrder(relative, source));
	}
	return { violations, scannedFileCount: files.length };
};
