import { describe, expect, test } from 'vitest';

import { buttonVariants } from './button.variants';

const SIZE_RADIUS_TOKENS = [
	['default', 'var(--publy-radius-medium-control)'],
	['xs', 'var(--publy-radius-chip)'],
	['sm', 'var(--publy-radius-small-control)'],
	['lg', 'var(--publy-radius-control)'],
	['icon', 'var(--publy-radius-medium-control)'],
	['icon-xs', 'var(--publy-radius-chip)'],
	['icon-sm', 'var(--publy-radius-small-control)'],
	['icon-lg', 'var(--publy-radius-control)'],
] as const;

const VARIANT_CHROME_FRAGMENTS = [
	['default', 'bg-primary'],
	['outline', 'bg-background'],
	['secondary', 'bg-secondary'],
	['ghost', 'hover:bg-muted'],
	['destructive', 'bg-(--publy-destructive-soft)'],
	['link', 'text-primary'],
] as const;

describe('buttonVariants', () => {
	test.each(SIZE_RADIUS_TOKENS)(
		'size=%s uses the matching control radius token',
		(size, radiusToken) => {
			expect(buttonVariants({ size })).toContain(radiusToken);
		},
	);

	test.each(VARIANT_CHROME_FRAGMENTS)(
		'variant=%s applies its chrome classes',
		(variant, expectedFragment) => {
			expect(buttonVariants({ variant })).toContain(expectedFragment);
		},
	);
});
