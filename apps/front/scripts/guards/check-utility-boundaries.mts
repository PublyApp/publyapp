/**
 * Keeps browser-sensitive date/time and clipboard capabilities behind the
 * canonical utilities. The guard owns source access, not downstream value
 * flow: every admitted static access to the real global capability symbols is
 * rejected outside the two canonical files.
 */

import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ts } from 'ts-morph';

export type UtilityBoundaryFinding = {
	file: string;
	line: number;
	kind: 'date-time' | 'clipboard';
	message: string;
};

type GlobalSymbols = {
	Intl: ts.Symbol;
	navigator: ts.Symbol;
	globalThis: ts.Symbol;
	window: ts.Symbol;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSourceDir = path.resolve(scriptDir, '../../src');
const canonicalFiles = new Set(['utils/format-time.ts', 'utils/clipboard.ts']);
const sourceExtension = /\.[cm]?[jt]sx?$/;
const globalDeclarationsFile = path.join(
	path.dirname(defaultSourceDir),
	'.utility-boundary-globals.d.ts',
);
const globalDeclarations = `
declare var Intl: {
\tDateTimeFormat: { new (...args: unknown[]): unknown };
};
declare var navigator: {
\tclipboard: { writeText: (...args: unknown[]) => unknown };
};
declare var globalThis: { Intl: typeof Intl; navigator: typeof navigator };
declare var window: { Intl: typeof Intl; navigator: typeof navigator };
`;

const isTestFile = (file: string, sourceDir: string): boolean => {
	const relativePath = path.relative(sourceDir, file).split(path.sep).join('/');
	return (
		/(?:^|\/)__tests__\//.test(relativePath) ||
		/\.(?:test|spec|stories)\.[cm]?[jt]sx?$/.test(relativePath)
	);
};

const unwrap = (expression: ts.Expression): ts.Expression => {
	let current = expression;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current) ||
		ts.isNonNullExpression(current) ||
		ts.isTypeAssertionExpression(current) ||
		ts.isPartiallyEmittedExpression(current)
	) {
		if (ts.isParenthesizedExpression(current)) {
			current = current.expression;
		} else if (ts.isAsExpression(current)) {
			current = current.expression;
		} else if (ts.isSatisfiesExpression(current)) {
			current = current.expression;
		} else if (ts.isNonNullExpression(current)) {
			current = current.expression;
		} else if (ts.isTypeAssertionExpression(current)) {
			current = current.expression;
		} else if (ts.isPartiallyEmittedExpression(current)) {
			current = current.expression;
		}
	}
	return current;
};

const staticPropertyName = (
	expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | null => {
	if (ts.isPropertyAccessExpression(expression)) {
		return expression.name.text;
	}

	const argument = expression.argumentExpression;
	return argument && ts.isStringLiteralLike(argument) ? argument.text : null;
};

const propertyParts = (
	expression: ts.Expression,
): { object: ts.Expression; name: string } | null => {
	const unwrapped = unwrap(expression);
	if (
		!ts.isPropertyAccessExpression(unwrapped) &&
		!ts.isElementAccessExpression(unwrapped)
	) {
		return null;
	}

	const name = staticPropertyName(unwrapped);
	return name === null ? null : { object: unwrapped.expression, name };
};

const resolveGlobal = (
	checker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
	name: string,
): ts.Symbol => {
	const symbol = checker.resolveName(
		name,
		sourceFile,
		ts.SymbolFlags.Value | ts.SymbolFlags.Namespace,
		false,
	);
	if (!symbol) {
		throw new Error(`TypeScript global symbol is unavailable: ${name}`);
	}
	return symbol;
};

const globalSymbolsFor = (
	checker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
): GlobalSymbols => {
	const Intl = resolveGlobal(checker, sourceFile, 'Intl');
	const navigator = resolveGlobal(checker, sourceFile, 'navigator');
	const globalThis = resolveGlobal(checker, sourceFile, 'globalThis');
	const window = resolveGlobal(checker, sourceFile, 'window');
	return { Intl, navigator, globalThis, window };
};

type StaticGlobalPath = string[];

const normalizeGlobalPath = (path: StaticGlobalPath): StaticGlobalPath =>
	(path[0] === 'globalThis' || path[0] === 'window') && path.length > 1
		? path.slice(1)
		: path;

const staticGlobalPath = (
	expression: ts.Expression,
	globals: GlobalSymbols,
	checker: ts.TypeChecker,
	seenSymbols: Set<ts.Symbol> = new Set(),
): StaticGlobalPath | null => {
	const unwrapped = unwrap(expression);
	if (ts.isIdentifier(unwrapped)) {
		const symbol = checker.getSymbolAtLocation(unwrapped);
		if (symbol === globals.Intl) {
			return ['Intl'];
		}
		if (symbol === globals.navigator) {
			return ['navigator'];
		}
		if (symbol === globals.globalThis) {
			return ['globalThis'];
		}
		if (symbol === globals.window) {
			return ['window'];
		}
		if (!symbol || seenSymbols.has(symbol)) {
			return null;
		}
		seenSymbols.add(symbol);
		const declarations = symbol.declarations ?? [];
		if (declarations.length !== 1) {
			return null;
		}
		const declaration = declarations[0];
		if (ts.isBindingElement(declaration)) {
			const binding = bindingPath(declaration);
			if (!binding) {
				return null;
			}
			const rootPath = staticGlobalPath(
				binding.initializer,
				globals,
				checker,
				seenSymbols,
			);
			if (!rootPath) {
				return null;
			}
			return normalizeGlobalPath([...rootPath, ...binding.path]);
		}
		if (
			!ts.isVariableDeclaration(declaration) ||
			!declaration.initializer ||
			!ts.isVariableDeclarationList(declaration.parent) ||
			(declaration.parent.flags & ts.NodeFlags.Const) === 0
		) {
			return null;
		}
		return staticGlobalPath(
			declaration.initializer,
			globals,
			checker,
			seenSymbols,
		);
	}
	const parts = propertyParts(expression);
	if (!parts) {
		return null;
	}
	const objectPath = staticGlobalPath(
		parts.object,
		globals,
		checker,
		seenSymbols,
	);
	if (!objectPath) {
		return null;
	}
	return normalizeGlobalPath([...objectPath, parts.name]);
};

const isDateTimeOrigin = (
	expression: ts.Expression,
	globals: GlobalSymbols,
	checker: ts.TypeChecker,
): boolean => {
	return (
		staticGlobalPath(expression, globals, checker)?.join('.') ===
		'Intl.DateTimeFormat'
	);
};

const isClipboardWriteOrigin = (
	expression: ts.Expression,
	globals: GlobalSymbols,
	checker: ts.TypeChecker,
): boolean => {
	return (
		staticGlobalPath(expression, globals, checker)?.join('.') ===
		'navigator.clipboard.writeText'
	);
};

const bindingName = (binding: ts.BindingElement): string | null => {
	const propertyName = binding.propertyName ?? binding.name;
	const expression = ts.isComputedPropertyName(propertyName)
		? unwrap(propertyName.expression)
		: propertyName;
	if (!ts.isIdentifier(expression) && !ts.isStringLiteralLike(expression)) {
		return null;
	}
	return expression.text;
};

const bindingPath = (
	node: ts.BindingElement,
): { initializer: ts.Expression; path: string[] } | null => {
	const path: string[] = [];
	let current = node;
	while (true) {
		const name = bindingName(current);
		if (name === null) {
			return null;
		}
		path.unshift(name);
		const pattern = current.parent;
		if (
			!ts.isObjectBindingPattern(pattern) &&
			!ts.isArrayBindingPattern(pattern)
		) {
			return null;
		}
		if (ts.isBindingElement(pattern.parent)) {
			current = pattern.parent;
			continue;
		}
		const declaration = pattern.parent;
		if (
			!ts.isVariableDeclaration(declaration) ||
			!declaration.initializer ||
			!ts.isVariableDeclarationList(declaration.parent) ||
			(declaration.parent.flags & ts.NodeFlags.Const) === 0
		) {
			return null;
		}
		return { initializer: declaration.initializer, path };
	}
};

const isProtectedBinding = (
	node: ts.BindingElement,
	globals: GlobalSymbols,
	checker: ts.TypeChecker,
): 'date-time' | 'clipboard' | null => {
	const binding = bindingPath(node);
	if (!binding) {
		return null;
	}
	const rootPath = staticGlobalPath(binding.initializer, globals, checker);
	if (!rootPath) {
		return null;
	}
	const fullPath = normalizeGlobalPath([...rootPath, ...binding.path]).join(
		'.',
	);
	if (fullPath === 'Intl.DateTimeFormat') {
		return 'date-time';
	}
	if (fullPath === 'navigator.clipboard.writeText') {
		return 'clipboard';
	}
	return null;
};

const walkSource = (sourceDir: string): string[] => {
	const files: string[] = [];
	const walk = (directory: string): void => {
		for (const entry of readdirSync(directory)) {
			const fullPath = path.join(directory, entry);
			const stats = lstatSync(fullPath);
			if (stats.isSymbolicLink()) {
				throw new Error(
					`source tree contains a symlink, which is not allowed: ${fullPath}`,
				);
			}
			if (stats.isDirectory()) {
				walk(fullPath);
			} else if (stats.isFile() && sourceExtension.test(entry)) {
				files.push(fullPath);
			}
		}
	};

	walk(sourceDir);
	return files.sort();
};

const validateSourceDir = (sourceDir: string): string => {
	const resolved = path.resolve(sourceDir);
	if (path.basename(resolved) !== 'src') {
		throw new Error(
			`source root must be the canonical src directory: ${resolved}`,
		);
	}

	const stats = lstatSync(resolved);
	if (!stats.isDirectory()) {
		throw new Error(`source root is not a directory: ${resolved}`);
	}
	if (realpathSync(resolved) !== resolved) {
		throw new Error(`source root must not be a symlink: ${resolved}`);
	}
	return resolved;
};

const findingFor = (
	file: string,
	sourceDir: string,
	sourceFile: ts.SourceFile,
	node: ts.Node,
	kind: UtilityBoundaryFinding['kind'],
): UtilityBoundaryFinding => ({
	file: path.relative(sourceDir, file).split(path.sep).join('/'),
	line:
		sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
		1,
	kind,
	message:
		kind === 'date-time'
			? 'Use apps/front/src/utils/format-time.ts for date/time formatting.'
			: 'Use apps/front/src/utils/clipboard.ts for clipboard writes.',
});

const createCompilerHost = (): ts.CompilerHost => {
	const host = ts.createCompilerHost({
		allowJs: true,
		jsx: ts.JsxEmit.ReactJSX,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		target: ts.ScriptTarget.ES2022,
		noLib: true,
		noEmit: true,
		skipLibCheck: true,
	});
	const originalGetSourceFile = host.getSourceFile.bind(host);
	host.fileExists = (fileName) =>
		fileName === globalDeclarationsFile || ts.sys.fileExists(fileName);
	host.readFile = (fileName) =>
		fileName === globalDeclarationsFile
			? globalDeclarations
			: ts.sys.readFile(fileName);
	host.getSourceFile = (fileName, languageVersion, onError) =>
		fileName === globalDeclarationsFile
			? ts.createSourceFile(
					fileName,
					globalDeclarations,
					languageVersion,
					true,
					ts.ScriptKind.TS,
				)
			: originalGetSourceFile(fileName, languageVersion, onError);
	return host;
};

export const scanUtilityBoundaries = (
	sourceDir: string = defaultSourceDir,
): UtilityBoundaryFinding[] => {
	const root = validateSourceDir(sourceDir);
	const files = walkSource(root);
	if (files.length === 0) {
		throw new Error(`no TypeScript source files found under ${root}`);
	}

	const program = ts.createProgram(
		[...files, globalDeclarationsFile],
		{
			allowJs: true,
			jsx: ts.JsxEmit.ReactJSX,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			target: ts.ScriptTarget.ES2022,
			noLib: true,
			noEmit: true,
			skipLibCheck: true,
		},
		createCompilerHost(),
	);
	const checker = program.getTypeChecker();
	const globalSourceFile = program.getSourceFile(globalDeclarationsFile);
	if (!globalSourceFile) {
		throw new Error('unknown TypeScript global declarations source');
	}
	const findings: UtilityBoundaryFinding[] = [];
	for (const file of files) {
		const sourceFile = program.getSourceFile(file);
		if (!sourceFile) {
			throw new Error(`unknown source file in TypeScript program: ${file}`);
		}
		for (const diagnostic of program.getSyntacticDiagnostics(sourceFile)) {
			if (!isTestFile(path.resolve(file), root)) {
				throw new Error(
					`unparseable production source: ${file} (${diagnostic.messageText})`,
				);
			}
		}
		const relativePath = path.relative(root, file).split(path.sep).join('/');
		if (isTestFile(file, root) || canonicalFiles.has(relativePath)) {
			continue;
		}
		const globals = globalSymbolsFor(checker, globalSourceFile);
		const visit = (node: ts.Node): void => {
			if (ts.isBindingElement(node)) {
				const kind = isProtectedBinding(node, globals, checker);
				if (kind) {
					findings.push(findingFor(file, root, sourceFile, node, kind));
				}
			}
			if (
				ts.isPropertyAccessExpression(node) ||
				ts.isElementAccessExpression(node)
			) {
				if (isDateTimeOrigin(node, globals, checker)) {
					findings.push(findingFor(file, root, sourceFile, node, 'date-time'));
				} else if (isClipboardWriteOrigin(node, globals, checker)) {
					findings.push(findingFor(file, root, sourceFile, node, 'clipboard'));
				}
			}
			node.forEachChild(visit);
		};
		sourceFile.forEachChild(visit);
	}

	return findings.sort(
		(left, right) =>
			left.file.localeCompare(right.file) ||
			left.line - right.line ||
			left.kind.localeCompare(right.kind),
	);
};

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		const findings = scanUtilityBoundaries();
		if (findings.length > 0) {
			for (const finding of findings) {
				console.error(
					`${finding.file}:${finding.line}: ${finding.kind}: ${finding.message}`,
				);
			}
			process.exitCode = 1;
		} else {
			console.log('Utility boundary check passed.');
		}
	} catch (error) {
		console.error(
			`Utility boundary check failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
	}
}
