/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { PersonAvatar } from './person-avatar';

afterEach(cleanup);

describe('PersonAvatar', () => {
	test('renders the real avatar through the Image primitive when avatarUrl is present', () => {
		const { container } = render(
			<PersonAvatar
				name="Ada Lovelace"
				avatarUrl="https://example.com/ada.png"
			/>,
		);

		const image = container.querySelector('[data-slot="image"] img');
		expect(image?.getAttribute('src')).toBe('https://example.com/ada.png');
		expect(image?.getAttribute('alt')).toBe('');
	});

	test('renders muted neutral initials when avatarUrl is absent', () => {
		const { container, getByText } = render(
			<PersonAvatar name="Ada Lovelace" avatarUrl={null} />,
		);

		const fallback = getByText('AL');
		expect(fallback.getAttribute('data-slot')).toBe('person-avatar-fallback');
		expect(fallback.className).toContain('bg-muted');
		expect(fallback.className).toContain('text-muted-foreground');
		expect(fallback.getAttribute('data-palette')).toBeNull();
		expect(container.querySelector('img')).toBeNull();
	});

	test('falls back to muted neutral initials when the avatar image fails', () => {
		const { container, getByText } = render(
			<PersonAvatar
				name="Ada Lovelace"
				avatarUrl="https://example.com/broken.png"
			/>,
		);

		const image = container.querySelector('img');
		expect(image).not.toBeNull();
		if (image) {
			fireEvent.error(image);
		}

		expect(container.querySelector('img')).toBeNull();
		expect(getByText('AL').getAttribute('data-slot')).toBe(
			'person-avatar-fallback',
		);
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
