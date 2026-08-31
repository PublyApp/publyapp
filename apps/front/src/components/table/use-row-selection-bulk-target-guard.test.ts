// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ts } from 'ts-morph';
import { describe, expect, test } from 'vitest';

/**
 * Selection-derived bulk-target guard (#1604).
 *
 * The canonical rule (docs/guides/list-pages-search-filter-cursor-pagination.md
 * §7.0 criterion 2): bulk mutation target IDs must be derived from the
 * reconciled visible selected rows
 * (`const selectedIds = selectedRows.map((row) => row.id)`), not from raw
 * selection state (`Object.keys(rowSelection)`).
 *
 * Why a structural guard, not a per-component test: every bulk-action site
 * takes a `rows` prop (the visible rows) and a `selection` result from
 * `useRowSelection`. The safe derivation is `rows.filter((row) =>
 * selection.rowSelection[row.id])` (or a `rows.flatMap` equivalent). Any
 * derivation that iterates the selection MAP directly (rather than the
 * VISIBLE ROWS list) risks sending a stale id to a bulk mutation when the
 * selection has not yet been pruned (the effect in `useRowSelection` runs
 * AFTER the next render, so for a single render the map can still contain
 * ids for rows that just left the view). `useRowSelection` prunes the map
 * to visible ids on every `visibleKey` change, but the visible-rows list
 * is the only place where the rendered "this row is still here" truth lives
 * — iterating it is what makes the contract hold across the prune window.
 *
 * Property asserted on the REAL tree:
 *
 *   1. Any source file under `apps/front/src/routes/` that references the
 *      selection map (a `rowSelection` property/member spelling — dot,
 *      element, aliased, destructured) AND owns a bulk mutation call MUST
 *      NOT derive those ids by iterating the map. The detector follows
 *      BINDINGS, not spellings: every derivation family below is checked
 *      on the map's direct spellings AND on every binding that resolves to
 *      the map (const alias, destructured binding, reassigned variable,
 *      chained alias, computed string key).
 *
 *      Forbidden families (each → a violation):
 *        - `Object.keys/entries/values(<map>)`
 *        - `[...<map>]` (array spread)
 *        - `for (const k in <map>)`
 *        - `for (const v of <map>)` (TypeError at runtime for a plain
 *          Record, but the same family as spread — flagged defensively)
 *
 *      Recognized spellings of the map itself:
 *        - `selection.rowSelection` (dot access)
 *        - `rowSelection` (direct binding)
 *        - `selection["rowSelection"]` / `selection['rowSelection']`
 *          (element access, literal key)
 *        - `selection[k]` where `k` is a const string 'rowSelection'
 *          (element access, computed key with resolved value)
 *
 *      Bindings that resolve to the map:
 *        - `const m = <map>` / `let m = <map>` (alias)
 *        - `const { rowSelection: m } = selection` / `{ rowSelection }`
 *          (destructuring — rename included)
 *        - `m = <map>` (assignment; last assignment wins)
 *        - `const n = m` (chained alias, transitively)
 *
 *      In addition, the detector NEVER stays silently green when it cannot
 *      resolve the flow (round-2 rule, verdict-r1): an unresolved form
 *      produces an `undecidable` diagnostic naming the binding:
 *        - `const m = ready ? selection.rowSelection : rows` — a mixed
 *          source: iterating `m` may extract raw map keys.
 *        - `const copy = { ...selection.rowSelection }` — a spread copy
 *          whose keys ARE the map's keys.
 *        - `Object.keys(selection[k])` with an unresolvable key — the
 *          element-access spelling with a key the guard cannot evaluate.
 *        - `collect(selection.rowSelection)` where a local helper iterates
 *          its parameter — interprocedural flow the guard cannot follow,
 *          so it names the parameter instead of staying green.
 *      A diagnostic is a REVIEW signal, not a proof of spam: these flows
 *      are exactly where a raw-map derivation hides next.
 *
 *   2. The `useRowSelection` primitive itself is excluded — it owns the map
 *      and is allowed to introspect it (it is the one source of truth for
 *      the pruned state, and its effect is the prune). The test library
 *      that re-exports the hook for spies ships under the same
 *      `components/table/` subtree, which the routes-only walk excludes.
 *
 * #1943 hardening: migrated from regex matching to ts-morph AST analysis to
 * catch structural forms regex could not see, then (round 2 / verdict-r1)
 * to a binding-tracking analysis so the guard follows the VALUE the binding
 * carries instead of the literal spelling that produced it.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
// __tests__/scripts/.../use-row-selection-bulk-target-guard.test.ts -> apps/front
// (the .test.ts lives next to use-row-selection.ts so its `here` is the
// components/table dir; walk up two levels to the apps/front root.)
const FRONT_ROOT = join(here, '..', '..', '..');
const ROUTES_ROOT = join(FRONT_ROOT, 'src', 'routes');

const isProductionSource = (file: string): boolean =>
	(file.endsWith('.ts') || file.endsWith('.tsx')) &&
	!file.endsWith('.test.ts') &&
	!file.endsWith('.test.tsx');

const walkDir = (dir: string): string[] => {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		let stat;
		try {
			stat = statSync(full);
		} catch {
			continue;
		}
		if (stat.isDirectory()) {
			out.push(...walkDir(full));
		} else if (stat.isFile() && isProductionSource(full)) {
			out.push(full);
		}
	}
	return out;
};

const allRouteFiles = walkDir(ROUTES_ROOT);

/**
 * AST-based violation detector (#1943, round 2).
 *
 * The detector is a tiny dataflow analysis over ONE source file:
 *
 *   1. It collects every variable binding (declaration, destructuring,
 *      assignment) and the provenance of its initializer: is that value the
 *      selection map ('map'), provably something else ('safe'), a mix the
 *      analysis cannot separate ('tainted'), or unresolvable ('unknown')?
 *   2. It collects const string bindings (`const k = 'rowSelection'`) so
 *      computed element keys resolve.
 *   3. It records which local functions iterate their parameters, so a call
 *      that passes the map into such a helper is reported as undecidable
 *      rather than silently green.
 *   4. It walks every iteration construct (Object.*, spread, for-in,
 *      for-of) and classifies the iterated expression. 'map' → violation.
 *      'tainted' → undecidable diagnostic naming the binding. An element
 *      access whose key cannot be resolved on a non-map receiver is
 *      undecidable too: it may be the element-access map spelling.
 *
 * The analysis is deliberately conservative on the unknown lane: a binding
 * that is merely unresolvable (`useState(...)`, a parameter, a helper call)
 * does NOT produce a diagnostic — the tree is full of legitimate
 * `Object.keys(errors)` / `Object.entries(catalog)` sites. Diagnostics fire
 * only where the SELECTION MAP itself flows through something the analysis
 * cannot pin down. That is the "never silently green on a map flow" rule.
 */
type Violation = {
	name: string;
	line: number;
};

type Provenance = 'map' | 'safe' | 'tainted' | 'unknown';

const FORBIDDEN_METHODS = new Set(['keys', 'entries', 'values']);

/** Analysis context for one source file. */
type Ctx = {
	/** Variable bindings resolved to provenance (last assignment wins). */
	bindings: Map<string, Provenance>;
	/** Const string bindings (`const k = 'rowSelection'`). */
	stringConsts: Map<string, string>;
	/** Named local functions (const arrow / function declaration), by name. */
	functions: Map<string, ts.Node>;
	/** Function-like node -> set of parameter names iterated inside its body. */
	iteratedParams: Map<ts.Node, Set<string>>;
};

/** Peels syntax wrappers that do not change what a value IS. */
const unwrap = (e: ts.Expression): ts.Expression => {
	let cur = e;
	for (;;) {
		if (ts.isParenthesizedExpression(cur)) {
			cur = cur.expression;
		} else if (ts.isAsExpression(cur)) {
			cur = cur.expression;
		} else if (ts.isSatisfiesExpression(cur)) {
			cur = cur.expression;
		} else if (ts.isNonNullExpression(cur)) {
			cur = cur.expression;
		} else if (ts.isAwaitExpression(cur)) {
			cur = cur.expression;
		} else {
			return cur;
		}
	}
};

/** True when `key` statically resolves to the string 'rowSelection'. */
const elementKeyResolvesToRowSelection = (
	key: ts.Expression,
	cx: Ctx,
): boolean => {
	const k = unwrap(key);
	if (ts.isStringLiteralLike(k)) {
		return k.text === 'rowSelection';
	}
	if (ts.isIdentifier(k)) {
		return cx.stringConsts.get(k.text) === 'rowSelection';
	}
	return false;
};

/**
 * Resolves what VALUE an expression carries:
 *   'map'     — provably the selection map (direct spelling or resolved binding)
 *   'safe'    — provably NOT the map (literals, plain object/array literals)
 *   'tainted' — a construct whose runtime value may include the map's keys but
 *               that the analysis cannot separate (conditional mixing the map
 *               with another source, an object/array spread of the map)
 *   'unknown' — everything else
 */
const classify = (expr: ts.Expression, cx: Ctx): Provenance => {
	const e = unwrap(expr);
	if (ts.isIdentifier(e)) {
		if (e.text === 'rowSelection') {
			return 'map';
		}
		return cx.bindings.get(e.text) ?? 'unknown';
	}
	if (ts.isPropertyAccessExpression(e)) {
		if (e.name.text === 'rowSelection') {
			return 'map';
		}
		if (classify(e.expression, cx) === 'map') {
			return 'safe';
		}
		return 'unknown';
	}
	if (ts.isElementAccessExpression(e)) {
		const key = e.argumentExpression;
		if (key && elementKeyResolvesToRowSelection(key, cx)) {
			return 'map';
		}
		// Reading a VALUE out of the map with a variable key is the legal
		// check shape (selection.rowSelection[row.id]). Reading off an
		// unknown receiver with an unresolvable key may be the map spelling —
		// the iteration-site check reports that lane as undecidable.
		if (classify(e.expression, cx) === 'map') {
			return 'safe';
		}
		return 'unknown';
	}
	if (ts.isObjectLiteralExpression(e)) {
		for (const prop of e.properties) {
			if (ts.isSpreadAssignment(prop)) {
				const inner = classify(prop.expression, cx);
				if (inner === 'map' || inner === 'tainted') {
					return 'tainted';
				}
			}
		}
		return 'safe';
	}
	if (ts.isArrayLiteralExpression(e)) {
		for (const elt of e.elements) {
			if (elt && ts.isSpreadElement(elt)) {
				const inner = classify(elt.expression, cx);
				if (inner === 'map' || inner === 'tainted') {
					return 'tainted';
				}
			}
		}
		return 'safe';
	}
	if (
		ts.isStringLiteralLike(e) ||
		ts.isNumericLiteral(e) ||
		e.kind === ts.SyntaxKind.TrueKeyword ||
		e.kind === ts.SyntaxKind.FalseKeyword ||
		e.kind === ts.SyntaxKind.NullKeyword ||
		e.kind === ts.SyntaxKind.UndefinedKeyword ||
		ts.isArrowFunction(e) ||
		ts.isFunctionExpression(e)
	) {
		return 'safe';
	}
	if (ts.isConditionalExpression(e)) {
		const whenTrue = classify(e.whenTrue, cx);
		const whenFalse = classify(e.whenFalse, cx);
		if (
			whenTrue === 'map' ||
			whenTrue === 'tainted' ||
			whenFalse === 'map' ||
			whenFalse === 'tainted'
		) {
			return 'tainted';
		}
		return 'unknown';
	}
	if (ts.isBinaryExpression(e)) {
		const left = classify(e.left, cx);
		const right = classify(e.right, cx);
		if (
			left === 'map' ||
			left === 'tainted' ||
			right === 'map' ||
			right === 'tainted'
		) {
			return 'tainted';
		}
		return 'unknown';
	}
	return 'unknown';
};

/** Binds one declared name (from a declaration or destructuring pattern). */
const bindDeclaredName = (
	name: ts.BindingName,
	initializer: ts.Expression | undefined,
	cx: Ctx,
): void => {
	if (ts.isIdentifier(name)) {
		cx.bindings.set(
			name.text,
			initializer ? classify(initializer, cx) : 'unknown',
		);
		return;
	}
	if (ts.isObjectBindingPattern(name)) {
		for (const element of name.elements) {
			if (!ts.isIdentifier(element.name)) {
				// Nested pattern on a destructured property — not tracked.
				continue;
			}
			if (element.dotDotDotToken !== undefined) {
				// Rest binding: `const { rowSelection, ...rest } = selection`.
				cx.bindings.set(element.name.text, 'unknown');
				continue;
			}
			if (element.propertyName) {
				// Renamed: `const { rowSelection: m } = selection`. The
				// property NAME is what identifies the map, not the receiver.
				cx.bindings.set(
					element.name.text,
					ts.isIdentifier(element.propertyName) &&
						element.propertyName.text === 'rowSelection'
						? 'map'
						: 'unknown',
				);
			} else {
				// Shorthand: `const { rowSelection } = selection`.
				cx.bindings.set(
					element.name.text,
					element.name.text === 'rowSelection' ? 'map' : 'unknown',
				);
			}
		}
		return;
	}
	// Array destructuring: `const [a, b] = useState(...)` — elements are not
	// tracked; the harness call's result is not the map.
};

/** The set of the current function's parameters that are iterated inside it. */
const collectIteratedParams = (fn: ts.Node): Set<string> => {
	const paramNames = new Set<string>();
	const params =
		'parameters' in fn && Array.isArray(fn.parameters)
			? (fn.parameters as ts.ParameterDeclaration[])
			: [];
	for (const p of params) {
		if (ts.isIdentifier(p.name)) {
			paramNames.add(p.name.text);
		}
	}
	const iterated = new Set<string>();
	if (paramNames.size === 0 || !('body' in fn)) {
		return iterated;
	}
	const body = (fn as ts.FunctionLikeDeclaration).body;
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const expr = node.expression;
			if (
				ts.isPropertyAccessExpression(expr) &&
				ts.isIdentifier(expr.expression) &&
				expr.expression.text === 'Object' &&
				FORBIDDEN_METHODS.has(expr.name.text)
			) {
				const arg = node.arguments[0];
				if (arg && ts.isIdentifier(arg) && paramNames.has(arg.text)) {
					iterated.add(arg.text);
				}
			}
		}
		if (
			ts.isForInStatement(node) &&
			ts.isIdentifier(node.expression) &&
			paramNames.has(node.expression.text)
		) {
			iterated.add(node.expression.text);
		}
		if (
			ts.isForOfStatement(node) &&
			ts.isIdentifier(node.expression) &&
			paramNames.has(node.expression.text)
		) {
			iterated.add(node.expression.text);
		}
		if (ts.isArrayLiteralExpression(node)) {
			for (const elt of node.elements) {
				if (
					elt &&
					ts.isSpreadElement(elt) &&
					ts.isIdentifier(elt.expression) &&
					paramNames.has(elt.expression.text)
				) {
					iterated.add(elt.expression.text);
				}
			}
		}
		node.forEachChild(visit);
	};
	if (body) {
		visit(body);
	}
	return iterated;
};

/** First pass: collect bindings, string consts, functions, iterated params. */
const collectBindings = (sourceFile: ts.SourceFile): Ctx => {
	const cx: Ctx = {
		bindings: new Map<string, Provenance>(),
		stringConsts: new Map<string, string>(),
		functions: new Map<string, ts.Node>(),
		iteratedParams: new Map<ts.Node, Set<string>>(),
	};

	const visit = (node: ts.Node): void => {
		// Register the function-like node itself so its iterated parameters
		// are visible to call sites, and name function declarations.
		if (
			ts.isFunctionDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node)
		) {
			cx.iteratedParams.set(node, collectIteratedParams(node));
			if (ts.isFunctionDeclaration(node) && node.name) {
				cx.functions.set(node.name.text, node);
			}
		}

		if (ts.isVariableDeclaration(node)) {
			const init = node.initializer;
			if (ts.isIdentifier(node.name)) {
				if (init && ts.isStringLiteralLike(init)) {
					// `const k = 'rowSelection'` — a computed element key.
					cx.stringConsts.set(node.name.text, init.text);
				}
				if (
					init &&
					(ts.isArrowFunction(init) || ts.isFunctionExpression(init))
				) {
					// `const collect = (x) => ...` — a named local helper.
					cx.functions.set(node.name.text, init);
				}
			}
			bindDeclaredName(node.name, init, cx);
		}

		// `m = selection.rowSelection` (assignment; last assignment wins)
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken
		) {
			if (ts.isIdentifier(node.left)) {
				cx.bindings.set(node.left.text, classify(node.right, cx));
			}
			if (ts.isObjectLiteralExpression(node.left)) {
				// Destructuring assignment: `({ rowSelection: m } = selection)`.
				for (const prop of node.left.properties) {
					if (
						ts.isPropertyAssignment(prop) &&
						ts.isIdentifier(prop.name) &&
						prop.name.text === 'rowSelection' &&
						ts.isIdentifier(prop.initializer)
					) {
						cx.bindings.set(prop.initializer.text, 'map');
					}
				}
			}
		}

		node.forEachChild(visit);
	};
	visit(sourceFile);
	return cx;
};

/** True when `expr` is an element access whose key cannot be resolved. */
const isUnresolvableElementAccess = (expr: ts.Expression, cx: Ctx): boolean => {
	const e = unwrap(expr);
	if (!ts.isElementAccessExpression(e)) {
		return false;
	}
	const key = e.argumentExpression;
	if (!key || elementKeyResolvesToRowSelection(key, cx)) {
		return false;
	}
	// The receiver is already a known map: `map[k]` is a value READ, legal.
	return classify(e.expression, cx) !== 'map';
};

/** Naming for the iterated target: direct vs aliased, plus the family.
 * Object.* families use the call form (`Object.keys(selection map)`),
 * the structural families use the over form (`[...] over selection map`). */
const nameForIteration = (
	target: ts.Expression,
	kind: string,
	cx: Ctx,
): string => {
	const e = unwrap(target);
	const isMethod = kind.startsWith('Object.');
	if (ts.isIdentifier(e) && e.text !== 'rowSelection') {
		if (cx.bindings.get(e.text) === 'map') {
			if (isMethod) {
				return `${kind}(aliased selection map: ${e.text})`;
			}
			return `${kind} over aliased selection map: ${e.text}`;
		}
	}
	if (isMethod) {
		return `${kind}(selection map)`;
	}
	return `${kind} over selection map`;
};

/**
 * Resolves the diagnostic for an iteration target.
 *   'map'      → a violation (direct or aliased)
 *   'tainted'  → an undecidable diagnostic naming the binding
 *   'unknown'  + unresolvable element key → an undecidable diagnostic
 *   otherwise  → no diagnostic (the iterated value provably is not the map,
 *                or is a plain unresolvable non-map value: legitimate)
 */
const iterationDiagnostic = (
	target: ts.Expression,
	kind: string,
	cx: Ctx,
): string | null => {
	const p = classify(target, cx);
	if (p === 'map') {
		return nameForIteration(target, kind, cx);
	}
	if (p === 'tainted') {
		const subject = ts.isIdentifier(target)
			? target.text
			: target.getText().slice(0, 48);
		return `undecidable: ${subject} may hold the selection map`;
	}
	if (p === 'unknown' && isUnresolvableElementAccess(target, cx)) {
		return `undecidable: ${target.getText().slice(0, 48)} uses an element key the guard cannot resolve`;
	}
	return null;
};

/**
 * Walk a single SourceFile and return all violations found.
 * Order of passes: collect bindings first (so use-site classification sees
 * the complete binding table), then scan constructs.
 */
const findViolationsInSource = (
	source: string,
	filePath: string,
): Violation[] => {
	const sourceFile = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	const cx = collectBindings(sourceFile);
	const violations: Violation[] = [];

	const record = (name: string, node: ts.Node) => {
		const { line } = sourceFile.getLineAndCharacterOfPosition(
			node.getStart(sourceFile),
		);
		violations.push({ name, line: line + 1 });
	};

	const visit = (node: ts.Node): void => {
		// Object.keys/entries/values over the map (any spelling or binding).
		if (ts.isCallExpression(node)) {
			const expr = node.expression;
			if (
				ts.isPropertyAccessExpression(expr) &&
				ts.isIdentifier(expr.expression) &&
				expr.expression.text === 'Object' &&
				FORBIDDEN_METHODS.has(expr.name.text)
			) {
				const arg = node.arguments[0];
				if (arg) {
					const diag = iterationDiagnostic(arg, `Object.${expr.name.text}`, cx);
					if (diag) {
						record(diag, node);
					}
				}
			}

			// Local helper receiving the map and iterating its parameter.
			const callee = unwrap(node.expression);
			if (ts.isIdentifier(callee)) {
				const fn = cx.functions.get(callee.text);
				if (fn) {
					const iterated = cx.iteratedParams.get(fn);
					if (iterated && iterated.size > 0) {
						for (const [index, arg] of node.arguments.entries()) {
							const p = classify(arg, cx);
							const params = (fn as ts.FunctionLikeDeclaration).parameters;
							const param = params[index];
							if (
								(p === 'map' || p === 'tainted') &&
								param &&
								ts.isIdentifier(param.name) &&
								iterated.has(param.name.text)
							) {
								record(
									`undecidable: ${param.name.text} may receive the selection map`,
									node,
								);
							}
						}
					}
				}
			} else if (
				ts.isArrowFunction(callee) ||
				ts.isFunctionExpression(callee)
			) {
				const iterated = cx.iteratedParams.get(callee);
				if (iterated && iterated.size > 0) {
					for (const [index, arg] of node.arguments.entries()) {
						const p = classify(arg, cx);
						const param = callee.parameters[index];
						if (
							(p === 'map' || p === 'tainted') &&
							param &&
							ts.isIdentifier(param.name) &&
							iterated.has(param.name.text)
						) {
							record(
								`undecidable: ${param.name.text} may receive the selection map`,
								node,
							);
						}
					}
				}
			}
		}

		// `[...<map>]` array spread
		if (ts.isArrayLiteralExpression(node)) {
			for (const elt of node.elements) {
				if (!elt || !ts.isSpreadElement(elt)) {
					continue;
				}
				const diag = iterationDiagnostic(elt.expression, '[...]', cx);
				if (diag) {
					record(diag, node);
				}
			}
		}

		// `for (const id in <map>)` — for-in over the map
		if (ts.isForInStatement(node)) {
			const diag = iterationDiagnostic(node.expression, 'for-in', cx);
			if (diag) {
				record(diag, node);
			}
		}

		// `for (const v of <map>)` — for-of over the map (TypeError on a
		// plain Record, same family as spread; flagged defensively)
		if (ts.isForOfStatement(node)) {
			const diag = iterationDiagnostic(node.expression, 'for-of', cx);
			if (diag) {
				record(diag, node);
			}
		}

		node.forEachChild(visit);
	};

	visit(sourceFile);
	return violations;
};

/**
 * Detect whether a source file references the selection map at all. Uses the
 * AST to avoid false positives on comments or strings. Recognizes the dot
 * spelling, the bare binding, the element-access spelling (`selection[...]`
 * with a 'rowSelection' key, literal or const-resolved) and destructuring.
 */
const hasSelectionMapReference = (source: string): boolean => {
	const sourceFile = ts.createSourceFile(
		'',
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const cx = collectBindings(sourceFile);
	let found = false;
	const visit = (node: ts.Node): void => {
		if (
			ts.isPropertyAccessExpression(node) &&
			node.name.text === 'rowSelection'
		) {
			found = true;
		}
		if (ts.isIdentifier(node) && node.text === 'rowSelection') {
			found = true;
		}
		if (
			ts.isElementAccessExpression(node) &&
			node.argumentExpression &&
			elementKeyResolvesToRowSelection(node.argumentExpression, cx)
		) {
			found = true;
		}
		if (!found) {
			node.forEachChild(visit);
		}
	};
	visit(sourceFile);
	return found;
};

/**
 * Walk route files that touch the selection map and collect offenders.
 */
const findViolations = (file: string): Violation[] => {
	const source = readFileSync(file, 'utf8');
	if (!hasSelectionMapReference(source)) {
		return [];
	}
	return findViolationsInSource(source, file);
};

/**
 * Run the violation detector against an in-memory source string.
 * Exported for the fabrication test above and for any future synthetic
 * proof (e.g. pairing the RED of a real offender with a fabricated
 * baseline that asserts the detector's contract).
 */
export const findViolationsAgainstSource = (source: string): string[] => {
	const violations = findViolationsInSource(source, '<fabricated>');
	// Deduplicate by name (multiple occurrences of the same pattern class)
	return [...new Set(violations.map((v) => v.name))];
};

describe('bulk-action sites derive ids from visible rows, not the raw selection map (#1604)', () => {
	// Discover bulk-action sites: route files that touch selection state.
	const candidateFiles = allRouteFiles
		.filter((file) => hasSelectionMapReference(readFileSync(file, 'utf8')))
		.map((file) => relative(FRONT_ROOT, file).split(sep).join('/'));

	// The selection primitive itself owns the map; the test library that
	// re-exports the hook for spies is also allowed. Both live under
	// `components/table/`, not `routes/`, so the route-only walk already
	// excludes them. Pin the exclusion explicitly so a future refactor
	// that moves a bulk-action test into routes/ doesn't silently exempt
	// it via name: the test walks `routes/`, period.

	test('every route file that touches the selection map is audited (drift detector)', () => {
		// Anti-vacuous: at least one route file must touch the selection
		// map today, otherwise the guard has nothing to assert and would
		// be vacuously green. If this ever returns 0, the rule no longer
		// applies (every bulk action has moved to a different shape) and
		// the guard should be retired — not silently kept.
		expect(
			candidateFiles.length,
			'expected at least one route file under apps/front/src/routes/ ' +
				'to reference the selection map. If the codebase has moved ' +
				'all bulk actions off `useRowSelection`, retire this guard ' +
				'rather than letting it pass vacuously.',
		).toBeGreaterThan(0);
	});

	test('no bulk-action site derives ids via Object.keys/entries/values/[...]/for-in/for-of on the selection map', () => {
		const offenders: Array<{ file: string; violations: Violation[] }> = [];
		for (const file of allRouteFiles) {
			const violations = findViolations(file);
			if (violations.length > 0) {
				offenders.push({
					file: relative(FRONT_ROOT, file).split(sep).join('/'),
					violations,
				});
			}
		}

		expect(
			offenders,
			`Bulk-action sites must derive ids from the visible rows list ` +
				`(e.g. \`rows.filter((row) => selection.rowSelection[row.id])\`), ` +
				`not from raw extraction of the selection map. The map can hold ` +
				`ids for rows that just left the view (the prune effect runs ` +
				`AFTER the next render), so a raw extraction risks a stale target. ` +
				`Offenders: ${JSON.stringify(offenders, null, 2)}`,
		).toEqual([]);
	});

	test('REPLAY — fabricating a raw-map derivation in a route file is caught (RED), removing it goes back to GREEN', () => {
		// This is the proof that the guard is not vacuously green. We
		// construct a fabricated source string that exhibits every
		// forbidden pattern AND every unresolved-map-flow family, run the
		// detector against it, and assert the detector returns at least one
		// violation per pattern. The production walk above stays clean
		// because no real file exhibits the pattern; this fabricated-source
		// check proves the detector is sharp enough to catch the pattern if
		// one ever sneaks back in.
		const fabricated = `
const selectedIds: string[] = [];
for (const [id, checked] of Object.entries(selection.rowSelection)) {
	if (checked) selectedIds.push(id);
}
const keys = Object.keys(selection.rowSelection);
const values = Object.values(rowSelection);
const spread = [...selection.rowSelection];
for (const id in selection.rowSelection) {
	selectedIds.push(id);
}
// alias + for-in (#1943/r2 form that stayed green)
const m = selection.rowSelection;
const aliasKeys = Object.keys(m);
const aliasIn: string[] = [];
for (const id in m) {
	aliasIn.push(id);
}
const aliasSpread = [...m];
// destructure rename + Object.keys (verdict form 3)
const { rowSelection: n } = selection;
const destructuredKeys = Object.keys(n);
// element-access spelling (verdict form 4)
const elementKeys = Object.keys(selection["rowSelection"]);
// computed string key resolves to the same member
const k = 'rowSelection';
const computedKeys = Object.keys(selection[k]);
// chained alias
const chained = m;
const chainedKeys = Object.keys(chained);
// reassigned alias (assignment is a binding source)
let reassigned;
reassigned = selection.rowSelection;
const reassignedKeys = Object.keys(reassigned);
// mixed source: cannot prove the value is NOT the map -> undecidable
const mixed = ready ? selection.rowSelection : rows;
const mixedKeys = Object.keys(mixed);
// spread copy: the keys ARE the map's keys -> undecidable
const copied = { ...selection.rowSelection };
const copiedKeys = Object.keys(copied);
// interprocedural flow: helper iterates its parameter -> undecidable
const collect = (x: Record<string, boolean>) => Object.keys(x);
collect(selection.rowSelection);
`;
		const violations = findViolationsAgainstSource(fabricated);
		expect(
			violations.sort(),
			'the detector must catch every forbidden pattern in the fabricated source',
		).toEqual(
			[
				'[...] over aliased selection map: m',
				'[...] over selection map',
				'Object.entries(selection map)',
				'Object.keys(aliased selection map: chained)',
				'Object.keys(aliased selection map: m)',
				'Object.keys(aliased selection map: n)',
				'Object.keys(aliased selection map: reassigned)',
				'Object.keys(selection map)',
				'Object.values(selection map)',
				'for-in over aliased selection map: m',
				'for-in over selection map',
				'undecidable: copied may hold the selection map',
				'undecidable: mixed may hold the selection map',
				'undecidable: x may receive the selection map',
			].sort(),
		);
	});
});
/**
 * Round-2 verdict forms (#1980): each of the four spelling families that
 * stayed GREEN against the r1 detector must produce a diagnostic with the
 * binding-tracking detector. These are pinned one-by-one so a regression in
 * any single binding form is caught by name, not by the lumped REPLAY
 * assertion above.
 *
 * Source: `_probe-r2-bulk.test.ts` (probe, deleted before commit).
 */
describe('r2 verdict forms: the detector follows the VALUE, not the spelling', () => {
	test('verdict form 1: alias + for...in is a violation', () => {
		const source = `
const m = selection.rowSelection;
for (const id in m) { ids.push(id); }
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['for-in over aliased selection map: m']),
		);
	});

	test('verdict form 2: alias + spread is a violation', () => {
		const source = `
const m = selection.rowSelection;
const a = [...m];
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['[...] over aliased selection map: m']),
		);
	});

	test('verdict form 3: destructure rename + Object.keys is a violation', () => {
		const source = `
const { rowSelection: m } = selection;
const keys = Object.keys(m);
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['Object.keys(aliased selection map: m)']),
		);
	});

	test('verdict form 4: element access spelling is a violation', () => {
		const source = `
const keys = Object.keys(selection["rowSelection"]);
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['Object.keys(selection map)']),
		);
	});

	test('fifth family: computed string key is resolved', () => {
		const source = `
const k = 'rowSelection';
const keys = Object.keys(selection[k]);
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['Object.keys(selection map)']),
		);
	});

	test('fifth family: chained alias is a violation', () => {
		const source = `
const m = selection.rowSelection;
const n = m;
const keys = Object.keys(n);
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['Object.keys(aliased selection map: n)']),
		);
	});

	test('fifth family: reassigned alias is a violation', () => {
		const source = `
let m;
m = selection.rowSelection;
const keys = Object.keys(m);
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['Object.keys(aliased selection map: m)']),
		);
	});

	test('fifth family: conditional source yields an UNDECIDABLE diagnostic', () => {
		const source = `
const m = ready ? selection.rowSelection : rows;
const keys = Object.keys(m);
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['undecidable: m may hold the selection map']),
		);
	});

	test('fifth family: object-spread copy yields an UNDECIDABLE diagnostic', () => {
		const source = `
const copy = { ...selection.rowSelection };
const keys = Object.keys(copy);
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['undecidable: copy may hold the selection map']),
		);
	});

	test('fifth family: helper-parameter flow yields an UNDECIDABLE diagnostic', () => {
		const source = `
const collect = (x: Record<string, boolean>) => Object.keys(x);
collect(selection.rowSelection);
`;
		expect(findViolationsAgainstSource(source)).toEqual(
			expect.arrayContaining(['undecidable: x may receive the selection map']),
		);
	});
});
