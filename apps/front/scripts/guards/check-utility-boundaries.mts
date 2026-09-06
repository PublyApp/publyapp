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

type Boundary =
	| 'clipboard'
	| 'clipboard-write'
	| 'date-time'
	| 'intl'
	| 'navigator';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSourceDir = path.resolve(scriptDir, '../../src');
const canonicalFiles = new Set(['utils/format-time.ts', 'utils/clipboard.ts']);
const sourceExtension = /\.[cm]?[jt]sx?$/;

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
		} else {
			break;
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

const isGlobalName = (
	expression: ts.Expression,
	name: string,
	checker: ts.TypeChecker,
): boolean => {
	const unwrapped = unwrap(expression);
	if (!ts.isIdentifier(unwrapped) || unwrapped.text !== name) {
		return false;
	}

	const symbol = checker.getSymbolAtLocation(unwrapped);
	if (!symbol) {
		return true;
	}

	const declarations = symbol.declarations ?? [];
	return (
		declarations.length === 0 ||
		declarations.every((item) => item.getSourceFile().isDeclarationFile)
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

const declarationFor = (
	expression: ts.Expression,
	checker: ts.TypeChecker,
): ts.Declaration | null => {
	const symbol = checker.getSymbolAtLocation(unwrap(expression));
	if (!symbol) {
		return null;
	}

	let resolved = symbol;
	const seen = new Set<ts.Symbol>();
	while ((resolved.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(resolved)) {
		seen.add(resolved);
		resolved = checker.getAliasedSymbol(resolved);
	}
	return resolved.valueDeclaration ?? resolved.declarations?.[0] ?? null;
};

const boundaryFromExpression = (
	expression: ts.Expression,
	checker: ts.TypeChecker,
	seen: Set<ts.Node>,
): Boundary | null => {
	const unwrapped = unwrap(expression);
	if (seen.has(unwrapped)) {
		return null;
	}
	seen.add(unwrapped);

	if (isGlobalName(unwrapped, 'navigator', checker)) {
		return 'navigator';
	}
	if (isGlobalName(unwrapped, 'Intl', checker)) {
		return 'intl';
	}
	if (isGlobalName(unwrapped, 'globalThis', checker)) {
		return 'navigator';
	}
	if (isGlobalName(unwrapped, 'window', checker)) {
		return 'navigator';
	}

	const parts = propertyParts(unwrapped);
	if (parts) {
		const objectBoundary = boundaryFromExpression(parts.object, checker, seen);
		if (
			parts.name === 'Intl' &&
			(objectBoundary === 'navigator' ||
				isGlobalName(parts.object, 'globalThis', checker) ||
				isGlobalName(parts.object, 'window', checker))
		) {
			return 'intl';
		}
		if (
			parts.name === 'navigator' &&
			(objectBoundary === 'navigator' ||
				isGlobalName(parts.object, 'globalThis', checker) ||
				isGlobalName(parts.object, 'window', checker))
		) {
			return 'navigator';
		}
		if (parts.name === 'DateTimeFormat' && objectBoundary === 'intl') {
			return 'date-time';
		}
		if (parts.name === 'clipboard' && objectBoundary === 'navigator') {
			return 'clipboard';
		}
		if (parts.name === 'writeText' && objectBoundary === 'clipboard') {
			return 'clipboard-write';
		}
		if (
			(parts.name === 'bind' ||
				parts.name === 'call' ||
				parts.name === 'apply') &&
			objectBoundary === 'clipboard-write'
		) {
			return 'clipboard-write';
		}
	}

	if (ts.isConditionalExpression(unwrapped)) {
		return (
			boundaryFromExpression(unwrapped.whenTrue, checker, seen) ??
			boundaryFromExpression(unwrapped.whenFalse, checker, seen)
		);
	}
	if (
		ts.isBinaryExpression(unwrapped) &&
		(unwrapped.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
			unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
			unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
	) {
		return (
			boundaryFromExpression(unwrapped.left, checker, seen) ??
			boundaryFromExpression(unwrapped.right, checker, seen)
		);
	}
	if (ts.isCallExpression(unwrapped)) {
		return boundaryFromExpression(unwrapped.expression, checker, seen);
	}
	if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
		if (ts.isBlock(unwrapped.body)) {
			for (const statement of unwrapped.body.statements) {
				if (ts.isReturnStatement(statement) && statement.expression) {
					return boundaryFromExpression(statement.expression, checker, seen);
				}
			}
			return null;
		}
		return boundaryFromExpression(unwrapped.body, checker, seen);
	}

	const declaration = declarationFor(unwrapped, checker);
	if (!declaration || seen.has(declaration)) {
		return null;
	}
	seen.add(declaration);
	if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
		return boundaryFromExpression(declaration.initializer, checker, seen);
	}
	if (ts.isBindingElement(declaration)) {
		const variable = declaration.parent.parent;
		if (ts.isVariableDeclaration(variable) && variable.initializer) {
			const name = declaration.propertyName ?? declaration.name;
			if (ts.isIdentifier(name)) {
				return boundaryFromExpression(
					ts.factory.createPropertyAccessExpression(
						variable.initializer,
						name.text,
					),
					checker,
					seen,
				);
			}
		}
	}
	return null;
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

export const scanUtilityBoundaries = (
	sourceDir: string = defaultSourceDir,
): UtilityBoundaryFinding[] => {
	const root = validateSourceDir(sourceDir);
	const files = walkSource(root);
	if (files.length === 0) {
		throw new Error(`no TypeScript source files found under ${root}`);
	}

	const program = ts.createProgram(files, {
		allowJs: true,
		jsx: ts.JsxEmit.ReactJSX,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		target: ts.ScriptTarget.ES2022,
		noEmit: true,
		skipLibCheck: true,
	});
	for (const diagnostic of program.getSyntacticDiagnostics()) {
		const file = diagnostic.file?.fileName;
		if (!file || !isTestFile(path.resolve(file), root)) {
			throw new Error(
				`unparseable production source: ${file ?? 'unknown source file'}`,
			);
		}
	}
	const checker = program.getTypeChecker();
	const rootFiles: ts.SourceFile[] = [];
	for (const file of files) {
		const sourceFile = program.getSourceFile(file);
		if (!sourceFile) {
			throw new Error(`unknown source file in TypeScript program: ${file}`);
		}
		rootFiles.push(sourceFile);
	}
	const findings: UtilityBoundaryFinding[] = [];

	for (const sourceFile of rootFiles) {
		const file = path.resolve(sourceFile.fileName);
		const relativePath = path.relative(root, file).split(path.sep).join('/');
		if (isTestFile(file, root) || canonicalFiles.has(relativePath)) {
			continue;
		}

		const visit = (node: ts.Node): void => {
			if (ts.isNewExpression(node) && node.expression) {
				if (
					boundaryFromExpression(node.expression, checker, new Set()) ===
					'date-time'
				) {
					findings.push(findingFor(file, root, sourceFile, node, 'date-time'));
				}
			}
			if (ts.isCallExpression(node)) {
				const boundary = boundaryFromExpression(
					node.expression,
					checker,
					new Set(),
				);
				if (boundary === 'date-time') {
					findings.push(findingFor(file, root, sourceFile, node, 'date-time'));
				} else if (boundary === 'clipboard-write') {
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
