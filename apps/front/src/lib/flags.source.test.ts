import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { ts } from 'ts-morph';
import { describe, expect, test } from 'vitest';

const flagsPath = fileURLToPath(new URL('./flags.ts', import.meta.url));

const visitSourceNodes = (
	sourceFile: ts.SourceFile,
	visitor: (node: ts.Node) => void,
): void => {
	const visit = (node: ts.Node): void => {
		visitor(node);
		node.forEachChild(visit);
	};

	visit(sourceFile);
};

const isImportMetaEnv = (node: ts.Node): boolean => {
	return (
		ts.isPropertyAccessExpression(node) &&
		node.name.text === 'env' &&
		ts.isMetaProperty(node.expression) &&
		node.expression.name.text === 'meta' &&
		node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
	);
};

const isProcessEnv = (node: ts.Node): boolean => {
	return (
		ts.isPropertyAccessExpression(node) &&
		node.name.text === 'env' &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'process'
	);
};

describe('feature flag source contract', () => {
	test('keeps every build-time default explicit and isolated', async () => {
		const source = await readFile(flagsPath, 'utf8');
		const sourceFile = ts.createSourceFile(
			flagsPath,
			source,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);
		const importMetaEnvAccesses: ts.PropertyAccessExpression[] = [];
		const computedEnvAccesses: ts.ElementAccessExpression[] = [];
		const memberEnvAccesses: ts.PropertyAccessExpression[] = [];
		const processEnvReferences: ts.PropertyAccessExpression[] = [];
		const readFlagCalls: ts.CallExpression[] = [];
		let readFlag: ts.ArrowFunction | undefined;

		visitSourceNodes(sourceFile, (node) => {
			if (isImportMetaEnv(node)) {
				importMetaEnvAccesses.push(node);
			}

			if (
				ts.isElementAccessExpression(node) &&
				isImportMetaEnv(node.expression)
			) {
				computedEnvAccesses.push(node);
			}

			if (
				ts.isPropertyAccessExpression(node) &&
				isImportMetaEnv(node.expression)
			) {
				memberEnvAccesses.push(node);
			}

			if (isProcessEnv(node)) {
				processEnvReferences.push(node);
			}

			if (
				ts.isVariableDeclaration(node) &&
				ts.isIdentifier(node.name) &&
				node.name.text === 'readFlag' &&
				node.initializer &&
				ts.isArrowFunction(node.initializer)
			) {
				readFlag = node.initializer;
			}

			if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				node.expression.text === 'readFlag'
			) {
				readFlagCalls.push(node);
			}
		});

		expect(importMetaEnvAccesses).toHaveLength(1);
		expect(computedEnvAccesses).toHaveLength(1);
		expect(memberEnvAccesses).toHaveLength(0);
		expect(processEnvReferences).toHaveLength(0);
		expect(readFlag).toBeDefined();
		expect(readFlagCalls.length).toBeGreaterThan(0);

		if (readFlag === undefined) {
			return;
		}

		const computedEnvAccess = computedEnvAccesses[0];
		expect(computedEnvAccess).toBeDefined();
		if (computedEnvAccess !== undefined) {
			expect(
				computedEnvAccess.pos >= readFlag.pos &&
					computedEnvAccess.end <= readFlag.end,
			).toBe(true);
			expect(
				computedEnvAccess.argumentExpression &&
					ts.isIdentifier(computedEnvAccess.argumentExpression) &&
					computedEnvAccess.argumentExpression.text === 'envKey',
			).toBe(true);
		}

		for (const call of readFlagCalls) {
			expect(call.arguments.length).toBeGreaterThanOrEqual(2);
			const defaultValue = call.arguments[1];
			expect(
				defaultValue?.kind === ts.SyntaxKind.TrueKeyword ||
					defaultValue?.kind === ts.SyntaxKind.FalseKeyword,
			).toBe(true);
		}
	});
});
