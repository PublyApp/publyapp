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

// `ts.SourceFile.parseDiagnostics` has always existed on the classic
// compiler's concrete SourceFile at runtime, but it is `@internal` and not
// part of the public `ts.SourceFile` type, so a plain untyped consumer (like
// check-design-system.mjs) can read it directly while this typechecked `.ts`
// file cannot without a cast. Isolated in one place instead of an inline
// `as`/`any` at every call site.
type CompilerSourceFileWithParseDiagnostics = ts.SourceFile & {
	parseDiagnostics: readonly ts.Diagnostic[];
};

const getParseDiagnostics = (
	sourceFile: ts.SourceFile,
): readonly ts.Diagnostic[] =>
	(sourceFile as CompilerSourceFileWithParseDiagnostics).parseDiagnostics;

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

const scriptKindForRelativePath = (relativePath: string): ts.ScriptKind =>
	relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;

// chore/908 follow-up (adversarial review BLOCKER): this used to always parse
// as TSX under a fake .tsx filename, regardless of the real file's extension.
// TSX grammar treats a generic arrow function (`const fn = <T>(...) => ...`,
// valid in a real .ts file) as ambiguous with a JSX opening tag, so a real
// .ts production file with that shape produced parse errors; the recovery
// tree that TSX-parsing built from that point on was silently a DIFFERENT,
// partial tree — and a forbidden import placed after the break vanished from
// it. Two independent fixes, both required:
//  1. Choose ScriptKind from the real relative path, not a hardcoded TSX
//     default, so a .ts file is parsed as TS.
//  2. Treat ANY parseDiagnostics as a hard, loud failure naming the file,
//     instead of ever walking whatever recovery tree the parser produced.
//     ts-morph's vendored compiler only stabilizes the *API surface* across
//     TypeScript upgrades (see the import-site comment above) — it does not,
//     and cannot, make an older parser understand syntax only a newer one
//     accepts. The day production source uses such syntax, this guard must
//     stop the build with a named file, not quietly report zero findings.
//
// W6-FLAKE (#827): the whole-tree walkers below (`findSonnerImports`,
// `hasDirectUseMutationCall`, `hasQueryFactoryOnToast`,
// `extractSuccessMessageKeys`) each parsed every production file from
// scratch — up to 4x full-tree AST parse bursts per run in this worker,
// wasted CPU that under external contention starved render workers past
// testing-library's findBy* budget. The per-(source, path) memoization below
// collapses those repeats to one parse per distinct input;
// `parseCallCountForTestObservation` exists so the suite can pin that
// behaviour.
let parseCallCount = 0;

const parseCallCountForTestObservation = (): number => parseCallCount;

// W6-FLAKE (#827): the per-(source, path) tree cache. Keyed on `relativePath`
// AND validated against the exact source text before reuse, so two fixture
// calls that reuse a path with different inline sources always trigger a
// fresh parse — a stale tree can never be served. Only successfully parsed
// (zero diagnostics) trees are cached; a parse that threw is not remembered.
const parsedSourceCache = new Map<
	string,
	{ source: string; sourceFile: ts.SourceFile }
>();

const parseSource = (
	source: string,
	relativePath = 'architecture-fixture.ts',
): ts.SourceFile => {
	const cached = parsedSourceCache.get(relativePath);
	if (cached && cached.source === source) {
		return cached.sourceFile;
	}

	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKindForRelativePath(relativePath),
	);
	parseCallCount += 1;

	const parseDiagnostics = getParseDiagnostics(sourceFile);
	if (parseDiagnostics.length > 0) {
		const messages = parseDiagnostics
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
			)
			.join('; ');
		throw new Error(
			`mutation-feedback-architecture guard could not parse ${relativePath} — ` +
				`refusing to scan a partial/recovered syntax tree: ${messages}`,
		);
	}

	parsedSourceCache.set(relativePath, { source, sourceFile });

	return sourceFile;
};

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

export const findSonnerImports = (
	source: string,
	relativePath?: string,
): string[] => {
	const sourceFile = parseSource(source, relativePath);
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

export const hasDirectUseMutationCall = (
	source: string,
	relativePath?: string,
): boolean => {
	const sourceFile = parseSource(source, relativePath);
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

export const findRouterFeedbackViolations = (
	source: string,
	relativePath?: string,
): string[] => {
	const sourceFile = parseSource(source, relativePath);
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

export const hasQueryFactoryOnToast = (
	source: string,
	relativePath?: string,
): boolean => {
	const sourceFile = parseSource(source, relativePath);
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

const extractSuccessMessageKeys = (
	source: string,
	relativePath?: string,
): string[] => {
	const sourceFile = parseSource(source, relativePath);
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
				.flatMap(({ source, relativePath }) =>
					extractSuccessMessageKeys(source, relativePath),
				),
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

	// Adversarial review BLOCKER regression: parseSource used to always parse
	// as TSX under a synthetic .tsx filename, no matter the real extension. A
	// generic arrow function is valid, unambiguous syntax in a real .ts file
	// but reads as an unclosed JSX opening tag under TSX grammar — the parser
	// recovered into a different, partial tree from that point on, and a
	// forbidden Sonner import placed after the generic arrow vanished from it
	// even though `pnpm --filter front typecheck` accepts the file outright.
	// Passing the real .ts relativePath must select ScriptKind.TS and keep the
	// import visible.
	test('a .ts file with a generic arrow function does not defeat the Sonner-import scan (regression: previously misparsed as TSX)', () => {
		const source = [
			// `<T>` and not `<T,>`: the trailing comma is precisely what
			// disambiguates a generic arrow from JSX, so `<T,>` parses
			// identically under both script kinds and would leave this test
			// green even if the script-kind selection regressed to always-TSX.
			// `<T>` is the discriminating form — as TSX it reads as an unclosed
			// JSX tag and the parser recovers into a partial tree.
			'const identity = <T>(value: T): T => value;',
			"import { toast } from 'sonner';",
			'void identity;',
			'void toast;',
		].join('\n');

		expect(findSonnerImports(source, 'lib/generic-arrow-probe.ts')).toEqual([
			'sonner',
		]);
	});

	// Adversarial review IMPORTANT/BLOCKER-adjacent regression: a source the
	// bundled parser cannot finish parsing must never be treated as "found
	// nothing" — it must throw, naming the file, so the guard fails the build
	// instead of silently reporting a clean scan of a broken recovery tree.
	test('parseSource fails loudly, naming the file, when the bundled parser cannot finish parsing (parse-diagnostic canary)', () => {
		const unparseable = [
			'const broken = `unterminated template literal',
			"import { toast } from 'sonner';",
		].join('\n');

		expect(() =>
			findSonnerImports(unparseable, 'lib/unparseable-probe.ts'),
		).toThrow(/lib\/unparseable-probe\.ts/);
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

	// W6-FLAKE (#827) canary: the whole-tree classifiers above
	// (`findSonnerImports`, `hasDirectUseMutationCall`, `findRouterFeedbackViolations`,
	// `hasQueryFactoryOnToast`) must share one AST parse per distinct
	// (source, path) input instead of each re-parsing the same production file.
	// Re-parsing was pure wasted CPU that starved render workers under external
	// load (see vitest.config.ts's W6-FLAKE notes). The memoized helper returns
	// the SAME tree object for a repeated identical input, so this pins sharing
	// without touching any detection logic.
	test('the whole-tree classifiers share one AST parse per distinct input (W6-FLAKE parse-sharing canary)', () => {
		const fixtureSource = "import { toast } from 'sonner';\nvoid toast;";
		const relativePath = 'lib/canary-w6-flake.ts';

		findSonnerImports(fixtureSource, relativePath);
		hasDirectUseMutationCall(fixtureSource, relativePath);
		findRouterFeedbackViolations(fixtureSource, relativePath);
		hasQueryFactoryOnToast(fixtureSource, relativePath);

		const parsesAfterFourWalkers = parseCallCountForTestObservation();

		findSonnerImports(fixtureSource, relativePath);

		expect(
			parseCallCountForTestObservation() - parsesAfterFourWalkers,
			'a fifth walk over an already-parsed (source, path) must reuse the memoized tree, not re-parse it',
		).toBe(0);
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
					findSonnerImports(source, relativePath).length > 0 &&
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
					hasDirectUseMutationCall(source, relativePath) &&
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

		const violations = findRouterFeedbackViolations(
			router?.source ?? '',
			router?.relativePath ?? 'router.tsx',
		);
		expect(
			violations,
			`router.tsx must keep query/auth errors in QueryCache and mutation success/failure feedback in MutationCache. Violations: ${violations.join('; ')}`,
		).toEqual([]);
	});

	test('front query factories never configure handlers.onToast', async () => {
		const files = await getProductionSourceFiles();
		const offenders = files
			.filter(({ source, relativePath }) =>
				hasQueryFactoryOnToast(source, relativePath),
			)
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
