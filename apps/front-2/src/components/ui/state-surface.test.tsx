/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

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
		).toBe('neutral');
	});
});
