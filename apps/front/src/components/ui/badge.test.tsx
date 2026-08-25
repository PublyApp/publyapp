/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Badge } from './badge';
import { badgeVariants } from './badge.variants';

afterEach(cleanup);

const VARIANT_CHROME_FRAGMENTS = [
	['default', 'bg-primary'],
	['secondary', 'bg-secondary'],
	['destructive', 'bg-destructive/10'],
	['outline', 'border-border'],
	['ghost', 'hover:bg-muted'],
	['link', 'text-primary'],
] as const;

describe('badgeVariants', () => {
	test.each(VARIANT_CHROME_FRAGMENTS)(
		'variant=%s applies its chrome classes',
		(variant, expectedFragment) => {
			expect(badgeVariants({ variant })).toContain(expectedFragment);
		},
	);

	// r3 F11: the `[a]:hover:*` variants only take effect when the badge
	// renders as an anchor via `render` — nothing pinned that they exist at
	// all, or that a plain <span> badge doesn't carry them as dead classes.
	test('every non-link, non-ghost variant carries an [a]:hover: fragment for anchor rendering', () => {
		const anchorVariants = [
			'default',
			'secondary',
			'destructive',
			'outline',
		] as const;
		for (const variant of anchorVariants) {
			expect(badgeVariants({ variant })).toMatch(/\[a]:hover:/);
		}
	});
});

describe('Badge', () => {
	test('renders as a span by default with the badge slot', () => {
		render(<Badge>New</Badge>);

		const badge = screen.getByText('New');
		expect(badge.tagName).toBe('SPAN');
		expect(badge.getAttribute('data-slot')).toBe('badge');
	});

	test('renders through `render` as an anchor, applying the [a]:hover classes', () => {
		render(<Badge render={<a href="/tenants" />}>Tenants</Badge>);

		const badge = screen.getByText('Tenants');
		expect(badge.tagName).toBe('A');
		expect(badge.className).toMatch(/\[a]:hover:/);
	});
});

// #1405: pins the focus-style scoping decision. A plain <span> badge is
// unfocusable, so `:focus-visible` can never match it and focus styling on
// the base cva is dead weight for every status-chip consumer; the only
// focusable form is the badge-as-link pattern (`render={<a href/>}`, the
// exact shape the focus-ring cascade guard probes). The outline therefore
// lives behind the `[a]:` variant, while the box-shadow ring itself stays on
// the base cva because DESIGN.md ("Focus rings") documents badge.tsx as a
// 3px-ring component with the width set per component IN ITS CVA. No copy is
// involved, so both locales are unaffected by construction.
describe('Badge focus styles (#1405)', () => {
	test('a plain <span> badge carries no unscoped focus-visible outline utility', () => {
		render(<Badge>New</Badge>);

		const badge = screen.getByText('New');
		// The class string carries the utilities for every element (the
		// scoping lives in the compiled selector), so the pin is: every
		// outline utility present must be behind the `[a]:` variant.
		const unscoped = badge.className
			.split(/\s+/)
			.filter(
				(cls) =>
					cls.includes('focus-visible:outline') && !cls.startsWith('[a]:'),
			);
		expect(unscoped).toEqual([]);
	});

	test('the badge-as-link pattern pins the token outline at the contractual 2px', () => {
		render(<Badge render={<a href="/tenants" />}>Tenants</Badge>);

		const badge = screen.getByText('Tenants');
		expect(badge.tagName).toBe('A');
		expect(badge.className).toMatch(/\[a]:focus-visible:outline-2/);
		expect(badge.className).toMatch(/\[a]:focus-visible:outline-ring/);
	});

	test('every variant keeps the 3px box-shadow focus ring on the base cva', () => {
		for (const variant of [
			'default',
			'secondary',
			'destructive',
			'outline',
			'ghost',
			'link',
		] as const) {
			const classes = badgeVariants({ variant });
			expect(classes).toContain('focus-visible:border-ring');
			expect(classes).toContain('focus-visible:ring-[3px]');
			expect(classes).toContain('focus-visible:ring-ring');
		}
	});
});
