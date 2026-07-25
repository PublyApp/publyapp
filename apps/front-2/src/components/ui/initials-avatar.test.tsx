/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	AvatarStack,
	BrandTile,
	paletteIndex,
	toInitials,
} from './initials-avatar';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			options ? `${key}:${JSON.stringify(options)}` : key,
	}),
}));

afterEach(cleanup);

describe('toInitials', () => {
	test('takes the first letter of the first and last words', () => {
		expect(toInitials('Ada Lovelace')).toBe('AL');
	});

	test('falls back to a single letter for a one-word name', () => {
		expect(toInitials('Ada')).toBe('A');
	});

	test('returns a placeholder for a blank name', () => {
		expect(toInitials('   ')).toBe('?');
	});

	test('handles astral-plane first characters without a lone surrogate', () => {
		expect(toInitials('😀 Lovelace')).toBe('😀L');
	});

	test('does not expand uppercase conversion into a multi-symbol output', () => {
		expect(toInitials('ß ß')).toBe('SS');
	});
});

describe('paletteIndex', () => {
	test('is deterministic for the same seed', () => {
		expect(paletteIndex('Ada Lovelace')).toBe(paletteIndex('Ada Lovelace'));
	});

	test('stays within the 8-slot palette range', () => {
		for (const seed of ['a', 'bb', 'Acme Inc', '', '😀']) {
			const index = paletteIndex(seed);
			expect(index).toBeGreaterThanOrEqual(1);
			expect(index).toBeLessThanOrEqual(8);
		}
	});
});

describe('AvatarStack', () => {
	// F8: every visual avatar in the stack is aria-hidden, so the stack's
	// identities must still reach assistive tech through the container.
	test('exposes the member names through an aria-label on the stack container', () => {
		const { container } = render(
			<AvatarStack
				people={[
					{
						name: 'Ada Lovelace',
						avatarUrl: 'https://example.com/ada.png',
					},
					{ name: 'Grace Hopper', avatarUrl: null },
				]}
			/>,
		);

		const stack = container.querySelector('.publy-avatar-stack');
		expect(stack?.getAttribute('role')).toBe('img');
		expect(stack?.getAttribute('aria-label')).toContain('Ada Lovelace');
		expect(stack?.getAttribute('aria-label')).toContain('Grace Hopper');
		expect(container.querySelector('img')?.getAttribute('src')).toBe(
			'https://example.com/ada.png',
		);
		expect(
			container.querySelector('[data-slot="person-avatar-fallback"]'),
		).not.toBeNull();
		expect(container.querySelector('[data-palette]')).toBeNull();
	});

	test('renders nothing for an empty name list', () => {
		const { container } = render(<AvatarStack people={[]} />);

		expect(container.querySelector('.publy-avatar-stack')).toBeNull();
	});
});

describe('BrandTile', () => {
	test('falls back to hashed initials when the logo image fails to load', () => {
		const { container } = render(
			<BrandTile name="Acme Inc" logoUrl="https://example.com/logo.png" />,
		);

		const image = container.querySelector('img');
		expect(image).not.toBeNull();
		if (image) {
			fireEvent.error(image);
		}

		expect(container.querySelector('img')).toBeNull();
		expect(screen.getByText('AI')).toBeTruthy();
	});

	// r3 F12: reset-by-identity (`key={logoUrl}`) — a new logoUrl after a
	// previous one failed must retry the image instead of staying stuck on
	// the initials fallback forever.
	test('a new logoUrl after a previous failure retries the image (reset by identity)', () => {
		const { container, rerender } = render(
			<BrandTile name="Acme Inc" logoUrl="https://example.com/old.png" />,
		);

		const firstImage = container.querySelector('img');
		expect(firstImage).not.toBeNull();
		if (firstImage) {
			fireEvent.error(firstImage);
		}
		expect(container.querySelector('img')).toBeNull();

		rerender(
			<BrandTile name="Acme Inc" logoUrl="https://example.com/new.png" />,
		);

		const secondImage = container.querySelector('img');
		expect(secondImage).not.toBeNull();
		expect(secondImage?.getAttribute('src')).toBe(
			'https://example.com/new.png',
		);
	});
});
