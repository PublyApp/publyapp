import path from 'node:path';

import { SyntaxKind } from 'typescript/unstable/ast';
import {
	isBindingElement,
	isBinaryExpression,
	isCallExpression,
	isElementAccessExpression,
	isExportSpecifier,
	isIdentifier,
	isImportSpecifier,
	isObjectLiteralExpression,
	isObjectBindingPattern,
	isParenthesizedExpression,
	isPropertyAssignment,
	isPropertyAccessExpression,
	isShorthandPropertyAssignment,
	isStringLiteral,
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

const isReactContextFactoryValue = (checker, node, reactCreateContext) => {
	assertStaticReactElementAccess(checker, node, reactCreateContext);

	if (
		(!isElementAccessExpression(node) &&
			!isIdentifier(node) &&
			!isPropertyAccessExpression(node)) ||
		isExportSpecifier(node.parent) ||
		isImportSpecifier(node.parent) ||
		(isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
		(isCallExpression(node.parent) && node.parent.expression === node)
	) {
		return false;
	}

	return resolvesToReactCreateContext(
		checker,
		symbolForExpression(checker, node),
		reactCreateContext,
	);
};

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

const findReactCreateContextSymbol = (program, checker) => {
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
	const createContext = reactModule
		? checker
				.getExportsOfModule(reactModule)
				.find((symbol) => symbol.name === 'createContext')
		: undefined;

	if (!createContext) {
		throw new Error(
			'Context chunk isolation guard could not resolve React.createContext.',
		);
	}

	return { createContext, reactModule };
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

// Rolldown currently collapses most aliases to these property-access forms
// before this parser runs. That is observed bundler behavior, not a guaranteed
// contract, so module-local aliases are resolved below and other context
// initializer callees must fail closed.
const isRenderedCreateContextCallee = (expression, createContextAliases) => {
	if (isIdentifier(expression)) {
		return (
			expression.text === 'createContext' ||
			createContextAliases.has(expression.text)
		);
	}

	if (isPropertyAccessExpression(expression)) {
		return expression.name.text === 'createContext';
	}

	if (isElementAccessExpression(expression)) {
		return (
			isStringLiteral(expression.argumentExpression) &&
			expression.argumentExpression.text === 'createContext'
		);
	}

	if (isParenthesizedExpression(expression)) {
		return isRenderedCreateContextCallee(
			expression.expression,
			createContextAliases,
		);
	}

	return (
		isBinaryExpression(expression) &&
		expression.operatorToken.kind === SyntaxKind.CommaToken &&
		isRenderedCreateContextCallee(expression.right, createContextAliases)
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

const analyzeRenderedContextModule = (
	sourceFile,
	expectedContextNames,
	moduleLabel,
) => {
	const recognizedContextNames = new Set();
	const createContextAliases = findRenderedCreateContextAliases(sourceFile);
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
					expectedContextNames.has(declaration.name.text)
				) {
					recognizedContextNames.add(declaration.name.text);
				} else {
					hasUnattributedCreateContextCall = true;
				}
			} else if (expressionContainsCreateContextName(node.expression)) {
				throw new Error(
					`Context chunk isolation guard cannot prove an unrecognized rendered createContext callee in ${moduleLabel}.`,
				);
			} else {
				const declaration = node.parent;
				if (
					isVariableDeclaration(declaration) &&
					declaration.initializer === node &&
					isIdentifier(declaration.name) &&
					expectedContextNames.has(declaration.name.text)
				) {
					throw new Error(
						`Context chunk isolation guard cannot prove how ${declaration.name.text} is created in ${moduleLabel}.`,
					);
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
					entry.expectedContextNames,
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

		const { createContext: reactCreateContext } = findReactCreateContextSymbol(
			project.program,
			project.checker,
		);
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

				if (
					isReactContextFactoryValue(project.checker, node, reactCreateContext)
				) {
					contexts.push({
						isFactoryValue: true,
						name: '<React.createContext factory value>',
						sourceFile: normalizeModuleId(sourceFile.fileName),
					});
				}

				if (isCallExpression(node)) {
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
						});
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

	const contextNamesBySource = new Map();
	for (const context of contexts) {
		const contextNames =
			contextNamesBySource.get(context.sourceFile) ?? new Set();
		contextNames.add(context.name);
		contextNamesBySource.set(context.sourceFile, contextNames);
	}

	const analyzedSourceFiles = new Set();
	const renderedModulesToAnalyze = [];
	for (const [sourceFile, expectedContextNames] of contextNamesBySource) {
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

		if (virtualModuleChunks.length === 0) {
			continue;
		}

		analyzedSourceFiles.add(sourceFile);
		for (const moduleChunk of [
			...(chunksForSource.get(sourceFile) ?? []),
			...virtualModuleChunks,
		]) {
			renderedModulesToAnalyze.push({
				...moduleChunk,
				expectedContextNames,
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
		let contextCreatingModuleCount = 0;
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
		if (contextCreatingModuleCount === 0 && !context.isFactoryValue) {
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
