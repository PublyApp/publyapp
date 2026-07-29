import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// chore/908 (TypeScript 7): see the same-named comment in
// i18n-key-coverage.test.ts — the classic Compiler API is no longer reachable
// through bare `import ts from 'typescript'` and its replacement,
// `typescript/unstable/ast`, is explicitly unstable and already renamed
// functions this file relied on. ts-morph's vendored, version-pinned compiler
// keeps this AST walk stable across TypeScript upgrades.
import { ts } from 'ts-morph';
import { describe, expect, test } from 'vitest';

import enResource from '@org/shared-ts/lib/i18n/locales/en';
import frResource from '@org/shared-ts/lib/i18n/locales/fr';

const srcDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx']);
const ALLOWED_SONNER_IMPORTERS = new Set([
	'components/ui/toaster.tsx',
	'lib/mutation-toast.ts',
]);
const QUERY_FACTORY_NAME =
	/^build(?:Anonymous|Auth|Staff|Tenant)(?:Suspense)?(?:Mutation|Query)Options$/;

type SourceFile = {
	relativePath: string;
	source: string;
};

const isProductionSourceFile = (relativePath: string): boolean => {
	const normalized = relativePath.split(path.sep).join('/');
	const basename = path.posix.basename(normalized);

	return (
		TEXT_EXTENSIONS.has(path.extname(basename)) &&
		!basename.endsWith('.d.ts') &&
		!/(?:\.test|\.spec)\.tsx?$/.test(basename) &&
		!basename.includes('.gen.') &&
		!normalized
			.split('/')
			.some((part) => ['__fixtures__', '__tests__', 'fixtures'].includes(part))
	);
};

const collectProductionFiles = async (
	dir: string,
	root = dir,
): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries.sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		const absolutePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectProductionFiles(absolutePath, root)));
			continue;
		}

		if (isProductionSourceFile(path.relative(root, absolutePath))) {
			files.push(absolutePath);
		}
	}

	return files;
};

let cachedSourceFiles: Promise<SourceFile[]> | null = null;

const getProductionSourceFiles = (): Promise<SourceFile[]> => {
	cachedSourceFiles ??= collectProductionFiles(srcDir).then((files) =>
		Promise.all(
			files.map(async (absolutePath) => ({
				relativePath: path
					.relative(srcDir, absolutePath)
					.split(path.sep)
					.join('/'),
				source: await readFile(absolutePath, 'utf8'),
			})),
		),
	);

	return cachedSourceFiles;
};

const parseSource = (source: string): ts.SourceFile =>
	ts.createSourceFile(
		'architecture-fixture.tsx',
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);

const getPropertyName = (name: ts.PropertyName): string | undefined => {
	if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
		return name.text;
	}

	if (
		ts.isComputedPropertyName(name) &&
		ts.isStringLiteralLike(name.expression)
	) {
		return name.expression.text;
	}

	return undefined;
};

const getObjectProperty = (
	object: ts.ObjectLiteralExpression,
	name: string,
): ts.ObjectLiteralElementLike | undefined =>
	object.properties.find(
		(property) =>
			'name' in property &&
			property.name !== undefined &&
			getPropertyName(property.name) === name,
	);

const containsIdentifier = (node: ts.Node, name: string): boolean => {
	let found = false;
	const visit = (current: ts.Node): void => {
		if (ts.isIdentifier(current) && current.text === name) {
			found = true;
			return;
		}
		ts.forEachChild(current, visit);
	};
	visit(node);
	return found;
};

export const findSonnerImports = (source: string): string[] => {
	const sourceFile = parseSource(source);
	const imports: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteralLike(node.moduleSpecifier) &&
			node.moduleSpecifier.text === 'sonner'
		) {
			imports.push(node.moduleSpecifier.text);
		} else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments.length === 1 &&
			ts.isStringLiteralLike(node.arguments[0]) &&
			node.arguments[0].text === 'sonner'
		) {
			imports.push(node.arguments[0].text);
		} else if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument) &&
			ts.isStringLiteralLike(node.argument.literal) &&
			node.argument.literal.text === 'sonner'
		) {
			imports.push(node.argument.literal.text);
		}

		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return imports;
};

export const hasDirectUseMutationCall = (source: string): boolean => {
	const sourceFile = parseSource(source);
	return containsIdentifierCall(sourceFile, 'useMutation');
};

const containsIdentifierCall = (node: ts.Node, name: string): boolean => {
	let found = false;
	const visit = (current: ts.Node): void => {
		if (
			ts.isCallExpression(current) &&
			ts.isIdentifier(current.expression) &&
			current.expression.text === name
		) {
			found = true;
			return;
		}
		ts.forEachChild(current, visit);
	};
	visit(node);
	return found;
};

export const findRouterFeedbackViolations = (source: string): string[] => {
	const sourceFile = parseSource(source);
	const queryCaches: ts.ObjectLiteralExpression[] = [];
	const mutationCaches: ts.ObjectLiteralExpression[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isNewExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.arguments?.length === 1 &&
			ts.isObjectLiteralExpression(node.arguments[0])
		) {
			if (node.expression.text === 'QueryCache') {
				queryCaches.push(node.arguments[0]);
			} else if (node.expression.text === 'MutationCache') {
				mutationCaches.push(node.arguments[0]);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);

	const violations: string[] = [];
	if (queryCaches.length !== 1) {
		violations.push('router must configure exactly one QueryCache');
	} else {
		const onError = getObjectProperty(queryCaches[0], 'onError');
		if (!onError || !containsIdentifier(onError, 'handleAuthedQueryError')) {
			violations.push('QueryCache.onError must only own query/auth failures');
		}
		if (
			containsIdentifier(queryCaches[0], 'handleMutationError') ||
			containsIdentifier(queryCaches[0], 'handleMutationSuccess') ||
			containsIdentifier(queryCaches[0], 'displayMutationFeedback')
		) {
			violations.push('QueryCache must not own mutation feedback');
		}
	}

	if (mutationCaches.length !== 1) {
		violations.push('router must configure exactly one MutationCache');
	} else {
		const onError = getObjectProperty(mutationCaches[0], 'onError');
		const onSuccess = getObjectProperty(mutationCaches[0], 'onSuccess');
		if (!onError || !containsIdentifier(onError, 'handleMutationError')) {
			violations.push('MutationCache.onError must own mutation failures');
		}
		if (!onSuccess || !containsIdentifier(onSuccess, 'handleMutationSuccess')) {
			violations.push('MutationCache.onSuccess must own mutation successes');
		}
	}

	return violations;
};

export const hasQueryFactoryOnToast = (source: string): boolean => {
	const sourceFile = parseSource(source);
	let found = false;
	const inspectForHandlers = (node: ts.Node): void => {
		if (ts.isObjectLiteralExpression(node)) {
			const handlers = getObjectProperty(node, 'handlers');
			if (
				handlers &&
				ts.isPropertyAssignment(handlers) &&
				ts.isObjectLiteralExpression(handlers.initializer) &&
				getObjectProperty(handlers.initializer, 'onToast')
			) {
				found = true;
				return;
			}
		}
		ts.forEachChild(node, inspectForHandlers);
	};
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			QUERY_FACTORY_NAME.test(node.expression.text)
		) {
			for (const argument of node.arguments) {
				inspectForHandlers(argument);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return found;
};

const extractSuccessMessageKeys = (source: string): string[] => {
	const sourceFile = parseSource(source);
	const keys: string[] = [];

	const visit = (node: ts.Node): void => {
		if (
			ts.isPropertyAssignment(node) &&
			getPropertyName(node.name) === 'meta' &&
			ts.isObjectLiteralExpression(node.initializer)
		) {
			const successMessage = getObjectProperty(
				node.initializer,
				'successMessage',
			);
			if (
				successMessage &&
				ts.isPropertyAssignment(successMessage) &&
				ts.isStringLiteralLike(successMessage.initializer)
			) {
				keys.push(successMessage.initializer.text);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return keys;
};

const collectQuerySuccessMessageKeys = async (): Promise<string[]> => {
	const files = await getProductionSourceFiles();
	return Array.from(
		new Set(
			files
				.filter(({ relativePath }) => relativePath.startsWith('lib/query/'))
				.flatMap(({ source }) => extractSuccessMessageKeys(source)),
		),
	);
};

const getMissingSuccessMessageKeys = (keys: string[]): string[] =>
	keys.filter(
		(key) =>
			!Object.hasOwn(enResource.common, key) ||
			!Object.hasOwn(frResource.common, key),
	);

describe('mutation feedback architecture classifiers', () => {
	test('finds static and dynamic Sonner imports without matching ordinary text', () => {
		expect(findSonnerImports("import { toast } from 'sonner';")).toEqual([
			'sonner',
		]);
		expect(findSonnerImports("const module = import('sonner');")).toEqual([
			'sonner',
		]);
		expect(
			findSonnerImports("// sonner is an adapter\nconst label = 'sonner';"),
		).toEqual([]);
	});

	test('finds direct useMutation calls, including generic calls, but not text', () => {
		expect(hasDirectUseMutationCall('useMutation({ mutationFn });')).toBe(true);
		expect(
			hasDirectUseMutationCall('useMutation<Result, Error>({ mutationFn });'),
		).toBe(true);
		expect(
			hasDirectUseMutationCall(
				"// useMutation({})\nconst example = 'useMutation<Result>()';",
			),
		).toBe(false);
	});

	test('requires mutation feedback to be owned by MutationCache', () => {
		const allowed = `
			new QueryCache({ onError: handleAuthedQueryError });
			new MutationCache({
				onError: (error, variables, context, mutation) =>
					handleMutationError(error, mutation),
				onSuccess: (data, variables, context, mutation) =>
					handleMutationSuccess(data, mutation),
			});
		`;
		const queryOwnsMutationFeedback = `
			new QueryCache({ onError: handleMutationError });
			new MutationCache({ onSuccess: handleMutationSuccess });
		`;
		const missingMutationCache = `
			new QueryCache({ onError: handleAuthedQueryError });
		`;

		expect(findRouterFeedbackViolations(allowed)).toEqual([]);
		expect(findRouterFeedbackViolations(queryOwnsMutationFeedback)).not.toEqual(
			[],
		);
		expect(findRouterFeedbackViolations(missingMutationCache)).not.toEqual([]);
	});

	test('finds handlers.onToast in query-factory configuration', () => {
		const allowed = `
			buildStaffQueryOptions(config, {
				clientAccessor: getClientManager(),
			});
		`;
		const violating = `
			buildStaffQueryOptions(config, {
				handlers: {
					onToast: displayFailure,
				},
			});
		`;

		expect(hasQueryFactoryOnToast(allowed)).toBe(false);
		expect(hasQueryFactoryOnToast(violating)).toBe(true);
	});
});

describe('front mutation feedback architecture', () => {
	test('production source discovery is non-empty', async () => {
		const files = await getProductionSourceFiles();
		expect(files.length).toBeGreaterThan(0);
	});

	test('Sonner imports stay behind the two front presentation adapters', async () => {
		const files = await getProductionSourceFiles();
		const offenders = files
			.filter(
				({ relativePath, source }) =>
					findSonnerImports(source).length > 0 &&
					!ALLOWED_SONNER_IMPORTERS.has(relativePath),
			)
			.map(({ relativePath }) => relativePath);

		expect(
			offenders,
			`Sonner imports are restricted to components/ui/toaster.tsx and lib/mutation-toast.ts. Offending files: ${offenders.join(', ')}`,
		).toEqual([]);
	});

	test('direct useMutation construction stays in lib/query', async () => {
		const files = await getProductionSourceFiles();
		const offenders = files
			.filter(
				({ relativePath, source }) =>
					hasDirectUseMutationCall(source) &&
					!relativePath.startsWith('lib/query/'),
			)
			.map(({ relativePath }) => relativePath);

		expect(
			offenders,
			`Direct useMutation(...) construction belongs in src/lib/query. Offending files: ${offenders.join(', ')}`,
		).toEqual([]);
	});

	test('router wires mutation feedback only through MutationCache', async () => {
		const files = await getProductionSourceFiles();
		const router = files.find(
			({ relativePath }) => relativePath === 'router.tsx',
		);
		expect(
			router,
			'router.tsx must be included in production source',
		).toBeDefined();

		const violations = findRouterFeedbackViolations(router?.source ?? '');
		expect(
			violations,
			`router.tsx must keep query/auth errors in QueryCache and mutation success/failure feedback in MutationCache. Violations: ${violations.join('; ')}`,
		).toEqual([]);
	});

	test('front query factories never configure handlers.onToast', async () => {
		const files = await getProductionSourceFiles();
		const offenders = files
			.filter(({ source }) => hasQueryFactoryOnToast(source))
			.map(({ relativePath }) => relativePath);

		expect(
			offenders,
			`Front-2 query factories must not configure handlers.onToast because that seam also handles query failures. Offending files: ${offenders.join(', ')}`,
		).toEqual([]);
	});
});

describe('front query factory success message i18n', () => {
	test('all literal successMessage keys resolve in common EN and FR locale bundles', async () => {
		const keys = await collectQuerySuccessMessageKeys();
		const missingKeys = getMissingSuccessMessageKeys(keys);

		expect(keys.length).toBeGreaterThan(0);
		expect(
			missingKeys,
			`Query successMessage keys must resolve in both common EN and FR bundles. Missing: ${missingKeys.join(', ')}`,
		).toEqual([]);
	});

	test('synthetic missing successMessage keys are detected', () => {
		const fixture = `
			const fixture = {
				meta: {
					successMessage: 'mutation-feedback-synthetic-missing',
				},
			};
		`;
		const missingKeys = getMissingSuccessMessageKeys(
			extractSuccessMessageKeys(fixture),
		);

		expect(missingKeys).toEqual(['mutation-feedback-synthetic-missing']);
	});
});
