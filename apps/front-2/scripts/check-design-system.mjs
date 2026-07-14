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
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/ui/loading-spinner.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason:
			'Functional spinner circle (a full rotation needs a full circle), not a decorative pill. ' +
			'An inline `design-system-ignore` comment cannot suppress this: the rule id ' +
			'"no-rounded-full-or-999-radius" itself contains the substring "rounded-full" and would ' +
			'self-trigger a new violation on the comment line, so this is a debt-list entry instead.',
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
	// F4: src/components/ui/ joined the scan this round; each pre-existing
	// `!`-suffix usage there is now recorded here instead of being invisible.
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/components/ui/badge.tsx',
		sourceIncludes: '[&>svg]:size-3!',
		reason:
			'Pins every Badge icon to 12px regardless of the icon component’s own default size (Tabler icons default to size-4/16px) — a caller’s icon className would otherwise win and break the compact 20px badge.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/components/ui/tabs.tsx',
		sourceIncludes: 'border-transparent!',
		reason:
			'TabsTrigger renders a native <button> by default (nativeButton); pins the border transparent against the user-agent button border independent of Tailwind’s utility generation order.',
	},
	{
		ruleId: IMPORTANT_FOUNDATION_RULE_ID,
		file: 'src/components/ui/tooltip.tsx',
		sourceIncludes: 'top-1/2!',
		reason:
			'Overrides Base UI’s own inline arrow-positioning style for the inline-end/inline-start/left/right sides; the default `top` set by the primitive otherwise wins over a plain (non-important) utility.',
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
		hasNearbySelector(lines, lineIndex, '.publy-avatar-initials') ||
		// The two other genuinely circular surfaces (F4): the rail's account
		// avatar/link (a real avatar, same shape rule as .publy-avatar-initials
		// above) and the form action bar's 7px status dot.
		hasNearbySelector(lines, lineIndex, "[data-rail-item='account']") ||
		hasNearbySelector(lines, lineIndex, '.app-shell-rail-account-avatar') ||
		hasNearbySelector(lines, lineIndex, '.publy-form-action-bar-status::before')
	);
};

// F3: a colour literal directly in the value — `#fff`, `rgba(0, 0, 0, .5)`,
// `hsl(200 10% 10%)` — as opposed to a value that only *references* another
// (already theme-aware) token, e.g. `0 0 0 1px var(--publy-border)` or
// `color-mix(in srgb, var(--publy-primary) 25%, transparent)`. Those need no
// dark counterpart of their own: they inherit theme-awareness from the token
// they point at.
const COLOR_LITERAL_PATTERN =
	/#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(\s*\d/;

// Tokens whose colour is deliberately fixed across both themes — documented
// per-entry so the guard can still see and reason about every exemption
// instead of being blind to the whole class (F3, mirrors KNOWN_GUARD_DEBT).
const THEME_INVARIANT_TOKENS = [
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

const isThemeInvariantToken = (name) =>
	THEME_INVARIANT_TOKENS.some((entry) =>
		entry.exact ? entry.exact === name : name.startsWith(entry.prefix),
	);

// Parses `--publy-x: value;` pairs out of a block of CSS text, tolerating
// multi-line values (e.g. a wrapped `box-shadow` declaration) since this
// operates on the whole block instead of scanning line-by-line.
const extractTokenDeclarations = (blockText) => {
	const declarations = new Map();
	const pattern = /(--publy-[\w-]+)\s*:\s*([^;]+);/g;
	let match;
	while ((match = pattern.exec(blockText))) {
		declarations.set(match[1], match[2].trim());
	}
	return declarations;
};

const findDeclarationLine = (lines, start, end, tokenName) => {
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
const collectScopedCustomPropertyDeclarations = (appCssLines) => {
	const byKey = new Map();

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
			const entry = byKey.get(key) ?? { light: new Map(), dark: new Map() };
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
const checkTokenGuardViolations = (fileContentsByRelativePath) => {
	const violations = [];
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
const RAW_COLOR_PROPERTY_NAMES =
	'color|background|background-color|background-image|border|border-color|' +
	'border-top|border-right|border-bottom|border-left|outline|outline-color|' +
	'text-shadow|caret-color|accent-color|fill|stroke';
const RAW_COLOR_PROPERTY_HEX_PATTERN = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES})\\s*:\\s*#[0-9a-fA-F]{3,8}\\b`,
);
const RAW_COLOR_PROPERTY_HEX_PATTERN_MULTILINE = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES})\\s*:[^;]*#[0-9a-fA-F]{3,8}\\b`,
);
const RAW_COLOR_PROPERTY_RGBA_PATTERN = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES}|box-shadow)\\s*:\\s*rgba?\\(`,
);
const RAW_COLOR_PROPERTY_RGBA_PATTERN_MULTILINE = new RegExp(
	`\\b(?:${RAW_COLOR_PROPERTY_NAMES}|box-shadow)\\s*:[^;]*rgba?\\(`,
);
// F3: a `--custom-prop:` declaration is invisible to the property-name
// patterns above (it has no property name at all), so a raw hex/rgba/hsla
// literal handed straight to a custom property — e.g.
// `--publy-icon-tile-bg: #f0f9ff;` — sailed through unscanned. Matched
// per-statement/per-line like the others; whether it needs a dark
// counterpart is token-theme-parity's job (checkTokenGuardViolations), not
// this rule's — this rule only flags the literal existing at all outside the
// :root/html.dark token layer (see `ignoreMatch: isAppCssTokenLayerLine`).
const RAW_COLOR_CUSTOM_PROPERTY_PATTERN =
	/^\s*--[\w-]+\s*:[^;]*(?:#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()/;
const RAW_COLOR_MULTILINE_PATTERN_OVERRIDES = new Map([
	[RAW_COLOR_PROPERTY_HEX_PATTERN, RAW_COLOR_PROPERTY_HEX_PATTERN_MULTILINE],
	[RAW_COLOR_PROPERTY_RGBA_PATTERN, RAW_COLOR_PROPERTY_RGBA_PATTERN_MULTILINE],
]);

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
			/\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|accent|decoration|divide)-\[#(?:[0-9a-fA-F]{3,8})\]/,
			RAW_COLOR_PROPERTY_HEX_PATTERN,
			/\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|accent|decoration|divide)-(?:slate|zinc|gray|neutral)-\d{2,3}\b/,
			/\b(?:bg|border|text|ring)-white\/\d+\b/,
			/\b(?:bg|border|text|ring)-black\/\d+\b/,
			/\b(?:bg|border|text|ring)-(?:white|black)\b/,
			/["'`]\s*rgba?\(/,
			/\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|accent|decoration|divide)-\[(?:rgba?\([^\]]+\))\]/,
			RAW_COLOR_PROPERTY_RGBA_PATTERN,
			RAW_COLOR_CUSTOM_PROPERTY_PATTERN,
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
			'Only avatar surfaces and 36px topbar icon buttons may remain fully rounded.',
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
	// Same opt-in reasoning as checkStaleDebt (F7): a fixture that doesn't
	// build a full :root/html.dark token layer shouldn't be misjudged against
	// the real app.css token set.
	checkTokenGuards = false,
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
						const effectivePattern =
							RAW_COLOR_MULTILINE_PATTERN_OVERRIDES.get(pattern) ?? pattern;
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
						);
					}
				}

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
						);
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

	if (checkTokenGuards) {
		violations.push(...checkTokenGuardViolations(fileContentsByRelativePath));
	}

	violations.scannedFileCount = files.length;
	return violations;
};

if (
	process.argv[1] &&
	pathToFileURL(process.argv[1]).href === import.meta.url
) {
	const violations = await scanFront2DesignSystem({
		checkStaleDebt: true,
		checkTokenGuards: true,
	});

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
