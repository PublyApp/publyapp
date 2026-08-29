import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// chore/908 (TypeScript 7): see the same-named comment in
// i18n-key-coverage.test.ts — the classic Compiler API is no longer reachable
// through bare `import ts from 'typescript'` and its replacement,
// `typescript/unstable/ast`, is explicitly unstable. This script runs in
// `just ci-front` and `pnpm test`, so its AST-based status-menu check
// (statusMenuViolations) needs a stable surface across TypeScript upgrades —
// ts-morph's vendored, version-pinned compiler provides that.
import { ts } from 'ts-morph';

import suppressionInventory from '../../src/lib/suppression-inventory.json' with { type: 'json' };
import {
	diffSuppressionInventory,
	findSuppressionSitesInSource,
	isPreviousLineSuppressed,
	type SuppressionSite,
} from '../../src/lib/suppression-reason.ts';

const rootDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

interface DesignViolation {
	ruleId: string;
	message: string;
	file: string;
	line: number;
	source: string;
}

/** The subset of a violation the guard-debt ledger actually charges on. */
interface GuardDebtCharge {
	ruleId: string;
	file: string;
	source: string;
}

export interface GuardDebtEntry {
	ruleId: string;
	file: string;
	sourceIncludes: string;
	reason: string;
	maxOccurrences: number;
}

/** A single-line pattern object (the `{ test }` half) participates in the
 * multi-line-aware statement scan exactly like a RegExp, so both shapes are
 * accepted everywhere a rule declares patterns. */
type RulePattern = RegExp | { test: (text: string) => boolean };

interface DesignSystemRule {
	id: string;
	message: string;
	appliesTo: (relativePath: string) => boolean;
	patterns: RulePattern[];
	ignoreMatch?: (
		relativePath: string,
		line: string,
		lineIndex: number,
		lines: string[],
	) => boolean;
	ignoreFile?: (relativePath: string) => boolean;
	mode?: 'source';
	allow?: (relativePath: string) => boolean;
}

interface ThemeInvariantTokenEntry {
	prefix?: string;
	exact?: string;
	reason: string;
}

interface TokenDecl {
	value: string;
	line: number;
}

interface ScopedCustomPropertyPair {
	light: Map<string, TokenDecl>;
	dark: Map<string, TokenDecl>;
}

// ts-morph's SourceFile type omits parseDiagnostics, but its vendored
// compiler always populates it (verified behaviour this guard relies on).
// Extending the public type keeps the single widening assertion comparable,
// instead of an `as unknown as` chain that discards type evidence.
interface SourceFileWithParseDiagnostics extends ts.SourceFile {
	parseDiagnostics: readonly ts.Diagnostic[];
}

interface ColorMixCall {
	openerIndex: number;
	argsText: string;
}

interface ScanOptions {
	baseDir?: string;
	sourceDir?: string;
	sourceDirs?: string[];
	checkStaleDebt?: boolean;
	guardDebt?: GuardDebtEntry[];
	checkTokenGuards?: boolean;
	checkSuppressionInventory?: boolean;
	checkDebtBudgetSlack?: boolean;
}

type DesignViolationScanResult = DesignViolation[] & {
	scannedFileCount: number;
};
const srcDir = path.join(rootDir, 'src');
const e2eDir = path.join(rootDir, 'e2e');

const STATUS_FILTER_RULE_ID = 'status-filter-checkbox-contract';

const jsxTagName = (node: ts.JsxElement | ts.JsxSelfClosingElement): string => {
	const tagName = ts.isJsxElement(node)
		? node.openingElement.tagName
		: node.tagName;
	return tagName.getText();
};

const visitDescendants = (
	node: ts.Node,
	visitor: (node: ts.Node) => void,
): void => {
	visitor(node);
	node.forEachChild((child) => visitDescendants(child, visitor));
};

const attributeNamed = (
	opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
	name: string,
): ts.JsxAttribute | undefined =>
	opening.attributes.properties.find(
		(attribute): attribute is ts.JsxAttribute =>
			ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
	);

const hasSpreadAttribute = (
	opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): boolean => opening.attributes.properties.some(ts.isJsxSpreadAttribute);

const isExplicitFalse = (attribute: ts.JsxAttribute | undefined): boolean =>
	Boolean(
		attribute?.initializer &&
		ts.isJsxExpression(attribute.initializer) &&
		attribute.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword,
	);

const isExplicitTrue = (attribute: ts.JsxAttribute | undefined): boolean => {
	if (!attribute) {
		return false;
	}
	return (
		attribute.initializer == null ||
		(ts.isJsxExpression(attribute.initializer) &&
			attribute.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword)
	);
};

const lineForNode = (sourceFile: ts.SourceFile, node: ts.Node): number =>
	sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

const containsStatusMap = (
	menu: ts.Node,
	sourceFile: ts.SourceFile,
): boolean => {
	let found = false;
	visitDescendants(menu, (node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'map' &&
			/status/i.test(node.getText(sourceFile))
		) {
			found = true;
		}
	});
	return found;
};

const statusMenuViolations = (
	relativePath: string,
	source: string,
): DesignViolation[] => {
	if (!relativePath.startsWith('src/') || !relativePath.endsWith('.tsx')) {
		return [];
	}

	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	// ts-morph omits parseDiagnostics from its public type even though its
	// vendored compiler always populates it; widen once through the named
	// view type instead of an assertion chain that would discard evidence.
	const { parseDiagnostics } = sourceFile as SourceFileWithParseDiagnostics;
	if (parseDiagnostics.length > 0) {
		return parseDiagnostics.map((diagnostic): DesignViolation => ({
			ruleId: STATUS_FILTER_RULE_ID,
			message: `cannot parse TSX status-menu candidate safely: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
			file: relativePath,
			line:
				diagnostic.start == null
					? 1
					: sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
			source:
				diagnostic.start == null
					? ''
					: sourceFile.text.slice(
							diagnostic.start,
							diagnostic.start + (diagnostic.length ?? 1),
						),
		}));
	}

	const violations: DesignViolation[] = [];
	visitDescendants(sourceFile, (node) => {
		if (!ts.isJsxElement(node) || jsxTagName(node) !== 'DropdownMenuContent') {
			return;
		}
		const menuText = node.getText(sourceFile);
		const isStatusMenu =
			/all-statuses/i.test(menuText) || containsStatusMap(node, sourceFile);
		if (!isStatusMenu) {
			return;
		}

		const items: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
		visitDescendants(node, (child) => {
			if (
				(ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) &&
				jsxTagName(child) === 'DropdownMenuCheckboxItem'
			) {
				items.push(child);
			}
		});
		const resetItems = items.filter((item) =>
			/all-statuses/i.test(item.getText(sourceFile)),
		);
		const valueItems = items.filter((item) => !resetItems.includes(item));

		if (valueItems.length > 0 && resetItems.length !== 1) {
			violations.push({
				ruleId: STATUS_FILTER_RULE_ID,
				message:
					'persistent status menu must contain exactly one All statuses reset item',
				file: relativePath,
				line: lineForNode(sourceFile, node),
				source: node.openingElement.getText(sourceFile),
			});
		}

		for (const item of valueItems) {
			const opening = ts.isJsxElement(item) ? item.openingElement : item;
			if (hasSpreadAttribute(opening)) {
				violations.push({
					ruleId: STATUS_FILTER_RULE_ID,
					message:
						'cannot classify status item attributes hidden by a JSX spread',
					file: relativePath,
					line: lineForNode(sourceFile, opening),
					source: opening.getText(sourceFile),
				});
				continue;
			}
			if (!isExplicitTrue(attributeNamed(opening, 'showCheckbox'))) {
				violations.push({
					ruleId: STATUS_FILTER_RULE_ID,
					message: 'status value must explicitly use showCheckbox={true}',
					file: relativePath,
					line: lineForNode(sourceFile, opening),
					source: opening.getText(sourceFile),
				});
			}
			if (!isExplicitFalse(attributeNamed(opening, 'closeOnClick'))) {
				violations.push({
					ruleId: STATUS_FILTER_RULE_ID,
					message: 'status value must explicitly use closeOnClick={false}',
					file: relativePath,
					line: lineForNode(sourceFile, opening),
					source: opening.getText(sourceFile),
				});
			}
		}

		for (const reset of resetItems) {
			const opening = ts.isJsxElement(reset) ? reset.openingElement : reset;
			if (hasSpreadAttribute(opening)) {
				violations.push({
					ruleId: STATUS_FILTER_RULE_ID,
					message: 'cannot classify reset attributes hidden by a JSX spread',
					file: relativePath,
					line: lineForNode(sourceFile, opening),
					source: opening.getText(sourceFile),
				});
			}
			if (attributeNamed(opening, 'showCheckbox')) {
				violations.push({
					ruleId: STATUS_FILTER_RULE_ID,
					message: 'All statuses reset must not use showCheckbox',
					file: relativePath,
					line: lineForNode(sourceFile, opening),
					source: opening.getText(sourceFile),
				});
			}
			if (!isExplicitTrue(attributeNamed(opening, 'closeOnClick'))) {
				violations.push({
					ruleId: STATUS_FILTER_RULE_ID,
					message: 'All statuses reset must explicitly close on click',
					file: relativePath,
					line: lineForNode(sourceFile, opening),
					source: opening.getText(sourceFile),
				});
			}
		}
	});
	return violations;
};

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const APP_CSS_PATH = 'src/styles/app.css';
const ROUNDED_RULE_ID = 'no-rounded-full-or-999-radius';
// F824 (ui F5): referenced by the composed-hex fixture-debt entries below.
const RAW_COLOR_RULE_ID = 'no-raw-visual-color';
const KNOWN_HANDOFF_GUARD_DEBT: GuardDebtEntry[] = [
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/query-display.tsx',
		sourceIncludes: 'animate-spin rounded-full border-2',
		reason: 'Legacy loading spinner; spinner cleanup is outside Task 1.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table-states.tsx',
		sourceIncludes:
			'<Skeleton className="size-[26px] shrink-0 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table-states.tsx',
		sourceIncludes: '<Skeleton className="h-3 w-40 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table-states.tsx',
		sourceIncludes: '<Skeleton className="h-3 w-56 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table-states.tsx',
		sourceIncludes: '<Skeleton className="ml-auto h-5 w-16 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table-states.tsx',
		sourceIncludes: '<Skeleton className="h-5 w-16 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: 'size-3.5 animate-spin rounded-full',
		reason: 'Legacy pagination spinner; Task 4 table pass owns this.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/ui/loading-spinner.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason:
			'Functional spinner circle (a full rotation needs a full circle), not a decorative pill. ' +
			'An inline `design-system-ignore` comment cannot suppress this: the rule id ' +
			'"no-rounded-full-or-999-radius" itself contains the substring "rounded-full" and would ' +
			'self-trigger a new violation on the comment line, so this is a debt-list entry instead.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
];

const IMPORTANT_FOUNDATION_RULE_ID = 'no-important-foundation';
// app.css declarations that must stay `!important` because they beat a real,
// verified conflicting Tailwind utility from a shared primitive (Badge/Button
// defaults) or are a deliberate, permanent cascade override (reduced-motion,
// theme-switch transition suppression) — not debt to pay down, but recorded
// here (per rule) so the guard can still see and reason about every
// `!important` in the file instead of being blind to the one file that has
// the most of them.
const KNOWN_IMPORTANT_FOUNDATION_DEBT: GuardDebtEntry[] = [
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'height: 22px !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill vs Badge h-5 default — real conflict, see rule comment.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 2,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'font-size: 11px !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill vs Badge text-xs default — real conflict.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 2,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'border-radius: var(--publy-radius-chip) !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill — same computed value as the Badge utility today, but kept explicit and important so a future Badge radius change cannot silently drift the shell chip.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 2,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'padding: 0 8px !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill vs Badge px-2 py-0.5 default — real conflict.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 2,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'background: var(--publy-surface-muted) !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill — Badge outline has no base bg utility, kept important for symmetry with the rest of the rule.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 2,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'color: var(--publy-foreground-muted) !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill/.app-shell-topbar-action-btn vs Badge text-foreground / Button outline defaults — real conflict.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 3,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'height: 36px !important;',
		reason:
			'.app-shell-topbar-action-btn — matches the Button size="icon" utility value; kept important for symmetry with the radius/border-color overrides in the same rule.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'min-height: 36px !important;',
		reason: '.app-shell-topbar-action-btn — see height: 36px entry above.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'width: 36px !important;',
		reason: '.app-shell-topbar-action-btn — see height: 36px entry above.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'min-width: 36px !important;',
		reason: '.app-shell-topbar-action-btn — see height: 36px entry above.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'border-radius: 999px !important;',
		reason:
			".app-shell-topbar-action-btn — deliberately circular vs the Button size utility 12px radius; this is the guard's own documented rounded-full exception for this selector.",
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'border-color: var(--publy-border) !important;',
		reason:
			'.app-shell-topbar-action-btn vs Button outline border-(--publy-border-strong) default — real conflict.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'transition-duration: 1ms !important;',
		reason:
			'prefers-reduced-motion: reduce — must beat every component/utility transition unconditionally; permanent by design.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'animation-duration: 1ms !important;',
		reason:
			'prefers-reduced-motion: reduce — see transition-duration entry above.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'animation-iteration-count: 1 !important;',
		reason:
			'prefers-reduced-motion: reduce — see transition-duration entry above.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'scroll-behavior: auto !important;',
		reason:
			'prefers-reduced-motion: reduce — see transition-duration entry above.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'transition: none !important;',
		reason:
			'html[data-theme-changing] — suppresses cross-fade during the .dark class swap; must beat every transition unconditionally, permanent by design.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	// F4: src/components/ui/ joined the scan this round; each pre-existing
	// `!`-suffix usage there is now recorded here instead of being invisible.
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/components/ui/badge.variants.ts',
		sourceIncludes: '[&>svg]:size-3!',
		reason:
			'Pins every Badge icon to 12px regardless of the icon component’s own default size (Tabler icons default to size-4/16px) — a caller’s icon className would otherwise win and break the compact 20px badge. (File: the cva definition moved here from badge.tsx for react-doctor rung 2, #1417.)',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/components/ui/tabs.tsx',
		sourceIncludes: 'border-transparent!',
		reason:
			'TabsTrigger renders a native <button> by default (nativeButton); pins the border transparent against the user-agent button border independent of Tailwind’s utility generation order.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/components/ui/tooltip.tsx',
		sourceIncludes: 'top-1/2!',
		reason:
			'Overrides Base UI’s own inline arrow-positioning style for the inline-end/inline-start/left/right sides; the default `top` set by the primitive otherwise wins over a plain (non-important) utility.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 4,
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/components/ui/search-input.test.tsx',
		sourceIncludes: 'display: inline-block !important;',
		reason:
			'#975 round 3 regression proof (css-cascade-test-support.ts): real CSS ' +
			'text constructed as test DATA to verify the cascade resolver now honours ' +
			'`!important`, not shipped styling — the parser under test genuinely needs ' +
			'the literal CSS token to exercise the code path the reviewer defeated.',
		// F824 ui F1/tests F2: hard budget = measured current standalone occurrences.

		maxOccurrences: 1,
	},
	// F824 (ui F5): these two contrast-suite fixtures deliberately compose
	// their fixture hexes (`'#' + 'ff0000'` etc.) precisely SO THAT the raw-
	// colour guard cannot see them — they exist to prove the contrast
	// resolvers still RESOLVE raw values correctly without tripping this very
	// scan on every run. They are recorded debt against the NEW composition
	// detectors, not silent exemptions: each carries a hard occurrence budget
	// and the matched source text is pinned, so editing a fixture past its
	// budget (or adding another composed colour anywhere) fails the guard.
	// (#823: the focus-ring suite's own `'#' + 'ffffff'` entry was DELETED,
	// not relaxed — its token-math rewrite stopped carrying that fixture, so
	// the debt entry went stale under the zero-slack policy.)
	{
		ruleId: RAW_COLOR_RULE_ID,
		file: 'src/styles/drawer-description-contrast.test.ts',
		sourceIncludes: "'#' + 'ff0000'",
		reason:
			'Contrast-suite fixture input (rawRed) — same deliberate evasion ' +
			'spelling as the focus-ring fixture; test DATA for resolver coverage.',
		maxOccurrences: 1,
	},
	{
		ruleId: RAW_COLOR_RULE_ID,
		file: 'src/styles/drawer-description-contrast.test.ts',
		sourceIncludes: "'#' + '111111'",
		reason:
			'Contrast-suite fixture input (rawNearBlack) — same deliberate ' +
			'evasion spelling as rawRed above; test DATA for resolver coverage.',
		maxOccurrences: 1,
	},
];

// r4-shell-F3: the app-shell mobile-nav `rounded-full` pill this allowlist
// used to carry was a real, shipped violation of the locked corner-radius
// rule — the guard reported "0 violations" only because this debt entry
// suppressed it, not because the surface was compliant. The pill is now
// fixed (see app-shell.tsx); this scope is finalized permanently, not just
// for the current entries, so a future debt entry can never quietly
// re-permit the same class of violation in this directory again.
const FINALIZED_NO_DEBT_SCOPES = ['src/components/app-shell/'];

for (const debt of KNOWN_HANDOFF_GUARD_DEBT) {
	const finalizedScope = FINALIZED_NO_DEBT_SCOPES.find((scope) =>
		debt.file.startsWith(scope),
	);
	if (finalizedScope) {
		throw new Error(
			`KNOWN_HANDOFF_GUARD_DEBT may not target "${finalizedScope}" (finalized scope, r4-shell-F3): ` +
				`${debt.file} — ${debt.ruleId}: ${debt.sourceIncludes}`,
		);
	}
}

// r1-fix: exported for the permanent zero-slack test, which re-measures every
// entry against its real file through the production path.
export const KNOWN_GUARD_DEBT: GuardDebtEntry[] = [
	...KNOWN_HANDOFF_GUARD_DEBT,
	...KNOWN_IMPORTANT_FOUNDATION_DEBT,
];

// F824 ui F1/tests F2: every entry must carry an explicit, positive integer
// budget. It cannot be derived from the status quo here (that would quietly
// re-bless whatever the entry happens to match today), so a missing or
// non-positive budget fails the module load: fix the code or measure the
// current occurrences and write them down — do not omit the number.
for (const debt of KNOWN_GUARD_DEBT) {
	if (!Number.isInteger(debt.maxOccurrences) || debt.maxOccurrences < 1) {
		throw new Error(
			`KNOWN_GUARD_DEBT entry ${debt.ruleId} @ ${debt.file} (${debt.sourceIncludes}) ` +
				'must declare a positive integer maxOccurrences budget — occurrences beyond the ' +
				'budget are reported as real violations, so the budget must be explicit.',
		);
	}
}

const escapeRegExpLiteral = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// #992 review follow-up: `.includes(selector)` matched any selector that
// merely STARTS WITH the allowlisted one (e.g. an unauthorized
// `.publy-profile-detail-tile-pin-impostor` silently inherited the
// `.publy-profile-detail-tile-pin` exception). A selector is a complete
// class/attribute token, not a free-text prefix, so require that the
// character immediately following the matched text is not itself a
// selector-identifier character (letter, digit, `_`, or `-`) — that is
// exactly the boundary a longer, unrelated class name would violate.
// Deliberately no left-side boundary check: some allowlisted selectors are
// matched as the tail of a compound selector (e.g.
// `.app-shell-rail-link[data-rail-item='account']`, where the character
// immediately before `[` is the preceding class's own last letter), and a
// left boundary would break that legitimate case.
const selectorAppearsExactly = (line: string, selector: string): boolean => {
	const pattern = new RegExp(`${escapeRegExpLiteral(selector)}(?![\\w-])`);
	return pattern.test(line);
};

// Tightened to the same rule block (F15): stop at the nearest enclosing `{`
// or `}` above the match instead of scanning a fixed 8-line lookback window,
// so a `rounded-full` in one rule can't ride on an unrelated selector's name
// merely because it sits a few lines above.
const hasNearbySelector = (
	lines: string[],
	lineIndex: number,
	selector: string,
): boolean => {
	for (let index = lineIndex; index >= 0; index--) {
		if (selectorAppearsExactly(lines[index], selector)) {
			return true;
		}

		if (index !== lineIndex && /[{}]/.test(lines[index])) {
			return false;
		}
	}

	return false;
};

// Finds the [startLine, endLine] (0-indexed, inclusive) ranges of top-level
// blocks whose opening line matches `selectorPattern`, by brace counting —
// used to make `no-raw-visual-color` block-aware instead of file-aware (F5):
// only the `:root { … }` / `html.dark { … }` token-declaration blocks in
// app.css may contain raw colour literals; every other rule in the file is
// scanned like any other source file.
const getBlockLineRanges = (
	lines: string[],
	selectorPattern: RegExp,
): [number, number][] => {
	const ranges: [number, number][] = [];
	for (let index = 0; index < lines.length; index += 1) {
		if (!selectorPattern.test(lines[index])) {
			continue;
		}

		let depth = 0;
		let started = false;
		for (let scan = index; scan < lines.length; scan += 1) {
			for (const character of lines[scan]) {
				if (character === '{') {
					depth += 1;
					started = true;
				} else if (character === '}') {
					depth -= 1;
				}
			}

			if (started && depth === 0) {
				ranges.push([index, scan]);
				break;
			}
		}
	}

	return ranges;
};

// W6-FLAKE #827: `no-raw-visual-color` consults the app.css token layer for
// EVERY candidate match it finds anywhere in the tree (its ignoreMatch runs
// per matched line/statement). Deriving the block ranges brace-counts the
// whole token layer, so recomputing per match made every raw-colour match in
// any file pay a full app.css re-scan. The derived ranges are keyed by the
// lines ARRAY's identity rather than copying or hashing it: each scan splits
// app.css exactly once, so one derivation serves all matches of that scan,
// and a WeakMap entry dies with its array — no cross-scan staleness, no
// retention, safe for the fixture tests that pass fresh temp-dir content
// through this path.
let tokenLayerRangesByLines = new WeakMap<string[], [number, number][]>();
let tokenLayerRangeComputeCalls = 0;

const getTokenLayerBlockRanges = (lines: string[]): [number, number][] => {
	const cached = tokenLayerRangesByLines.get(lines);
	if (cached !== undefined) {
		return cached;
	}

	tokenLayerRangeComputeCalls += 1;
	const ranges = [
		...getBlockLineRanges(lines, /^:root\s*\{/),
		...getBlockLineRanges(lines, /^html\.dark\s*\{/),
	];
	tokenLayerRangesByLines.set(lines, ranges);
	return ranges;
};

// Test seam ONLY (W6-FLAKE #827 canary): production callers never reset the
// cache; the spec uses these to prove one scan derives the ranges at most
// once per distinct lines array.
const resetTokenLayerRangeCacheForTestObservation = () => {
	tokenLayerRangesByLines = new WeakMap();
	tokenLayerRangeComputeCalls = 0;
};

const getTokenLayerComputeStatsForTestObservation = () => ({
	computeCalls: tokenLayerRangeComputeCalls,
});

export const scanFront2DesignSystemInternals = {
	resetTokenLayerRangeCacheForTestObservation,
	getTokenLayerComputeStatsForTestObservation,
};

const isAppCssTokenLayerLine = (
	relativePath: string,
	lineIndex: number,
	lines: string[],
): boolean => {
	if (relativePath !== APP_CSS_PATH) {
		return false;
	}

	return getTokenLayerBlockRanges(lines).some(
		([start, end]) => lineIndex >= start && lineIndex <= end,
	);
};

const isRoundedRadiusAllowed = (
	relativePath: string,
	line: string,
	lineIndex: number,
	lines: string[],
): boolean => {
	if (
		relativePath === 'src/components/ui/avatar.tsx' ||
		relativePath === 'src/components/ui/person-avatar.tsx'
	) {
		return true;
	}

	if (relativePath === 'src/components/app-shell/app-shell.tsx') {
		return selectorAppearsExactly(line, 'app-shell-topbar-action-btn');
	}

	// SimpleLayout's theme/language buttons are the same 36px circular
	// treatment as the workspace topbar's, expressed as inline Tailwind
	// utilities instead of the shared class — they must NOT reuse
	// `.app-shell-topbar-action-btn` itself, since that class is `display:
	// none` below 640px in the workspace topbar's mobile rule (r3-shell-F1).
	if (
		relativePath === 'src/layouts/simple-layout.tsx' ||
		relativePath === 'src/layouts/simple-layout.test.tsx'
	) {
		return line.includes('rounded-full');
	}

	if (relativePath !== 'src/styles/app.css') {
		return false;
	}

	return (
		selectorAppearsExactly(line, '.app-shell-topbar-action-btn') ||
		hasNearbySelector(lines, lineIndex, '.app-shell-topbar-action-btn') ||
		// The remaining genuinely circular CSS surfaces (F4): the rail's
		// account avatar/link and the form action bar's 7px status dot.
		hasNearbySelector(lines, lineIndex, "[data-rail-item='account']") ||
		hasNearbySelector(lines, lineIndex, '.app-shell-rail-account-avatar') ||
		hasNearbySelector(
			lines,
			lineIndex,
			'.publy-form-action-bar-status::before',
		) ||
		// #992: the profile icon-picker's pencil-pin corner badge is a THIRD,
		// deliberately narrow exception (not just "avatars and topbar icon
		// buttons" — keep this list and the `no-rounded-full-or-999-radius`
		// rule message above, and docs/guides/front/conventions.md's corner-
		// radius section, in sync whenever this list changes). It is the same
		// "genuinely circular" affordance shape as AvatarBadge (a small round
		// indicator sitting on a corner). Matched with an exact selector
		// boundary (`selectorAppearsExactly`/`hasNearbySelector`), not a raw
		// substring, so an unrelated selector merely starting with this class
		// name (e.g. a hypothetical `.publy-profile-detail-tile-pin-anything`)
		// cannot silently inherit the exception.
		hasNearbySelector(lines, lineIndex, '.publy-profile-detail-tile-pin')
	);
};

// r4-ui-F3: the direct-colour-function source, centralized so every scanner
// (token parity, property values, arbitrary Tailwind, custom properties) sees
// the same set of standard CSS colour functions instead of each maintaining
// its own hex/rgb(a)-only copy. Covers hex plus every standard CSS colour
// function — rgb(a), hsl(a), hwb, lab, lch, oklab, oklch, color() — while
// `(?!-mix)` after `color` keeps `color-mix(in srgb, var(--x) N%, ...)`
// (a reference, not a literal) out of this list; that intentional case is
// still recognized and exempted separately wherever it appears.
const DIRECT_COLOR_FUNCTION_NAMES =
	'rgba?|hsla?|hwb|lab|lch|oklab|oklch|color(?!-mix)';

// F3: a colour literal directly in the value — `#fff`, `rgba(0, 0, 0, .5)`,
// `hsl(200 10% 10%)`, `oklch(95% .1 90)` — as opposed to a value that only
// *references* another (already theme-aware) token, e.g.
// `0 0 0 1px var(--publy-border)` or
// `color-mix(in srgb, var(--publy-primary) 25%, transparent)`. Those need no
// dark counterpart of their own: they inherit theme-awareness from the token
// they point at.
const COLOR_LITERAL_PATTERN = new RegExp(
	`#[0-9a-fA-F]{3,8}\\b|\\b(?:${DIRECT_COLOR_FUNCTION_NAMES})\\(`,
);

// Tokens whose colour is deliberately fixed across both themes — documented
// per-entry so the guard can still see and reason about every exemption
// instead of being blind to the whole class (F3, mirrors KNOWN_GUARD_DEBT).
const THEME_INVARIANT_TOKENS: ThemeInvariantTokenEntry[] = [
	{
		prefix: '--publy-avatar-',
		reason:
			'WCAG-pinned avatar palette validated against fixed white initials text; must not swap in dark mode.',
	},
	{
		prefix: '--publy-auth-',
		reason:
			'Auth split-brand hero panel (handoff A1) is a fixed dark canvas by design, independent of the app theme.',
	},
	{
		exact: '--publy-shadow-chrome',
		reason:
			'.btn-primary-chrome bevel is pinned to the handoff spec value (see check-design-system.test.mjs) and reads as a consistent metal highlight regardless of surface tone.',
	},
	{
		exact: '--publy-chrome-border',
		reason:
			'.btn-primary-chrome border is the same fixed metal bevel as --publy-shadow-chrome above and must not swap in dark mode either.',
	},
];

const isThemeInvariantToken = (name: string): boolean =>
	THEME_INVARIANT_TOKENS.some((entry) =>
		entry.exact !== undefined
			? entry.exact === name
			: entry.prefix !== undefined && name.startsWith(entry.prefix),
	);

// W6-GUARDS (ui F3): this raw regex used to scan comments along with real
// declarations — `/* --publy-new-tone: dark value pending; */` satisfied
// BOTH token-theme-parity (the parity guard saw the commented name as
// "declared" in the block it appeared in, even though the browser never
// resolves it there) and token-must-be-declared (any comment anywhere in
// app.css mentioning a token name made every real `var(--publy-x)` usage
// look declared, even if no real declaration existed anywhere). Every
// consumer of this function — token parity, the scoped custom-property
// pairing walk, and the whole-source declared-names set — shares this one
// parser, so stripping comments here closes the hole everywhere at once.
const stripCssComments = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//g, '');

// Parses `--publy-x: value;` pairs out of a block of CSS text, tolerating
// multi-line values (e.g. a wrapped `box-shadow` declaration) since this
// operates on the whole block instead of scanning line-by-line.
const extractTokenDeclarations = (blockText: string): Map<string, string> => {
	const declarations = new Map<string, string>();
	const pattern = /(--publy-[\w-]+)\s*:\s*([^;]+);/g;
	let match;
	while ((match = pattern.exec(stripCssComments(blockText)))) {
		declarations.set(match[1], match[2].trim());
	}
	return declarations;
};

const findDeclarationLine = (
	lines: string[],
	start: number,
	end: number,
	tokenName: string,
): number => {
	for (let index = start; index <= end; index += 1) {
		if (lines[index].trim().startsWith(`${tokenName}:`)) {
			return index + 1;
		}
	}
	return start + 1;
};

// F3: token-theme-parity above only reads the :root/html.dark token *layer*
// blocks, so a colour-valued custom property declared per-selector on an
// ordinary component rule (e.g. `--publy-icon-tile-bg`/`-fg` per
// `data-tone`) was invisible to it — the exact shape that shipped 32 raw hex
// literals unpaired. Walks every top-level `selector { … }` block in
// app.css (this file has no CSS nesting, so brace-counting from a block's
// own header line never crosses into an unrelated block), skips
// :root/html.dark (handled above) and at-rule headers, and pairs each
// remaining block's declarations against a `html.dark <same selector>`
// block, keyed by the last selector in a possibly comma-separated list —
// which is how every existing dark counterpart in this file is spelled
// (`html.dark .foo, html.dark .bar { … }` mirrors `.foo, .bar { … }`).
const collectScopedCustomPropertyDeclarations = (
	appCssLines: string[],
): Map<string, ScopedCustomPropertyPair> => {
	const byKey = new Map<string, ScopedCustomPropertyPair>();

	for (let index = 0; index < appCssLines.length; index += 1) {
		const trimmed = appCssLines[index].trim();
		if (!trimmed.endsWith('{') || trimmed.startsWith('@')) {
			continue;
		}

		const header = trimmed.slice(0, -1).trim();
		if (header === '' || header === ':root' || header === 'html.dark') {
			continue;
		}

		let depth = 0;
		let started = false;
		let endLine = index;
		for (let scan = index; scan < appCssLines.length; scan += 1) {
			for (const character of appCssLines[scan]) {
				if (character === '{') {
					depth += 1;
					started = true;
				} else if (character === '}') {
					depth -= 1;
				}
			}
			if (started && depth === 0) {
				endLine = scan;
				break;
			}
		}

		const isDark = /^html\.dark\b/.test(header);
		const key = header.replace(/^html\.dark\s+/, '');
		const blockText = appCssLines.slice(index + 1, endLine).join('\n');
		const declarations = extractTokenDeclarations(blockText);
		if (declarations.size > 0) {
			const entry: ScopedCustomPropertyPair = byKey.get(key) ?? {
				light: new Map<string, TokenDecl>(),
				dark: new Map<string, TokenDecl>(),
			};
			const bucket = isDark ? entry.dark : entry.light;
			for (const [name, value] of declarations) {
				if (!bucket.has(name)) {
					bucket.set(name, {
						value,
						line: findDeclarationLine(appCssLines, index, endLine, name),
					});
				}
			}
			byKey.set(key, entry);
		}

		index = endLine;
	}

	return byKey;
};

// F3: two guards over the token *layer* itself, run once over the whole scan
// instead of per-line — the r1 dead-token deletion left conventions.md
// prescribing `--publy-shadow-card`, a token that no longer exists, and nothing
// today would have caught a light-only colour token shipping the same way.
const checkTokenGuardViolations = (
	fileContentsByRelativePath: Map<string, string>,
): DesignViolation[] => {
	const violations: DesignViolation[] = [];
	const appCssSource = fileContentsByRelativePath.get(APP_CSS_PATH);
	if (appCssSource === undefined) {
		return violations;
	}

	const appCssLines = appCssSource.split('\n');
	const [rootRange] = getBlockLineRanges(appCssLines, /^:root\s*\{/);
	const [darkRange] = getBlockLineRanges(appCssLines, /^html\.dark\s*\{/);
	const rootBlockText = rootRange
		? appCssLines.slice(rootRange[0], rootRange[1] + 1).join('\n')
		: '';
	const darkBlockText = darkRange
		? appCssLines.slice(darkRange[0], darkRange[1] + 1).join('\n')
		: '';
	const rootDeclarations = extractTokenDeclarations(rootBlockText);
	const darkDeclarations = extractTokenDeclarations(darkBlockText);
	// token-must-be-declared's "declared" set is deliberately wider than the
	// :root/html.dark token layer: component rules legitimately declare their
	// own locally-scoped custom properties (e.g. per-selector
	// `--publy-icon-tile-bg`/`-fg` pairs, `--publy-data-table-row-height` per
	// density variant) and consume them within the same file. Only a
	// reference that resolves to *no* declaration anywhere in app.css — the
	// `--publy-shadow-card` shape — is a real miss.
	const declaredNames = new Set(extractTokenDeclarations(appCssSource).keys());

	// token-theme-parity: every colour-valued :root token needs an html.dark
	// counterpart, unless it's on the theme-invariant allowlist above.

	// F824 ui F2: parity ran in ONE direction only — :root tokens were
	// required to have a dark counterpart, but a token declared ONLY in
	// html.dark passed as clean, its light-mode value silently falling back
	// to whatever the cascade default is. The check is now symmetric.
	for (const [name, value] of rootDeclarations) {
		if (!COLOR_LITERAL_PATTERN.test(value)) {
			continue;
		}

		if (isThemeInvariantToken(name) || darkDeclarations.has(name)) {
			continue;
		}

		violations.push({
			ruleId: 'token-theme-parity',
			message:
				'Colour-valued token declared in :root has no html.dark counterpart and is not on the ' +
				'theme-invariant allowlist — it will render its light value on dark surfaces too.',
			file: APP_CSS_PATH,
			line: rootRange
				? findDeclarationLine(appCssLines, rootRange[0], rootRange[1], name)
				: 0,
			source: `${name}: ${value}`,
		});
	}

	for (const [name, value] of darkDeclarations) {
		if (!COLOR_LITERAL_PATTERN.test(value)) {
			continue;
		}

		if (isThemeInvariantToken(name) || rootDeclarations.has(name)) {
			continue;
		}

		violations.push({
			ruleId: 'token-theme-parity',
			message:
				'Colour-valued token declared in html.dark has no :root counterpart and is not on the ' +
				'theme-invariant allowlist — light mode will render no value at all instead of this one.',
			file: APP_CSS_PATH,
			line: darkRange
				? findDeclarationLine(appCssLines, darkRange[0], darkRange[1], name)
				: 0,
			source: `${name}: ${value}`,
		});
	}

	// token-theme-parity (selector-scoped): a colour-valued custom property
	// declared on a component selector (not :root/html.dark) also needs an
	// `html.dark <same selector>` counterpart, unless it's theme-invariant.
	const scopedDeclarations =
		collectScopedCustomPropertyDeclarations(appCssLines);
	for (const [key, entry] of scopedDeclarations) {
		for (const [name, { value, line }] of entry.light) {
			if (!COLOR_LITERAL_PATTERN.test(value)) {
				continue;
			}

			if (isThemeInvariantToken(name) || entry.dark.has(name)) {
				continue;
			}

			violations.push({
				ruleId: 'token-theme-parity',
				message:
					`Colour-valued custom property "${name}" declared on \`${key}\` has no ` +
					`\`html.dark ${key}\` counterpart and is not on the theme-invariant allowlist — ` +
					'it will render its light value on dark surfaces too.',
				file: APP_CSS_PATH,
				line,
				source: `${name}: ${value}`,
			});
		}
	}

	// token-must-be-declared: every --publy-* reference across the scan
	// (`var(--x)`, `(--x)`, `[--x]`) must resolve to a declaration in app.css.
	const referencePattern = /(--publy-[\w-]+)(\s*:)?/g;
	for (const [relativePath, source] of fileContentsByRelativePath) {
		referencePattern.lastIndex = 0;
		let match;
		while ((match = referencePattern.exec(source))) {
			const [full, name, colon] = match;
			if (colon || declaredNames.has(name)) {
				continue;
			}

			const line = source.slice(0, match.index).split('\n').length;
			violations.push({
				ruleId: 'token-must-be-declared',
				message: `--publy-* token "${name}" is referenced but never declared in :root or html.dark of ${APP_CSS_PATH}.`,
				file: relativePath,
				line,
				source: full.trim(),
			});
		}
	}

	return violations;
};

const isConfirmDialogFile = (relativePath: string): boolean =>
	relativePath === 'src/components/ui/confirm-dialog.tsx' ||
	relativePath === 'src/components/ui/drawer.tsx';

// F824 ui F1/tests F2: a debt entry is a BUDGET, not an unlimited licence.
// The old matcher ran `source.includes(snippet)` over the whole FILE, so a
// single occurrence anywhere let EVERY violation of the same rule through —
// including second, unrelated offenses on other lines, and duplicates of the
// debt line itself riding the same exemption forever (tests F2).
//
// r1-fix (round-1 review CRITICAL): budgets are charged PER OCCURRENCE of the
// entry's snippet, not once per violating LINE. The previous ledger
// decremented exactly one unit per reported violation, so an entry whose
// snippet appears several times on ONE line consumed a single unit of a
// budget measured in occurrences — tooltip.tsx carries four `top-1/2!` on its
// Arrow className line, so its `maxOccurrences: 4` spent 1 and left 3 units of
// permanent slack that silently re-permitted three NEW violations (proven in
// review: three planted `top-1/2!` lines stayed green). Now every violation
// event spends as many units as ITS OWN offending text carries occurrences of
// the snippet (up to what remains): the tooltip Arrow line spends 4 of 4 in
// one event, and any further occurrence — anywhere, on any line — finds the
// budget empty and is reported. One unit per occurrence, wherever it sits,
// is exactly how every `maxOccurrences` in this file is measured; the
// zero-slack check (`checkGuardDebtBudgetSlack`, r1-fix below) keeps
// budget == exact current occurrence count so a correctly-measured entry can
// never be exhausted early by status-quo content.
//
// The ledger closes over the EFFECTIVE debt list (the caller-supplied
// `guardDebt` in fixture tests, `KNOWN_GUARD_DEBT` in the real CLI run), so
// a narrow fixture exercises the same budget mechanics the production scan
// runs.
const countSnippetOccurrences = (source: string, snippet: string): number => {
	const pattern = new RegExp(`(?<!-)${escapeRegExpLiteral(snippet)}`, 'g');
	return [...source.matchAll(pattern)].length;
};

// r1-fix (round-1 review): a debt entry's `maxOccurrences` must equal the
// file's EXACT current occurrence count of its snippet (`(?!-)snippet`,
// non-overlapping, wherever they sit). A budget ABOVE the real count leaves
// permanent slack that silently re-permits new violations of the same rule
// (the round-1 CRITICAL: tooltip.tsx's four `top-1/2!` share one line); a
// budget BELOW it fails the guard on the very code the entry records. Opt-in
// like the other whole-repo checks: only the real CLI run enables it, plus
// the permanent zero-slack test which measures the REAL repo.
const checkGuardDebtBudgetSlack = (
	guardDebt: GuardDebtEntry[],
	fileContentsByRelativePath: Map<string, string>,
): DesignViolation[] => {
	const findings: DesignViolation[] = [];
	for (const debt of guardDebt) {
		const content = fileContentsByRelativePath.get(debt.file);
		if (content === undefined) {
			continue;
		}
		const actual = countSnippetOccurrences(content, debt.sourceIncludes);
		if (actual === debt.maxOccurrences) {
			continue;
		}
		findings.push({
			ruleId: 'guard-debt-budget-slack',
			message:
				`guardDebt entry ${debt.ruleId} @ ${debt.file} (${debt.sourceIncludes}) declares maxOccurrences ${String(debt.maxOccurrences)} but the file currently carries ${String(actual)} occurrence(s) — a budget must equal the exact measured occurrence count (zero slack). ` +
				(actual > debt.maxOccurrences
					? 'Raise the budget only together with the code that adds the occurrence(s), each with a reason.'
					: 'Lower the budget to match — leftover slack silently re-permits new violations of this rule.'),
			file: debt.file,
			line: 0,
			source: `${debt.ruleId}: ${debt.sourceIncludes}`,
		});
	}
	return findings;
};

const createHandoffGuardDebtLedger = (
	debtList: GuardDebtEntry[],
): ((charge: GuardDebtCharge) => boolean) => {
	const remainingByEntryIndex = new Map<number, number>();
	const matchingIndexes: number[] = [];
	return ({ ruleId, file, source }: GuardDebtCharge): boolean => {
		for (let index = 0; index < debtList.length; index += 1) {
			const debt = debtList[index];
			if (debt.ruleId !== ruleId || debt.file !== file) {
				continue;
			}
			if (!source.includes(debt.sourceIncludes)) {
				continue;
			}
			const pattern = new RegExp(
				`(?<!-)${escapeRegExpLiteral(debt.sourceIncludes)}`,
			);
			if (!pattern.test(source)) {
				continue;
			}
			matchingIndexes.push(index);
		}
		for (const index of matchingIndexes) {
			if (!remainingByEntryIndex.has(index)) {
				remainingByEntryIndex.set(index, debtList[index].maxOccurrences ?? 0);
			}
		}
		for (const index of matchingIndexes) {
			// Charge PER OCCURRENCE carried by this violating text, capped at
			// what the entry still has: a line bearing N snippets spends N
			// units in this one event (tooltip.tsx's Arrow line spends all 4),
			// so no multi-occurrence line can ride a budget measured in
			// occurrences while leaving silent slack behind.
			const occurrencesInSource = Math.min(
				countSnippetOccurrences(source, debtList[index].sourceIncludes),
				remainingByEntryIndex.get(index) ?? 0,
			);
			if (occurrencesInSource > 0) {
				remainingByEntryIndex.set(
					index,
					(remainingByEntryIndex.get(index) ?? 0) - occurrencesInSource,
				);
				return true;
			}
		}
		return false;
	};
};

// r1-fix: read-only probe over the REAL ledger, for the permanent zero-slack
// test. It feeds the given file content's debt-matching lines through the
// actual createHandoffGuardDebtLedger closure, then counts how many further
// single-occurrence violations the entry would still absorb. Zero means the
// status quo consumes the whole budget (no silent slack); anything above zero
// is exactly the over-budget slack the round-1 review proved exploitable
// (three planted `top-1/2!` lines staying green). Because this closes over
// the production ledger, reverting the per-occurrence charging flips the
// test that asserts on it back to red.
/** Probe handle over the handoff guard-debt ledger used by the specs. */
interface HandoffLedgerProbe {
	remainingAfterStatusQuo: (
		ruleId: string,
		file: string,
		content: string,
	) => number;
}

export const createHandoffLedgerProbe = (
	debtList: GuardDebtEntry[],
): HandoffLedgerProbe => {
	const allows = createHandoffGuardDebtLedger(debtList);
	return {
		remainingAfterStatusQuo: (ruleId, file, content) => {
			const debt = debtList.find(
				(entry) => entry.ruleId === ruleId && entry.file === file,
			);
			if (!debt) {
				return 0;
			}
			for (const line of content.split('\n')) {
				if (line.includes(debt.sourceIncludes)) {
					allows({ ruleId, file, source: line });
				}
			}
			let remaining = 0;
			while (allows({ ruleId, file, source: debt.sourceIncludes })) {
				remaining += 1;
			}
			return remaining;
		},
	};
};

// An opt-out comment on the line directly above the offending line. Requires a
// reason after the rule id so the suppression has to be argued, not just added.
//
// W5-HARDEN2: this defers entirely to `isPreviousLineSuppressed`, the single
// shared parser also used by `findSuppressionSitesInSource`/the inventory
// diff below, so this guard and the inventory can never again disagree about
// what counts as a suppression site. See suppression-reason.ts for the full
// rationale.
const isInlineSuppressed = (
	lines: string[],
	line: number,
	ruleId: string,
): boolean =>
	isPreviousLineSuppressed(lines, line, 'design-system-ignore', ruleId);

// (The two trailing optional parameters exist because several call sites
// pass a legacy duplicate push (a repeated violations array + violation
// object); both have been inert at runtime for a long time and are accepted
// here purely to keep those call shapes honest — they are never read.)
const makeRecordViolation =
	(handoffGuardDebtAllows: (violation: GuardDebtCharge) => boolean) =>
	(
		violations: DesignViolation[],
		violation: DesignViolation,
		lines?: string[],
		_legacyDuplicateViolations?: DesignViolation[],
		_legacyDuplicateViolation?: DesignViolation,
	): void => {
		if (handoffGuardDebtAllows(violation)) {
			return;
		}

		if (lines && isInlineSuppressed(lines, violation.line, violation.ruleId)) {
			return;
		}

		violations.push(violation);
	};

// no-raw-visual-color's two property-based colour patterns, and their
// multi-line-aware counterparts (F4): a value can legitimately wrap across
// lines before its terminating `;` (e.g. a multi-line `box-shadow`), so the
// css-declaration statement scan below (which joins such a declaration into
// one string) substitutes these `[^;]*`-widened variants in place of the
// `\s*`-only ones. Kept as separate pattern objects, not shared, so ordinary
// per-line scanning of .ts/.tsx files never sees the wider `[^;]*` gap —
// that widening is only safe once a value is known to be one CSS
// declaration bounded by `;`, which per-line text (potentially a JS object
// literal with comma-separated properties on one line) is not.
// F3: widened past the original color/background/border-color/outline-color
// list to also cover the `border`/`outline` shorthands (a literal there is
// the same visible line as `border-color`, just spelled differently) and the
// remaining colour-bearing properties the original list missed entirely.
// W6-GUARDS (ui F5): `box-shadow`/`filter`/`backdrop-filter` were missing
// from THIS list entirely — only the colour-FUNCTION pattern below added
// `box-shadow` as a one-off — so a raw hex/named-colour shadow (as opposed
// to an `rgba(...)` one) sailed through unscanned. Also added the camelCase
// spellings (`boxShadow`, `backgroundColor`, ...) a TS/TSX inline
// `style={{ ... }}` object or a shared style-object constant uses instead of
// kebab-case — the property-name half of the same finding's "the property
// detector only understands kebab-case CSS".
const RAW_COLOR_PROPERTY_NAMES =
	'color|background|background-color|backgroundColor|background-image|' +
	'backgroundImage|border|border-color|borderColor|' +
	'border-top|borderTop|border-right|borderRight|border-bottom|borderBottom|' +
	'border-left|borderLeft|outline|outline-color|outlineColor|box-shadow|' +
	'boxShadow|filter|backdrop-filter|backdropFilter|' +
	'text-shadow|textShadow|caret-color|caretColor|accent-color|accentColor|' +
	'fill|stroke';
const RAW_COLOR_PROPERTY_HEX_PATTERN = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES})\\s*:\\s*#[0-9a-fA-F]{3,8}\\b`,
);
const RAW_COLOR_PROPERTY_HEX_PATTERN_MULTILINE = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES})\\s*:[^;]*#[0-9a-fA-F]{3,8}\\b`,
);
// r4-ui-F3: widened past rgb(a)/hsl(a) to every standard direct colour
// function (see DIRECT_COLOR_FUNCTION_NAMES) — hwb/lab/lch/oklab/oklch/
// color() literals in a property value are just as unrouted to a theme-aware
// token as an rgba() one.
const RAW_COLOR_PROPERTY_RGBA_PATTERN = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES})\\s*:\\s*(?:${DIRECT_COLOR_FUNCTION_NAMES})\\(`,
);
const RAW_COLOR_PROPERTY_RGBA_PATTERN_MULTILINE = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES})\\s*:[^;]*(?:${DIRECT_COLOR_FUNCTION_NAMES})\\(`,
);
// W6-GUARDS (shell F6 / ui F6): a raw CSS/inline-style NAMED colour keyword
// (`color: red;`, `style={{ color: 'red' }}`) was entirely unguarded outside
// `color-mix()` — every direct-literal pattern above only ever recognised
// hex and colour-function shapes. Anchored immediately after the colon (not
// widened to `[^;]*`) so a token reference elsewhere in the SAME declaration
// value — `border: 1px solid var(--publy-border-strong)` — can never
// false-positive on an unrelated word that happens to share a colour name.
const CSS_NAMED_COLOR_NAMES = [
	'aliceblue',
	'antiquewhite',
	'aqua',
	'aquamarine',
	'azure',
	'beige',
	'bisque',
	'black',
	'blanchedalmond',
	'blue',
	'blueviolet',
	'brown',
	'burlywood',
	'cadetblue',
	'chartreuse',
	'chocolate',
	'coral',
	'cornflowerblue',
	'cornsilk',
	'crimson',
	'cyan',
	'darkblue',
	'darkcyan',
	'darkgoldenrod',
	'darkgray',
	'darkgreen',
	'darkgrey',
	'darkkhaki',
	'darkmagenta',
	'darkolivegreen',
	'darkorange',
	'darkorchid',
	'darkred',
	'darksalmon',
	'darkseagreen',
	'darkslateblue',
	'darkslategray',
	'darkslategrey',
	'darkturquoise',
	'darkviolet',
	'deeppink',
	'deepskyblue',
	'dimgray',
	'dimgrey',
	'dodgerblue',
	'firebrick',
	'floralwhite',
	'forestgreen',
	'fuchsia',
	'gainsboro',
	'ghostwhite',
	'gold',
	'goldenrod',
	'gray',
	'green',
	'greenyellow',
	'grey',
	'honeydew',
	'hotpink',
	'indianred',
	'indigo',
	'ivory',
	'khaki',
	'lavender',
	'lavenderblush',
	'lawngreen',
	'lemonchiffon',
	'lightblue',
	'lightcoral',
	'lightcyan',
	'lightgoldenrodyellow',
	'lightgray',
	'lightgreen',
	'lightgrey',
	'lightpink',
	'lightsalmon',
	'lightseagreen',
	'lightskyblue',
	'lightslategray',
	'lightslategrey',
	'lightsteelblue',
	'lightyellow',
	'lime',
	'limegreen',
	'linen',
	'magenta',
	'maroon',
	'mediumaquamarine',
	'mediumblue',
	'mediumorchid',
	'mediumpurple',
	'mediumseagreen',
	'mediumslateblue',
	'mediumspringgreen',
	'mediumturquoise',
	'mediumvioletred',
	'midnightblue',
	'mintcream',
	'mistyrose',
	'moccasin',
	'navajowhite',
	'navy',
	'oldlace',
	'olive',
	'olivedrab',
	'orange',
	'orangered',
	'orchid',
	'palegoldenrod',
	'palegreen',
	'paleturquoise',
	'palevioletred',
	'papayawhip',
	'peachpuff',
	'peru',
	'pink',
	'plum',
	'powderblue',
	'purple',
	'rebeccapurple',
	'red',
	'rosybrown',
	'royalblue',
	'saddlebrown',
	'salmon',
	'sandybrown',
	'seagreen',
	'seashell',
	'sienna',
	'silver',
	'skyblue',
	'slateblue',
	'slategray',
	'slategrey',
	'snow',
	'springgreen',
	'steelblue',
	'tan',
	'teal',
	'thistle',
	'tomato',
	'turquoise',
	'violet',
	'wheat',
	'white',
	'whitesmoke',
	'yellow',
	'yellowgreen',
];
const RAW_COLOR_PROPERTY_NAMED_PATTERN = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES})\\s*:\\s*["'\`]?(?:${CSS_NAMED_COLOR_NAMES.join('|')})\\b`,
	'i',
);
// W6-GUARDS (ui F5): a shorthand value (`box-shadow: 0 0 0 3px red;`) puts
// the named colour AFTER other tokens (offset/blur/spread), not immediately
// after the colon — the anchored pattern above only ever checked the FIRST
// token. Widened the same way the hex/rgba multi-line variants are, but with
// an explicit `(?<![\w-])`/`(?![\w-])` boundary (not just `\b`) so a token
// reference elsewhere in the SAME declaration can never false-positive on a
// colour-name word fragment (`var(--publy-border-strong)` contains no
// standalone "red"/"tan", but this guards the general case: `\b` alone
// treats the boundary between `-` and a letter as a word boundary, which
// `--publy-red-500` would trip without this stricter check).
const RAW_COLOR_PROPERTY_NAMED_PATTERN_MULTILINE = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES})\\s*:[^;]*(?<![\\w-])(?:${CSS_NAMED_COLOR_NAMES.join('|')})(?![\\w-])`,
	'i',
);
// F3: a `--custom-prop:` declaration is invisible to the property-name
// patterns above (it has no property name at all), so a raw hex/rgba/hsla/
// oklch/etc. literal handed straight to a custom property — e.g.
// `--publy-icon-tile-bg: #f0f9ff;` — sailed through unscanned. Matched
// per-statement/per-line like the others; whether it needs a dark
// counterpart is token-theme-parity's job (checkTokenGuardViolations), not
// this rule's — this rule only flags the literal existing at all outside the
// :root/html.dark token layer (see `ignoreMatch: isAppCssTokenLayerLine`).
const RAW_COLOR_CUSTOM_PROPERTY_PATTERN = new RegExp(
	`^\\s*--[\\w-]+\\s*:[^;]*(?:#[0-9a-fA-F]{3,8}\\b|\\b(?:${DIRECT_COLOR_FUNCTION_NAMES})\\()`,
);
const RAW_COLOR_MULTILINE_PATTERN_OVERRIDES = new Map<RegExp, RegExp>([
	[RAW_COLOR_PROPERTY_HEX_PATTERN, RAW_COLOR_PROPERTY_HEX_PATTERN_MULTILINE],
	[RAW_COLOR_PROPERTY_RGBA_PATTERN, RAW_COLOR_PROPERTY_RGBA_PATTERN_MULTILINE],
	[
		RAW_COLOR_PROPERTY_NAMED_PATTERN,
		RAW_COLOR_PROPERTY_NAMED_PATTERN_MULTILINE,
	],
]);
// r5-ui-F2: the quoted/templated and Tailwind-arbitrary variants below were
// hard-coded to `rgba?` only, so a quoted `'hsl(0 0% 0%)'`/`` `oklch(...)` ``
// string or an arbitrary utility like `bg-[oklch(95%_0.02_90)]` sailed
// through unscanned even though DIRECT_COLOR_FUNCTION_NAMES (used by the
// property-value patterns above) already covers every standard CSS colour
// function. Both now share that same function list instead of maintaining a
// second, narrower rgba-only copy.
const QUOTED_DIRECT_COLOR_PATTERN = new RegExp(
	`["'\`]\\s*(?:${DIRECT_COLOR_FUNCTION_NAMES})\\(`,
);
// r5-ui-F2 (evasion #3 — see the packet report): a `shadow-[]` arbitrary
// value composes an offset/blur/spread prefix with the colour function
// (`shadow-[0_0_0_3px_rgba(...)]`), so requiring the function at the very
// start of the bracket (as the bg/text/etc. case above still legitimately
// does — a raw prefix there is never itself a colour utility) missed it
// entirely. This variant allows arbitrary non-`]` text before the function,
// so it catches the colour literal wherever it sits inside the brackets.
const ARBITRARY_TAILWIND_DIRECT_COLOR_ANYWHERE_PATTERN = new RegExp(
	'\\b(?:shadow)-' +
		`\\[[^\\]]*(?:${DIRECT_COLOR_FUNCTION_NAMES})\\([^\\]]*\\]`,
);
const ARBITRARY_TAILWIND_DIRECT_COLOR_PATTERN = new RegExp(
	'\\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|accent|decoration|divide)-' +
		`\\[(?:${DIRECT_COLOR_FUNCTION_NAMES})\\([^\\]]+\\)\\]`,
);
// r5-ui-F2: `color(?!-mix)` inside DIRECT_COLOR_FUNCTION_NAMES deliberately
// exempts `color-mix(...)` itself (it's a reference form, not a literal —
// see the DIRECT_COLOR_FUNCTION_NAMES comment above), but that exemption was
// applied wholesale: `color-mix(in srgb, #fff 25%, transparent)` and
// `color-mix(in srgb, rgba(0,0,0,.4) 25%, transparent)` are just as much raw
// literals as a bare `#fff` — they only become safe once every colour
// operand is a semantic `var(...)` reference (or a theme-invariant keyword
// like `transparent`/`currentColor`). Flag any `color-mix(...)` call whose
// argument list still contains a raw hex, named-colour, or colour-function
// operand.
//
// W5-HARDEN (W5-VERIFY2): a single whole-expression regex (`[^)]*` from
// `color-mix(` to the first raw-colour match) cannot see past the FIRST
// nested `)` — `color-mix(in srgb, var(--primary) 50%, #ffffff)` stops at
// `var()`'s closing paren and never reaches the raw `#ffffff` second
// operand. It also never recognised a raw NAMED colour (`white`) or a
// `color()` function operand. Rather than patch the regex for each shape
// (the same mistake that produced the original hole), this parses the real
// argument list — splitting on top-level commas so nested parens in `var()`/
// `rgba()` never get mistaken for a top-level separator — and validates
// EVERY colour operand independently, wherever it sits in the list.
const COLOR_MIX_SAFE_KEYWORDS = new Set([
	'transparent',
	'currentcolor',
	'inherit',
	'initial',
	'unset',
	'revert',
	'revert-layer',
]);

/** Splits `text` on top-level occurrences of `separator`, treating any
 * substring inside matching parens as opaque (so `var(--x)`/`rgba(0,0,0,.4)`
 * never contribute a false split point). */
const splitTopLevel = (text: string, separator: string): string[] => {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (character === '(') {
			depth += 1;
		} else if (character === ')') {
			depth -= 1;
		} else if (character === separator && depth === 0) {
			parts.push(text.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(text.slice(start));
	return parts;
};

/** Extracts the balanced argument-list text of a `var(...)` call at the start
 * of `value` (already confirmed via `/^var\(/i`), so a fallback containing
 * its own nested parens (another `var()`, a `color-mix()`, a colour
 * function) is captured whole instead of truncated at the first `)`. Returns
 * `null` for an unbalanced/malformed call. */
const extractVarArgs = (value: string): string | null => {
	const openParenIndex = value.indexOf('(');
	if (openParenIndex === -1) {
		return null;
	}
	let depth = 0;
	for (let index = openParenIndex; index < value.length; index += 1) {
		if (value[index] === '(') {
			depth += 1;
		} else if (value[index] === ')') {
			depth -= 1;
			if (depth === 0) {
				return value.slice(openParenIndex + 1, index);
			}
		}
	}
	return null;
};

// W5-HARDEN2: relative colour syntax — `rgb(from <base> r g b)` (and the
// hsl/hwb/lab/lch/oklab/oklch/color() equivalents) — derives every channel
// from `<base>`. When `<base>` is itself a `var(...)` reference or a
// theme-invariant keyword, the whole expression is exactly as token-derived
// as a plain `var(...)` operand — the trailing channel-name identifiers
// (`r g b`, `h s l`, ...) are never themselves colour literals, so they must
// not make this read as "not a var(), therefore raw". Only the base matters.
const RELATIVE_COLOR_BASE_PATTERN =
	/^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*from\s+(var\(--[\w-]+\)|[a-zA-Z]+)\s+/i;

/** A color-mix() colour operand is one `<color> <percentage>?` segment. Safe
 * forms are a `var(...)` reference, a theme-invariant keyword, a NESTED
 * color-mix() whose own operands are all themselves safe (checked
 * recursively — the outer function name being `color-mix` is not itself
 * evidence of safety OR rawness, only its operands are), or relative colour
 * syntax (`rgb(from var(--x) r g b)`) based on a safe colour. Anything else —
 * hex, `rgb()`/`hsl()`/`oklch()`/`color()` given literal channels, or a bare
 * named colour keyword like `white`/`red` — is a raw literal. */
const isSafeColorMixValue = (withoutPercentage: string): boolean => {
	if (/^var\(/i.test(withoutPercentage)) {
		// W6-GUARDS (tests F5): a bare `var(--x)` operand is always safe — the
		// referenced custom property is itself a theme-aware token by
		// definition — but this used to accept ANY value starting with `var(`,
		// including one carrying a raw-literal FALLBACK
		// (`var(--missing-brand, #fff)`): when the custom property is unset,
		// the browser renders the raw fallback directly, which is exactly as
		// raw as a bare `#fff` operand. Parse the var() call as a balanced
		// function and, when a fallback is present, validate IT the same way
		// any other color-mix operand is validated (recursively — the
		// fallback can itself be a safe var()/keyword/nested color-mix, or a
		// raw literal).
		const argsText = extractVarArgs(withoutPercentage);
		if (argsText === null) {
			return false;
		}
		const [, ...fallbackParts] = splitTopLevel(argsText, ',');
		if (fallbackParts.length === 0) {
			return true;
		}
		return isSafeColorMixValue(fallbackParts.join(',').trim());
	}
	if (COLOR_MIX_SAFE_KEYWORDS.has(withoutPercentage.toLowerCase())) {
		return true;
	}
	// Case-insensitive (W5-HARDEN2 item 4A): CSS function/keyword spelling is
	// ASCII case-insensitive end to end — `COLOR-MIX(...)` is exactly as real
	// as `color-mix(...)`, and a nested operand can be spelled either way too.
	if (/^color-mix\(/i.test(withoutPercentage)) {
		return !hasRawColorMixOperand(withoutPercentage);
	}
	const relativeMatch = RELATIVE_COLOR_BASE_PATTERN.exec(withoutPercentage);
	if (relativeMatch) {
		const base = relativeMatch[1];
		return (
			/^var\(/i.test(base) || COLOR_MIX_SAFE_KEYWORDS.has(base.toLowerCase())
		);
	}
	return false;
};

const isRawColorMixOperand = (segment: string): boolean => {
	const trimmed = segment.trim();
	if (trimmed === '') {
		return false;
	}
	const withoutPercentage = trimmed.replace(/\s+[\d.]+%\s*$/, '').trim();
	return !isSafeColorMixValue(withoutPercentage);
};

/** Finds every top-level `color-mix(...)` call in `text` (there may be
 * several — a multi-declaration CSS statement, or several arbitrary-utility
 * calls on one line) by balanced-paren matching over the FULL text — which
 * works identically whether the call sits on one line or is wrapped across
 * several (a multi-line template literal), since paren balancing indexes raw
 * characters and does not care about newlines. Matching is case-insensitive
 * (W5-HARDEN2 item 4A — see isSafeColorMixValue). Returns the opener's
 * character offset and its raw argument-list text for each call found. */
const findColorMixArgLists = (text: string): ColorMixCall[] => {
	const calls: ColorMixCall[] = [];
	const openerPattern = /color-mix\(/gi;
	let openerMatch;
	while ((openerMatch = openerPattern.exec(text))) {
		const openParenIndex = openerMatch.index + openerMatch[0].length - 1;
		let depth = 0;
		let closeParenIndex = -1;
		for (let index = openParenIndex; index < text.length; index += 1) {
			if (text[index] === '(') {
				depth += 1;
			} else if (text[index] === ')') {
				depth -= 1;
				if (depth === 0) {
					closeParenIndex = index;
					break;
				}
			}
		}
		if (closeParenIndex === -1) {
			continue;
		}

		calls.push({
			openerIndex: openerMatch.index,
			argsText: text.slice(openParenIndex + 1, closeParenIndex),
		});

		openerPattern.lastIndex = closeParenIndex;
	}
	return calls;
};

/** The first comma-separated segment inside a color-mix() argument list is
 * the `in <space>[ <method> hue]` colour-interpolation clause, never a
 * colour operand — it's skipped. */
const colorMixArgsHaveRawOperand = (argsText: string): boolean =>
	splitTopLevel(argsText, ',')
		.slice(1)
		.some((segment) => isRawColorMixOperand(segment));

/** Returns true if ANY color-mix() call found anywhere in `text` has a raw
 * colour operand — used both by the shared per-line/per-statement pattern
 * object below (COLOR_MIX_RAW_OPERAND_PATTERN, CSS files) and recursively by
 * isSafeColorMixValue to evaluate a nested color-mix() operand. */
const hasRawColorMixOperand = (text: string): boolean =>
	findColorMixArgLists(text).some((call) =>
		colorMixArgsHaveRawOperand(call.argsText),
	);

const COLOR_MIX_RAW_OPERAND_PATTERN = { test: hasRawColorMixOperand };

// F824 (ui F5): a raw colour assembled by STRING COMPOSITION never contains a
// complete raw-colour literal, so every literal-shaped detector above sails
// past it. Two runtime-equivalent spellings exist in this codebase:
//   '#' + 'ff0000'   — hash prefix concatenated with a quoted hex body
//   `#${'00ccff'}`   — template literal interpolating a quoted hex body
// Both evaluate to a raw hex string a stylesheet/style object will happily
// consume. Deliberately narrow shapes:
//  - Pattern 1 requires BOTH operands fully quoted ('#' / "#" / `#`) so a
//    DOM id selector built from a variable (`'#' + elementId`, querySelector
//    anchors) never matches — only a hex-digit body does.
//  - Pattern 2 requires the interpolated expression to START with a quote,
//    so `` `#${sectionId}` `` anchors and e2e labels stay unscanned; only an
//    interpolated string literal whose contents are pure hex digits match.
// A composed colour split across THREE or more fragments, or assembled via
// variables/constants instead of inline literals, remains outside regex
// reach by design — this rule catches the idiom as written, not a dataflow
// analysis (the same boundary every other pattern here accepts).
const QUOTE_CLASS = `["'\`]`;
const COMPOSED_HASH_CONCAT_PATTERN = new RegExp(
	`${QUOTE_CLASS}#${QUOTE_CLASS}\\s*\\+\\s*${QUOTE_CLASS}[0-9a-fA-F]{3,8}${QUOTE_CLASS}`,
);
const COMPOSED_TEMPLATE_INTERP_PATTERN = new RegExp(
	'`\\s*#\\$\\{\\s*' + `${QUOTE_CLASS}[0-9a-fA-F]{3,8}${QUOTE_CLASS}\\s*\\}`,
);

const rules: DesignSystemRule[] = [
	{
		id: 'no-heroui-import',
		message: 'Use local Gray UI primitives instead of HeroUI.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/from ['"]@heroui\//, /import ['"]@heroui\//],
	},
	{
		id: 'no-mui-import',
		message: 'Use local primitives instead of MUI libraries.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/from ['"]@mui\//, /from ['"]@mui/],
	},
	{
		id: 'no-lucide-import',
		message: 'Use Tabler icons from the Gray UI stack instead of Lucide.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/from ['"]lucide-react['"]/, /import ['"]lucide-react['"]/],
	},
	{
		id: 'no-heroui-color-scale',
		message:
			'Use Gray UI semantic tokens instead of legacy HeroUI numbered color scales.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [
			/\b(?:bg|text|border|ring|from|to|via)-(?:danger|success|warning|foreground|default|primary|content\d?)-\d{2,3}\b/,
		],
	},
	{
		id: 'no-raw-visual-color',
		message:
			'Use front semantic tokens instead of raw hex/rgb/slate/gray/zinc/neutral/white/black styling.',
		// Covers all of src/. The earlier per-directory list silently exempted
		// src/lib/, where a raw-hex palette landed unscanned. The former
		// src/design-handoff/ exemption is gone (F4): that directory was
		// deleted in r1's F8 fix, so the exemption was dead — and if the
		// directory ever comes back, its literals should be scanned like any
		// other source file's.
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		// Block-aware, not file-aware (F5): app.css is the token layer, but only
		// its `:root { … }` / `html.dark { … }` declaration blocks are allowed to
		// contain raw colour literals. Every other rule in the file is scanned
		// like any other source file, so a new `.publy-*` rule with `#fff` in it
		// fails the guard instead of hiding behind a whole-file exemption.
		ignoreMatch: (relativePath, _line, lineIndex, lines) =>
			isAppCssTokenLayerLine(relativePath, lineIndex, lines),
		patterns: [
			/["'`][#][0-9a-fA-F]{3,8}["'`]/, // quoted/templated raw color tokens
			// F824 (ui F5): runtime-composed raw hex (see declaration above).
			COMPOSED_HASH_CONCAT_PATTERN,
			COMPOSED_TEMPLATE_INTERP_PATTERN,
			/\b(?:bg|text|border|ring|shadow|from|to|via|fill|stroke|outline|accent|decoration|divide)-\[#(?:[0-9a-fA-F]{3,8})\]/,
			RAW_COLOR_PROPERTY_HEX_PATTERN,
			/\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|accent|decoration|divide)-(?:slate|zinc|gray|neutral)-\d{2,3}\b/,
			/\b(?:bg|border|text|ring)-white\/\d+\b/,
			/\b(?:bg|border|text|ring)-black\/\d+\b/,
			/\b(?:bg|border|text|ring)-(?:white|black)\b/,
			QUOTED_DIRECT_COLOR_PATTERN,
			ARBITRARY_TAILWIND_DIRECT_COLOR_PATTERN,
			ARBITRARY_TAILWIND_DIRECT_COLOR_ANYWHERE_PATTERN,
			RAW_COLOR_PROPERTY_RGBA_PATTERN,
			RAW_COLOR_PROPERTY_NAMED_PATTERN,
			RAW_COLOR_CUSTOM_PROPERTY_PATTERN,
			COLOR_MIX_RAW_OPERAND_PATTERN,
		],
	},
	{
		id: 'no-native-product-select',
		message:
			'Prefer local Select primitives on product surfaces during migration.',
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/components/table/') ||
			relativePath.startsWith('src/routes/authed/'),
		patterns: [/<select\b/],
	},
	{
		id: 'no-prototype-icons',
		message:
			'Use Tabler icon components, not emoji/punctuation/numeric icon strings.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/icon=["'](?:!|\?|401|⛔|🔎)["']/],
	},
	{
		id: 'no-icon-font-classes',
		// Only @tabler/icons-react (components) is installed; no webfont ships.
		// `ti ti-*` matches no rule, so the element mounts and renders nothing.
		message:
			'Tabler ships here as React components, not a webfont. `ti ti-*` classes render blank; import the icon component instead.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/["'`]\s*ti\s+ti-/, /className=\{?["'`]ti\s/],
	},
	{
		id: 'no-native-confirm',
		message: 'Use local confirm dialog in product surfaces.',
		appliesTo: (relativePath) => relativePath.startsWith('src/routes/authed/'),
		patterns: [/globalThis\.confirm\b/],
	},
	{
		id: 'no-important-foundation',
		message: 'Fix cascade through tokens/theme/wrappers, not !important.',
		// app.css added (F9): it holds the app's only literal CSS `!important`
		// declarations, previously unscanned; each pre-existing one is now a
		// KNOWN_IMPORTANT_FOUNDATION_DEBT entry with a reason, above. Widened
		// (F4) to src/components/ui/ and src/routes/ — r1 left those unscanned
		// on the theory that src/components/ui/'s existing `!`-suffix usages
		// (tabs.tsx, tooltip.tsx, badge.tsx) were "already reviewed", but that
		// review left no trace the guard could see, so a *new* `bg-red-500!` in
		// any primitive or route file was legal. Each pre-existing usage is now
		// a KNOWN_IMPORTANT_FOUNDATION_DEBT entry, same as app.css's.
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/components/app-shell/') ||
			relativePath.startsWith('src/components/table/') ||
			relativePath.startsWith('src/components/ui/') ||
			// Test files carry unrelated string fixtures that can end in `!`
			// (e.g. `'Not Valid!'`) — this rule cares about markup/CSS, not
			// prose in a spec assertion, so exclude them from the routes/ scan.
			(relativePath.startsWith('src/routes/') &&
				!relativePath.includes('.test.')) ||
			relativePath === APP_CSS_PATH,
		patterns: [
			/!important/,
			/![a-z0-9]+-[a-z0-9][a-z0-9-]*/, // Tailwind v3 `!prefix` syntax
			// Tailwind v4 `suffix!` syntax (e.g. `border-transparent!`,
			// `top-1/2!`, `text-(--foo)!`) — the v3 pattern above never matches
			// this codebase's actual `!`-suffix usages (F9).
			/[\w\-/.[\]():%]+!(?=["'`\s}]|$)/,
		],
	},
	{
		id: 'no-rounded-full-or-999-radius',
		message:
			'Only avatar surfaces, 36px topbar icon buttons, and the profile ' +
			'icon-picker pencil-pin corner badge may remain fully rounded.',
		appliesTo: () => true,
		patterns: [
			/\brounded-full\b/,
			/\bborder-radius:\s*999px\b/,
			// F4: the same "fully circular" shape, expressed through Tailwind
			// arbitrary values, a percentage, or the shared token — none of
			// which the two patterns above can see.
			/\brounded-\[(?:999|9999)px\]/,
			/\brounded-\[50%\]/,
			/\bborder-radius:\s*50%/,
			/\bborder-radius:\s*var\(--publy-radius-circular\)/,
		],
		ignoreMatch: isRoundedRadiusAllowed,
	},
	{
		id: 'no-non-confirmation-centered-overlay',
		message:
			'Use non-centered drawers for non-confirmation overlays; only confirm can stay centered.',
		// Was scoped to src/routes/ only, so a centered modal built in
		// src/components/ (the most likely place for one) was invisible to it
		// (F15). confirm-dialog.tsx/drawer.tsx are exempt via ignoreFile — the
		// rule's own message says confirm gets to stay centered.
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		ignoreFile: isConfirmDialogFile,
		patterns: [
			/(?:top-1\/2.*left-1\/2|left-1\/2.*top-1\/2)/,
			/\b(?:centered|center)\b[^\n]{0,140}\b(?:dialog|modal)\b/i,
			/\btransform\s*:\s*translate\(-50%,\s*-50%\)/,
		],
	},
	{
		id: 'no-dialog-popup-primitives',
		message:
			'Use the local confirm dialog path; keep DialogPopup direct usage for future non-confirmation overlays.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/DialogPopup\b/, /DialogPrimitive\.Popup/],
		mode: 'source',
		ignoreFile: isConfirmDialogFile,
	},
	{
		id: 'no-raw-internal-anchor',
		mode: 'source',
		message: 'Use TanStack Link for internal route navigation.',
		// Was scoped to src/routes/authed/ only, so a raw <a href="/staff/…">
		// inside src/components/app-shell/ (the most likely place for one) was
		// invisible to it (F15).
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [
			/<a\b(?:(?!<a\b)[\s\S])*?href=["']\/(staff|tenant)\b(?:(?!<a\b)[\s\S])*?>/g,
			// Path constants (`STAFF_INVITATIONS_LIST_PATH`, `ROUTES.x`, …) don't
			// match the literal-href pattern above, so a raw `<a href={...}>`
			// referencing one sails through unflagged — that's how the
			// invitations back-link reload shipped clean. Catch the expression
			// form too, biased toward over-matching (suppress via
			// design-system-ignore rather than narrow the regex).
			/<a\b(?:(?!<a\b)[\s\S])*?href=\{[^}]*(?:path|route)[^}]*\}(?:(?!<a\b)[\s\S])*?>/gi,
		],
	},
	{
		// A Playwright glob's `*` compiles to `([^/]*)` and cannot cross a path
		// separator; only `**` becomes `(.*)`. A trailing single `*` therefore
		// matches the collection path but never its sub-paths, so the handler is
		// dead code and the request escapes to the real API while the test still
		// appears to pass. This has silently defeated three specs.
		id: 'no-single-star-route-glob',
		mode: 'source',
		message:
			"page.route()/context.route() glob ends in a single '*', which cannot cross '/'. Sub-paths escape the mock and hit the real API. Use '**'.",
		appliesTo: (relativePath) => relativePath.startsWith('e2e/'),
		// W6-GUARDS (tests F6): the previous pattern was anchored to exactly the
		// two literal receiver names `page`/`context` and a quoted string
		// literal argument — a fixture/receiver alias (`staffPage.route`,
		// `browserContext.route`, any destructured/renamed Playwright fixture)
		// or a glob passed through a local constant expression instead of an
		// inline literal were both structurally invisible. `.route(` is a
		// Playwright-specific method name with no ordinary-code collision risk
		// in an e2e spec file, so the receiver is now ANY identifier, not just
		// the two hand-picked ones (fixes the alias evasion). A `.route()` call
		// whose first argument isn't a literal at all — a bare identifier —
		// can never be statically checked for the single-star shape, so it now
		// fails CLOSED instead of silently passing (fixes the constant
		// evasion): inline the glob literal, or widen it to `**`, so it's
		// checkable again. A template-literal argument (with or without
		// interpolation) is deliberately still checked by the first pattern
		// only, not treated as unresolvable — this codebase's existing e2e
		// specs widely compose globs as `` `**${suffix}` ``/`` `${BASE}${path}` ``
		// template literals, and the interpolated portion is never itself the
		// trailing-star boundary in any current usage.
		//
		// F824 (tests F4): the receiver anchor was a bare `\w+` identifier, so a
		// CHAINED receiver (`page.context().route(`) ended in `)` before the
		// `.route(` and never matched — a single-star glob hung off such a chain
		// was structurally invisible. The anchor now consumes the full receiver
		// chain (identifier/call/index segments joined by dots, ending in any of
		// word char/$/)/]), so the emitted violation source quotes the whole call
		// (`page.context().route(glob`) instead of a meaningless tail.
		patterns: [
			/(?:[\w$\])]+(?:\((?:[^()]|\([^()]*\))*\))?(?:\[[^\][]*\])?\.)+route\(\s*(['"`])(?:(?!\1)[^\\])*[^*]\*\1/g,
			/(?:[\w$\])]+(?:\((?:[^()]|\([^()]*\))*\))?(?:\[[^\][]*\])?\.)+route\(\s*(?!['"`/])\S[^,)]*/g,
		],
	},
];

const pathExists = async (dir: string): Promise<boolean> => {
	try {
		await readdir(dir);
		return true;
	} catch {
		return false;
	}
};

const collectFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const absolutePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(absolutePath)));
			continue;
		}

		if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(absolutePath);
		}
	}

	return files;
};

// F824 (shell F3): a suppression naming a rule id nobody defined used to be
// honoured silently (or, worse, silently absorbed the real id it merely
// prefixed). The guard now rejects any `design-system-ignore:` comment whose
// leading rule id is not one of the rules declared in this file — the author
// gets an explicit "unknown suppression rule id" finding instead of silence.
// This walks the ONE shared parser (`findSuppressionSitesInSource`) line by
// line, so what counts as a suppression site here can never diverge from the
// live suppression check or the committed inventory.
const KNOWN_DESIGN_SYSTEM_RULE_IDS = new Set(rules.map((rule) => rule.id));

const unknownSuppressionRuleIdViolations = (
	relativePath: string,
	source: string,
): DesignViolation[] => {
	const findings: DesignViolation[] = [];
	const lines = source.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		for (const site of findSuppressionSitesInSource(
			lines[index],
			relativePath,
		)) {
			if (site.convention !== 'design-system-ignore') {
				continue;
			}
			const statedRuleId = site.reason.trim().split(/\s+/)[0] ?? '';
			if (KNOWN_DESIGN_SYSTEM_RULE_IDS.has(statedRuleId)) {
				continue;
			}
			findings.push({
				ruleId: 'unknown-suppression-rule-id',
				message:
					`design-system-ignore names rule id "${statedRuleId}", which is not a known rule id — ` +
					'the suppression is rejected. Fix the typo or remove the comment.',
				file: relativePath,
				line: index + 1,
				source: lines[index].trim(),
			});
		}
	}
	return findings;
};

export const scanFront2DesignSystem = async ({
	baseDir = rootDir,
	sourceDir,
	sourceDirs = sourceDir ? [sourceDir] : [srcDir, e2eDir],
	// Opt-in (F7) and parameterized rather than always-on against the module
	// constant: a fixture test's temp source dir routinely reuses a real
	// KNOWN_GUARD_DEBT file path (e.g. src/components/app-shell/app-shell.tsx)
	// with unrelated stub content, which would otherwise misreport as "stale"
	// on every such fixture. The real CLI run below opts in with the real
	// KNOWN_GUARD_DEBT list; unit tests that want to exercise this mechanism
	// pass their own narrow `guardDebt` fixture instead.
	checkStaleDebt = false,
	guardDebt = KNOWN_GUARD_DEBT,
	// Same opt-in reasoning as checkStaleDebt (F7): a fixture that doesn't
	// build a full :root/html.dark token layer shouldn't be misjudged against
	// the real app.css token set.
	checkTokenGuards = false,
	// Same opt-in reasoning again: a fixture temp dir's `design-system-ignore`
	// comments (planted to exercise isInlineSuppressed) have nothing to do
	// with the real, committed suppression-inventory.json, so comparing a
	// fixture scan against it would spuriously fail every such test.
	checkSuppressionInventory = false,
	// Same opt-in reasoning again (r1-fix): a fixture temp dir rarely carries
	// the real debt-listed files, so measuring budgets against it is
	// meaningless; only the real CLI run opts in, plus the permanent
	// zero-slack test which measures the REAL repo directly.
	checkDebtBudgetSlack = false,
}: ScanOptions = {}): Promise<DesignViolationScanResult> => {
	const handoffGuardDebtAllows = createHandoffGuardDebtLedger(guardDebt);
	const recordViolation = makeRecordViolation(handoffGuardDebtAllows);
	const files: string[] = [];
	const emptyDirs: string[] = [];
	for (const dir of sourceDirs) {
		const dirFiles = (await pathExists(dir)) ? await collectFiles(dir) : [];
		if (dirFiles.length === 0) {
			emptyDirs.push(dir);
		}
		files.push(...dirFiles);
	}

	// Vacuity check (F6, widened per-directory by r3-F4): a missing/renamed
	// source directory previously made `pathExists` false for just that one
	// directory, so `files` overall could still be non-empty (e.g. `src/`
	// alone contributes ~300 files) and the guard exited 0 having silently
	// scanned nothing from the missing directory — invisible to rules whose
	// `appliesTo` only matches that directory (e.g. `no-single-star-route-glob`
	// only applies under `e2e/`). Throw if ANY configured sourceDir
	// contributed zero files, not just when the combined total is zero.
	if (emptyDirs.length > 0) {
		throw new Error(
			`front design-system guard scanned 0 files from ${emptyDirs.length} of ` +
				`${sourceDirs.length} source director${sourceDirs.length === 1 ? 'y' : 'ies'} ` +
				`(${emptyDirs.join(', ')}) — the scan is vacuous for that directory. A ` +
				'renamed/missing source directory would cause exactly this, and rules scoped ' +
				'to that directory would silently pass with 0 violations for the wrong reason.',
		);
	}

	const violations: DesignViolation[] = [];
	const fileContentsByRelativePath = new Map<string, string>();

	for (const absolutePath of files) {
		const relativePath = path
			.relative(baseDir, absolutePath)
			.split(path.sep)
			.join('/');
		const source = await readFile(absolutePath, 'utf8');
		const lines = source.split('\n');
		fileContentsByRelativePath.set(relativePath, source);
		violations.push(...statusMenuViolations(relativePath, source));
		violations.push(
			...unknownSuppressionRuleIdViolations(relativePath, source),
		);

		for (const rule of rules) {
			if (!rule.appliesTo(relativePath) || rule.allow?.(relativePath)) {
				continue;
			}

			if (rule.ignoreFile?.(relativePath)) {
				continue;
			}

			if (rule.id === 'no-raw-visual-color' && relativePath.endsWith('.css')) {
				// Multi-line-aware (F4): a wrapped `box-shadow`/`background` value
				// (property name on one line, `rgba(...)` literals on the next) is
				// invisible to the single-line patterns below, since the property
				// name and the colour literal never share a line. Scan whole
				// `;`-terminated declarations instead, so the joined text still
				// contains both. Excluding `{`/`}` from the span (not just `;`)
				// keeps each match to exactly one declaration — without it, a
				// match starting right after one declaration's `;` would swallow
				// the next rule's selector and opening brace too, and report the
				// violation's line as still inside the *previous* rule.
				const statementPattern = /[^;{}]*;/g;
				let statementMatch;
				while ((statementMatch = statementPattern.exec(source))) {
					const statementText = statementMatch[0];
					const lineIndex =
						source.slice(0, statementMatch.index).split('\n').length - 1;
					for (const pattern of rule.patterns) {
						const effectivePattern: RulePattern =
							pattern instanceof RegExp
								? (RAW_COLOR_MULTILINE_PATTERN_OVERRIDES.get(pattern) ??
									pattern)
								: pattern;
						if (!effectivePattern.test(statementText)) {
							continue;
						}

						if (
							rule.ignoreMatch?.(relativePath, statementText, lineIndex, lines)
						) {
							continue;
						}

						recordViolation(
							violations,
							{
								ruleId: rule.id,
								message: rule.message,
								file: relativePath,
								line: lineIndex + 1,
								source: statementText.trim().replace(/\s+/g, ' '),
							},
							lines,
							violations,
							{
								ruleId: rule.id,
								message: rule.message,
								file: relativePath,
								line: lineIndex + 1,
								source: statementText.trim().replace(/\s+/g, ' '),
							},
						);
					}
				}

				continue;
			}

			if (rule.mode === 'source') {
				for (const pattern of rule.patterns) {
					// Every mode-'source' rule in this file declares plain RegExp
					// patterns; fail fast rather than widen the type if that ever
					// changes.
					if (!(pattern instanceof RegExp)) {
						throw new Error(
							`internal invariant: rule ${rule.id} declares mode 'source' with a non-RegExp pattern`,
						);
					}
					const globalPattern = new RegExp(
						pattern.source,
						pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
					);
					const matches = source.matchAll(globalPattern);
					for (const match of matches) {
						const line = source.slice(0, match.index).split('\n').length;
						recordViolation(
							violations,
							{
								ruleId: rule.id,
								message: rule.message,
								file: relativePath,
								line,
								source: match[0].trim(),
							},
							lines,
							violations,
							{
								ruleId: rule.id,
								message: rule.message,
								file: relativePath,
								line,
								source: match[0].trim(),
							},
						);
					}
				}
			} else {
				for (let index = 0; index < lines.length; index += 1) {
					const line = lines[index];
					for (const pattern of rule.patterns) {
						// W5-HARDEN2 item 4B: a color-mix() call can wrap across
						// multiple lines (a multi-line template literal); this
						// per-LINE loop can never see a call whose opener and raw
						// operand sit on different lines, so it's handled once,
						// whole-file, in the dedicated pass below instead of here.
						if (pattern === COLOR_MIX_RAW_OPERAND_PATTERN) {
							continue;
						}

						if (!pattern.test(line)) {
							continue;
						}

						if (rule.ignoreMatch?.(relativePath, line, index, lines)) {
							continue;
						}

						recordViolation(
							violations,
							{
								ruleId: rule.id,
								message: rule.message,
								file: relativePath,
								line: index + 1,
								source: line.trim(),
							},
							lines,
							violations,
							{
								ruleId: rule.id,
								message: rule.message,
								file: relativePath,
								line: index + 1,
								source: line.trim(),
							},
						);
					}
				}
			}
		}
	}

	// W5-HARDEN2 item 4B: dedicated whole-source pass for the color-mix
	// raw-operand check. CSS files already get multi-line coverage above (the
	// `;`-terminated statement-join branch joins a whole declaration, however
	// many lines it spans, before testing patterns against it). Every other
	// scanned extension (.ts/.tsx/.mjs) only ran the per-line loop above,
	// which tests one line at a time and can never find a color-mix(...)
	// call's matching close paren when it sits on a later line — so a
	// multi-line, non-CSS raw operand was structurally invisible. Scanning
	// the FULL file text (not one line at a time) finds the matching paren
	// regardless of how many newlines it crosses, exactly like the CSS
	// statement branch already does for its own declarations.
	const colorMixRule: DesignSystemRule | undefined = rules.find(
		(rule) => rule.id === 'no-raw-visual-color',
	);
	if (!colorMixRule) {
		throw new Error(
			'internal invariant: no-raw-visual-color rule must exist in rules',
		);
	}
	for (const [relativePath, source] of fileContentsByRelativePath) {
		if (
			relativePath.endsWith('.css') ||
			!colorMixRule.appliesTo(relativePath)
		) {
			continue;
		}

		const lines = source.split('\n');
		for (const call of findColorMixArgLists(source)) {
			if (!colorMixArgsHaveRawOperand(call.argsText)) {
				continue;
			}

			const lineIndex =
				source.slice(0, call.openerIndex).split('\n').length - 1;
			if (
				colorMixRule.ignoreMatch?.(
					relativePath,
					lines[lineIndex],
					lineIndex,
					lines,
				)
			) {
				continue;
			}

			recordViolation(
				violations,
				{
					ruleId: colorMixRule.id,
					message: colorMixRule.message,
					file: relativePath,
					line: lineIndex + 1,
					source: lines[lineIndex].trim(),
				},
				lines,
				violations,
				{
					ruleId: colorMixRule.id,
					message: colorMixRule.message,
					file: relativePath,
					line: lineIndex + 1,
					source: lines[lineIndex].trim(),
				},
			);
		}
	}

	// Self-pruning stale-debt check (F7): a guardDebt entry is a standing,
	// silent re-permit for one exact (rule, file, source substring)
	// combination. If the file was part of this scan but no longer contains
	// that substring, the entry is stale — either the offending code moved on
	// its own (good) or was rewritten to no longer match (also good), and
	// either way the entry is now dead weight that would silently re-permit a
	// *new, unrelated* regression matching the same rule+file.
	if (checkStaleDebt) {
		for (const debt of guardDebt) {
			const content = fileContentsByRelativePath.get(debt.file);

			// F10: a debt entry whose file was deleted (not just absent from a
			// narrower fixture scan — checkStaleDebt is itself opt-in, on only
			// for the real CLI run's full src/+e2e/ scan) is stale too: the file
			// it silently re-permits a violation in no longer exists, and if the
			// path is ever recreated the entry would immediately re-permit
			// whatever lands there, unrelated to the original offense.
			if (content === undefined) {
				violations.push({
					ruleId: 'stale-guard-debt',
					message:
						"guardDebt entry's file was not found in this scan (deleted or renamed); delete the entry — a stale entry silently re-permits a violation of the same rule if the path is ever recreated.",
					file: debt.file,
					line: 0,
					source: `${debt.ruleId}: ${debt.sourceIncludes}`,
				});
				continue;
			}

			if (!content.includes(debt.sourceIncludes)) {
				violations.push({
					ruleId: 'stale-guard-debt',
					message:
						'guardDebt entry no longer matches any line in this file; delete it — a stale entry silently re-permits a future, unrelated violation of the same rule in the same file.',
					file: debt.file,
					line: 0,
					source: `${debt.ruleId}: ${debt.sourceIncludes}`,
				});
			}
		}
	}

	// r1-fix: every budget must equal the file's exact current occurrence
	// count — see checkGuardDebtBudgetSlack above.
	if (checkDebtBudgetSlack) {
		violations.push(
			...checkGuardDebtBudgetSlack(guardDebt, fileContentsByRelativePath),
		);
	}

	if (checkTokenGuards) {
		violations.push(...checkTokenGuardViolations(fileContentsByRelativePath));
	}

	// W5-HARDEN: reason-quality alone can't stop a suppression reworded to
	// clear the bar without argument — the structural backstop is this
	// inventory diff. A `design-system-ignore` comment that exists in code
	// but not in suppression-inventory.json (added/reworded without
	// regenerating it), or an inventory entry no longer found in code, both
	// fail the guard.
	if (checkSuppressionInventory) {
		const found: SuppressionSite[] = [];
		for (const [relativePath, source] of fileContentsByRelativePath) {
			found.push(
				...findSuppressionSitesInSource(source, relativePath).filter(
					(site) => site.convention === 'design-system-ignore',
				),
			);
		}
		const relevantInventory = suppressionInventory.filter(
			(
				site,
			): site is SuppressionSite & {
				convention: 'design-system-ignore';
			} => site.convention === 'design-system-ignore',
		);
		const { undocumented, stale } = diffSuppressionInventory(
			found,
			relevantInventory,
		);
		for (const site of undocumented) {
			violations.push({
				ruleId: 'suppression-inventory-drift',
				message:
					'design-system-ignore suppression is not in suppression-inventory.json — ' +
					'run `node scripts/generate/generate-suppression-inventory.mts` and commit the result.',
				file: site.file,
				line: 0,
				source: site.reason,
			});
		}
		for (const site of stale) {
			violations.push({
				ruleId: 'suppression-inventory-drift',
				message:
					'suppression-inventory.json lists a design-system-ignore site no longer found in ' +
					'this scan — run `node scripts/generate/generate-suppression-inventory.mts` and commit the result.',
				file: site.file,
				line: 0,
				source: site.reason,
			});
		}
	}

	return Object.assign(violations, { scannedFileCount: files.length });
};

if (
	process.argv[1] &&
	pathToFileURL(process.argv[1]).href === import.meta.url
) {
	const violations = await scanFront2DesignSystem({
		checkStaleDebt: true,
		checkTokenGuards: true,
		checkSuppressionInventory: true,
		checkDebtBudgetSlack: true,
	});

	console.error(
		`front design-system guard: scanned ${violations.scannedFileCount} files, ${violations.length} violations`,
	);

	if (violations.length > 0) {
		console.error('front design-system guard failed:');
		for (const violation of violations) {
			console.error(
				`${violation.file}:${violation.line} ${violation.ruleId} - ${violation.message}\n  ${violation.source}`,
			);
		}
		process.exit(1);
	}
}
