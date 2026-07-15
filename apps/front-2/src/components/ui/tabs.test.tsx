/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Tabs, TabsList, TabsTrigger } from './tabs';

afterEach(cleanup);

/**
 * Base UI's `useButton` defaults `nativeButton` to `true`. When a
 * `TabsTrigger` renders a router `Link` (an `<a>`, not a `<button>`) via
 * `render`, that default makes Space a no-op: it's neither a native
 * `<button>` nor recognised as a link, so the keydown handler
 * `preventDefault()`s the key and returns without doing anything. Enter
 * still "works" only because the anchor's own default browser action
 * (link activation) is never prevented — it isn't handled by Base UI at
 * all. `TabsTrigger` now defaults `nativeButton` to `false` whenever a
 * `render` override is present, which the assertions below exercise.
 */
describe('TabsTrigger Space/Enter activation with a render override', () => {
	test('Space activates the link: click() fires and the key is consumed', () => {
		const onNavigate = vi.fn();

		render(
			<Tabs value="overview">
				<TabsList>
					<TabsTrigger value="overview" render={<a href="/overview" />}>
						Overview
					</TabsTrigger>
					<TabsTrigger
						value="permissions"
						render={
							<a
								href="/permissions"
								onClick={(event) => {
									event.preventDefault();
									onNavigate();
								}}
							/>
						}
					>
						Permissions
					</TabsTrigger>
				</TabsList>
			</Tabs>,
		);

		const permissionsTab = screen.getByRole('tab', { name: 'Permissions' });
		permissionsTab.focus();

		const notCancelled = fireEvent.keyDown(permissionsTab, { key: ' ' });

		expect(notCancelled).toBe(false);
		expect(onNavigate).toHaveBeenCalledTimes(1);
	});

	test('Enter is left to the anchor default action, not swallowed by Base UI', () => {
		const onNavigate = vi.fn();

		render(
			<Tabs value="overview">
				<TabsList>
					<TabsTrigger value="overview" render={<a href="/overview" />}>
						Overview
					</TabsTrigger>
					<TabsTrigger
						value="permissions"
						render={
							<a
								href="/permissions"
								onClick={(event) => {
									event.preventDefault();
									onNavigate();
								}}
							/>
						}
					>
						Permissions
					</TabsTrigger>
				</TabsList>
			</Tabs>,
		);

		const permissionsTab = screen.getByRole('tab', { name: 'Permissions' });
		permissionsTab.focus();

		const notCancelled = fireEvent.keyDown(permissionsTab, { key: 'Enter' });

		// Base UI does not preventDefault() or synthesize a click for Enter on
		// a link render target — it relies entirely on the browser's native
		// "Enter activates the focused link" behaviour, which jsdom doesn't
		// simulate from a synthetic keydown. Not cancelled + no synthetic
		// click is exactly what keeps that native fallback alive.
		expect(notCancelled).toBe(true);
		expect(onNavigate).not.toHaveBeenCalled();
	});

	test('regression guard: forcing nativeButton back to true swallows Space again', () => {
		const onNavigate = vi.fn();

		render(
			<Tabs value="overview">
				<TabsList>
					<TabsTrigger value="overview" render={<a href="/overview" />}>
						Overview
					</TabsTrigger>
					<TabsTrigger
						value="permissions"
						nativeButton
						render={
							<a
								href="/permissions"
								onClick={(event) => {
									event.preventDefault();
									onNavigate();
								}}
							/>
						}
					>
						Permissions
					</TabsTrigger>
				</TabsList>
			</Tabs>,
		);

		const permissionsTab = screen.getByRole('tab', { name: 'Permissions' });
		permissionsTab.focus();

		fireEvent.keyDown(permissionsTab, { key: ' ' });

		expect(onNavigate).not.toHaveBeenCalled();
	});
});
