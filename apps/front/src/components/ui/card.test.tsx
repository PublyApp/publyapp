/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Card, CardAction, CardContent, CardFooter, CardHeader } from './card';

afterEach(cleanup);

describe('Card', () => {
	test('defaults to data-size="default" and the default gap/padding classes', () => {
		render(<Card data-testid="card">content</Card>);

		const card = screen.getByTestId('card');
		expect(card.getAttribute('data-size')).toBe('default');
		expect(card.className).toContain('gap-6');
		expect(card.className).toContain('py-6');
	});

	// r3 F11: `size="sm"` drives `group-data-[size=sm]/card:*` on five child
	// components through a `group/card` container query — one broken
	// `data-size` attribute silently reverts every card's padding, and
	// nothing pinned it.
	test('size="sm" sets data-size and every child slot carries its group-data-[size=sm] class', () => {
		render(
			<Card data-testid="card" size="sm">
				<CardHeader data-testid="header">header</CardHeader>
				<CardContent data-testid="content">content</CardContent>
				<CardFooter data-testid="footer">footer</CardFooter>
				<CardAction data-testid="action">action</CardAction>
			</Card>,
		);

		expect(screen.getByTestId('card').getAttribute('data-size')).toBe('sm');
		expect(screen.getByTestId('header').className).toContain(
			'group-data-[size=sm]/card:px-4',
		);
		expect(screen.getByTestId('content').className).toContain(
			'group-data-[size=sm]/card:px-4',
		);
		expect(screen.getByTestId('footer').className).toContain(
			'group-data-[size=sm]/card:px-4',
		);
		// CardAction has no size-dependent classes of its own — confirms it's
		// deliberately exempt, not silently missing the pattern.
		expect(screen.getByTestId('action').className).not.toContain(
			'group-data-[size=sm]',
		);
	});

	test('every card slot carries its data-slot marker', () => {
		render(
			<Card>
				<CardHeader data-testid="header">header</CardHeader>
				<CardContent data-testid="content">content</CardContent>
				<CardFooter data-testid="footer">footer</CardFooter>
			</Card>,
		);

		expect(screen.getByTestId('header').getAttribute('data-slot')).toBe(
			'card-header',
		);
		expect(screen.getByTestId('content').getAttribute('data-slot')).toBe(
			'card-content',
		);
		expect(screen.getByTestId('footer').getAttribute('data-slot')).toBe(
			'card-footer',
		);
	});
});
