import path from 'node:path';

import {
	isBindingElement,
	isCallExpression,
	isElementAccessExpression,
	isExportSpecifier,
	isIdentifier,
	isImportSpecifier,
	isObjectLiteralExpression,
	isObjectBindingPattern,
	isPropertyAssignment,
	isPropertyAccessExpression,
	isShorthandPropertyAssignment,
	isStringLiteral,
	isVariableDeclaration,
} from 'typescript/unstable/ast/is';
import { API, SymbolFlags } from 'typescript/unstable/sync';

const REACT_TYPE_DECLARATION = /[/\\]@types[/\\]react[/\\]index\.d\.ts$/;
const TANSTACK_ROUTE_VIRTUAL_MODULE = /[?&]tsr-(?:shared|split)=/;
const SOURCE_MODULE_EXTENSION = /\.[cm]?[jt]sx?$/;
const MINIMUM_CONTEXT_COUNT = 4;

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

	if (!isVariableDeclaration(declaration) || !declaration.initializer) {
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
	if (!isVariableDeclaration(declaration) || !declaration.initializer) {
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

const containsReactCreateContextCall = (renderedModule) =>
	typeof renderedModule.code === 'string' &&
	/\bcreateContext\s*\(/.test(renderedModule.code);

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
			moduleChunks.push({ chunkName: chunk.fileName, renderedModule });
			chunksForSource.set(normalizedModuleId, moduleChunks);
		}
	}

	return contexts.flatMap((context) => {
		const chunkNames = new Set();
		for (const [moduleId, moduleChunks] of chunksForSource) {
			if (
				moduleId !== context.sourceFile &&
				(!moduleId.startsWith(`${context.sourceFile}?`) ||
					(TANSTACK_ROUTE_VIRTUAL_MODULE.test(moduleId) &&
						!moduleChunks.some(({ renderedModule }) =>
							containsReactCreateContextCall(renderedModule),
						)))
			) {
				continue;
			}

			for (const { chunkName } of moduleChunks) {
				chunkNames.add(chunkName);
			}
		}

		const sourcePath = path.relative(projectDirectory, context.sourceFile);
		if (chunkNames.size === 0 && !context.isFactoryValue) {
			return [
				`${context.name} in ${sourcePath} is not present in a client chunk.`,
			];
		}

		if (chunkNames.size < 2) {
			return [];
		}

		return [
			`${context.name} in ${sourcePath} is present in multiple client chunks: ${[...chunkNames].join(', ')}.`,
		];
	});
};

const findTypeScriptProgramCoverageViolations = (
	programSourceFiles,
	chunks,
	sourceDirectory,
) => {
	const sourceDirectoryPrefix = `${normalizeModuleId(sourceDirectory)}/`;
	const missingSourceFiles = new Set();

	for (const chunk of chunks) {
		for (const moduleId of Object.keys(chunk.modules)) {
			const sourceFile = sourceFileForModuleId(moduleId);
			if (
				!sourceFile.startsWith(sourceDirectoryPrefix) ||
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
			`Vite source module ${path.relative(sourceDirectory, sourceFile)} is not present in the TypeScript program.`,
	);
};

export const contextChunkIsolationPlugin = ({ tsconfigPath }) => {
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
			if (contexts.length < MINIMUM_CONTEXT_COUNT) {
				throw new Error(
					`Context chunk isolation guard expected at least ${MINIMUM_CONTEXT_COUNT} React contexts but found ${contexts.length}.`,
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
					path.join(projectDirectory, 'src'),
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
