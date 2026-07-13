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
			<AvatarStack names={['Ada Lovelace', 'Grace Hopper']} />,
		);

		const stack = container.querySelector('.publy-avatar-stack');
		expect(stack?.getAttribute('role')).toBe('img');
		expect(stack?.getAttribute('aria-label')).toContain('Ada Lovelace');
		expect(stack?.getAttribute('aria-label')).toContain('Grace Hopper');
	});

	test('renders nothing for an empty name list', () => {
		const { container } = render(<AvatarStack names={[]} />);

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
});
