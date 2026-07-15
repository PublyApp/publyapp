/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import {
	Avatar,
	AvatarBadge,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
} from './avatar';

afterEach(cleanup);

describe('Avatar', () => {
	test('renders root, image, and fallback with data-slot markers', () => {
		const { container } = render(
			<Avatar>
				<AvatarImage src="https://example.com/avatar.png" />
				<AvatarFallback>AB</AvatarFallback>
			</Avatar>,
		);

		const root = container.querySelector('[data-slot="avatar"]');
		expect(root?.getAttribute('data-size')).toBe('default');
		expect(screen.getByText('AB').getAttribute('data-slot')).toBe(
			'avatar-fallback',
		);
	});
});

describe('AvatarGroup', () => {
	test('renders grouped avatars and fallback count node markers', () => {
		const { container } = render(
			<AvatarGroup>
				<Avatar data-size="sm" />
				<AvatarGroupCount aria-label="count">+1</AvatarGroupCount>
			</AvatarGroup>,
		);

		const group = container.querySelector('[data-slot="avatar-group"]');
		expect(group).not.toBeNull();
		expect(container.querySelector('[data-slot="avatar"]')).not.toBeNull();
		expect(screen.getByText('+1').getAttribute('data-slot')).toBe(
			'avatar-group-count',
		);
	});
});

describe('AvatarBadge', () => {
	test('renders in the expected role and slot', () => {
		const { container } = render(
			<Avatar>
				<AvatarBadge />
			</Avatar>,
		);

		const badge = container.querySelector('[data-slot="avatar-badge"]');
		expect(badge).not.toBeNull();
	});
});
