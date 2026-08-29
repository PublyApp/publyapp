/**
 * Subtle foreground guard - forbids NEW --publy-foreground-subtle on standalone body-size text.
 *
 * Reads REAL source files (every stylesheet under src plus every
 * src TS/TSX file), not a synthetic fixture. Existing legitimate
 * consumers are enumerated in subtle-foreground-allowlist.ts with a
 * file:line-independent key (selector / class fragment) so moving code does
 * not break but adding a new body site does.
 *
 * Body-size definition: standalone readable text at 13px or more. Placeholders,
 * decorative icons, eyebrow/label/helper (11-12px) and inline metadata that
 * accompanies readable content are NOT body - they stay green without an
 * allowlist entry (adversarial proof). A body-size subtle site must be
 * allowlisted with a reasoned entry or the guard fails.
 *
 * Classification rule for string constants: a shared class constant such as
 * `export const X = 'text-sm text-[var(--publy-foreground-subtle)]'` that
 * carries the subtle token is a violation unless allowlisted (fail-closed).
 * We do not trace consumers - the definition site itself must be allowlisted.
 * Template literals and cn() compositions without a literal className="..."
 * wrapper are likewise flagged at file level and require an allowlist entry.
 * Tailwind utilities never appear in the compiled CSS, so they cannot be
 * "bounded by the CSS guard" - the source scan is the bound.
 *
 * House style follows drawer-description-contrast.test.ts and
 * profile-icon-picker-pin-contrast.test.ts: read the real stylesheets, strip
 * comments only for fallback scans, use postcss for the CSS walk.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import { describe, expect, test } from 'vitest';

import { SUBTLE_FOREGROUND_ALLOWLIST } from './subtle-foreground-allowlist';

const FRONT_ROOT = path.resolve(process.cwd());
const SRC_DIR = path.join(FRONT_ROOT, 'src');

const SUBTLE_TOKEN = '--publy-foreground-subtle';

const isPlaceholderSelector = (selector: string) =>
	/::placeholder|:placeholder/.test(selector);

// Extract a body-size verdict from a CSS rule's text. Returns true for
// standalone body (>=13px), false for caption/label/helper (<=12px), and
// null when no size is declared (caller decides - for a new site, null is
// treated as body because the default page size is 14px).
const cssSizeIsBody = (ruleText: string): boolean | null => {
	// Explicit font-size declarations.
	const pxMatches = [...ruleText.matchAll(/font-size:\s*([\d.]+)px/g)];
	for (const m of pxMatches) {
		const v = Number(m[1]);
		if (v >= 13) {
			return true;
		}
		if (v <= 12) {
			return false;
		}
	}

	// Tailwind @apply or class fragments inside the rule text.
	if (/(?:@apply|class)[^;]*\btext-xs\b/.test(ruleText)) {
		return false;
	}
	if (/(?:@apply|class)[^;]*\btext-\[11px\]/.test(ruleText)) {
		return false;
	}
	if (/(?:@apply|class)[^;]*\btext-\[12px\]/.test(ruleText)) {
		return false;
	}
	if (/(?:@apply|class)[^;]*\btext-sm\b/.test(ruleText)) {
		return true;
	}
	if (/(?:@apply|class)[^;]*\btext-base\b/.test(ruleText)) {
		return true;
	}
	const bracketPx = [...ruleText.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)];
	for (const m of bracketPx) {
		const v = Number(m[1]);
		if (v >= 13) {
			return true;
		}
		if (v <= 12) {
			return false;
		}
	}

	return null;
};

// Extract body verdict from a class string or arbitrary string literal that
// contains Tailwind size tokens.
const classStringIsBody = (classString: string): boolean | null => {
	if (/\btext-xs\b/.test(classString)) {
		return false;
	}
	if (/\btext-\[11px\]/.test(classString)) {
		return false;
	}
	if (/\btext-\[12px\]/.test(classString)) {
		return false;
	}
	if (/\btext-sm\b/.test(classString)) {
		return true;
	}
	if (/\btext-base\b/.test(classString)) {
		return true;
	}
	if (/\btext-lg\b/.test(classString)) {
		return true;
	}
	if (/\btext-xl\b/.test(classString)) {
		return true;
	}
	const bracketPx = [...classString.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)];
	for (const m of bracketPx) {
		const v = Number(m[1]);
		if (v >= 13) {
			return true;
		}
		if (v <= 12) {
			return false;
		}
	}
	// No size token at all - inherits body (14px) by default.
	return null;
};

const isAllowlistedCss = (selector: string): boolean =>
	SUBTLE_FOREGROUND_ALLOWLIST.some(
		(e) => !e.file && e.selector.trim() === selector.trim(),
	);

const isAllowlistedTsx = (classString: string, relativeFile: string): boolean =>
	SUBTLE_FOREGROUND_ALLOWLIST.some((e) => {
		if (!e.file) {
			return false;
		}
		// Normalize file sep for cross-platform.
		const want = e.file.replaceAll('\\', '/');
		const got = relativeFile.replaceAll('\\', '/');
		if (want !== got) {
			return false;
		}
		return classString.includes(e.selector);
	});

const collectSrcFiles = (dir: string, acc: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			// Skip generated / build artifacts.
			if (entry === 'node_modules' || entry === '.next' || entry === 'dist') {
				continue;
			}
			collectSrcFiles(full, acc);
		} else if (
			(entry.endsWith('.tsx') || entry.endsWith('.ts')) &&
			!entry.endsWith('.d.ts')
		) {
			// Scan both .ts and .tsx - a shared constant in a .ts file such as
			// `export const X = 'text-sm text-[var(--publy-foreground-subtle)]'`
			// consumed on body text must be caught (fail-closed).
			acc.push(full);
		} else if (entry.endsWith('.css')) {
			// Also collect stylesheets recursively - every file under src,
			// not only app.css (landing.css included).
			acc.push(full);
		}
	}
	return acc;
};

const collectCssFiles = (dir: string, acc: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (entry === 'node_modules' || entry === '.next' || entry === 'dist') {
				continue;
			}
			collectCssFiles(full, acc);
		} else if (entry.endsWith('.css')) {
			acc.push(full);
		}
	}
	return acc;
};

describe('subtle foreground on body text guard (#1151)', () => {
	test('fails when a new --publy-foreground-subtle lands on standalone body-size text', () => {
		const violations: string[] = [];

		// --- CSS scan: every stylesheet under src via postcss ---
		const cssFiles = collectCssFiles(SRC_DIR);
		for (const cssPath of cssFiles) {
			const relCss = path.relative(FRONT_ROOT, cssPath);
			// Skip test fixtures that might mention the token in comments.
			if (relCss.includes('.test.')) {
				continue;
			}
			const cssSource = readFileSync(cssPath, 'utf8');
			const root = postcss.parse(cssSource);
			root.walkRules((rule) => {
				const hasSubtle = rule.nodes.some(
					(n) =>
						n.type === 'decl' &&
						typeof (n as postcss.Declaration).value === 'string' &&
						(n as postcss.Declaration).value.includes(SUBTLE_TOKEN),
				);
				if (!hasSubtle) {
					return;
				}

				const selector = rule.selector.trim();
				if (isAllowlistedCss(selector)) {
					return;
				}

				// Placeholders are legitimate at any size (not readable body).
				if (isPlaceholderSelector(selector)) {
					return;
				}
				// Icon selectors are NOT blind-exempted - a future `*-icon`
				// rule carrying readable body text must be explicitly
				// allowlisted with a reason. Only the allowlist above exempts.

				const sizeVerdict = cssSizeIsBody(rule.toString());
				// Small / helper / eyebrow / label (<=12px) stays green.
				if (sizeVerdict === false) {
					return;
				}
				// Body (>=13px) or unknown (no explicit size, inherits 14px) is
				// standalone body - requires an explicit allowlist entry with a
				// reason, so flag as violation.
				violations.push(
					`CSS ${relCss} :: ${selector} uses ${SUBTLE_TOKEN} at body size (or unknown size - add an allowlist entry if this is legitimate inline-meta/helper/icon/placeholder)`,
				);
			});
		}

		// --- TS/TSX scan: real source files ---
		const allSrcFiles = collectSrcFiles(SRC_DIR);
		const srcFiles = allSrcFiles.filter(
			(f) => f.endsWith('.ts') || f.endsWith('.tsx'),
		);
		// Class attribute regex - covers className="..." only.
		const classAttrRe = /className\s*=\s*"([^"]*foreground-subtle[^"]*)"/g;
		for (const fullPath of srcFiles) {
			const rel = path.relative(FRONT_ROOT, fullPath);
			if (rel.includes('subtle-foreground-allowlist')) {
				continue;
			}
			if (rel.includes('.test.')) {
				continue;
			}
			if (rel.endsWith('.d.ts')) {
				continue;
			}
			const source = readFileSync(fullPath, 'utf8');
			let m: RegExpExecArray | null;
			// Reset regex state per file.
			classAttrRe.lastIndex = 0;
			while ((m = classAttrRe.exec(source)) !== null) {
				const classString = m[1];
				if (isAllowlistedTsx(classString, rel)) {
					continue;
				}

				const sizeVerdict = classStringIsBody(classString);
				// Caption / label / helper stays green.
				if (sizeVerdict === false) {
					continue;
				}
				// Body or unknown size without an allowlist entry is a violation.
				// Unknown (null) is treated as body because the default text size
				// is 14px - a bare `text-[var(--publy-foreground-subtle)]` with
				// no size token still paints body-size text.
				const sizeLabel =
					sizeVerdict === true
						? 'body size (>=13px)'
						: 'unknown size (inherits body)';
				violations.push(
					`TSX ${rel} class "${classString}" uses ${SUBTLE_TOKEN} at ${sizeLabel} - add an allowlist entry with a reason if this is legitimate placeholder/icon/eyebrow/helper/inline-meta`,
				);
			}

			// Also catch subtle used outside a literal className string, e.g.
			// a shared constant `export const X = 'text-sm ...subtle...'` in a
			// .ts file or a template literal / cn() composition in a .tsx file
			// without a matching className="..." wrapper. Classification rule:
			// fail-closed - any string literal carrying the token is a
			// violation unless the file+fragment is allowlisted. We do not
			// trace consumers.
			if (!source.includes(SUBTLE_TOKEN)) {
				continue;
			}
			classAttrRe.lastIndex = 0;
			const hadLiteralHit = classAttrRe.test(source);
			if (hadLiteralHit) {
				continue;
			}
			// File-level subtle without a className literal - could be a .ts
			// constant, a style prop, a cn() composition, or a dynamic class.
			// Flag as needing allowlist unless the file is already covered.
			const fileAllowlisted = SUBTLE_FOREGROUND_ALLOWLIST.some(
				(e) => e.file && rel.replaceAll('\\', '/') === e.file,
			);
			if (fileAllowlisted) {
				continue;
			}
			// Find the first non-comment line carrying the token for a better message.
			const lines = source.split('\n');
			for (let i = 0; i < lines.length; i++) {
				if (
					lines[i].includes(SUBTLE_TOKEN) &&
					!lines[i].trim().startsWith('//') &&
					!lines[i].trim().startsWith('*')
				) {
					// Caption / label in a constant (e.g. text-[11px] subtle)
					// stays green - only body or unknown size is a violation.
					const lineVerdict = classStringIsBody(lines[i]);
					if (lineVerdict === false) {
						break;
					}
					violations.push(
						`TS ${rel}:${i + 1} uses ${SUBTLE_TOKEN} outside a literal className - move it to a class or add an allowlist entry (fail-closed: string constants carrying the token are violations unless allowlisted)`,
					);
					break;
				}
			}
		}

		expect(
			violations,
			violations.length
				? `New --publy-foreground-subtle on body-size text:\n${violations.join('\n')}\n\nIf this is legitimate (placeholder, decorative icon, eyebrow/label/helper, or inline metadata accompanying readable content), add it to src/styles/subtle-foreground-allowlist.ts with a reason. Otherwise use --publy-foreground-muted or --publy-foreground-secondary.`
				: undefined,
		).toEqual([]);
	});

	test('every allowlist entry still matches a real source site (no stale entries)', () => {
		const cssFiles = collectCssFiles(SRC_DIR);
		const cssSelectors = new Set<string>();
		for (const cssPath of cssFiles) {
			const relCss = path.relative(FRONT_ROOT, cssPath);
			if (relCss.includes('.test.')) {
				continue;
			}
			const cssSource = readFileSync(cssPath, 'utf8');
			const root = postcss.parse(cssSource);
			root.walkRules((rule) => {
				const hasSubtle = rule.nodes.some(
					(n) =>
						n.type === 'decl' &&
						(n as postcss.Declaration).value.includes(SUBTLE_TOKEN),
				);
				if (hasSubtle) {
					cssSelectors.add(rule.selector.trim());
				}
			});
		}

		// Collect TS/TSX class strings for stale check.
		const allSrc = collectSrcFiles(SRC_DIR);
		const srcFiles = allSrc.filter(
			(f) => f.endsWith('.ts') || f.endsWith('.tsx'),
		);
		// Map file -> set of class strings in that file, and also global set.
		const fileToClassStrings = new Map<string, string[]>();
		const allClassStrings: string[] = [];
		for (const fullPath of srcFiles) {
			const rel = path.relative(FRONT_ROOT, fullPath).replaceAll('\\', '/');
			if (rel.includes('.test.')) {
				continue;
			}
			if (rel.endsWith('.d.ts')) {
				continue;
			}
			if (rel.includes('subtle-foreground-allowlist')) {
				continue;
			}
			const source = readFileSync(fullPath, 'utf8');
			const re = /className\s*=\s*"([^"]*foreground-subtle[^"]*)"/g;
			let m: RegExpExecArray | null;
			const arr: string[] = [];
			while ((m = re.exec(source)) !== null) {
				arr.push(m[1]);
				allClassStrings.push(m[1]);
			}
			// Also capture string literals outside className that contain the token
			// (for .ts constants) so stale entries scoped to those files are honoured.
			if (source.includes(SUBTLE_TOKEN) && arr.length === 0) {
				// Record raw lines containing the token as pseudo class strings
				// for stale matching - entry.selector fragment match is sufficient.
				const lines = source.split('\n');
				for (const line of lines) {
					if (line.includes(SUBTLE_TOKEN)) {
						arr.push(line);
					}
				}
			}
			fileToClassStrings.set(rel, arr);
		}
		// Also collect raw CSS file existence for file-scoped CSS entries (if any).

		const stale: string[] = [];
		for (const entry of SUBTLE_FOREGROUND_ALLOWLIST) {
			let found = false;
			if (entry.file) {
				// Honour entry.file strictly - an entry scoped to a deleted file
				// must be reported stale even if the fragment matches elsewhere.
				const want = entry.file.replaceAll('\\', '/');
				const classStringsInFile = fileToClassStrings.get(want);
				if (classStringsInFile) {
					found = classStringsInFile.some((cs) => cs.includes(entry.selector));
					// Also check if the file itself still exists and contains the fragment
					// outside className (e.g. .ts constant). Fallback to raw file read.
					if (!found) {
						try {
							const full = path.join(FRONT_ROOT, want);
							const src = readFileSync(full, 'utf8');
							found = src.includes(entry.selector);
						} catch {
							found = false;
						}
					}
				} else {
					// File does not exist or was not collected - stale.
					found = false;
				}
			} else {
				found = cssSelectors.has(entry.selector.trim());
				if (!found) {
					// Allow CSS entries to also be satisfied by a TSX fragment if
					// the selector string happens to be a class fragment (defensive).
					found = allClassStrings.some((cs) => cs.includes(entry.selector));
				}
			}
			if (!found) {
				stale.push(entry.selector + (entry.file ? ` (${entry.file})` : ''));
			}
		}

		expect(
			stale,
			stale.length
				? `Stale allowlist entries (no matching source site - remove them):\n${stale.join('\n')}`
				: undefined,
		).toEqual([]);
	});
});
