import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const srcDir = path.join(rootDir, 'src');
const e2eDir = path.join(rootDir, 'e2e');

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const APP_CSS_PATH = 'src/styles/app.css';
const ROUNDED_RULE_ID = 'no-rounded-full-or-999-radius';
const KNOWN_HANDOFF_GUARD_DEBT = [
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/app-shell/app-shell.tsx',
		sourceIncludes: 'rounded-full px-4 py-2',
		reason: 'Legacy mobile shell trigger; Task 3 shell pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/error-views/LogoutRedirect.tsx',
		sourceIncludes: 'size-8 animate-spin rounded-full',
		reason: 'Legacy loading spinner; spinner cleanup is outside Task 1.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/query-display.tsx',
		sourceIncludes: 'animate-spin rounded-full border-2',
		reason: 'Legacy loading spinner; spinner cleanup is outside Task 1.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes:
			'<Skeleton className="size-[26px] shrink-0 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: '<Skeleton className="h-3 w-40 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: '<Skeleton className="h-3 w-56 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: '<Skeleton className="ml-auto h-5 w-16 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: '<Skeleton className="h-5 w-16 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: 'size-3.5 animate-spin rounded-full',
		reason: 'Legacy pagination spinner; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/invitations/$invitationId.tsx',
		sourceIncludes: 'h-auto rounded-full border-none',
		reason: 'Legacy staff invitation chip; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles/$profileId/users.tsx',
		sourceIncludes: 'rounded-full border border-divider px-4 py-2',
		reason: 'Legacy profile chip; Staff module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles/$profileId/users.tsx',
		sourceIncludes: 'rounded-full bg-primary px-4 py-2',
		reason: 'Legacy profile chip; Staff module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/staff-users/$userId.tsx',
		sourceIncludes: 'h-2 w-2 rounded-full bg-primary',
		reason: 'Legacy status dot; Staff module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/_tenant-details-shell.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId.tsx',
		sourceIncludes: 'rounded-full bg-muted px-2 py-1',
		reason: 'Legacy status chip; Tenants module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/users/$userId-edit.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/users/$userId.tsx',
		sourceIncludes: 'h-2 w-2 rounded-full bg-primary',
		reason: 'Legacy status dot; Tenants module pass owns this.',
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
const KNOWN_IMPORTANT_FOUNDATION_DEBT = [
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'height: 22px !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill vs Badge h-5 default — real conflict, see rule comment.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'font-size: 11px !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill vs Badge text-xs default — real conflict.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'border-radius: var(--publy-radius-chip) !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill — same computed value as the Badge utility today, but kept explicit and important so a future Badge radius change cannot silently drift the shell chip.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'padding: 0 8px !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill vs Badge px-2 py-0.5 default — real conflict.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'background: var(--publy-surface-muted) !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill — Badge outline has no base bg utility, kept important for symmetry with the rest of the rule.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'color: var(--publy-foreground-muted) !important;',
		reason:
			'.app-shell-workspace-pill/.app-shell-tenant-pill/.app-shell-topbar-action-btn vs Badge text-foreground / Button outline defaults — real conflict.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'height: 36px !important;',
		reason:
			'.app-shell-topbar-action-btn — matches the Button size="icon" utility value; kept important for symmetry with the radius/border-color overrides in the same rule.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'min-height: 36px !important;',
		reason: '.app-shell-topbar-action-btn — see height: 36px entry above.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'width: 36px !important;',
		reason: '.app-shell-topbar-action-btn — see height: 36px entry above.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'min-width: 36px !important;',
		reason: '.app-shell-topbar-action-btn — see height: 36px entry above.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'border-radius: 999px !important;',
		reason:
			".app-shell-topbar-action-btn — deliberately circular vs the Button size utility 12px radius; this is the guard's own documented rounded-full exception for this selector.",
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'border-color: var(--publy-border) !important;',
		reason:
			'.app-shell-topbar-action-btn vs Button outline border-(--publy-border-strong) default — real conflict.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'transition-duration: 1ms !important;',
		reason:
			'prefers-reduced-motion: reduce — must beat every component/utility transition unconditionally; permanent by design.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'animation-duration: 1ms !important;',
		reason:
			'prefers-reduced-motion: reduce — see transition-duration entry above.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'animation-iteration-count: 1 !important;',
		reason:
			'prefers-reduced-motion: reduce — see transition-duration entry above.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'scroll-behavior: auto !important;',
		reason:
			'prefers-reduced-motion: reduce — see transition-duration entry above.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/styles/app.css',
		sourceIncludes: 'transition: none !important;',
		reason:
			'html[data-theme-changing] — suppresses cross-fade during the .dark class swap; must beat every transition unconditionally, permanent by design.',
	},
];

const KNOWN_GUARD_DEBT = [
	...KNOWN_HANDOFF_GUARD_DEBT,
	...KNOWN_IMPORTANT_FOUNDATION_DEBT,
];

// Tightened to the same rule block (F15): stop at the nearest enclosing `{`
// or `}` above the match instead of scanning a fixed 8-line lookback window,
// so a `rounded-full` in one rule can't ride on an unrelated selector's name
// merely because it sits a few lines above.
const hasNearbySelector = (lines, lineIndex, selector) => {
	for (let index = lineIndex; index >= 0; index--) {
		if (lines[index].includes(selector)) {
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
const getBlockLineRanges = (lines, selectorPattern) => {
	const ranges = [];
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

const isAppCssTokenLayerLine = (relativePath, lineIndex, lines) => {
	if (relativePath !== APP_CSS_PATH) {
		return false;
	}

	const ranges = [
		...getBlockLineRanges(lines, /^:root\s*\{/),
		...getBlockLineRanges(lines, /^html\.dark\s*\{/),
	];

	return ranges.some(([start, end]) => lineIndex >= start && lineIndex <= end);
};

const isRoundedRadiusAllowed = (relativePath, line, lineIndex, lines) => {
	if (relativePath === 'src/components/ui/avatar.tsx') {
		return true;
	}

	if (relativePath === 'src/components/app-shell/app-shell.tsx') {
		return line.includes('app-shell-topbar-action-btn');
	}

	if (relativePath !== 'src/styles/app.css') {
		return false;
	}

	return (
		line.includes('.app-shell-topbar-action-btn') ||
		hasNearbySelector(lines, lineIndex, '.app-shell-topbar-action-btn') ||
		hasNearbySelector(lines, lineIndex, '.publy-avatar-initials')
	);
};

const isConfirmDialogFile = (relativePath) =>
	relativePath === 'src/components/ui/confirm-dialog.tsx' ||
	relativePath === 'src/components/ui/drawer.tsx';

const isKnownHandoffGuardDebt = ({ ruleId, file, source }) => {
	for (const debt of KNOWN_GUARD_DEBT) {
		if (
			debt.ruleId === ruleId &&
			debt.file === file &&
			source.includes(debt.sourceIncludes)
		) {
			return true;
		}
	}

	return false;
};

// An opt-out comment on the line directly above the offending line. Requires a
// reason after the rule id so the suppression has to be argued, not just added.
const SUPPRESSION_PREFIX = 'design-system-ignore:';

const isInlineSuppressed = (lines, line, ruleId) => {
	const previous = lines[line - 2] ?? '';
	const marker = `${SUPPRESSION_PREFIX} ${ruleId}`;
	const at = previous.indexOf(marker);
	return at !== -1 && previous.slice(at + marker.length).trim().length > 0;
};

const recordViolation = (violations, violation, lines) => {
	if (isKnownHandoffGuardDebt(violation)) {
		return;
	}

	if (lines && isInlineSuppressed(lines, violation.line, violation.ruleId)) {
		return;
	}

	violations.push(violation);
};

const rules = [
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
			'Use front-2 semantic tokens instead of raw hex/rgb/slate/gray/zinc/neutral/white/black styling.',
		// Covers all of src/. The earlier per-directory list silently exempted
		// src/lib/, where a raw-hex palette landed unscanned.
		// src/design-handoff/ is exempt: its literals are *expected* values that
		// computed-style assertions compare against, not styling.
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/') &&
			!relativePath.startsWith('src/design-handoff/'),
		// Block-aware, not file-aware (F5): app.css is the token layer, but only
		// its `:root { … }` / `html.dark { … }` declaration blocks are allowed to
		// contain raw colour literals. Every other rule in the file is scanned
		// like any other source file, so a new `.publy-*` rule with `#fff` in it
		// fails the guard instead of hiding behind a whole-file exemption.
		ignoreMatch: (relativePath, _line, lineIndex, lines) =>
			isAppCssTokenLayerLine(relativePath, lineIndex, lines),
		patterns: [
			/["'`][#][0-9a-fA-F]{3,8}["'`]/, // quoted/templated raw color tokens
			/\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|accent|decoration|divide)-\[#(?:[0-9a-fA-F]{3,8})\]/,
			/\b(?:color|background|background-color|border-color|outline-color|fill|stroke)\s*:\s*#[0-9a-fA-F]{3,8}\b/,
			/\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|accent|decoration|divide)-(?:slate|zinc|gray|neutral)-\d{2,3}\b/,
			/\b(?:bg|border|text|ring)-white\/\d+\b/,
			/\b(?:bg|border|text|ring)-black\/\d+\b/,
			/\b(?:bg|border|text|ring)-(?:white|black)\b/,
			/["'`]\s*rgba?\(/,
			/\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|accent|decoration|divide)-\[(?:rgba?\([^\]]+\))\]/,
			/\b(?:color|background|background-color|border-color|outline-color|box-shadow|fill|stroke)\s*:\s*rgba?\(/,
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
		// KNOWN_IMPORTANT_FOUNDATION_DEBT entry with a reason, above. Left at
		// app-shell/ + table/ for TSX (not widened to all of src/components/):
		// that's the exact scope the F9 failure scenario (`bg-red-500!` on
		// data-table.tsx) needs, without also re-litigating src/components/ui/'s
		// existing, already-reviewed `!`-suffix usages (tabs.tsx, tooltip.tsx,
		// badge.tsx) outside this packet's ownership — see report Handoffs.
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/components/app-shell/') ||
			relativePath.startsWith('src/components/table/') ||
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
			'Only avatar surfaces and 36px topbar icon buttons may remain fully rounded.',
		appliesTo: () => true,
		patterns: [/\brounded-full\b/, /\bborder-radius:\s*999px\b/],
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
		source: 'source',
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
		// Covers context.route(...) too (F30) — Playwright's BrowserContext
		// exposes the same route() API as Page, and a glob registered there has
		// the identical single-`*`-cannot-cross-`/` footgun.
		patterns: [/(?:page|context)\.route\(\s*(['"`])(?:(?!\1)[^\\])*[^*]\*\1/g],
	},
];

const pathExists = async (dir) => {
	try {
		await readdir(dir);
		return true;
	} catch {
		return false;
	}
};

const collectFiles = async (dir) => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

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
} = {}) => {
	const files = [];
	for (const dir of sourceDirs) {
		if (await pathExists(dir)) {
			files.push(...(await collectFiles(dir)));
		}
	}

	// Vacuity check (F6): a missing/renamed source directory previously made
	// `pathExists` false, so `files` silently stayed empty and the guard
	// exited 0 having scanned nothing. Throw instead of returning `[]`, so a
	// vacuous scan is a hard failure, not a false "pass".
	if (files.length === 0) {
		throw new Error(
			`front-2 design-system guard scanned 0 files across ${sourceDirs.length} source ` +
				`director${sourceDirs.length === 1 ? 'y' : 'ies'} (${sourceDirs.join(', ')}) — ` +
				'the scan is vacuous. A renamed/missing source directory would cause exactly ' +
				'this, and a vacuous scan always "passes" with 0 violations for the wrong reason.',
		);
	}

	const violations = [];
	const fileContentsByRelativePath = new Map();

	for (const absolutePath of files) {
		const relativePath = path
			.relative(baseDir, absolutePath)
			.split(path.sep)
			.join('/');
		const source = await readFile(absolutePath, 'utf8');
		const lines = source.split('\n');
		fileContentsByRelativePath.set(relativePath, source);

		for (const rule of rules) {
			if (!rule.appliesTo(relativePath) || rule.allow?.(relativePath)) {
				continue;
			}

			if (rule.ignoreFile?.(relativePath)) {
				continue;
			}

			if (rule.mode === 'source') {
				for (const pattern of rule.patterns) {
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
						);
					}
				}
			} else {
				for (let index = 0; index < lines.length; index += 1) {
					const line = lines[index];
					for (const pattern of rule.patterns) {
						if (!pattern.test(line)) {
							continue;
						}

						if (rule.ignoreMatch?.(relativePath, line, index, lines)) {
							continue;
						}

						recordViolation(violations, {
							ruleId: rule.id,
							message: rule.message,
							file: relativePath,
							line: index + 1,
							source: line.trim(),
						});
					}
				}
			}
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
			if (content === undefined) {
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

	violations.scannedFileCount = files.length;
	return violations;
};

if (
	process.argv[1] &&
	pathToFileURL(process.argv[1]).href === import.meta.url
) {
	const violations = await scanFront2DesignSystem({ checkStaleDebt: true });

	console.error(
		`front-2 design-system guard: scanned ${violations.scannedFileCount} files, ${violations.length} violations`,
	);

	if (violations.length > 0) {
		console.error('front-2 design-system guard failed:');
		for (const violation of violations) {
			console.error(
				`${violation.file}:${violation.line} ${violation.ruleId} - ${violation.message}\n  ${violation.source}`,
			);
		}
		process.exit(1);
	}
}
