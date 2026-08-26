import path from 'node:path';
import process from 'node:process';

import { SyntaxKind } from 'typescript/unstable/ast';
import type { Node, SourceFile } from 'typescript/unstable/ast';
import {
	isArrayLiteralExpression,
	isAsExpression,
	isArrowFunction,
	isBindingElement,
	isBinaryExpression,
	isCallExpression,
	isConditionalExpression,
	isElementAccessExpression,
	isExportAssignment,
	isFunctionExpression,
	isIdentifier,
	isInterfaceDeclaration,
	isNonNullExpression,
	isObjectBindingPattern,
	isObjectLiteralExpression,
	isParenthesizedExpression,
	isPropertyAccessExpression,
	isPropertyAssignment,
	isPropertyDeclaration,
	isSatisfiesExpression,
	isShorthandPropertyAssignment,
	isSpreadAssignment,
	isSpreadElement,
	isStringLiteral,
	isTypeAliasDeclaration,
	isTypeAssertion,
	isVariableDeclaration,
} from 'typescript/unstable/ast/is';
import { API, SymbolFlags } from 'typescript/unstable/sync';
import type {
	Checker,
	Symbol as TsSymbol,
	Type,
} from 'typescript/unstable/sync';

import {
	classifyCopyAttribution,
	decodeSourceMapSegments,
	findEmittedCallExtents,
	resolveRenderedMapSource,
	spanKeyOf,
} from './context-source-map.mts';
import type {
	CopyAttribution,
	SourceSpan,
	RawSourceMap,
} from './context-source-map.mts';

// Re-exported so the public-API type probe in
// check-context-chunk-isolation.test.mts (which compiles a real consumer
// against this module's surface, not a hand-written .d.mts) can name
// `SourceSpan` from this module. The hand-written .d.mts was retired in
// #1449 (scripts/ -> tools/ move); the public type surface now flows
// through the source. Without `export type`, the probe's
// `type SourceSpan` import fails with TS2459 ("declares 'SourceSpan'
// locally, but it is not exported"), which is what surfaced on the
// front test lane at 02d2db493.
export type { CopyAttribution, SourceSpan };

// The retired hand-written .d.mts exported this shape; types now live in
// source and are re-exported here so consumers keep a single import surface.

/**
 * One discovered React context creation site in the scanned program.
 *
 * `mintSpans` is present on every entry `findReactContextDeclarations`
 * returns; it stays optional in the type because the violation checker and
 * the inventory comparison accept hand-fed declarations whose spans were
 * trimmed (the original JS read them through `?? []`).
 */
export interface ContextDeclaration {
	name: string;
	sourceFile: string;
	mintSpans?: SourceSpan[] | undefined;
}

/** One entry of a hand-maintained context inventory the build must match. */
export interface ContextInventoryEntry {
	name: string;
	sourceFile: string;
}

/** A chunk-shaped output entry the guard inspects in `generateBundle`. */
export interface ClientChunk {
	type: 'chunk';
	fileName: string;
	name?: string | undefined;
	modules: Record<string, unknown>;
	code?: string | undefined;
	map?: RawSourceMap | null | undefined;
}

/**
 * An asset-shaped output entry the guard may delete when it owns it.
 * `fileName` and `name` mirror what real bundler-emitted assets carry; the
 * forced-map cleanup keys its delete on `chunk.name + '.map'`, never on
 * these fields, so they stay informational.
 */
interface OutputAsset {
	type: 'asset';
	fileName?: string | undefined;
	name?: string | undefined;
	source: unknown;
}

export type BundleOutputEntry = ClientChunk | OutputAsset;

interface ResolvedSegment {
	genCol: number;
	genLine: number;
	origCol: number;
	origLine: number;
	source: string;
}

type ChunkAnalysis =
	| { hasMap: false }
	| {
			hasMap: true;
			segments: ResolvedSegment[];
			emittedCallExtents: ReturnType<typeof findEmittedCallExtents> | undefined;
	  };

interface ModuleChunkLink {
	chunk: ClientChunk;
	chunkName: string;
	moduleId: string;
}

interface ModuleCopyFacts {
	chunkName: string;
	hasMap: boolean;
	precise: boolean;
	tiedSpanKeys: Set<string>;
}

interface FamilyCopyVerdict {
	attributable: boolean;
	chunkName: string;
	hasMap: boolean;
	minted: boolean;
}

/** The client environment's resolved `build` options the guard reads and mutates. */
interface ClientEnvironmentBuildConfig {
	sourcemap?: boolean | 'hidden' | 'inline' | undefined;
	rolldownOptions?:
		| {
				output?:
					| {
							sourcemapFileNames?:
								| string
								| ((chunk: unknown) => string)
								| undefined;
					  }
					| undefined;
		  }
		| undefined;
}

/** The slice of the user's Vite config the guard inspects to find the client build options. */
interface GuardViteUserConfig {
	build?: ClientEnvironmentBuildConfig | undefined;
	environments?:
		| Record<
				string,
				{ build?: ClientEnvironmentBuildConfig | undefined } | undefined
		  >
		| undefined;
}

const REACT_TYPE_DECLARATION = /[/\\]@types[/\\]react[/\\]index\.d\.ts$/;
// Curated from TanStack's source-derived sibling transforms. Add new families
// explicitly so unknown query modules keep failing closed.
const TANSTACK_SOURCE_SIBLING_VIRTUAL_MODULE =
	/[?&](?:tsr-(?:shared|split)|tss-hydrate)=/;
const SOURCE_MODULE_EXTENSION = /\.[cm]?[jt]sx?$/;

const normalizeModuleId = (moduleId: string): string =>
	path.normalize(moduleId).replaceAll('\\', '/');

const sourceFileForModuleId = (moduleId: string): string =>
	normalizeModuleId(moduleId.split('?')[0] ?? '');

const symbolForExpression = (
	checker: Checker,
	expression: Node,
): TsSymbol | undefined =>
	isElementAccessExpression(expression)
		? checker.getSymbolAtLocation(expression.argumentExpression)
		: checker.getSymbolAtLocation(expression);

const symbolForBindingElement = (
	checker: Checker,
	bindingElement: Node,
): TsSymbol | undefined => {
	if (!isBindingElement(bindingElement)) {
		return undefined;
	}
	const bindingPattern: Node = bindingElement.parent;
	const declaration: Node = bindingPattern.parent;
	if (
		!isObjectBindingPattern(bindingPattern) ||
		!isVariableDeclaration(declaration) ||
		!declaration.initializer ||
		!bindingElement.name
	) {
		return undefined;
	}

	const type: Type | undefined = checker.getTypeAtLocation(
		declaration.initializer,
	);
	return type
		? checker.getPropertyOfType(
				type,
				(bindingElement.propertyName ?? bindingElement.name).getText(),
			)
		: undefined;
};

const isContextFactoryAdapterCall = (expression: Node): boolean =>
	isCallExpression(expression) &&
	isPropertyAccessExpression(expression.expression) &&
	['apply', 'bind', 'call'].includes(expression.expression.name.getText());

const isReactNamespace = (
	checker: Checker,
	expression: Node,
	reactCreateContext: TsSymbol,
): boolean => {
	const type: Type | undefined = checker.getTypeAtLocation(expression);
	return type
		? checker
				.getPropertiesOfType(type)
				.some((property) => property.id === reactCreateContext.id)
		: false;
};

const assertStaticReactElementAccess = (
	checker: Checker,
	expression: Node,
	reactCreateContext: TsSymbol,
	sourceFileName: string,
): void => {
	if (
		isElementAccessExpression(expression) &&
		!isStringLiteral(expression.argumentExpression) &&
		(isReactNamespace(checker, expression.expression, reactCreateContext) ||
			dynamicObjectMayContainReactContextFactory(
				checker,
				expression.expression,
				reactCreateContext,
			))
	) {
		throw new Error(
			`Context chunk isolation guard cannot prove a dynamic React element access in ${sourceFileName} is not createContext.`,
		);
	}
};

/** Symbols the context scan needs from React's declaration file. */
interface ReactContextSymbols {
	contextType: TsSymbol;
	createContext: TsSymbol;
	reactModule: TsSymbol | undefined;
}

const findReactContextSymbols = (
	program: {
		getSourceFileNames(): readonly string[];
		getSourceFile(file: string): SourceFile | undefined;
	},
	checker: Checker,
	tsconfigPath: string,
): ReactContextSymbols => {
	const reactDeclaration = program
		.getSourceFileNames()
		.map((fileName) => program.getSourceFile(fileName))
		.find((sourceFile) =>
			REACT_TYPE_DECLARATION.test(sourceFile?.fileName ?? ''),
		);

	if (!reactDeclaration) {
		throw new Error(
			`Context chunk isolation guard could not find React type declarations (@types/react/index.d.ts) in the program for ${tsconfigPath}.`,
		);
	}

	const reactModule = checker.getSymbolAtLocation(reactDeclaration);
	const reactExports = reactModule
		? checker.getExportsOfModule(reactModule)
		: [];
	const createContext = reactExports.find(
		(symbol) => symbol.name === 'createContext',
	);

	if (!createContext) {
		throw new Error(
			`Context chunk isolation guard could not resolve React.createContext in ${reactDeclaration.fileName}.`,
		);
	}

	const contextType = reactExports.find((symbol) => symbol.name === 'Context');
	if (!contextType) {
		throw new Error(
			`Context chunk isolation guard could not resolve React's Context type in ${reactDeclaration.fileName}.`,
		);
	}

	return {
		contextType,
		createContext,
		reactModule,
	};
};

// A context value is whatever the checker says is React's Context<T>, not
// whatever callee happened to produce it. Factories such as
// createStrictContext live in another module and resolve through the type
// system, so a binding whose type is Context<T> — or a branded subtype whose
// heritage chain reaches Context<T> — is a context regardless of how many
// indirection hops separated it from createContext.
const typeContainsReactContext = (
	checker: Checker,
	type: Type | undefined,
	reactContextType: TsSymbol,
	seenSymbolIds: Set<number> = new Set(),
): boolean => {
	if (!type) {
		return false;
	}

	if (type.isUnionType() || type.isIntersectionType()) {
		return (type.getTypes() ?? []).some((member) =>
			typeContainsReactContext(
				checker,
				member,
				reactContextType,
				seenSymbolIds,
			),
		);
	}

	return symbolContainsReactContext(
		checker,
		type.getSymbol(),
		reactContextType,
		seenSymbolIds,
	);
};

// Assignability by declared shape, not symbol identity: a type is React's
// Context when its own symbol is React's Context, when it is a type alias of
// one, or when its interface heritage chain reaches React's Context through
// any import/namespace spelling.
//
// There is deliberately no structural-assignability fallback for heritage
// references whose symbol does not resolve: an unresolvable reference types
// as `any`, and `isTypeAssignableTo(any, X)` is true for every X, so a
// fallback would classify every interface with an unresolved base as a React
// context. In tsgo's relational checker `isTypeAssignableTo` also answers
// false for every genuinely resolved Context-shaped type (verified against
// `Context<T>`, `Context<null>`, and branded chains), so such a fallback
// could never have detected a real context anyway; the resolved heritage
// walk below is the mechanism.
const symbolContainsReactContext = (
	checker: Checker,
	symbol: TsSymbol | undefined,
	reactContextType: TsSymbol,
	seenSymbolIds: Set<number>,
): boolean => {
	if (!symbol || seenSymbolIds.has(symbol.id)) {
		return false;
	}

	seenSymbolIds.add(symbol.id);
	if (symbol.id === reactContextType.id) {
		return true;
	}

	if (symbol.flags & SymbolFlags.Alias) {
		return symbolContainsReactContext(
			checker,
			checker.getAliasedSymbol(symbol),
			reactContextType,
			seenSymbolIds,
		);
	}

	// An interface can be declared across multiple declarations (interface
	// merging); the heritage clause may sit on any of them, so every
	// declaration is walked, not just the first.
	for (const declaration of symbol.declarations ?? []) {
		const resolvedDeclaration = declaration.resolve();
		if (!resolvedDeclaration) {
			continue;
		}

		if (isTypeAliasDeclaration(resolvedDeclaration)) {
			if (
				typeContainsReactContext(
					checker,
					checker.getTypeAtLocation(resolvedDeclaration.type),
					reactContextType,
					seenSymbolIds,
				)
			) {
				return true;
			}
			continue;
		}

		if (isInterfaceDeclaration(resolvedDeclaration)) {
			for (const clause of resolvedDeclaration.heritageClauses ?? []) {
				for (const typeReference of clause.types) {
					const heritageSymbol = checker.getSymbolAtLocation(
						typeReference.expression,
					);
					if (
						heritageSymbol &&
						symbolContainsReactContext(
							checker,
							heritageSymbol,
							reactContextType,
							seenSymbolIds,
						)
					) {
						return true;
					}
				}
			}
		}
	}

	return false;
};

const resolvesToReactCreateContext = (
	checker: Checker,
	symbol: TsSymbol | undefined,
	reactCreateContext: TsSymbol,
	seenSymbolIds: Set<number> = new Set(),
): boolean => {
	if (!symbol || seenSymbolIds.has(symbol.id)) {
		return false;
	}

	seenSymbolIds.add(symbol.id);
	if (symbol.id === reactCreateContext.id) {
		return true;
	}

	if (symbol.flags & SymbolFlags.Alias) {
		const aliasedSymbol = checker.getAliasedSymbol(symbol);
		if (aliasedSymbol.id === reactCreateContext.id) {
			return true;
		}
	}

	const declarationHandle = symbol.valueDeclaration;
	const declaration = declarationHandle?.resolve();
	if (!declaration) {
		return false;
	}

	if (isBindingElement(declaration)) {
		return resolvesToReactCreateContext(
			checker,
			symbolForBindingElement(checker, declaration),
			reactCreateContext,
			seenSymbolIds,
		);
	}

	if (isShorthandPropertyAssignment(declaration)) {
		return resolvesToReactCreateContext(
			checker,
			checker.getShorthandAssignmentValueSymbol(declaration),
			reactCreateContext,
			seenSymbolIds,
		);
	}

	if (isPropertyAssignment(declaration)) {
		return resolvesToReactCreateContext(
			checker,
			symbolForExpression(checker, declaration.initializer),
			reactCreateContext,
			seenSymbolIds,
		);
	}

	if (!isVariableDeclaration(declaration) || !declaration.initializer) {
		return false;
	}

	const initializer = declaration.initializer;
	const factoryExpression: Node =
		isCallExpression(initializer) &&
		isContextFactoryAdapterCall(initializer) &&
		isPropertyAccessExpression(initializer.expression)
			? initializer.expression.expression
			: initializer;

	return resolvesToReactCreateContext(
		checker,
		symbolForExpression(checker, factoryExpression),
		reactCreateContext,
		seenSymbolIds,
	);
};

const dynamicObjectMayContainReactContextFactory = (
	checker: Checker,
	expression: Node,
	reactCreateContext: TsSymbol,
	seenSymbolIds: Set<number> = new Set(),
): boolean => {
	const symbol = checker.getSymbolAtLocation(expression);
	if (!symbol || seenSymbolIds.has(symbol.id)) {
		return false;
	}

	seenSymbolIds.add(symbol.id);
	const resolvedSymbol =
		symbol.flags & SymbolFlags.Alias
			? checker.getAliasedSymbol(symbol)
			: symbol;
	const declarationHandle = resolvedSymbol.valueDeclaration;
	const declaration = declarationHandle?.resolve();
	if (
		!declaration ||
		!isVariableDeclaration(declaration) ||
		!declaration.initializer
	) {
		return false;
	}

	const initializer: Node = declaration.initializer;
	if (!isObjectLiteralExpression(initializer)) {
		return dynamicObjectMayContainReactContextFactory(
			checker,
			initializer,
			reactCreateContext,
			seenSymbolIds,
		);
	}

	for (const property of initializer.properties) {
		if (
			isShorthandPropertyAssignment(property) &&
			resolvesToReactCreateContext(
				checker,
				checker.getShorthandAssignmentValueSymbol(property),
				reactCreateContext,
			)
		) {
			return true;
		}

		if (
			isPropertyAssignment(property) &&
			resolvesToReactCreateContext(
				checker,
				symbolForExpression(checker, property.initializer),
				reactCreateContext,
			)
		) {
			return true;
		}
	}

	return false;
};

const contextNameForCall = (callExpression: Node): string => {
	const declaration: Node = callExpression.parent;
	if (
		isVariableDeclaration(declaration) &&
		declaration.initializer === callExpression
	) {
		return declaration.name.getText();
	}

	return '<anonymous context>';
};

// A context-bearing declaration is a variable or a class field with an
// identifier name, or a binding element of a variable declaration whose
// initializer binds the context through a call
// (`const { probe: Ctx } = makeContexts()`). A destructured value only mints
// when its initializer contains a call; a destructure out of an existing
// holder (`const { RealContext } = holder`) never mints and produces no
// entry, and a destructure whose initializer is itself an object or array
// literal is the holder-position mint (`<anonymous context>`) discovered
// separately, not a distinct binding.
const declarationBinding = (
	checker: Checker,
	node: Node,
):
	| { symbol: TsSymbol; name: string; initializer: Node | undefined }
	| undefined => {
	if (isVariableDeclaration(node) || isPropertyDeclaration(node)) {
		if (!isIdentifier(node.name)) {
			return undefined;
		}

		const symbol = checker.getSymbolAtLocation(node.name);
		return symbol
			? { symbol, name: node.name.text, initializer: node.initializer }
			: undefined;
	}

	if (isBindingElement(node)) {
		let bindingPattern: Node = node.parent;
		let declaration: Node = bindingPattern.parent;
		// Nested patterns: `const { inner: { Ctx: NestedCtx } } = make()`
		// wraps the binding element in further patterns and binding elements
		// before the variable declaration. Walk up so the mint is attributed
		// to the declaration whose initializer calls the factory.
		while (isBindingElement(declaration)) {
			bindingPattern = declaration.parent;
			declaration = bindingPattern.parent;
		}

		if (
			!isVariableDeclaration(declaration) ||
			!declaration.initializer ||
			!node.name ||
			!isIdentifier(node.name) ||
			isObjectLiteralExpression(declaration.initializer) ||
			isArrayLiteralExpression(declaration.initializer)
		) {
			return undefined;
		}

		const symbol = checker.getSymbolAtLocation(node.name);
		return symbol
			? {
					symbol,
					name: node.name.text,
					initializer: declaration.initializer,
				}
			: undefined;
	}

	return undefined;
};

// The position a call's value lands in, walked through transparent value
// wrappers: parens, `as`, `!`, `satisfies`, comma chains (only the right
// operand is the value), conditional branches, logical operands (`&&`, `||`,
// `??`), and property/element accesses. A comma expression returns only its
// right operand, so only a call that sits on the right side of a comma can be
// the value — `{ probe: (createStrictContext(null), 0) }` discards the
// context and must not invent an `<anonymous context>` inventory entry. A
// spread element is itself the holder of its argument's value
// (`{ ...makeContexts(null) }` spreads a context record into the object).
const holderPositionOfCall = (node: Node): Node => {
	let current: Node = node;
	for (;;) {
		const parent: Node = current.parent;
		if (
			isParenthesizedExpression(parent) ||
			isAsExpression(parent) ||
			isTypeAssertion(parent) ||
			isNonNullExpression(parent) ||
			isSatisfiesExpression(parent) ||
			isPropertyAccessExpression(parent) ||
			isElementAccessExpression(parent)
		) {
			current = parent;
			continue;
		}

		if (
			isBinaryExpression(parent) &&
			parent.operatorToken.kind === SyntaxKind.CommaToken &&
			parent.right === current
		) {
			current = parent;
			continue;
		}

		if (
			isBinaryExpression(parent) &&
			[
				SyntaxKind.AmpersandAmpersandToken,
				SyntaxKind.BarBarToken,
				SyntaxKind.QuestionQuestionToken,
			].includes(parent.operatorToken.kind)
		) {
			current = parent;
			continue;
		}

		if (
			isConditionalExpression(parent) &&
			(parent.whenTrue === current || parent.whenFalse === current)
		) {
			current = parent;
			continue;
		}

		return parent;
	}
};

// The calls whose values make up an expression: the expression itself when it
// is a call, otherwise the calls reached through the transparent value
// wrappers the holder walk above understands. `makeContexts().probe` yields
// the `makeContexts()` call because the minted value flows through the access.
// Used to attribute a binding mint (`const Ctx = makeContexts().probe`) to
// the exact call positions that execute it.
const valueCallsOf = (expression: Node): Node[] => {
	if (isCallExpression(expression)) {
		return [expression];
	}

	if (
		isParenthesizedExpression(expression) ||
		isAsExpression(expression) ||
		isTypeAssertion(expression) ||
		isNonNullExpression(expression) ||
		isSatisfiesExpression(expression) ||
		isPropertyAccessExpression(expression) ||
		isElementAccessExpression(expression)
	) {
		return valueCallsOf(expression.expression);
	}

	if (
		isBinaryExpression(expression) &&
		expression.operatorToken.kind === SyntaxKind.CommaToken
	) {
		return valueCallsOf(expression.right);
	}

	if (
		isBinaryExpression(expression) &&
		[
			SyntaxKind.AmpersandAmpersandToken,
			SyntaxKind.BarBarToken,
			SyntaxKind.QuestionQuestionToken,
		].includes(expression.operatorToken.kind)
	) {
		return [
			...valueCallsOf(expression.left),
			...valueCallsOf(expression.right),
		];
	}

	if (isConditionalExpression(expression)) {
		return [
			...valueCallsOf(expression.whenTrue),
			...valueCallsOf(expression.whenFalse),
		];
	}

	return [];
};

const isContextRecordType = (
	checker: Checker,
	type: Type,
	reactContextType: TsSymbol,
	seenTypeIds: Set<number>,
): boolean => {
	if (
		type.isErrorType() ||
		type.isTypeParameter() ||
		seenTypeIds.has(type.id)
	) {
		return false;
	}

	seenTypeIds.add(type.id);
	if (type.isUnionType() || type.isIntersectionType()) {
		return (type.getTypes() ?? []).some((member) =>
			isContextRecordType(checker, member, reactContextType, seenTypeIds),
		);
	}

	if (checker.isArrayType(type) || type.isTupleType()) {
		const elementType = checker.getIndexInfosOfType(type)[0]?.valueType;
		return (
			elementType !== undefined &&
			isContextRecordType(checker, elementType, reactContextType, seenTypeIds)
		);
	}

	// A factory returning a *record* of contexts — `{ probe: Context<…> }` or
	// a nested record — mints every context in the record each time the call
	// executes, so the call is a mint at its own position: `{ probe:
	// makeContexts(null) }` and `{ ...makeContexts(null) }` both execute the
	// factory from every delivered copy of the module. Recursion is bounded
	// by the per-type id set; function-typed property values resolve through
	// Function's own members, which never contain a context.
	for (const property of checker.getPropertiesOfType(type)) {
		const declarationHandle = property.valueDeclaration;
		const propertyDeclaration = declarationHandle?.resolve();
		if (!propertyDeclaration) {
			continue;
		}

		const propertyType = checker.getTypeOfSymbolAtLocation(
			property,
			propertyDeclaration,
		);
		if (
			typeContainsReactContext(checker, propertyType, reactContextType) ||
			isContextRecordType(checker, propertyType, reactContextType, seenTypeIds)
		) {
			return true;
		}
	}

	return false;
};

// A minting call: its value resolves to React's `Context<…>` through the type
// system, or its callee resolves to React's createContext export, or its value
// is a record containing contexts (a record factory call whose result is held
// or spread). Identity for the rendered analysis is the call's exact source
// span — never a name.
const callMintsContext = (
	checker: Checker,
	callExpression: Node,
	reactContextType: TsSymbol,
	reactCreateContext: TsSymbol,
): boolean => {
	const callType = checker.getTypeAtLocation(callExpression);
	return (
		typeContainsReactContext(checker, callType, reactContextType) ||
		(callType !== undefined &&
			isContextRecordType(checker, callType, reactContextType, new Set())) ||
		resolvesToReactCreateContext(
			checker,
			symbolForExpression(
				checker,
				isCallExpression(callExpression)
					? callExpression.expression
					: callExpression,
			),
			reactCreateContext,
		)
	);
};

// The exact source span of the minting call, in the TypeScript scan's
// 0-based line and UTF-16 column coordinates. The rendered copy of the call
// is recognized when the bundler's own source map maps an emitted position
// back inside this span.
const spanOf = (sourceFile: SourceFile, node: Node): SourceSpan => {
	const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
	const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
	return {
		endCol: end.character,
		endLine: end.line,
		startCol: start.character,
		startLine: start.line,
	};
};

// The recorded mint span is the call's *argument-list* extent — the open
// paren through the close paren — not the whole CallExpression. Only that
// extent can be emitted by the call and by nothing else: an emitted callee
// identifier, or a callee *reference* that maps back into the callee text,
// would otherwise be accepted as "the call was emitted" when no call was.
// A holder mint that is a wrapper call (`(() => createContext(null))()`,
// `(0, factory)()` with an empty outer argument list) is descended into its
// innermost minting call, whose argument list is where the bundler's map
// places the mint's emitted tokens.
const innermostMintCall = (node: Node): Node => {
	let mint: Node = node;
	for (let guard = 0; guard < 20; guard++) {
		if (!isCallExpression(mint)) {
			break;
		}
		let form: Node = mint.expression;
		while (
			isParenthesizedExpression(form) ||
			isAsExpression(form) ||
			isSatisfiesExpression(form) ||
			isTypeAssertion(form) ||
			isNonNullExpression(form)
		) {
			form = form.expression;
		}
		if (isArrowFunction(form) || isFunctionExpression(form)) {
			if (isCallExpression(form.body)) {
				mint = form.body;
				continue;
			}
			break;
		}
		if (isCallExpression(form)) {
			mint = form;
			continue;
		}
		break;
	}
	return mint;
};

const mintCallSpan = (sourceFile: SourceFile, node: Node): SourceSpan => {
	const mint = innermostMintCall(node);
	if (!isCallExpression(mint)) {
		return spanOf(sourceFile, node);
	}
	const openParen = sourceFile.text.indexOf('(', mint.expression.end);
	const start = sourceFile.getLineAndCharacterOfPosition(openParen);
	const end = sourceFile.getLineAndCharacterOfPosition(mint.getEnd());
	return {
		endCol: end.character,
		endLine: end.line,
		startCol: start.character,
		startLine: start.line,
	};
};

const spanKey = (span: SourceSpan): string =>
	`${span.startLine}:${span.startCol}:${span.endLine}:${span.endCol}`;

const uniqueSpans = (spans: readonly SourceSpan[]): SourceSpan[] => {
	const seen = new Set<string>();
	return spans.filter((span) => {
		const key = spanKey(span);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
};

// A mint always executes createContext somewhere, so a binding or holder
// position whose initializer contains a call is a mint candidate; a binding
// that merely aliases an existing context (const Ctx = RealContext, for-of,
// destructure, static field alias) never mints and produces no entry.
const expressionContainsCall = (expression: Node): boolean => {
	let containsCall = false;
	const visit = (node: Node): void => {
		if (containsCall) {
			return;
		}

		if (isCallExpression(node)) {
			containsCall = true;
			return;
		}

		node.forEachChild(visit);
	};

	visit(expression);
	return containsCall;
};

export const findReactContextDeclarations = (
	tsconfigPath: string,
	onProgramSourceFiles: (sourceFiles: Set<string>) => void = () => {},
): ContextDeclaration[] => {
	const api = new API();

	try {
		const snapshot = api.updateSnapshot({ openProjects: [tsconfigPath] });
		const project = snapshot.getProject(tsconfigPath);
		if (!project) {
			throw new Error(
				`Context chunk isolation guard could not load ${tsconfigPath}.`,
			);
		}

		const { contextType: reactContextType, createContext: reactCreateContext } =
			findReactContextSymbols(project.program, project.checker, tsconfigPath);
		onProgramSourceFiles(
			new Set(
				project.program
					.getSourceFileNames()
					.map((sourceFileName) => normalizeModuleId(sourceFileName)),
			),
		);
		const contexts: ContextDeclaration[] = [];
		// Declarations whose binding already produced an inventory entry.
		// A minting call inside such a declaration's initializer (a named
		// conditional like `const Ctx = cond ? createContext(null) :
		// createContext(null)`) is represented by the entry's recorded mint
		// spans, so the direct-call fallback must not invent an anonymous
		// entry per branch for it.
		const trackedDeclarations = new Set<Node>();

		for (const sourceFileName of project.program.getSourceFileNames()) {
			if (
				sourceFileName.includes('/node_modules/') ||
				/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(sourceFileName)
			) {
				continue;
			}

			const sourceFile = project.program.getSourceFile(sourceFileName);
			if (!sourceFile) {
				continue;
			}
			const visit = (node: Node): void => {
				assertStaticReactElementAccess(
					project.checker,
					node,
					reactCreateContext,
					normalizeModuleId(sourceFileName),
				);

				const binding = declarationBinding(project.checker, node);
				if (
					binding &&
					binding.initializer &&
					expressionContainsCall(binding.initializer)
				) {
					if (
						typeContainsReactContext(
							project.checker,
							project.checker.getTypeOfSymbolAtLocation(binding.symbol, node),
							reactContextType,
						)
					) {
						trackedDeclarations.add(node);
						const mintingCalls = valueCallsOf(binding.initializer).filter(
							(call) =>
								callMintsContext(
									project.checker,
									call,
									reactContextType,
									reactCreateContext,
								),
						);
						contexts.push({
							name: binding.name,
							sourceFile: normalizeModuleId(sourceFile.fileName),
							mintSpans: uniqueSpans(
								mintingCalls.map((call) => mintCallSpan(sourceFile, call)),
							),
						});
					} else if (
						isCallExpression(binding.initializer) &&
						resolvesToReactCreateContext(
							project.checker,
							symbolForExpression(
								project.checker,
								binding.initializer.expression,
							),
							reactCreateContext,
						)
					) {
						trackedDeclarations.add(node);
						contexts.push({
							name: binding.name,
							sourceFile: normalizeModuleId(sourceFile.fileName),
							mintSpans: [mintCallSpan(sourceFile, binding.initializer)],
						});
					}
				}

				if (isCallExpression(node)) {
					const position = holderPositionOfCall(node);
					const isDeclarationInitializer =
						(isVariableDeclaration(position) ||
							isPropertyDeclaration(position)) &&
						position.initializer === node;
					if (!isDeclarationInitializer && !trackedDeclarations.has(position)) {
						const isHolderPosition =
							isPropertyAssignment(position) ||
							isArrayLiteralExpression(position) ||
							isExportAssignment(position) ||
							isSpreadElement(position) ||
							isSpreadAssignment(position);
						if (
							isHolderPosition &&
							callMintsContext(
								project.checker,
								node,
								reactContextType,
								reactCreateContext,
							)
						) {
							contexts.push({
								name: '<anonymous context>',
								sourceFile: normalizeModuleId(sourceFile.fileName),
								mintSpans: [mintCallSpan(sourceFile, node)],
							});
						} else if (!isHolderPosition) {
							const calleeSymbol = symbolForExpression(
								project.checker,
								node.expression,
							);
							if (
								resolvesToReactCreateContext(
									project.checker,
									calleeSymbol,
									reactCreateContext,
								)
							) {
								contexts.push({
									name: contextNameForCall(node),
									sourceFile: normalizeModuleId(sourceFile.fileName),
									mintSpans: [mintCallSpan(sourceFile, node)],
								});
							}
						}
					}
				}

				node.forEachChild(visit);
			};

			visit(sourceFile);
		}

		return contexts;
	} finally {
		api.close();
	}
};

export const findContextChunkIsolationViolations = (
	contexts: readonly ContextDeclaration[],
	chunks: readonly ClientChunk[],
	projectDirectory: string = process.cwd(),
	outputDirectory: string = projectDirectory,
): string[] => {
	const chunksForSource = new Map<string, ModuleChunkLink[]>();

	for (const chunk of chunks) {
		for (const moduleId of Object.keys(chunk.modules)) {
			const normalizedModuleId = normalizeModuleId(moduleId);
			const moduleChunks = chunksForSource.get(normalizedModuleId) ?? [];
			moduleChunks.push({
				chunk,
				chunkName: chunk.fileName,
				moduleId: normalizedModuleId,
			});
			chunksForSource.set(normalizedModuleId, moduleChunks);
		}
	}

	// Every chunk's decoded source map, indexed by the chunk object. A chunk
	// without a map makes every copy it delivers un-attributable: the verdict
	// then falls back to the module/chunk cardinality facts alone and fails
	// closed when more than one copy is delivered. A map that is present but
	// not a structurally valid version-3 map (wrong version, malformed VLQ,
	// out-of-range source ids) is input the guard cannot interpret, so it
	// fails loud with a named diagnostic rather than guessing.
	const chunkAnalyses = new Map<ClientChunk, ChunkAnalysis>();
	for (const chunk of chunks) {
		const map = chunk.map;
		if (map === undefined || map === null) {
			chunkAnalyses.set(chunk, { hasMap: false });
			continue;
		}

		if (
			map.version !== 3 ||
			typeof map.mappings !== 'string' ||
			!Array.isArray(map.sources)
		) {
			throw new Error(
				`Context chunk isolation guard could not use the source map the build emitted for chunk ${chunk.fileName}: expected a version-3 map with a mappings string and a sources array.`,
			);
		}

		const chunkDirectory = path.join(
			outputDirectory,
			path.dirname(chunk.fileName),
		);
		const segments: ResolvedSegment[] = [];
		for (const segment of decodeSourceMapSegments(map, chunk.fileName)) {
			// A one-field VLQ segment is generated-only: it has no original
			// source and never contributes a position.
			if (!segment.mapped) {
				continue;
			}
			if (segment.sourceIndex >= map.sources.length) {
				throw new Error(
					`Context chunk isolation guard could not use the source map the build emitted for chunk ${chunk.fileName}: segment references source index ${segment.sourceIndex} beyond the ${map.sources.length} listed sources.`,
				);
			}
			const source = resolveRenderedMapSource(
				map.sources[segment.sourceIndex],
				chunkDirectory,
			);
			if (source === undefined) {
				continue;
			}
			segments.push({
				genCol: segment.genCol,
				genLine: segment.genLine,
				origCol: segment.origCol,
				origLine: segment.origLine,
				source,
			});
		}
		// The generated positions of the map's segments refer to the chunk's
		// own emitted code, so the guard parses that code once for the call
		// extents it must tie attribution to. A chunk that carries no code
		// (hand-fed fixtures) skips the emitted-call tie entirely.
		const emittedCallExtents =
			typeof chunk.code === 'string' && chunk.code.length > 0
				? findEmittedCallExtents(chunk.code)
				: undefined;
		chunkAnalyses.set(chunk, {
			emittedCallExtents,
			hasMap: true,
			segments,
		});
	}

	// Group the discovered contexts by their source module so a copy's mint
	// calls can be explained against every span in the module at once: a copy
	// whose map ties its mint calls to some other context's span is verifiably
	// non-minting for the context being checked, while a copy that ties to no
	// span at all is unverifiable (fail closed) rather than silently
	// non-minting.
	const contextsByModule = new Map<string, ContextDeclaration[]>();
	for (const context of contexts) {
		const moduleContexts = contextsByModule.get(context.sourceFile) ?? [];
		moduleContexts.push(context);
		contextsByModule.set(context.sourceFile, moduleContexts);
	}

	const violations: string[] = [];
	for (const [sourceFile, moduleContexts] of contextsByModule) {
		const sourcePath = path.relative(projectDirectory, sourceFile);
		const allMintSpans: SourceSpan[] = moduleContexts.flatMap(
			(context) => context.mintSpans ?? [],
		);

		// Per delivered module copy, the facts shared by every context of the
		// module: the map's precision, and the mint spans the copy ties to.
		const moduleCopies: ModuleCopyFacts[] = [];
		for (const [moduleId, moduleChunks] of chunksForSource) {
			const isSourceModule = moduleId === sourceFile;
			const isSourceQueryModule = moduleId.startsWith(`${sourceFile}?`);
			if (!isSourceModule && !isSourceQueryModule) {
				continue;
			}

			if (
				isSourceQueryModule &&
				!TANSTACK_SOURCE_SIBLING_VIRTUAL_MODULE.test(moduleId)
			) {
				throw new Error(
					`Context chunk isolation guard cannot prove an unrecognized source-derived query module ${moduleId}; verify its transform semantics before adding its TanStack sibling family to the curated allowlist.`,
				);
			}

			for (const moduleChunk of moduleChunks) {
				const chunkAnalysis = chunkAnalyses.get(moduleChunk.chunk);
				if (!chunkAnalysis) {
					throw new Error(
						`Context chunk isolation guard did not analyze a chunk delivering a context source module: ${moduleChunk.chunk.fileName}.`,
					);
				}
				const copySegments: ResolvedSegment[] = chunkAnalysis.hasMap
					? chunkAnalysis.segments.filter(
							(segment) => segment.source === moduleChunk.moduleId,
						)
					: [];
				const { precise, tiedSpanKeys }: CopyAttribution =
					classifyCopyAttribution(
						copySegments,
						allMintSpans,
						chunkAnalysis.hasMap ? chunkAnalysis.emittedCallExtents : undefined,
					);
				moduleCopies.push({
					chunkName: moduleChunk.chunkName,
					hasMap: chunkAnalysis.hasMap,
					precise,
					tiedSpanKeys,
				});
			}
		}

		if (moduleCopies.length === 0) {
			for (const context of moduleContexts) {
				violations.push(
					`${context.name} in ${sourcePath} is not present in a client chunk.`,
				);
			}
			continue;
		}

		for (const context of moduleContexts) {
			const contextSpanKeys = new Set((context.mintSpans ?? []).map(spanKeyOf));
			const familyCopies: FamilyCopyVerdict[] = moduleCopies.map((copy) => {
				const minted =
					copy.precise &&
					[...copy.tiedSpanKeys].some((key) => contextSpanKeys.has(key));
				// A copy is verifiably non-minting for this context only when
				// every mint call its map ties to belongs to some *other*
				// context's span (so this context's mint cannot be the one the
				// copy executes). Anything else — the copy ties to no span at
				// all (it may mint with a map that hides the mint), or the map
				// is unverifiable — is unverifiable and fails closed.
				const verifiablyNonMinting =
					!minted &&
					copy.tiedSpanKeys.size > 0 &&
					![...copy.tiedSpanKeys].some((key) => contextSpanKeys.has(key));
				return {
					attributable: minted || verifiablyNonMinting,
					chunkName: copy.chunkName,
					hasMap: copy.hasMap,
					minted,
				};
			});

			const mintingCopies = familyCopies.filter((copy) => copy.minted);
			const copyCount = familyCopies.length;
			if (copyCount >= 2 && familyCopies.some((copy) => !copy.attributable)) {
				throw new Error(
					`Context chunk isolation guard cannot classify how ${context.name} in ${sourcePath} is created: the build emits no source map for a client chunk delivering its source, or a delivered copy's map does not resolve precise original positions for it.`,
				);
			}

			if (mintingCopies.length === 0) {
				if (copyCount >= 2) {
					const chunkNames = [
						...new Set(familyCopies.map((copy) => copy.chunkName)),
					];
					throw new Error(
						`Context chunk isolation guard cannot classify how ${context.name} in ${sourcePath} is created: its source is delivered in ${copyCount} client module copies (${chunkNames.join(', ')}) and no rendered copy is attributed a mint.`,
					);
				}
				continue;
			}

			if (mintingCopies.length === 1) {
				continue;
			}

			const chunkNames = new Set(mintingCopies.map((copy) => copy.chunkName));
			if (chunkNames.size === 1) {
				violations.push(
					`${context.name} in ${sourcePath} is created by multiple client modules in chunk: ${[...chunkNames].join(', ')}.`,
				);
			} else {
				violations.push(
					`${context.name} in ${sourcePath} is present in multiple client chunks: ${[...chunkNames].join(', ')}.`,
				);
			}
		}
	}

	return violations;
};

export const findContextInventoryViolations = (
	contexts: readonly ContextDeclaration[],
	contextInventory: readonly ContextInventoryEntry[],
	projectDirectory: string,
): string[] => {
	// F824 (ui F6): the two sides are compared as MULTISETS, not sets. The
	// previous `${name} in ${file}` Set comparison collapsed every distinct
	// minting site a module hosts under one identity (two anonymous holder
	// mints in one file both discover as `<anonymous context> in <file>`) to
	// a single entry: one inventory entry silently certified both sites, and
	// kept certifying one after the other was deleted — per-file coverage
	// despite this guard claiming per-`createContext` verdicts.
	const discoveredCounts = new Map<string, number>();
	for (const context of contexts) {
		const key = `${context.name} in ${path.relative(projectDirectory, context.sourceFile)}`;
		discoveredCounts.set(key, (discoveredCounts.get(key) ?? 0) + 1);
	}

	const expectedCounts = new Map<string, number>();
	for (const context of contextInventory) {
		const key = `${context.name} in ${context.sourceFile}`;
		expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
	}

	const violations: string[] = [];

	for (const [expectedContext, expectedCount] of expectedCounts) {
		if ((discoveredCounts.get(expectedContext) ?? 0) < expectedCount) {
			violations.push(
				`Expected context inventory entry ${expectedContext} is missing from the TypeScript program.`,
			);
		}
	}

	for (const [discoveredContext, discoveredCount] of discoveredCounts) {
		if ((expectedCounts.get(discoveredContext) ?? 0) < discoveredCount) {
			violations.push(
				`Discovered React context ${discoveredContext} is missing from the checked-in inventory.`,
			);
		}
	}

	return violations;
};

const findTypeScriptProgramCoverageViolations = (
	programSourceFiles: ReadonlySet<string>,
	chunks: readonly ClientChunk[],
	workspaceDirectory: string,
): string[] => {
	const workspaceDirectoryPrefix = `${normalizeModuleId(workspaceDirectory)}/`;
	const missingSourceFiles = new Set<string>();

	for (const chunk of chunks) {
		for (const moduleId of Object.keys(chunk.modules)) {
			const sourceFile = sourceFileForModuleId(moduleId);
			if (
				!sourceFile.startsWith(workspaceDirectoryPrefix) ||
				sourceFile.includes('/node_modules/') ||
				!SOURCE_MODULE_EXTENSION.test(sourceFile) ||
				programSourceFiles.has(sourceFile)
			) {
				continue;
			}

			missingSourceFiles.add(sourceFile);
		}
	}

	return [...missingSourceFiles].map(
		(sourceFile) =>
			`Vite source module ${path.relative(workspaceDirectory, sourceFile)} is not present in the TypeScript program.`,
	);
};

/**
 * Options accepted by {@link contextChunkIsolationPlugin}.
 */
export interface ContextChunkIsolationPluginOptions {
	contextInventory: readonly ContextInventoryEntry[];
	tsconfigPath: string;
	workspaceDirectory?: string | undefined;
}

export const contextChunkIsolationPlugin = ({
	contextInventory,
	tsconfigPath,
	workspaceDirectory = path.dirname(tsconfigPath),
}: ContextChunkIsolationPluginOptions) => {
	let contexts: ContextDeclaration[] = [];
	let programSourceFiles: ReadonlySet<string> = new Set();
	let forcedSourcemap = false;

	return {
		name: 'publy:context-chunk-isolation',
		apply: 'build' as const,
		applyToEnvironment: (environment: { name: string }): boolean =>
			environment.name === 'client',
		// Rendered attribution reads the bundler's own source map, so the
		// client build must emit one. 'hidden' writes the map without the
		// sourceMappingURL comment; when the user configured sourcemaps
		// themselves, their choice stands and the maps are theirs to keep.
		// When the guard forces the map it also pins the map asset naming to
		// `[name].map`, so the guard knows the exact filename every forced
		// map lands at — `chunk.name + '.map'` — and can later delete
		// precisely the assets it caused, never an unrelated asset that
		// merely shares a suffix or bytes.
		config(config: GuardViteUserConfig): void {
			const clientBuild = config.environments?.client?.build ?? config.build;
			if (clientBuild === undefined) {
				throw new Error(
					'Context chunk isolation guard requires a resolvable client build configuration to enforce the hidden source map.',
				);
			}
			if (clientBuild.sourcemap === undefined) {
				clientBuild.sourcemap = 'hidden';
			}
			// Pin the map asset naming to `[name].map` unconditionally, so the
			// guard knows the exact filename every forced map lands at —
			// `chunk.name + '.map'` — and can later delete precisely the
			// assets it caused, never an unrelated asset that merely shares a
			// suffix or bytes.
			clientBuild.rolldownOptions ??= {};
			clientBuild.rolldownOptions.output ??= {};
			clientBuild.rolldownOptions.output.sourcemapFileNames = '[name].map';
			forcedSourcemap = clientBuild.sourcemap === 'hidden';
		},
		buildStart(): void {
			contexts = findReactContextDeclarations(tsconfigPath, (sourceFiles) => {
				programSourceFiles = sourceFiles;
			});
			const inventoryViolations = findContextInventoryViolations(
				contexts,
				contextInventory,
				path.dirname(tsconfigPath),
			);
			if (inventoryViolations.length > 0) {
				throw new Error(
					`React context inventory failed:\n${inventoryViolations
						.map((violation) => `- ${violation}`)
						.join('\n')}`,
				);
			}
		},
		generateBundle(
			this: { error(message: string): void },
			outputOptions: { dir?: string | undefined },
			bundle: Record<string, BundleOutputEntry>,
		): void {
			const chunks = Object.values(bundle).filter(
				(output): output is ClientChunk => output.type === 'chunk',
			);
			const projectDirectory = path.dirname(tsconfigPath);
			const violations = [
				...findContextChunkIsolationViolations(
					contexts,
					chunks,
					projectDirectory,
					outputOptions.dir ?? projectDirectory,
				),
				...findTypeScriptProgramCoverageViolations(
					programSourceFiles,
					chunks,
					workspaceDirectory,
				),
			];
			// The maps the guard forced on the build are consumed in memory
			// and must not ship with the output: 'hidden' already omits the
			// sourceMappingURL comment, and removing the map assets keeps the
			// artifact byte-for-byte what it would have been without the
			// guard's internal sourcemap requirement. The guard deletes an
			// asset only when it can prove ownership of it, and ownership is
			// a fact the guard recorded when it forced the map, not
			// something inferred from the asset's shape: the config hook
			// pinned the forced map naming to `[name].map`, so the guard's
			// own map for a chunk sits at the exact key `chunk.name + '.map'`
			// holding the bundler's serialization of that chunk's map object
			// — the exact object the guard still holds. The guard therefore
			// deletes an asset only when its bytes equal that serialization
			// (`JSON.stringify(chunk.map)`), pinned by the real-build suite
			// against the bundler's writer. Any other bytes — a strict
			// subset of fields such as a `sourcesContent`-stripped map, an
			// extra field, a reordered or reformatted key, any differing
			// value — are not the guard's map and survive untouched. The
			// disclosed residual is a foreign asset byte-identical to the
			// full serialization, which no comparison can distinguish.
			if (forcedSourcemap) {
				for (const chunk of chunks) {
					if (chunk.map === undefined || chunk.map === null) {
						continue;
					}
					const fileName = `${chunk.name}.map`;
					const asset = bundle[fileName];
					if (asset?.type !== 'asset' || typeof asset.source !== 'string') {
						continue;
					}
					if (asset.source === JSON.stringify(chunk.map)) {
						delete bundle[fileName];
					}
				}
			}
			if (violations.length > 0) {
				this.error(
					`React context chunk isolation failed:\n${violations
						.map((violation) => `- ${violation}`)
						.join('\n')}`,
				);
			}
		},
	};
};
