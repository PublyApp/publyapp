/**
 * Subtle foreground guard - forbids NEW --publy-foreground-subtle on standalone body-size text.
 *
 * Reads REAL source files (app.css plus every src TSX file), not a synthetic fixture.
 * Existing legitimate consumers are enumerated in subtle-foreground-allowlist.ts
 * with a file:line-independent key (selector / class fragment) so moving code
 * does not break but adding a new body site does.
 *
 * Body-size definition: standalone readable text at 13px or more. Placeholders,
 * decorative icons, eyebrow/label/helper (11-12px) and inline metadata that
 * accompanies readable content are NOT body - they stay green without an
 * allowlist entry (adversarial proof). A body-size subtle site must be
 * allowlisted with a reasoned entry or the guard fails.
 *
 * House style follows drawer-description-contrast.test.ts and
 * profile-icon-picker-pin-contrast.test.ts: read the real app.css, strip
 * comments only for fallback scans, use postcss for the CSS walk.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import { describe, expect, test } from 'vitest';

import { SUBTLE_FOREGROUND_ALLOWLIST } from './subtle-foreground-allowlist';

const FRONT_ROOT = path.resolve(process.cwd());
const APP_CSS_PATH = path.join(FRONT_ROOT, 'src/styles/app.css');
const SRC_DIR = path.join(FRONT_ROOT, 'src');

const SUBTLE_TOKEN = '--publy-foreground-subtle';

const isPlaceholderSelector = (selector: string) =>
	/::placeholder|:placeholder/.test(selector);

const isIconSelector = (selector: string) => /-icon\b/.test(selector);

// Extract a body-size verdict from a CSS rule's text. Returns true for
// standalone body (>=13px), false for caption/label/helper (<=12px), and
// null when no size is declared (caller decides - for a new site, null is
// treated as body because the default page size is 14px).
const cssSizeIsBody = (ruleText: string): boolean | null => {
	// Explicit font-size declarations.
	const pxMatches = [...ruleText.matchAll(/font-size:\s*([\d.]+)px/g)];
	for (const m of pxMatches) {
		const v = Number(m[1]);
		if (v >= 13) return true;
		if (v <= 12) return false;
	}

	// Tailwind @apply or class fragments inside the rule text.
	if (/(?:@apply|class)[^;]*\btext-xs\b/.test(ruleText)) return false;
	if (/(?:@apply|class)[^;]*\btext-\[11px\]/.test(ruleText)) return false;
	if (/(?:@apply|class)[^;]*\btext-\[12px\]/.test(ruleText)) return false;
	if (/(?:@apply|class)[^;]*\btext-sm\b/.test(ruleText)) return true;
	if (/(?:@apply|class)[^;]*\btext-base\b/.test(ruleText)) return true;
	const bracketPx = [...ruleText.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)];
	for (const m of bracketPx) {
		const v = Number(m[1]);
		if (v >= 13) return true;
		if (v <= 12) return false;
	}

	return null;
};

// Extract body verdict from a TSX class string.
const tsxClassIsBody = (classString: string): boolean | null => {
	if (/\btext-xs\b/.test(classString)) return false;
	if (/\btext-\[11px\]/.test(classString)) return false;
	if (/\btext-\[12px\]/.test(classString)) return false;
	if (/\btext-sm\b/.test(classString)) return true;
	if (/\btext-base\b/.test(classString)) return true;
	if (/\btext-lg\b/.test(classString)) return true;
	if (/\btext-xl\b/.test(classString)) return true;
	const bracketPx = [...classString.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)];
	for (const m of bracketPx) {
		const v = Number(m[1]);
		if (v >= 13) return true;
		if (v <= 12) return false;
	}
	// Also handle text-[13px], text-[14px] without bracket escape? Already covered.
	// No size token at all - inherits body (14px) by default.
	return null;
};

const isAllowlistedCss = (selector: string): boolean =>
	SUBTLE_FOREGROUND_ALLOWLIST.some(
		(e) => e.selector.trim() === selector.trim(),
	);

const isAllowlistedTsx = (classString: string, relativeFile: string): boolean =>
	SUBTLE_FOREGROUND_ALLOWLIST.some((e) => {
		if (!e.file) return false;
		// Normalize file sep for cross-platform.
		const want = e.file.replaceAll('\\', '/');
		const got = relativeFile.replaceAll('\\', '/');
		if (want !== got) return false;
		return classString.includes(e.selector);
	});

const collectTsxFiles = (dir: string, acc: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			// Skip generated / build artifacts.
			if (entry === 'node_modules' || entry === '.next' || entry === 'dist')
				continue;
			collectTsxFiles(full, acc);
		} else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
			// Only scan TSX for className cases; .ts files do not carry JSX
			// subtle consumers today, and skipping them reduces noise.
			if (entry.endsWith('.tsx')) acc.push(full);
		}
	}
	return acc;
};

describe('subtle foreground on body text guard (#1151)', () => {
	test('fails when a new --publy-foreground-subtle lands on standalone body-size text', () => {
		const violations: string[] = [];

		// --- CSS scan: real app.css via postcss ---
		const cssSource = readFileSync(APP_CSS_PATH, 'utf8');
		const root = postcss.parse(cssSource);
		root.walkRules((rule) => {
			const hasSubtle = rule.nodes.some(
				(n) =>
					n.type === 'decl' &&
					typeof (n as postcss.Declaration).value === 'string' &&
					(n as postcss.Declaration).value.includes(SUBTLE_TOKEN),
			);
			if (!hasSubtle) return;

			const selector = rule.selector.trim();
			if (isAllowlistedCss(selector)) return;

			// Placeholders and decorative icons are legitimate at any size.
			if (isPlaceholderSelector(selector)) return;
			if (isIconSelector(selector)) return;

			const sizeVerdict = cssSizeIsBody(rule.toString());
			// Small / helper / eyebrow / label (<=12px) stays green.
			if (sizeVerdict === false) return;
			// Body (>=13px) or unknown (no explicit size, inherits 14px) is
			// standalone body - requires an explicit allowlist entry with a
			// reason, so flag as violation.
			violations.push(
				`CSS ${selector} uses ${SUBTLE_TOKEN} at body size (or unknown size - add an allowlist entry if this is legitimate inline-meta/helper/icon/placeholder)`,
			);
		});

		// --- TSX scan: real source files ---
		const tsxFiles = collectTsxFiles(SRC_DIR);
		// Class attribute regex - covers className="..." only; template
		// literals and cn() compositions that spread a subtle token without a
		// literal className string are out of scope for this guard (they would
		// require AST parsing - see the drawer guard for that cost) and are
		// instead bounded by the CSS guard above via their final class.
		const classAttrRe = /className\s*=\s*"([^"]*foreground-subtle[^"]*)"/g;
		for (const fullPath of tsxFiles) {
			const rel = path.relative(FRONT_ROOT, fullPath);
			const source = readFileSync(fullPath, 'utf8');
			let m: RegExpExecArray | null;
			// Reset regex state per file.
			classAttrRe.lastIndex = 0;
			while ((m = classAttrRe.exec(source)) !== null) {
				const classString = m[1];
				if (isAllowlistedTsx(classString, rel)) continue;

				const sizeVerdict = tsxClassIsBody(classString);
				// Caption / label / helper stays green.
				if (sizeVerdict === false) continue;
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
			// `text-[var(--publy-foreground-subtle)]` appears in a template
			// literal or cn() call without a matching className="..." wrapper.
			// For those, we cannot extract a size - treat as a violation unless
			// the file itself is allowlisted via a CSS selector route.
			// To avoid double-counting the literal cases already handled, only
			// flag files that contain the token but had zero className hits and
			// are not the allowlisted TSX files.
			if (!source.includes(SUBTLE_TOKEN)) continue;
			classAttrRe.lastIndex = 0;
			const hadLiteralHit = classAttrRe.test(source);
			if (hadLiteralHit) continue;
			// File-level subtle without a className literal - could be a style
			// prop, a cn() composition, or a dynamic class. Flag as needing
			// allowlist unless the file is already covered.
			const fileAllowlisted = SUBTLE_FOREGROUND_ALLOWLIST.some(
				(e) => e.file && rel.replaceAll('\\', '/') === e.file,
			);
			if (fileAllowlisted) continue;
			// Heuristic: if the file mentions subtle only inside a comment or
			// a test file, do not flag - tests legitimately mention the token.
			if (rel.includes('.test.')) continue;
			// Find the line for a better message.
			const lines = source.split('\n');
			for (let i = 0; i < lines.length; i++) {
				if (
					lines[i].includes(SUBTLE_TOKEN) &&
					!lines[i].trim().startsWith('//') &&
					!lines[i].trim().startsWith('*')
				) {
					// Ignore the allowlist file itself.
					if (rel.includes('subtle-foreground-allowlist')) break;
					violations.push(
						`TSX ${rel}:${i + 1} uses ${SUBTLE_TOKEN} outside a literal className - move it to a class or add an allowlist entry`,
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
		const cssSource = readFileSync(APP_CSS_PATH, 'utf8');
		const root = postcss.parse(cssSource);
		const cssSelectors = new Set<string>();
		root.walkRules((rule) => {
			const hasSubtle = rule.nodes.some(
				(n) =>
					n.type === 'decl' &&
					(n as postcss.Declaration).value.includes(SUBTLE_TOKEN),
			);
			if (hasSubtle) cssSelectors.add(rule.selector.trim());
		});

		const tsxFiles = collectTsxFiles(SRC_DIR);
		const tsxClassStrings: string[] = [];
		for (const fullPath of tsxFiles) {
			const source = readFileSync(fullPath, 'utf8');
			const re = /className\s*=\s*"([^"]*foreground-subtle[^"]*)"/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(source)) !== null) tsxClassStrings.push(m[1]);
		}

		const stale: string[] = [];
		for (const entry of SUBTLE_FOREGROUND_ALLOWLIST) {
			let found = false;
			if (entry.file) {
				found = tsxClassStrings.some((cs) => cs.includes(entry.selector));
				if (!found) {
					// Also check CSS for file-less entries that happen to mention a TSX fragment.
					found = cssSelectors.has(entry.selector.trim());
				}
			} else {
				found = cssSelectors.has(entry.selector.trim());
				if (!found) {
					found = tsxClassStrings.some((cs) => cs.includes(entry.selector));
				}
			}
			if (!found) stale.push(entry.selector);
		}

		expect(
			stale,
			stale.length
				? `Stale allowlist entries (no matching source site - remove them):\n${stale.join('\n')}`
				: undefined,
		).toEqual([]);
	});
});
