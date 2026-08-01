import path from 'node:path';

import {
	isCallExpression,
	isElementAccessExpression,
	isExportSpecifier,
	isIdentifier,
	isImportSpecifier,
	isPropertyAccessExpression,
	isVariableDeclaration,
} from 'typescript/unstable/ast/is';
import { API, SymbolFlags } from 'typescript/unstable/sync';

const REACT_TYPE_DECLARATION = /[/\\]@types[/\\]react[/\\]index\.d\.ts$/;

const normalizeModuleId = (moduleId) =>
	path.normalize(moduleId.split('?')[0]).replaceAll('\\', '/');

const symbolForExpression = (checker, expression) =>
	isElementAccessExpression(expression)
		? checker.getSymbolAtLocation(expression.argumentExpression)
		: checker.getSymbolAtLocation(expression);

const isContextFactoryAdapterCall = (expression) =>
	isCallExpression(expression) &&
	isPropertyAccessExpression(expression.expression) &&
	['apply', 'bind', 'call'].includes(expression.expression.name.getText());

const isReactContextFactoryValue = (checker, node, reactCreateContext) => {
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

	return createContext;
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

export const findReactContextDeclarations = (tsconfigPath) => {
	const api = new API();

	try {
		const snapshot = api.updateSnapshot({ openProjects: [tsconfigPath] });
		const project = snapshot.getProject(tsconfigPath);
		if (!project) {
			throw new Error(
				`Context chunk isolation guard could not load ${tsconfigPath}.`,
			);
		}

		const reactCreateContext = findReactCreateContextSymbol(
			project.program,
			project.checker,
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
				if (
					isReactContextFactoryValue(project.checker, node, reactCreateContext)
				) {
					contexts.push({
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

export const findContextChunkIsolationViolations = (contexts, chunks) => {
	const chunksForSource = new Map();

	for (const chunk of chunks) {
		for (const moduleId of Object.keys(chunk.modules)) {
			const normalizedModuleId = normalizeModuleId(moduleId);
			const chunkNames = chunksForSource.get(normalizedModuleId) ?? [];
			chunkNames.push(chunk.fileName);
			chunksForSource.set(normalizedModuleId, chunkNames);
		}
	}

	return contexts.flatMap((context) => {
		const chunkNames = chunksForSource.get(context.sourceFile) ?? [];
		if (chunkNames.length < 2) {
			return [];
		}

		return [
			`${context.name} in ${path.relative(process.cwd(), context.sourceFile)} is present in multiple client chunks: ${chunkNames.join(', ')}.`,
		];
	});
};

export const contextChunkIsolationPlugin = ({ tsconfigPath }) => {
	let contexts = [];

	return {
		name: 'publy:context-chunk-isolation',
		apply: 'build',
		applyToEnvironment: (environment) => environment.name === 'client',
		buildStart() {
			contexts = findReactContextDeclarations(tsconfigPath);
		},
		generateBundle(_outputOptions, bundle) {
			const chunks = Object.values(bundle).filter(
				(output) => output.type === 'chunk',
			);
			const violations = findContextChunkIsolationViolations(contexts, chunks);
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
