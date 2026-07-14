import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @vitest-environment jsdom
 *
 * r5-F4: the selectable tenant-picker row suppressed the native outline and
 * fell back to a raw `shadow-[0_0_0_3px_rgba(253,199,0,0.16)]` focus
 * indicator, measured at 1.08:1 against the light-theme card surface — far
 * under the 3:1 WCAG non-text-indicator floor — because
 * `no-raw-visual-color` only recognises an arbitrary utility when the
 * bracket *starts* with `rgb(a)`, not when it's nested inside a `shadow-[]`
 * value. This test renders the real row and computes the same contrast the
 * browser would, so a future raw-colour regression here fails on substance
 * (contrast/shape), not just on the guard's narrow bracket-prefix check.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TenantsForPickerData } from '~/lib/query/tenants-for-picker';

vi.mock('~/lib/hooks/use-logout', () => ({
	useLogout: () => ({ logout: vi.fn(), isLoggingOut: false }),
}));

const EN_LABELS: Record<string, string> = {
	'select-organization': 'Select Organization',
	'select-organization-description':
		'Choose which organization you want to access',
	suspended: 'Suspended',
	'log-out': 'Log out',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { TenantPortalPickerView } from './_tenant-picker-view';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const appCssPath = path.resolve(rootDir, '../../../styles/app.css');
const appCssSource = readFileSync(appCssPath, 'utf-8');

type Rgb = { r: number; g: number; b: number };

const parseHex = (hex: string): Rgb => {
	const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
	if (!match) {
		throw new Error(`Not a 6-digit hex colour: ${hex}`);
	}
	const value = match[1];
	return {
		r: Number.parseInt(value.slice(0, 2), 16),
		g: Number.parseInt(value.slice(2, 4), 16),
		b: Number.parseInt(value.slice(4, 6), 16),
	};
};

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linearize = (channel: number): number => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (a: Rgb, b: Rgb): number => {
	const lumA = relativeLuminance(a);
	const lumB = relativeLuminance(b);
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
};

/** Pulls the Nth `--token: #hex;` declaration for a css custom property out
 * of app.css source, in source order (1st = :root/light, 2nd = html.dark). */
const nthTokenHex = (token: string, occurrence: number): string => {
	const pattern = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, 'g');
	const matches = [...appCssSource.matchAll(pattern)];
	const match = matches[occurrence];
	if (!match) {
		throw new Error(
			`Expected occurrence ${occurrence} of ${token} in app.css, found ${matches.length}`,
		);
	}
	return match[1];
};

const CONTRAST_FLOOR = 3.0;

const THEMES = [
	{ name: 'light', ringOccurrence: 0, surfaceOccurrence: 0 },
	{ name: 'dark', ringOccurrence: 1, surfaceOccurrence: 1 },
];

const PICKER_DATA: TenantsForPickerData = {
	tenants: [
		{
			id: 'tenant-1',
			name: 'Lattice Cloud',
			code: 'LC',
			status: 'Active',
		},
	],
	activeCount: 1,
	totalCount: 1,
	hasSuspendedTenants: false,
};

const renderActiveRow = () => {
	render(<TenantPortalPickerView data={PICKER_DATA} onSelect={() => {}} />);
	return screen.getByTestId('tenant-portal-row') as HTMLButtonElement;
};

describe('tenant picker row focus indicator', () => {
	afterEach(() => {
		cleanup();
	});

	test('does not fall back to a raw rgb()/rgba() colour function for its focus indicator', () => {
		const row = renderActiveRow();

		// LAW 3 evasion coverage: none of these shapes should ever appear on
		// this row's className, even though `no-raw-visual-color` only catches
		// the first.
		expect(row.className).not.toMatch(/rgba?\(/);
		expect(row.className).not.toMatch(/hsla?\(/);
		expect(row.className).not.toMatch(/oklch\(/);
		expect(row.className).toContain('focus-visible:ring-ring');
	});

	for (const theme of THEMES) {
		test(`renders a >=3:1 contrast focus ring against the card surface in the ${theme.name} theme`, () => {
			const ringHex = nthTokenHex('--publy-focus-ring', theme.ringOccurrence);
			const surfaceHex = nthTokenHex(
				'--publy-surface',
				theme.surfaceOccurrence,
			);

			const ratio = contrastRatio(parseHex(ringHex), parseHex(surfaceHex));

			expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
		});
	}
});
