import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, test } from 'vitest';

const srcRoot = path.resolve(import.meta.dirname, '..');
const scriptExtensions = new Set([
	'.cjs',
	'.js',
	'.jsx',
	'.mjs',
	'.ts',
	'.tsx',
]);
const zIndexUtilityPattern = /(?:^|:)(-?z-(?:\d+|\[[^\]\s]+\]|\([^)]+\)))$/;
const zIndexTokenPrefix = ['--publy', 'z'].join('-');
const tokenBackedZIndexPattern = new RegExp(
	`^z-\\(${zIndexTokenPrefix}-[a-z0-9-]+\\)$`,
);
const classHelperNames = new Set(['cn', 'clsx']);
const classAttributeNames = new Set(['class', 'className']);

type SourceFragment = {
	text: string;
	line: number;
};

type VariableBinding = {
	declaration: ts.VariableDeclaration;
	scope: ts.Node;
};

const findSourceFiles = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findSourceFiles(absolutePath)));
			continue;
		}

		if (entry.isFile()) {
			files.push(absolutePath);
		}
	}

	return files;
};

const findLexicalScope = (node: ts.Node): ts.Node => {
	let current: ts.Node | undefined = node.parent;

	while (current) {
		if (
			ts.isSourceFile(current) ||
			ts.isFunctionLike(current) ||
			ts.isBlock(current) ||
			ts.isModuleBlock(current) ||
			ts.isCaseBlock(current)
		) {
			return current;
		}
		current = current.parent;
	}

	return node.getSourceFile();
};

const isWithinNode = (node: ts.Node, possibleAncestor: ts.Node): boolean => {
	let current: ts.Node | undefined = node;

	while (current) {
		if (current === possibleAncestor) {
			return true;
		}
		current = current.parent;
	}

	return false;
};

const getScriptFragments = (
	filePath: string,
	source: string,
): SourceFragment[] => {
	const sourceFile = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		filePath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const fragments: SourceFragment[] = [];
	const bindings = new Map<string, VariableBinding[]>();
	const seenFragmentPositions = new Set<number>();

	const collectBindings = (node: ts.Node): void => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer
		) {
			const existing = bindings.get(node.name.text) ?? [];
			existing.push({
				declaration: node,
				scope: findLexicalScope(node),
			});
			bindings.set(node.name.text, existing);
		}

		ts.forEachChild(node, collectBindings);
	};

	collectBindings(sourceFile);

	const addFragment = (
		node:
			| ts.StringLiteral
			| ts.NoSubstitutionTemplateLiteral
			| ts.TemplateLiteralLikeNode,
	): void => {
		const position = node.getStart(sourceFile);
		if (seenFragmentPositions.has(position)) {
			return;
		}

		seenFragmentPositions.add(position);
		const { line } = sourceFile.getLineAndCharacterOfPosition(position);
		fragments.push({ text: node.text, line: line + 1 });
	};

	const collectClassFragments = (
		node: ts.Node,
		resolvingBindings: Set<ts.VariableDeclaration>,
	): void => {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			addFragment(node);
			return;
		}

		if (ts.isTemplateExpression(node)) {
			addFragment(node.head);
			for (const span of node.templateSpans) {
				collectClassFragments(span.expression, resolvingBindings);
				addFragment(span.literal);
			}
			return;
		}

		if (ts.isIdentifier(node)) {
			const matchingBindings = (bindings.get(node.text) ?? [])
				.filter((binding) => isWithinNode(node, binding.scope))
				.sort(
					(left, right) =>
						left.scope.getWidth(sourceFile) - right.scope.getWidth(sourceFile),
				);
			const binding = matchingBindings[0];

			if (
				binding?.declaration.initializer &&
				!resolvingBindings.has(binding.declaration)
			) {
				const nextResolvingBindings = new Set(resolvingBindings);
				nextResolvingBindings.add(binding.declaration);
				collectClassFragments(
					binding.declaration.initializer,
					nextResolvingBindings,
				);
			}
			return;
		}

		ts.forEachChild(node, (child) =>
			collectClassFragments(child, resolvingBindings),
		);
	};

	const visit = (node: ts.Node): void => {
		if (
			ts.isJsxAttribute(node) &&
			classAttributeNames.has(node.name.getText(sourceFile)) &&
			node.initializer
		) {
			collectClassFragments(node.initializer, new Set());
			return;
		}

		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			classHelperNames.has(node.expression.text)
		) {
			for (const argument of node.arguments) {
				collectClassFragments(argument, new Set());
			}
			return;
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return fragments;
};

const getCssFragments = (source: string): SourceFragment[] => {
	const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
		comment.replace(/[^\n]/g, ' '),
	);
	const fragments: SourceFragment[] = [];
	const getLine = (position: number): number =>
		withoutComments.slice(0, position).split('\n').length;
	const applyPattern = /@apply\b([\s\S]*?);/g;
	let applyMatch: RegExpExecArray | null;

	while ((applyMatch = applyPattern.exec(withoutComments))) {
		const directive = applyMatch[1];
		const directiveOffset = applyMatch.index + applyMatch[0].indexOf(directive);
		fragments.push({
			text: directive,
			line: getLine(directiveOffset),
		});
	}

	const classSelectorPattern = /\.((?:\\.|[-_a-zA-Z0-9])+)/g;
	let segmentStart = 0;

	for (let index = 0; index < withoutComments.length; index += 1) {
		const character = withoutComments[index];
		if (character === '{') {
			const selector = withoutComments.slice(segmentStart, index);
			let classMatch: RegExpExecArray | null;

			while ((classMatch = classSelectorPattern.exec(selector))) {
				fragments.push({
					text: classMatch[1].replace(/\\(.)/g, '$1'),
					line: getLine(segmentStart + classMatch.index),
				});
			}
		}

		if (character === '{' || character === '}' || character === ';') {
			segmentStart = index + 1;
		}
	}

	return fragments;
};

const getDetectedUtilities = (fragments: SourceFragment[]): string[] => {
	const utilities: string[] = [];

	for (const fragment of fragments) {
		for (const classToken of fragment.text.split(/\s+/)) {
			const utility = zIndexUtilityPattern.exec(classToken)?.[1];
			if (utility && !tokenBackedZIndexPattern.test(utility)) {
				utilities.push(utility);
			}
		}
	}

	return utilities.sort();
};

const findRawZIndexUtilities = async (): Promise<string[]> => {
	const violations: string[] = [];

	for (const filePath of await findSourceFiles(srcRoot)) {
		const extension = path.extname(filePath);
		if (!scriptExtensions.has(extension) && extension !== '.css') {
			continue;
		}

		const source = await readFile(filePath, 'utf8');
		const fragments =
			extension === '.css'
				? getCssFragments(source)
				: getScriptFragments(filePath, source);

		for (const fragment of fragments) {
			for (const utility of getDetectedUtilities([fragment])) {
				violations.push(
					`${path.relative(srcRoot, filePath)}:${fragment.line} ${utility}`,
				);
			}
		}
	}

	return violations.sort();
};

describe('z-index token coverage', () => {
	test('finds raw utilities in substituted className templates', () => {
		const source =
			'const view = <div className={`z-50 ${x} z-[60] ${y} -z-10`} />;';

		expect(
			getDetectedUtilities(getScriptFragments('fixture.tsx', source)),
		).toEqual(['-z-10', 'z-50', 'z-[60]']);
	});

	test('finds raw utilities in CSS selectors and terminal apply directives', () => {
		const source = String.raw`
			.hover\:z-\[60\] {}
			.fixture { @apply block z-50; }
		`;

		expect(getDetectedUtilities(getCssFragments(source))).toEqual([
			'z-50',
			'z-[60]',
		]);
	});

	test('finds every supported raw utility shape in class helpers', () => {
		const source = `
			const layer = 'z-50';
			cn(layer, 'z-[60]');
			clsx(['-z-10']);
		`;

		expect(
			getDetectedUtilities(getScriptFragments('fixture.tsx', source)),
		).toEqual(['-z-10', 'z-50', 'z-[60]']);
	});

	test('ignores strings outside class-bearing positions', () => {
		expect(
			getDetectedUtilities(
				getScriptFragments('fixture.d.ts', "type Layer = 'z-50';"),
			),
		).toEqual([]);
		expect(
			getDetectedUtilities(
				getScriptFragments(
					'fixture.tsx',
					'const view = <div data-example="z-50" />;',
				),
			),
		).toEqual([]);
	});

	test('allows z-auto and token-backed utilities', () => {
		const source = `
			const view = (
				<div
					className="z-auto z-(--publy-z-menu) z-(--publy-z-select) z-(--publy-z-raised) z-(--publy-z-overlay) z-(--publy-z-drawer-surface) z-(--publy-z-shell-topbar) z-(--publy-z-selection-bar)"
				/>
			);
		`;

		expect(
			getDetectedUtilities(getScriptFragments('fixture.tsx', source)),
		).toEqual([]);
	});

	test('routes every z-index utility through the shared stacking scale', async () => {
		expect(await findRawZIndexUtilities()).toEqual([]);
	});
});
