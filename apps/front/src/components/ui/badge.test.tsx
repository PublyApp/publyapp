/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Badge, badgeVariants } from './badge';

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
		for (const variant of ['default', 'secondary', 'destructive', 'outline']) {
			expect(badgeVariants({ variant: variant as never })).toMatch(
				/\[a]:hover:/,
			);
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
