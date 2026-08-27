/**
 * @vitest-environment jsdom
 */
/**
 * IMPORTANT finding (review-ui-fidelity.md, #1024 remediation): switching the
 * tenant band to `bg-muted` while the tenant-code line kept
 * `text-muted-foreground` resolved to ~4.40:1 in the light theme — under the
 * WCAG AA 4.5:1 floor for normal-sized text (dark mode was fine at ~5.81:1).
 * `pnpm --filter front check:design-system` does not catch this: it checks
 * semantic-token declarations, usage, and light/dark parity, not ordinary
 * foreground-on-background contrast. The existing contrast suites
 * (`focus-ring-contrast.test.ts`, `avatar-fallback-contrast.test.ts`) cover
 * focus rings and avatar fallbacks only — neither renders this component or
 * this token pair as it is actually used here.
 *
 * This test renders the REAL `ProfileTenantBand` component, reads the
 * `className` its section and its tenant-code line actually resolved to, and
 * maps those Tailwind utilities to the real `app.css` custom-property chain
 * (the same `@theme inline` → `:root`/`html.dark` → `--publy-*` resolution a
 * browser performs) to compute the rendered contrast ratio in both themes.
 * It is therefore coupled to the real render output, not a hand-restated
 * fixture: reverting the tenant-code line to `text-muted-foreground` makes
 * this fail again (verified manually against the pre-fix source — see the
 * PR/commit description for the failing-then-passing transcript).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
		className?: string;
	}) => {
		let href = to;
		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}
		return (
			<a href={href} className={className}>
				{children}
			</a>
		);
	},
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				'open-tenant': 'Open tenant',
				'status-unknown': 'Unknown',
			})[key] ?? key,
	}),
}));

vi.mock('../_tenant-details-shell', () => ({
	formatTenantStatusLabel: (status: string) => status,
}));

import { ProfileTenantBand } from './_profile-tenant-band';

// jsdom shadows the global URL constructor with a browser-relative one, so
// resolving a sibling/ancestor file requires node:path against
// fileURLToPath(import.meta.url) directly, not `new URL(relative, import.meta.url)`
// (see the identical note in ../_tenant-details-shell.test.tsx).
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const appCssPath = path.resolve(rootDir, '../../../../../../styles/app.css');
const appCss = readFileSync(appCssPath, 'utf8');

const WCAG_AA_NORMAL_TEXT_FLOOR = 4.5;

type Rgb = { r: number; g: number; b: number };

const extractBlock = (
	header: '@theme inline' | ':root' | 'html.dark',
): string => {
	const start = appCss.indexOf(`${header} {`);
	if (start === -1) {
		throw new Error(`Missing ${header} block in app.css`);
	}

	let depth = 0;
	for (let index = start; index < appCss.length; index += 1) {
		if (appCss[index] === '{') {
			depth += 1;
		} else if (appCss[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				return appCss.slice(start, index + 1);
			}
		}
	}

	throw new Error(`Unclosed ${header} block in app.css`);
};

const extractDeclarations = (block: string): Map<string, string> => {
	const declarations = new Map<string, string>();
	const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(block))) {
		declarations.set(match[1], match[2].trim());
	}
	return declarations;
};

const parseHex = (hex: string): Rgb => ({
	r: Number.parseInt(hex.slice(1, 3), 16),
	g: Number.parseInt(hex.slice(3, 5), 16),
	b: Number.parseInt(hex.slice(5, 7), 16),
});

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linearize = (channel: number): number => {
		const value = channel / 255;
		if (value <= 0.04045) return value / 12.92;
		return ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (
	foregroundHex: string,
	backgroundHex: string,
): number => {
	const foregroundLuminance = relativeLuminance(parseHex(foregroundHex));
	const backgroundLuminance = relativeLuminance(parseHex(backgroundHex));
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);
	return (lighter + 0.05) / (darker + 0.05);
};

/** Resolves a `var(--x)` chain (through `:root`/`html.dark` overrides) down
 * to a hex literal, exactly like a browser resolving custom properties. */
const resolveToHex = (
	value: string,
	declarations: Map<string, string>,
): string => {
	const trimmed = value.trim();
	const varMatch = /^var\((--[\w-]+)\)$/.exec(trimmed);
	if (varMatch) {
		const referenced = declarations.get(varMatch[1]);
		if (referenced === undefined) {
			throw new Error(`Unresolved token reference: ${varMatch[1]}`);
		}
		return resolveToHex(referenced, declarations);
	}
	if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
		return trimmed;
	}
	throw new Error(`Unsupported colour value shape: ${trimmed}`);
};

type ColorCandidate = { index: number; hexValue: string };

/** Maps a rendered `className` string to the hex colour a browser would
 * paint for the given CSS property ('background-color' | 'color').
 *
 * The `text-*`/`bg-*` prefix is overloaded in Tailwind — `text-xs`/`text-sm`
 * are font-size utilities, not colours — so this collects every candidate
 * utility of the requested shape (a semantic name that is a real member of
 * the `@theme inline` `--color-*` map, or an arbitrary `[var(--x)]` value)
 * and resolves the RIGHTMOST one, mirroring how a real conflicting-utility
 * merge (tailwind-merge / cascade) resolves to the last-declared match
 * rather than the first token that happens to share the prefix. Fails
 * closed (throws) when no real colour utility is found — an unrecognised
 * shape must not be silently treated as "nothing to assert". */
const resolvePaintedHex = (
	className: string,
	property: 'background-color' | 'color',
	themeInlineDeclarations: Map<string, string>,
	themeDeclarations: Map<string, string>,
): string => {
	const prefix = property === 'background-color' ? 'bg' : 'text';
	const candidates: ColorCandidate[] = [];

	const arbitraryPattern = new RegExp(
		`(?:^|\\s)${prefix}-\\[(var\\(--[\\w-]+\\))\\](?=\\s|$)`,
		'g',
	);
	let arbitraryMatch: RegExpExecArray | null;
	while ((arbitraryMatch = arbitraryPattern.exec(className))) {
		candidates.push({
			index: arbitraryMatch.index,
			hexValue: resolveToHex(arbitraryMatch[1], themeDeclarations),
		});
	}

	const semanticPattern = new RegExp(
		`(?:^|\\s)${prefix}-([\\w-]+)(?=\\s|$)`,
		'g',
	);
	let semanticMatch: RegExpExecArray | null;
	while ((semanticMatch = semanticPattern.exec(className))) {
		const themeColorRef = themeInlineDeclarations.get(
			`--color-${semanticMatch[1]}`,
		);
		if (themeColorRef !== undefined) {
			candidates.push({
				index: semanticMatch.index,
				hexValue: resolveToHex(themeColorRef, themeDeclarations),
			});
		}
	}

	if (candidates.length === 0) {
		throw new Error(
			`No resolvable ${prefix}-* colour utility found in className: "${className}"`,
		);
	}

	let winner = candidates[0];
	for (const candidate of candidates) {
		if (candidate.index >= winner.index) {
			winner = candidate;
		}
	}
	return winner.hexValue;
};

const buildTenant = (): StaffTenantDetails => ({
	id: '11111111-1111-1111-1111-111111111111',
	name: 'Acme Corporation',
	legalName: null,
	description: null,
	code: 'ACME',
	logoUrl: null,
	websiteUrl: null,
	billingEmail: null,
	supportEmail: null,
	defaultLocale: null,
	timezone: null,
	notes: null,
	status: 'Active',
	usersCount: 4,
	ownersCount: 1,
	maxUsers: 10,
	profilesCount: 2,
	pendingInvitationsCount: 0,
	expiringSoonInvitationsCount: 0,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z'),
	lastActivityAt: null,
});

describe('ProfileTenantBand contrast (review-ui-fidelity.md IMPORTANT finding)', () => {
	afterEach(() => {
		cleanup();
	});

	const themeInlineDeclarations = extractDeclarations(
		extractBlock('@theme inline'),
	);

	test.each([
		['light', ':root'],
		['dark', 'html.dark'],
	] as const)(
		'the rendered tenant-code line clears the %s-mode 4.5:1 floor against the rendered band background',
		(_theme, header) => {
			render(
				<ProfileTenantBand
					tenant={buildTenant()}
					tenantId="11111111-1111-1111-1111-111111111111"
				/>,
			);

			const section = screen.getByTestId('staff-tenant-profile-tenant-band');
			const codeLine = screen.getByText('publyapp.com/').closest('p');
			if (!codeLine) {
				throw new Error(
					'Could not find the tenant-code <p> in the rendered band',
				);
			}

			// html.dark overrides layer over :root, mirroring the real cascade.
			const themeDeclarations = new Map([
				...extractDeclarations(extractBlock(':root')),
				...(header === 'html.dark'
					? extractDeclarations(extractBlock('html.dark'))
					: []),
			]);

			const backgroundHex = resolvePaintedHex(
				section.className,
				'background-color',
				themeInlineDeclarations,
				themeDeclarations,
			);
			const foregroundHex = resolvePaintedHex(
				codeLine.className,
				'color',
				themeInlineDeclarations,
				themeDeclarations,
			);

			const ratio = contrastRatio(foregroundHex, backgroundHex);
			expect(
				ratio,
				`rendered pair ${foregroundHex} on ${backgroundHex} -> ${ratio.toFixed(2)}:1`,
			).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT_FLOOR);
		},
	);

	test('evasion proof: the pre-fix text-muted-foreground-on-bg-muted pairing is what actually failed in light mode', () => {
		const themeDeclarations = extractDeclarations(extractBlock(':root'));
		const backgroundHex = resolvePaintedHex(
			'bg-muted',
			'background-color',
			themeInlineDeclarations,
			themeDeclarations,
		);
		const foregroundHex = resolvePaintedHex(
			'text-muted-foreground',
			'color',
			themeInlineDeclarations,
			themeDeclarations,
		);

		const ratio = contrastRatio(foregroundHex, backgroundHex);
		// Documents WHY this guard exists: proves the exact pre-fix pair this
		// batch shipped is genuinely below the floor this test enforces, so the
		// floor above is not vacuous.
		expect(ratio).toBeLessThan(WCAG_AA_NORMAL_TEXT_FLOOR);
	});
});
