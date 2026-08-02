import path from 'node:path';

import { SyntaxKind } from 'typescript/unstable/ast';
import {
	isArrayLiteralExpression,
	isAsExpression,
	isBindingElement,
	isBinaryExpression,
	isCallExpression,
	isConditionalExpression,
	isElementAccessExpression,
	isExportAssignment,
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

const REACT_TYPE_DECLARATION = /[/\\]@types[/\\]react[/\\]index\.d\.ts$/;
// Curated from TanStack's source-derived sibling transforms. Add new families
// explicitly so unknown query modules keep failing closed.
const TANSTACK_SOURCE_SIBLING_VIRTUAL_MODULE =
	/[?&](?:tsr-(?:shared|split)|tss-hydrate)=/;
const SOURCE_MODULE_EXTENSION = /\.[cm]?[jt]sx?$/;

const normalizeModuleId = (moduleId) =>
	path.normalize(moduleId).replaceAll('\\', '/');

const sourceFileForModuleId = (moduleId) =>
	normalizeModuleId(moduleId.split('?')[0]);

const symbolForExpression = (checker, expression) =>
	isElementAccessExpression(expression)
		? checker.getSymbolAtLocation(expression.argumentExpression)
		: checker.getSymbolAtLocation(expression);

const symbolForBindingElement = (checker, bindingElement) => {
	const bindingPattern = bindingElement.parent;
	const declaration = bindingPattern?.parent;
	if (
		!isObjectBindingPattern(bindingPattern) ||
		!isVariableDeclaration(declaration) ||
		!declaration.initializer ||
		!bindingElement.name
	) {
		return undefined;
	}

	const type = checker.getTypeAtLocation(declaration.initializer);
	return type
		? checker.getPropertyOfType(
				type,
				(bindingElement.propertyName ?? bindingElement.name).getText(),
			)
		: undefined;
};

const isContextFactoryAdapterCall = (expression) =>
	isCallExpression(expression) &&
	isPropertyAccessExpression(expression.expression) &&
	['apply', 'bind', 'call'].includes(expression.expression.name.getText());

const isReactNamespace = (checker, expression, reactCreateContext) => {
	const type = checker.getTypeAtLocation(expression);
	return type
		? checker
				.getPropertiesOfType(type)
				.some((property) => property.id === reactCreateContext.id)
		: false;
};

const assertStaticReactElementAccess = (
	checker,
	expression,
	reactCreateContext,
) => {
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
			'Context chunk isolation guard cannot prove a dynamic React element access is not createContext.',
		);
	}
};

const findReactContextSymbols = (program, checker) => {
	const reactDeclaration = program
		.getSourceFileNames()
		.map((fileName) => program.getSourceFile(fileName))
		.find((sourceFile) => REACT_TYPE_DECLARATION.test(sourceFile.fileName));

	if (!reactDeclaration) {
		throw new Error(
			'Context chunk isolation guard could not find React type declarations.',
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
			'Context chunk isolation guard could not resolve React.createContext.',
		);
	}

	const contextType = reactExports.find((symbol) => symbol.name === 'Context');
	if (!contextType) {
		throw new Error(
			"Context chunk isolation guard could not resolve React's Context type.",
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
	checker,
	type,
	reactContextType,
	seenSymbolIds = new Set(),
) => {
	if (!type) {
		return false;
	}

	if (type.isUnionType() || type.isIntersectionType()) {
		return type
			.getTypes()
			.some((member) =>
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
	checker,
	symbol,
	reactContextType,
	seenSymbolIds,
) => {
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
	checker,
	symbol,
	reactCreateContext,
	seenSymbolIds = new Set(),
) => {
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

	const declaration = symbol.valueDeclaration?.resolve();
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

	if (
		!declaration ||
		!isVariableDeclaration(declaration) ||
		!declaration.initializer
	) {
		return false;
	}

	const initializer = declaration.initializer;
	const factoryExpression = isContextFactoryAdapterCall(initializer)
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
	checker,
	expression,
	reactCreateContext,
	seenSymbolIds = new Set(),
) => {
	const symbol = checker.getSymbolAtLocation(expression);
	if (!symbol || seenSymbolIds.has(symbol.id)) {
		return false;
	}

	seenSymbolIds.add(symbol.id);
	const resolvedSymbol =
		symbol.flags & SymbolFlags.Alias
			? checker.getAliasedSymbol(symbol)
			: symbol;
	const declaration = resolvedSymbol.valueDeclaration?.resolve();
	if (
		!declaration ||
		!isVariableDeclaration(declaration) ||
		!declaration.initializer
	) {
		return false;
	}

	const initializer = declaration.initializer;
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

const contextNameForCall = (callExpression) => {
	const declaration = callExpression.parent;
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
const declarationBinding = (checker, node) => {
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
		let bindingPattern = node.parent;
		let declaration = bindingPattern?.parent;
		// Nested patterns: `const { inner: { Ctx: NestedCtx } } = make()`
		// wraps the binding element in further patterns and binding elements
		// before the variable declaration. Walk up so the mint is attributed
		// to the declaration whose initializer calls the factory.
		while (isBindingElement(declaration)) {
			bindingPattern = declaration.parent;
			declaration = bindingPattern?.parent;
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
const holderPositionOfCall = (node) => {
	let current = node;
	for (;;) {
		const parent = current.parent;
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
const valueCallsOf = (expression) => {
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

const isContextRecordType = (checker, type, reactContextType, seenTypeIds) => {
	if (
		type.isErrorType() ||
		type.isTypeParameter() ||
		seenTypeIds.has(type.id)
	) {
		return false;
	}

	seenTypeIds.add(type.id);
	if (type.isUnionType() || type.isIntersectionType()) {
		return type
			.getTypes()
			.some((member) =>
				isContextRecordType(checker, member, reactContextType, seenTypeIds),
			);
	}

	if (checker.isArrayType(type) || type.isTupleType()) {
		const elementType = checker.getIndexInfosOfType(type)[0]?.type;
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
		const propertyDeclaration = property.valueDeclaration?.resolve();
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
	checker,
	callExpression,
	reactContextType,
	reactCreateContext,
) => {
	const callType = checker.getTypeAtLocation(callExpression);
	return (
		typeContainsReactContext(checker, callType, reactContextType) ||
		isContextRecordType(checker, callType, reactContextType, new Set()) ||
		resolvesToReactCreateContext(
			checker,
			symbolForExpression(checker, callExpression.expression),
			reactCreateContext,
		)
	);
};

// The exact source span of the minting call, in the TypeScript scan's
// 0-based line and UTF-16 column coordinates. The rendered copy of the call
// is recognized when the bundler's own source map maps an emitted position
// back inside this span.
const spanOf = (sourceFile, node) => {
	const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
	const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
	return {
		endCol: end.character,
		endLine: end.line,
		startCol: start.character,
		startLine: start.line,
	};
};

const spanKey = (span) =>
	`${span.startLine}:${span.startCol}:${span.endLine}:${span.endCol}`;

const uniqueSpans = (spans) => {
	const seen = new Set();
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
const expressionContainsCall = (expression) => {
	let containsCall = false;
	const visit = (node) => {
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
	tsconfigPath,
	onProgramSourceFiles = () => {},
) => {
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
			findReactContextSymbols(project.program, project.checker);
		onProgramSourceFiles(
			new Set(
				project.program
					.getSourceFileNames()
					.map((sourceFileName) => normalizeModuleId(sourceFileName)),
			),
		);
		const contexts = [];
		// Declarations whose binding already produced an inventory entry.
		// A minting call inside such a declaration's initializer (a named
		// conditional like `const Ctx = cond ? createContext(null) :
		// createContext(null)`) is represented by the entry's recorded mint
		// spans, so the direct-call fallback must not invent an anonymous
		// entry per branch for it.
		const trackedDeclarations = new Set();

		for (const sourceFileName of project.program.getSourceFileNames()) {
			if (
				sourceFileName.includes('/node_modules/') ||
				/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(sourceFileName)
			) {
				continue;
			}

			const sourceFile = project.program.getSourceFile(sourceFileName);
			const visit = (node) => {
				assertStaticReactElementAccess(
					project.checker,
					node,
					reactCreateContext,
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
						contexts.push({
							name: binding.name,
							sourceFile: normalizeModuleId(sourceFile.fileName),
							mintSpans: uniqueSpans(
								valueCallsOf(binding.initializer)
									.filter((call) =>
										callMintsContext(
											project.checker,
											call,
											reactContextType,
											reactCreateContext,
										),
									)
									.map((call) => spanOf(sourceFile, call)),
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
							mintSpans: [spanOf(sourceFile, binding.initializer)],
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
								mintSpans: [spanOf(sourceFile, node)],
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
									mintSpans: [spanOf(sourceFile, node)],
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

// Decoding of the chunk source map produced by the build. The map is the
// bundler's own record of which emitted call originated at which source
// position, so attribution through it survives every renaming, alias
// elimination, inlining and chunk merge the bundler performs — a call that
// did not originate at a recorded mint span can never map back to it.
//
// The mappings string is standard VLQ: per generated line, comma-separated
// segments of (generatedColumn, sourceIndex, originalLine, originalColumn[,
// nameIndex]) as zig-zag-encoded signed deltas, with original positions in
// the standard 0-based line and column coordinates. The rendered copy of a
// call therefore carries the same coordinates the TypeScript scan records —
// no conversion is needed, and the regression suite pins the convention
// against real builds.

const SOURCE_MAP_BASE64 =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// The decode is bounded: every character must be in the base64 alphabet, every
// field must terminate (continuation bit cleared) before the input ends, and
// no field may exceed the 31-bit value range of the standard encoding.
// Malformed input throws a named guard error — it never hangs and never
// silently mis-reads.
const readSourceMapVlq = (encoded, state, chunkFileName) => {
	let value = 0;
	let shift = 0;
	for (;;) {
		const character = encoded[state.index];
		const digit =
			character === undefined ? -1 : SOURCE_MAP_BASE64.indexOf(character);
		if (digit === -1) {
			throw new Error(
				`Context chunk isolation guard could not decode the source map for chunk ${chunkFileName}: invalid VLQ character ${JSON.stringify(character)}.`,
			);
		}
		state.index++;
		value += (digit & 31) << shift;
		if ((digit & 32) === 0) {
			break;
		}
		shift += 5;
		if (shift > 30) {
			throw new Error(
				`Context chunk isolation guard could not decode the source map for chunk ${chunkFileName}: VLQ field exceeds the supported 31-bit value range.`,
			);
		}
	}
	const sign = value & 1;
	return sign ? -(value >> 1) : value >> 1;
};

// Returns every mapping's original source position, keyed by nothing but the
// position itself: consumers attribute a segment to a module copy by matching
// the resolved source id and test the position against recorded mint spans.
// Per line, segments are comma-separated and each segment carries 1
// (generated column only), 4 or 5 (with names index) zig-zag VLQ fields; any
// other arity is malformed input.
const decodeSourceMapSegments = (map, chunkFileName) => {
	const segments = [];
	let sourceIndex = 0;
	let origLine = 0;
	let origCol = 0;
	for (const encodedLine of map.mappings.split(';')) {
		let genCol = 0;
		for (const rawSegment of encodedLine.split(',')) {
			if (rawSegment === '') {
				continue;
			}

			const fields = [];
			const state = { index: 0 };
			while (state.index < rawSegment.length) {
				fields.push(readSourceMapVlq(rawSegment, state, chunkFileName));
			}

			if (![1, 4, 5].includes(fields.length)) {
				throw new Error(
					`Context chunk isolation guard could not decode the source map for chunk ${chunkFileName}: segment carries ${fields.length} VLQ fields.`,
				);
			}

			const [
				genColDelta,
				sourceIndexDelta = 0,
				origLineDelta = 0,
				origColDelta = 0,
			] = fields;
			genCol += genColDelta;
			sourceIndex += sourceIndexDelta;
			origLine += origLineDelta;
			origCol += origColDelta;
			if (sourceIndex < 0 || origLine < 0 || origCol < 0) {
				throw new Error(
					`Context chunk isolation guard could not decode the source map for chunk ${chunkFileName}: segment resolves to a negative original position.`,
				);
			}
			segments.push({ genCol, origCol, origLine, sourceIndex });
		}
	}
	return segments;
};

// Resolves a chunk map's relative source id (relative to the chunk's own
// directory in the output tree) to the absolute module id used by
// chunk.modules. Internal Rolldown virtual ids are prefixed with a NUL byte
// and are not real modules; they yield no segment.
const resolveRenderedMapSource = (mapSource, chunkDirectory) => {
	if (
		typeof mapSource !== 'string' ||
		mapSource === '' ||
		mapSource.startsWith('\0')
	) {
		return undefined;
	}

	const resolved = path.isAbsolute(mapSource)
		? mapSource
		: path.resolve(chunkDirectory, mapSource);
	return normalizeModuleId(resolved);
};

// A rendered segment matches a recorded mint span when the bundler's own map
// says the emitted call originated inside the span: the same source line (in
// the standard 0-based coordinates both the scan and the map use) and a
// column within the call's [start, end) extent.
const renderedSegmentMatchesSpan = (segment, span) => {
	if (segment.origLine < span.startLine || segment.origLine > span.endLine) {
		return false;
	}
	if (segment.origLine === span.startLine && segment.origCol < span.startCol) {
		return false;
	}
	if (segment.origLine === span.endLine && segment.origCol >= span.endCol) {
		return false;
	}
	return true;
};

export const findContextChunkIsolationViolations = (
	contexts,
	chunks,
	projectDirectory = process.cwd(),
	outputDirectory = projectDirectory,
) => {
	const chunksForSource = new Map();

	for (const chunk of chunks) {
		for (const [moduleId, renderedModule] of Object.entries(chunk.modules)) {
			const normalizedModuleId = normalizeModuleId(moduleId);
			const moduleChunks = chunksForSource.get(normalizedModuleId) ?? [];
			moduleChunks.push({
				chunk,
				chunkName: chunk.fileName,
				moduleId: normalizedModuleId,
				renderedModule,
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
	const chunkAnalyses = new Map();
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
		const segments = [];
		for (const segment of decodeSourceMapSegments(map, chunk.fileName)) {
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
				origCol: segment.origCol,
				origLine: segment.origLine,
				source,
			});
		}
		chunkAnalyses.set(chunk, { hasMap: true, segments });
	}

	return contexts.flatMap((context) => {
		const sourcePath = path.relative(projectDirectory, context.sourceFile);
		const mintSpans = context.mintSpans ?? [];
		const familyCopies = [];
		for (const [moduleId, moduleChunks] of chunksForSource) {
			const isSourceModule = moduleId === context.sourceFile;
			const isSourceQueryModule = moduleId.startsWith(`${context.sourceFile}?`);
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
						'Context chunk isolation guard did not analyze a chunk delivering a context source module.',
					);
				}

				// A copy mints the context when the bundler's map attributes
				// an emitted call to one of the recorded mint spans in this
				// exact module copy (the map's resolved source id matches the
				// copy's module id — a sibling copy in the same chunk is a
				// different source id, so per-copy attribution stays exact).
				const minted =
					chunkAnalysis.hasMap &&
					chunkAnalysis.segments.some(
						(segment) =>
							segment.source === moduleChunk.moduleId &&
							mintSpans.some((span) =>
								renderedSegmentMatchesSpan(segment, span),
							),
					);
				familyCopies.push({
					chunkName: moduleChunk.chunkName,
					hasMap: chunkAnalysis.hasMap,
					minted,
				});
			}
		}

		if (familyCopies.length === 0) {
			return [
				`${context.name} in ${sourcePath} is not present in a client chunk.`,
			];
		}

		const mintingCopies = familyCopies.filter((copy) => copy.minted);
		const copyCount = familyCopies.length;
		// A delivered copy whose chunk emits no source map cannot be checked:
		// it may mint the context like any other copy, so attribution is
		// incomplete and the verdict fails closed whenever more than one copy
		// exists. A single copy needs no attribution at all.
		if (copyCount >= 2 && familyCopies.some((copy) => !copy.hasMap)) {
			throw new Error(
				`Context chunk isolation guard cannot classify how ${context.name} in ${sourcePath} is created: the build emits no source map for a client chunk delivering its source.`,
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

			// A single delivered copy with no attributed mint stays green:
			// with only one copy there is nothing to duplicate, and the mint
			// not being in the bundle at all is likewise inert.
			return [];
		}

		if (mintingCopies.length === 1) {
			return [];
		}

		const chunkNames = new Set(mintingCopies.map((copy) => copy.chunkName));
		if (chunkNames.size === 1) {
			return [
				`${context.name} in ${sourcePath} is created by multiple client modules in chunk: ${[...chunkNames].join(', ')}.`,
			];
		}

		return [
			`${context.name} in ${sourcePath} is present in multiple client chunks: ${[...chunkNames].join(', ')}.`,
		];
	});
};

export const findContextInventoryViolations = (
	contexts,
	contextInventory,
	projectDirectory,
) => {
	const discoveredContexts = new Set(
		contexts.map(
			(context) =>
				`${context.name} in ${path.relative(projectDirectory, context.sourceFile)}`,
		),
	);
	const expectedContexts = new Set(
		contextInventory.map(
			(context) => `${context.name} in ${context.sourceFile}`,
		),
	);
	const violations = [];

	for (const expectedContext of expectedContexts) {
		if (!discoveredContexts.has(expectedContext)) {
			violations.push(
				`Expected context inventory entry ${expectedContext} is missing from the TypeScript program.`,
			);
		}
	}

	for (const discoveredContext of discoveredContexts) {
		if (!expectedContexts.has(discoveredContext)) {
			violations.push(
				`Discovered React context ${discoveredContext} is missing from the checked-in inventory.`,
			);
		}
	}

	return violations;
};

const findTypeScriptProgramCoverageViolations = (
	programSourceFiles,
	chunks,
	workspaceDirectory,
) => {
	const workspaceDirectoryPrefix = `${normalizeModuleId(workspaceDirectory)}/`;
	const missingSourceFiles = new Set();

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

export const contextChunkIsolationPlugin = ({
	contextInventory,
	tsconfigPath,
	workspaceDirectory = path.dirname(tsconfigPath),
}) => {
	let contexts = [];
	let programSourceFiles = new Set();
	let forcedSourcemap = false;

	return {
		name: 'publy:context-chunk-isolation',
		apply: 'build',
		applyToEnvironment: (environment) => environment.name === 'client',
		// Rendered attribution reads the bundler's own source map, so the
		// client build must emit one. 'hidden' writes the map without the
		// sourceMappingURL comment; when the user configured sourcemaps
		// themselves, their choice stands and the maps are theirs to keep.
		config(config) {
			const clientBuild = config.environments?.client?.build ?? config.build;
			if (clientBuild?.sourcemap === undefined) {
				clientBuild.sourcemap = 'hidden';
				forcedSourcemap = true;
			}
		},
		buildStart() {
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
		generateBundle(outputOptions, bundle) {
			const chunks = Object.values(bundle).filter(
				(output) => output.type === 'chunk',
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
			// guard's internal sourcemap requirement. The assets are removed
			// by their bundle identity (any emitted asset named *.map), never
			// by a filename derived from the chunk — the output may rename map
			// files via `sourcemapFileNames` and the leak must not depend on
			// the default `${chunk.fileName}.map` convention.
			if (forcedSourcemap) {
				for (const [fileName, output] of Object.entries(bundle)) {
					if (output.type === 'asset' && fileName.endsWith('.map')) {
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
