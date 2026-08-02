import path from 'node:path';

import { SyntaxKind } from 'typescript/unstable/ast';
import {
	isArrayBindingPattern,
	isArrayLiteralExpression,
	isAsExpression,
	isBindingElement,
	isBinaryExpression,
	isCallExpression,
	isClassDeclaration,
	isElementAccessExpression,
	isExportAssignment,
	isFunctionDeclaration,
	isIdentifier,
	isInterfaceDeclaration,
	isNonNullExpression,
	isObjectBindingPattern,
	isObjectLiteralExpression,
	isParenthesizedExpression,
	isPropertyAssignment,
	isPropertyAccessExpression,
	isPropertyDeclaration,
	isSatisfiesExpression,
	isShorthandPropertyAssignment,
	isStringLiteral,
	isTypeAliasDeclaration,
	isTypeAssertion,
	isVariableDeclaration,
} from 'typescript/unstable/ast/is';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
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

// Transparent expression wrappers (parens, `as`, `!`, `satisfies`) and comma
// chains keep the wrapped call as the holder's value, so the holder-position
// check walks through them: `{ probe: createStrictContext(null) as
// StrictContext<null> }` and `{ probe: (0, createStrictContext(null)) }` are
// still holder-position mints. A comma expression returns only its right
// operand, so only a call that sits on the right side of a comma can be the
// holder's value — `{ probe: (createStrictContext(null), 0) }` discards the
// context and must not invent an `<anonymous context>` inventory entry.
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
			(isBinaryExpression(parent) &&
				parent.operatorToken.kind === SyntaxKind.CommaToken &&
				parent.right === current)
		) {
			current = parent;
			continue;
		}

		return parent;
	}
};

// The bare callee name after bundler transforms: identifier text, property
// access member name, string-literal element access, or the right side of a
// comma chain. Used to match a rendered minting call against the callee the
// source scan recorded for the file's holder positions.
const calleeNameOf = (expression) => {
	if (isIdentifier(expression)) {
		return expression.text;
	}

	if (isPropertyAccessExpression(expression)) {
		return expression.name.text;
	}

	if (
		isElementAccessExpression(expression) &&
		isStringLiteral(expression.argumentExpression)
	) {
		return expression.argumentExpression.text;
	}

	if (isParenthesizedExpression(expression)) {
		return calleeNameOf(expression.expression);
	}

	if (
		isBinaryExpression(expression) &&
		expression.operatorToken.kind === SyntaxKind.CommaToken
	) {
		return calleeNameOf(expression.right);
	}

	return undefined;
};

const declaredExportNameOf = (checker, symbol) => {
	if (symbol.name !== 'default') {
		return symbol.name;
	}

	// A default export binds the value's own name: tsgo resolves an
	// `export default identifier` import straight to the value symbol, but an
	// `export default function/class Name` import resolves to a symbol named
	// 'default' whose declaration carries the real declared name — the name
	// the bundler emits.
	for (const declaration of symbol.declarations ?? []) {
		const resolvedDeclaration = declaration.resolve();
		if (!resolvedDeclaration) {
			continue;
		}

		if (
			(isFunctionDeclaration(resolvedDeclaration) ||
				isClassDeclaration(resolvedDeclaration)) &&
			resolvedDeclaration.name
		) {
			return resolvedDeclaration.name.text;
		}

		if (isExportAssignment(resolvedDeclaration)) {
			const expressionSymbol = checker.getSymbolAtLocation(
				resolvedDeclaration.expression,
			);
			if (expressionSymbol) {
				return expressionSymbol.name;
			}
		}
	}

	return undefined;
};

// The callee identities of a minting call: the syntactic name plus the
// declared export names the callee's symbol resolves to. A bundler resolves
// imports to the exporting module's declared name, so `import {
// createStrictContext as mk }`, `import mkDefault from …`, and barrel
// re-exports all render as `createStrictContext` — the local spelling is
// exactly what the bundler is free to rewrite. The module-local spelling is
// kept for callees declared in the same module, whose rendered name is the
// binding name. Identity is by declared name, not by module: two factories
// with the same export name both mint contexts, so either attribution is
// correct for the holder gate.
//
// An unnameable callee (an IIFE wrapper: `{ p: (() => mk(null))() }`) has no
// name of its own, but the call it executes does — the wrapper's value is
// that call's result — so when no direct identity exists, the callee
// expression is searched for the calls it runs.
const mintingCalleeNames = (checker, expression) => {
	const names = new Set();
	const localName = calleeNameOf(expression);
	if (localName !== undefined) {
		names.add(localName);
	}

	const seenSymbolIds = new Set();
	let resolvedSymbol = isElementAccessExpression(expression)
		? checker.getSymbolAtLocation(expression.argumentExpression)
		: checker.getSymbolAtLocation(expression);
	while (
		resolvedSymbol &&
		resolvedSymbol.flags & SymbolFlags.Alias &&
		!seenSymbolIds.has(resolvedSymbol.id)
	) {
		seenSymbolIds.add(resolvedSymbol.id);
		resolvedSymbol = checker.getAliasedSymbol(resolvedSymbol);
	}

	if (resolvedSymbol && !seenSymbolIds.has(resolvedSymbol.id)) {
		const declaredName = declaredExportNameOf(checker, resolvedSymbol);
		if (declaredName) {
			names.add(declaredName);
		}
	}

	if (names.size === 0) {
		const visit = (node) => {
			if (names.size > 0) {
				return;
			}

			if (isCallExpression(node)) {
				for (const name of mintingCalleeNames(checker, node.expression)) {
					names.add(name);
				}
				return;
			}

			node.forEachChild(visit);
		};
		visit(expression);
	}

	return [...names];
};

// Rolldown currently collapses most aliases to these property-access forms
// before this parser runs. That is observed bundler behavior, not a guaranteed
// contract, so module-local aliases are resolved below and other context
// initializer callees must fail closed.
const isRenderedCreateContextCallee = (expression, createContextAliases) => {
	const name = calleeNameOf(expression);
	return (
		name === 'createContext' ||
		(name !== undefined && createContextAliases.has(name))
	);
};

const findRenderedCreateContextAliases = (sourceFile) => {
	const aliases = new Set();
	const declarations = [];
	const visit = (node) => {
		if (
			isVariableDeclaration(node) &&
			isIdentifier(node.name) &&
			node.initializer
		) {
			declarations.push(node);
		}

		node.forEachChild(visit);
	};

	visit(sourceFile);
	let previousAliasCount = -1;
	while (previousAliasCount !== aliases.size) {
		previousAliasCount = aliases.size;
		for (const declaration of declarations) {
			if (
				!aliases.has(declaration.name.text) &&
				isRenderedCreateContextCallee(declaration.initializer, aliases)
			) {
				aliases.add(declaration.name.text);
			}
		}
	}

	return aliases;
};

const expressionContainsCreateContextName = (expression) => {
	let containsCreateContextName = false;
	const visit = (node) => {
		if (
			(isIdentifier(node) && node.text === 'createContext') ||
			(isStringLiteral(node) && node.text === 'createContext')
		) {
			containsCreateContextName = true;
			return;
		}

		if (!containsCreateContextName) {
			node.forEachChild(visit);
		}
	};

	visit(expression);
	return containsCreateContextName;
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

// Rolldown deconflicts duplicate bindings of the same source module by
// suffixing one copy's names ($1, $2, ...), observed as `ProbeContext$1` in
// the two-creators-share-one-chunk fixture. Matching must ignore that
// suffix, or a renamed copy slips past the name-keyed fail-closed checks.
const normalizeRenderedBindingName = (name) => name.replace(/\$\d+$/, '');

// A rendered binding pattern that binds an expected context name through an
// unrecognized callee cannot be attributed. Only the pattern's own bound
// names count: `const { probe: ProbeContext } = makeContexts(null)` binds
// ProbeContext, and if that name is expected the rendered copy is treated the
// same way an unrecognized identifier binding is — it cannot be proven not to
// mint. Nested patterns (`const { inner: { probe: ProbeContext } } = …`)
// recurse; elided array elements have no name and are skipped.
const bindingPatternBoundExpectedName = (pattern, expectedContextNames) => {
	if (!isObjectBindingPattern(pattern) && !isArrayBindingPattern(pattern)) {
		return undefined;
	}

	for (const element of pattern.elements) {
		if (!isBindingElement(element)) {
			continue;
		}

		const name = element.name;
		if (isIdentifier(name)) {
			const normalizedName = normalizeRenderedBindingName(name.text);
			if (expectedContextNames.has(normalizedName)) {
				return normalizedName;
			}
		} else if (name) {
			const nestedName = bindingPatternBoundExpectedName(
				name,
				expectedContextNames,
			);
			if (nestedName) {
				return nestedName;
			}
		}
	}

	return undefined;
};

// A rendered holder-position call mints when its callee matches an
// attributed minting callee. An unnameable callee (an IIFE: `{ p: (() =>
// createStrictContext(null))() }`) has no direct name, but the call it
// executes determines the holder value, so the callee expression is searched
// for a nested call to an attributed minting callee. The search is bounded to
// unnameable callees so an argument-position mint inside a nameable outer
// call (`wrap(createStrictContext(null))`) is not mistaken for the holder
// value.
const renderedHolderCallMints = (expression, holderMintingCallees) => {
	if (!holderMintingCallees || holderMintingCallees.size === 0) {
		return false;
	}

	const directName = normalizeRenderedBindingName(
		calleeNameOf(expression) ?? '',
	);
	if (holderMintingCallees.has(directName)) {
		return true;
	}

	if (calleeNameOf(expression) !== undefined) {
		return false;
	}

	let containsMintingCall = false;
	const visit = (node) => {
		if (containsMintingCall) {
			return;
		}

		if (isCallExpression(node)) {
			const name = normalizeRenderedBindingName(
				calleeNameOf(node.expression) ?? '',
			);
			if (holderMintingCallees.has(name)) {
				containsMintingCall = true;
				return;
			}
		}

		node.forEachChild(visit);
	};
	visit(expression);
	return containsMintingCall;
};

const analyzeRenderedContextModule = (
	sourceFile,
	expectedContexts,
	moduleLabel,
) => {
	const recognizedContextNames = new Set();
	const createContextAliases = findRenderedCreateContextAliases(sourceFile);
	const expectedContextNames = new Set(expectedContexts.keys());
	// The only holder-position calls a rendered copy can be proven to mint
	// through are the callees the source scan attributed to the file's
	// `<anonymous context>` entries. Anything else in a holder position —
	// TanStack's own `component: lazyRouteComponent(…)` split shim among them —
	// is a call whose value is not known to be a context, and must not be
	// counted as one.
	const holderMintingCallees = expectedContexts.get('<anonymous context>');
	let hasUnattributedCreateContextCall = false;

	const visit = (node) => {
		if (isCallExpression(node)) {
			if (
				isRenderedCreateContextCallee(node.expression, createContextAliases)
			) {
				const declaration = node.parent;
				if (
					isVariableDeclaration(declaration) &&
					declaration.initializer === node &&
					isIdentifier(declaration.name) &&
					expectedContextNames.has(
						normalizeRenderedBindingName(declaration.name.text),
					)
				) {
					recognizedContextNames.add(
						normalizeRenderedBindingName(declaration.name.text),
					);
				} else {
					hasUnattributedCreateContextCall = true;
				}
			} else if (expressionContainsCreateContextName(node.expression)) {
				throw new Error(
					`Context chunk isolation guard cannot prove an unrecognized rendered createContext callee in ${moduleLabel}.`,
				);
			} else {
				const declaration = holderPositionOfCall(node);
				if (
					(isPropertyAssignment(declaration) ||
						isArrayLiteralExpression(declaration) ||
						isExportAssignment(declaration)) &&
					renderedHolderCallMints(node.expression, holderMintingCallees)
				) {
					// A factory-minted holder position (object property, array
					// element, export default) whose callee is one the source
					// scan attributed to the file's anonymous context: fail
					// closed, the same way an unattributed createContext call
					// does.
					hasUnattributedCreateContextCall = true;
				} else if (
					isVariableDeclaration(declaration) &&
					declaration.initializer === node &&
					isIdentifier(declaration.name) &&
					expectedContextNames.has(
						normalizeRenderedBindingName(declaration.name.text),
					)
				) {
					throw new Error(
						`Context chunk isolation guard cannot prove how ${declaration.name.text} is created in ${moduleLabel}.`,
					);
				} else if (
					isVariableDeclaration(declaration) &&
					declaration.initializer === node &&
					!isIdentifier(declaration.name)
				) {
					const boundName = bindingPatternBoundExpectedName(
						declaration.name,
						expectedContextNames,
					);
					if (boundName) {
						throw new Error(
							`Context chunk isolation guard cannot prove how ${boundName} is created in ${moduleLabel}.`,
						);
					}
				}
			}
		}

		node.forEachChild(visit);
	};

	visit(sourceFile);
	return { hasUnattributedCreateContextCall, recognizedContextNames };
};

const analyzeRenderedContextModules = (entries) => {
	const analyses = new Map();
	if (entries.length === 0) {
		return analyses;
	}

	const virtualRoot = '/publy-context-chunk-isolation';
	const configPath = `${virtualRoot}/tsconfig.json`;
	const files = {};
	const sourceFiles = [];

	for (const [index, entry] of entries.entries()) {
		if (typeof entry.renderedModule.code !== 'string') {
			throw new Error(
				`Context chunk isolation guard cannot inspect rendered code for ${entry.moduleId} in ${entry.chunkName}.`,
			);
		}

		const fileName = `module-${index}.js`;
		const filePath = `${virtualRoot}/${fileName}`;
		files[filePath] = entry.renderedModule.code;
		sourceFiles.push({ entry, fileName, filePath });
	}

	files[configPath] = JSON.stringify({
		compilerOptions: { allowJs: true, checkJs: false, noEmit: true },
		files: sourceFiles.map(({ fileName }) => fileName),
	});

	const api = new API({ cwd: '/', fs: createVirtualFileSystem(files) });
	try {
		const snapshot = api.updateSnapshot({ openProjects: [configPath] });
		const project = snapshot.getProject(configPath);
		if (!project) {
			throw new Error(
				'Context chunk isolation guard could not parse rendered client modules.',
			);
		}

		for (const { entry, filePath } of sourceFiles) {
			const diagnostics = project.program.getSyntacticDiagnostics(filePath);
			const sourceFile = project.program.getSourceFile(filePath);
			if (!sourceFile || diagnostics.length > 0) {
				throw new Error(
					`Context chunk isolation guard cannot parse rendered code for ${entry.moduleId} in ${entry.chunkName}.`,
				);
			}

			analyses.set(
				entry.renderedModule,
				analyzeRenderedContextModule(
					sourceFile,
					entry.expectedContexts,
					`${entry.moduleId} in ${entry.chunkName}`,
				),
			);
		}
	} finally {
		api.close();
	}

	return analyses;
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
						contexts.push({
							name: binding.name,
							sourceFile: normalizeModuleId(sourceFile.fileName),
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
						contexts.push({
							name: binding.name,
							sourceFile: normalizeModuleId(sourceFile.fileName),
						});
					}
				}

				if (isCallExpression(node)) {
					const position = holderPositionOfCall(node);
					const isDeclarationInitializer =
						(isVariableDeclaration(position) ||
							isPropertyDeclaration(position)) &&
						position.initializer === node;
					if (!isDeclarationInitializer) {
						const isHolderPosition =
							isPropertyAssignment(position) ||
							isArrayLiteralExpression(position) ||
							isExportAssignment(position);
						if (
							isHolderPosition &&
							typeContainsReactContext(
								project.checker,
								project.checker.getTypeAtLocation(node),
								reactContextType,
							)
						) {
							contexts.push({
								name: '<anonymous context>',
								sourceFile: normalizeModuleId(sourceFile.fileName),
								mintingCallees: mintingCalleeNames(
									project.checker,
									node.expression,
								),
							});
						} else {
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
									mintingCallees: mintingCalleeNames(
										project.checker,
										node.expression,
									),
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
	contexts,
	chunks,
	projectDirectory = process.cwd(),
) => {
	const chunksForSource = new Map();

	for (const chunk of chunks) {
		for (const [moduleId, renderedModule] of Object.entries(chunk.modules)) {
			const normalizedModuleId = normalizeModuleId(moduleId);
			const moduleChunks = chunksForSource.get(normalizedModuleId) ?? [];
			moduleChunks.push({
				chunkName: chunk.fileName,
				moduleId: normalizedModuleId,
				renderedModule,
			});
			chunksForSource.set(normalizedModuleId, moduleChunks);
		}
	}

	// Per source file, the expected contexts map to the callee names the
	// source scan attributed to their holder-position mints; the rendered
	// holder fail-closed only fires for those callees.
	const contextsBySource = new Map();
	for (const context of contexts) {
		const contextCallees =
			contextsBySource.get(context.sourceFile) ?? new Map();
		const mintingCallees = contextCallees.get(context.name) ?? new Set();
		for (const callee of context.mintingCallees ?? []) {
			mintingCallees.add(callee);
		}

		contextCallees.set(context.name, mintingCallees);
		contextsBySource.set(context.sourceFile, contextCallees);
	}

	const analyzedSourceFiles = new Set();
	const renderedModulesToAnalyze = [];
	for (const [sourceFile, expectedContexts] of contextsBySource) {
		const virtualModuleChunks = [];
		for (const [moduleId, moduleChunks] of chunksForSource) {
			if (!moduleId.startsWith(`${sourceFile}?`)) {
				continue;
			}

			if (!TANSTACK_SOURCE_SIBLING_VIRTUAL_MODULE.test(moduleId)) {
				throw new Error(
					`Context chunk isolation guard cannot prove an unrecognized source-derived query module ${moduleId}; verify its transform semantics before adding its TanStack sibling family to the curated allowlist.`,
				);
			}

			virtualModuleChunks.push(...moduleChunks);
		}

		const sourceModuleChunks = chunksForSource.get(sourceFile) ?? [];
		if (sourceModuleChunks.length === 0 && virtualModuleChunks.length === 0) {
			continue;
		}

		analyzedSourceFiles.add(sourceFile);
		for (const moduleChunk of [...sourceModuleChunks, ...virtualModuleChunks]) {
			renderedModulesToAnalyze.push({
				...moduleChunk,
				expectedContexts,
			});
		}
	}

	const renderedContextAnalyses = analyzeRenderedContextModules(
		renderedModulesToAnalyze,
	);
	const renderedModuleCreatesContext = (renderedModule, contextName) => {
		const analysis = renderedContextAnalyses.get(renderedModule);
		if (!analysis) {
			throw new Error(
				'Context chunk isolation guard did not analyze a relevant rendered module.',
			);
		}

		return (
			analysis.hasUnattributedCreateContextCall ||
			analysis.recognizedContextNames.has(contextName)
		);
	};

	return contexts.flatMap((context) => {
		const chunkNames = new Set();
		const sourceChunkNames = new Set();
		let contextCreatingModuleCount = 0;
		let sourceModuleCopyCount = 0;
		const hasRenderedContextAnalysis = analyzedSourceFiles.has(
			context.sourceFile,
		);
		for (const [moduleId, moduleChunks] of chunksForSource) {
			const isSourceModule = moduleId === context.sourceFile;
			const isSourceQueryModule = moduleId.startsWith(`${context.sourceFile}?`);
			if (
				!isSourceModule &&
				(!isSourceQueryModule ||
					!TANSTACK_SOURCE_SIBLING_VIRTUAL_MODULE.test(moduleId))
			) {
				continue;
			}

			const inspectRenderedContext =
				hasRenderedContextAnalysis &&
				(isSourceModule ||
					TANSTACK_SOURCE_SIBLING_VIRTUAL_MODULE.test(moduleId));
			for (const { chunkName, renderedModule } of moduleChunks) {
				// Every module-chunk pair is a delivered copy of the
				// context's source, whether or not it is attributed a mint.
				// The fail-closed branch counts copies, not the chunks they
				// landed in: advanced chunk grouping can put two copies in
				// one chunk, and a chunk name is a container, not a copy.
				sourceModuleCopyCount += 1;
				sourceChunkNames.add(chunkName);
				if (
					inspectRenderedContext &&
					!renderedModuleCreatesContext(renderedModule, context.name)
				) {
					continue;
				}

				contextCreatingModuleCount += 1;
				chunkNames.add(chunkName);
			}
		}

		const sourcePath = path.relative(projectDirectory, context.sourceFile);
		if (contextCreatingModuleCount === 0) {
			if (sourceModuleCopyCount >= 2) {
				throw new Error(
					`Context chunk isolation guard cannot classify how ${context.name} in ${sourcePath} is created: its source is delivered in ${sourceModuleCopyCount} client module copies (${[...sourceChunkNames].join(', ')}) and no rendered copy is attributed a mint.`,
				);
			}

			if (
				hasRenderedContextAnalysis &&
				chunksForSource.has(context.sourceFile)
			) {
				return [];
			}

			return [
				`${context.name} in ${sourcePath} is not present in a client chunk.`,
			];
		}

		if (contextCreatingModuleCount < 2) {
			return [];
		}

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

	return {
		name: 'publy:context-chunk-isolation',
		apply: 'build',
		applyToEnvironment: (environment) => environment.name === 'client',
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
		generateBundle(_outputOptions, bundle) {
			const chunks = Object.values(bundle).filter(
				(output) => output.type === 'chunk',
			);
			const projectDirectory = path.dirname(tsconfigPath);
			const violations = [
				...findContextChunkIsolationViolations(
					contexts,
					chunks,
					projectDirectory,
				),
				...findTypeScriptProgramCoverageViolations(
					programSourceFiles,
					chunks,
					workspaceDirectory,
				),
			];
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
