/**
 * @vitest-environment jsdom
 */
import { IconSearchOff } from '@tabler/icons-react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { AppErrorView } from '~/components/error-views/AppErrorView';

import {
	ErrorStateSurface,
	NoMatchStateSurface,
	StateSurface,
} from './state-surface';

afterEach(cleanup);

describe('state-surface', () => {
	test('renders a default neutral surface and title', () => {
		render(
			<StateSurface
				title="No records yet"
				description="Add one to continue."
				testId="surface"
			/>,
		);
		expect(screen.getByText('No records yet')).toBeTruthy();
		expect(screen.getByText('Add one to continue.')).toBeTruthy();
		expect(screen.getByTestId('surface')).toBeTruthy();
		expect(
			screen
				.getByTestId('surface')
				.querySelector('.publy-state-icon')
				?.getAttribute('data-tone'),
		).toBe('neutral');
	});

	test('renders a danger-toned error surface and keeps technical identifiers in mono style', () => {
		render(
			<ErrorStateSurface
				title="List unavailable"
				description="Unable to load."
				technicalIdentifier="error-id-001"
				testId="error-surface"
			/>,
		);
		expect(screen.getByText('error-id-001')).toBeTruthy();
		expect(screen.getByText('List unavailable')).toBeTruthy();
		expect(screen.getByTestId('error-surface')).toBeTruthy();
		expect(screen.getByTestId('error-surface').getAttribute('data-tone')).toBe(
			'danger',
		);
		expect(
			screen
				.getByTestId('error-surface')
				.querySelector('.publy-state-icon')
				?.getAttribute('data-tone'),
		).toBe('danger');
		expect(screen.getByText('error-id-001').className).toContain(
			'publy-state-technical-id',
		);
	});

	test('renders no-match with the search-off icon surface tone', () => {
		render(
			<NoMatchStateSurface
				title="No matches"
				description="Try another query."
				testId="nomatch"
			/>,
		);
		expect(screen.getByText('No matches')).toBeTruthy();
		expect(screen.getByTestId('nomatch')).toBeTruthy();
		expect(
			screen
				.getByTestId('nomatch')
				.querySelector('.publy-state-icon')
				?.getAttribute('data-tone'),
		).toBe('primary');
	});

	test('hides the decorative glyph cluster from assistive tech', () => {
		render(
			<StateSurface
				title="No records yet"
				description="Add one to continue."
				testId="surface"
			/>,
		);
		const cluster = screen
			.getByTestId('surface')
			.querySelector('.publy-state-icon-cluster');
		expect(cluster?.getAttribute('aria-hidden')).toBe('true');
	});

	test('renders the icon bare, with no wash or ring layers (flat, owner-approved 2026-07-10 round 2)', () => {
		render(
			<StateSurface
				title="No records yet"
				description="Add one to continue."
				testId="surface"
			/>,
		);
		const root = screen.getByTestId('surface');
		expect(root.querySelector('.publy-state-icon-wash')).toBeNull();
		expect(root.querySelector('.publy-state-icon-ring')).toBeNull();
	});

	test('valorizes the icon at inline scale — no backing, cluster carries data-scale="inline" (owner-approved 2026-07-10 round 3)', () => {
		render(
			<StateSurface
				title="No records yet"
				description="Add one to continue."
				testId="surface"
			/>,
		);
		const cluster = screen
			.getByTestId('surface')
			.querySelector('.publy-state-icon-cluster');
		expect(cluster?.getAttribute('data-scale')).toBe('inline');
	});

	test('the ghost numeral and error-hero clip are gone (owner-approved 2026-07-10 round 3)', () => {
		render(
			<StateSurface
				title="No records yet"
				description="Add one to continue."
				testId="surface"
			/>,
		);
		const root = screen.getByTestId('surface');
		expect(root.querySelector('.publy-error-hero')).toBeNull();
		expect(root.querySelector('.publy-error-ghost-numeral')).toBeNull();
	});

	test('AppErrorView renders the same icon-cluster/state-icon primitive as StateSurface, at page scale (owner-approved 2026-07-10 round 3)', () => {
		render(
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" />}
				title="Page not found"
				code="404 — Not Found"
				testId="app-error-view"
			/>,
		);
		const root = screen.getByTestId('app-error-view');
		const cluster = root.querySelector('.publy-state-icon-cluster');
		expect(cluster?.getAttribute('data-scale')).toBe('page');
		expect(cluster?.getAttribute('data-tone')).toBe('neutral');
		expect(root.querySelector('.publy-state-icon')).not.toBeNull();
		expect(root.querySelector('.publy-error-hero')).toBeNull();
		expect(root.querySelector('.publy-error-ghost-numeral')).toBeNull();
	});

	test('AppErrorView renders actions without a separator rule above them (owner-approved 2026-07-10 round 3)', () => {
		render(
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" />}
				title="Page not found"
				testId="app-error-view"
				actions={<button type="button">Go to home</button>}
			/>,
		);
		const actionsWrap = screen.getByRole('button', {
			name: 'Go to home',
		}).parentElement;
		expect(actionsWrap?.className).not.toContain('border-t');
	});
});
