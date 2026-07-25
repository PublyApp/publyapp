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
const zIndexUtilityPattern =
	/(?:^|:)(-?z-(?:\d+|auto|\[[^\]\s]+\]|\([^)]+\)))$/;
const tokenBackedZIndexPattern = /^z-\(--publy-z-[a-z0-9-]+\)$/;

type SourceFragment = {
	text: string;
	line: number;
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

	const visit = (node: ts.Node): void => {
		if (
			ts.isStringLiteralLike(node) ||
			ts.isNoSubstitutionTemplateLiteral(node)
		) {
			const { line } = sourceFile.getLineAndCharacterOfPosition(
				node.getStart(),
			);
			fragments.push({ text: node.text, line: line + 1 });
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

	return withoutComments.split('\n').map((text, index) => ({
		text,
		line: index + 1,
	}));
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
			for (const classToken of fragment.text.split(/\s+/)) {
				const utility = zIndexUtilityPattern.exec(classToken)?.[1];
				if (!utility || tokenBackedZIndexPattern.test(utility)) {
					continue;
				}

				violations.push(
					`${path.relative(srcRoot, filePath)}:${fragment.line} ${utility}`,
				);
			}
		}
	}

	return violations.sort();
};

describe('z-index token coverage', () => {
	test('routes every z-index utility through the shared stacking scale', async () => {
		expect(await findRawZIndexUtilities()).toEqual([]);
	});
});
