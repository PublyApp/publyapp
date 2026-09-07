/**
 * Keeps browser-sensitive date/time and clipboard capabilities behind the
 * canonical utilities. The guard owns source access, not downstream value
 * flow: every static access to the real global capability symbols is rejected
 * outside the two canonical files.
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
	dateTimeFormat: ts.Symbol;
	clipboard: ts.Symbol;
	writeText: ts.Symbol;
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

const symbolAtExpression = (
	expression: ts.Expression,
	checker: ts.TypeChecker,
): ts.Symbol | undefined => {
	const unwrapped = unwrap(expression);
	if (ts.isPropertyAccessExpression(unwrapped)) {
		return checker.getSymbolAtLocation(unwrapped.name);
	}
	if (ts.isElementAccessExpression(unwrapped)) {
		const name = staticPropertyName(unwrapped);
		if (name !== null) {
			return checker.getPropertyOfType(
				checker.getTypeAtLocation(unwrapped.expression),
				name,
			);
		}
	}
	return checker.getSymbolAtLocation(unwrapped);
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
	const dateTimeFormat = checker.getPropertyOfType(
		checker.getTypeOfSymbolAtLocation(Intl, sourceFile),
		'DateTimeFormat',
	);
	const clipboard = checker.getPropertyOfType(
		checker.getTypeOfSymbolAtLocation(navigator, sourceFile),
		'clipboard',
	);
	if (!clipboard) {
		throw new Error('TypeScript protected utility symbols are unavailable');
	}
	const writeText = checker.getPropertyOfType(
		checker.getTypeOfSymbolAtLocation(clipboard, sourceFile),
		'writeText',
	);
	if (!dateTimeFormat || !writeText) {
		throw new Error('TypeScript protected utility symbols are unavailable');
	}
	return {
		Intl,
		navigator,
		globalThis,
		window,
		dateTimeFormat,
		clipboard,
		writeText,
	};
};

const isExpectedGlobalProperty = (
	expression: ts.Expression,
	name: 'Intl' | 'navigator',
	expected: ts.Symbol,
	globals: GlobalSymbols,
	checker: ts.TypeChecker,
): boolean => {
	const parts = propertyParts(expression);
	if (!parts) {
		return symbolAtExpression(expression, checker) === expected;
	}
	if (parts.name !== name) {
		return false;
	}
	const objectSymbol = symbolAtExpression(parts.object, checker);
	if (objectSymbol === globals.globalThis || objectSymbol === globals.window) {
		return symbolAtExpression(expression, checker) !== undefined;
	}
	return symbolAtExpression(expression, checker) === expected;
};

const hasPropertyAccessParent = (
	expression: ts.Expression,
	name: string,
): boolean => {
	const parent = unwrap(expression).parent;
	return (
		(ts.isPropertyAccessExpression(parent) ||
			ts.isElementAccessExpression(parent)) &&
		staticPropertyName(parent) === name
	);
};

const isDateTimeOrigin = (
	expression: ts.Expression,
	globals: GlobalSymbols,
	checker: ts.TypeChecker,
): boolean => {
	const parts = propertyParts(expression);
	if (
		isExpectedGlobalProperty(
			expression,
			'Intl',
			globals.Intl,
			globals,
			checker,
		) &&
		!hasPropertyAccessParent(expression, 'DateTimeFormat')
	) {
		return true;
	}
	return (
		parts?.name === 'DateTimeFormat' &&
		symbolAtExpression(expression, checker) === globals.dateTimeFormat &&
		isExpectedGlobalProperty(
			parts.object,
			'Intl',
			globals.Intl,
			globals,
			checker,
		)
	);
};

const isClipboardWriteOrigin = (
	expression: ts.Expression,
	globals: GlobalSymbols,
	checker: ts.TypeChecker,
): boolean => {
	const parts = propertyParts(expression);
	if (
		parts?.name === 'clipboard' &&
		isExpectedGlobalProperty(
			parts.object,
			'navigator',
			globals.navigator,
			globals,
			checker,
		) &&
		!hasPropertyAccessParent(expression, 'writeText')
	) {
		return true;
	}
	if (
		parts?.name !== 'writeText' ||
		symbolAtExpression(expression, checker) !== globals.writeText
	) {
		return false;
	}
	const clipboardParts = propertyParts(parts.object);
	return (
		clipboardParts?.name === 'clipboard' &&
		symbolAtExpression(parts.object, checker) === globals.clipboard &&
		isExpectedGlobalProperty(
			clipboardParts.object,
			'navigator',
			globals.navigator,
			globals,
			checker,
		)
	);
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
