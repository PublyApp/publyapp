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

const isImportMetaEnv = (
	node: ts.Node,
): node is ts.PropertyAccessExpression => {
	return (
		ts.isPropertyAccessExpression(node) &&
		node.name.text === 'env' &&
		ts.isMetaProperty(node.expression) &&
		node.expression.name.text === 'meta' &&
		node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
	);
};

const isProcessEnv = (node: ts.Node): node is ts.PropertyAccessExpression => {
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
		const flagProperties: ts.PropertyAssignment[] = [];
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

			// Every leaf of the FEATURES registry, collected independently of how
			// it is initialized — so a flag whose value comes from anywhere other
			// than a direct `readFlag(...)` call is still counted here and fails
			// the equality below. Counting only `readFlag` callees would let an
			// aliased `const rf = readFlag; rf(...)` shrink both sides at once.
			if (
				ts.isVariableDeclaration(node) &&
				ts.isIdentifier(node.name) &&
				node.name.text === 'FEATURES'
			) {
				const registry = ts.isAsExpression(node.initializer ?? node)
					? (node.initializer as ts.AsExpression).expression
					: node.initializer;
				if (registry !== undefined && ts.isObjectLiteralExpression(registry)) {
					for (const band of registry.properties) {
						if (
							ts.isPropertyAssignment(band) &&
							ts.isObjectLiteralExpression(band.initializer)
						) {
							for (const flag of band.initializer.properties) {
								if (ts.isPropertyAssignment(flag)) {
									flagProperties.push(flag);
								}
							}
						}
					}
				}
			}
		});

		expect(importMetaEnvAccesses).toHaveLength(1);
		expect(computedEnvAccesses).toHaveLength(1);
		expect(memberEnvAccesses).toHaveLength(0);
		expect(processEnvReferences).toHaveLength(0);
		expect(readFlag).toBeDefined();
		expect(flagProperties.length).toBeGreaterThan(0);
		// Pins the two together: one direct `readFlag(...)` call per registry
		// leaf, so no flag can be given a value by any other route.
		expect(readFlagCalls).toHaveLength(flagProperties.length);
		for (const flag of flagProperties) {
			expect(
				ts.isCallExpression(flag.initializer) &&
					ts.isIdentifier(flag.initializer.expression) &&
					flag.initializer.expression.text === 'readFlag',
			).toBe(true);
		}

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
