/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MockImage } from './avatar.test-helper';
import { PersonAvatar } from './person-avatar';

beforeEach(() => {
	MockImage.instances = [];
	vi.stubGlobal('Image', MockImage);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('PersonAvatar', () => {
	test('renders the real avatar through the shared Avatar primitives when avatarUrl is present', () => {
		const { container } = render(
			<PersonAvatar
				name="Ada Lovelace"
				avatarUrl="https://example.com/ada.png"
			/>,
		);

		expect(MockImage.instances).toHaveLength(1);
		expect(MockImage.instances[0]?.src).toBe('https://example.com/ada.png');

		act(() => MockImage.instances[0]?.onload?.());

		const image = container.querySelector('[data-slot="avatar-image"]');
		expect(image?.getAttribute('src')).toBe('https://example.com/ada.png');
		expect(image?.getAttribute('alt')).toBe('');
		expect(image?.className).toContain('aspect-square');
	});

	test('renders name-hashed palette initials when avatarUrl is absent', () => {
		const { container, getByText } = render(
			<PersonAvatar name="Ada Lovelace" avatarUrl={null} />,
		);

		const fallback = getByText('AL');
		expect(fallback.getAttribute('data-slot')).toBe('person-avatar-fallback');
		expect(fallback.className).toContain('publy-avatar-initials');
		expect(fallback.className).toContain(
			'text-[var(--publy-avatar-foreground)]',
		);
		expect(fallback.className).not.toContain('foreground-secondary');
		expect(fallback.className).not.toContain('text-muted-foreground');
		expect(fallback.getAttribute('data-palette')).toBe('7');
		expect(container.querySelector('img')).toBeNull();
	});

	test('falls back to name-hashed palette initials when the avatar image fails', () => {
		const { container, getByText } = render(
			<PersonAvatar
				name="Ada Lovelace"
				avatarUrl="https://example.com/broken.png"
			/>,
		);

		expect(MockImage.instances).toHaveLength(1);
		expect(MockImage.instances[0]?.src).toBe('https://example.com/broken.png');

		act(() => MockImage.instances[0]?.onerror?.());

		expect(container.querySelector('[data-slot="avatar-image"]')).toBeNull();
		const fallback = getByText('AL');
		expect(fallback.getAttribute('data-slot')).toBe('person-avatar-fallback');
		expect(fallback.getAttribute('data-palette')).toBe('7');
	});

	test('is decorative by default but can expose an accessible name when standalone', () => {
		const { rerender } = render(
			<PersonAvatar
				name="Ada Lovelace"
				avatarUrl="https://example.com/ada.png"
			/>,
		);

		expect(screen.queryByRole('img')).toBeNull();

		rerender(
			<PersonAvatar
				name="Ada Lovelace"
				avatarUrl="https://example.com/ada.png"
				accessibleLabel="Ada Lovelace profile photo"
			/>,
		);

		expect(
			screen.getByRole('img', { name: 'Ada Lovelace profile photo' }),
		).toBeTruthy();
	});

	test('supports the existing person-avatar size variants', () => {
		const { container } = render(
			<PersonAvatar name="Ada Lovelace" avatarUrl={null} size="lg" />,
		);

		expect(
			container.querySelector('[data-slot="person-avatar"]')?.className,
		).toContain('size-14');
	});
});
