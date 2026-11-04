/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { AppErrorView } from './AppErrorView';

afterEach(cleanup);

describe('AppErrorView', () => {
	test('defaults to embedded — a div, not a nested main landmark', () => {
		const { container } = render(
			<AppErrorView icon={<span />} title="Not found" testId="error" />,
		);

		expect(container.querySelector('main')).toBeNull();
		expect(screen.getByTestId('error').tagName).toBe('DIV');
	});

	test('embedded={false} opts into the full-page main landmark', () => {
		const { container } = render(
			<AppErrorView
				icon={<span />}
				title="Not found"
				testId="error"
				embedded={false}
			/>,
		);

		expect(container.querySelector('main')).not.toBeNull();
		expect(screen.getByTestId('error').tagName).toBe('MAIN');
	});

	test('announces page-scale error views assertively (owner decision #2291)', () => {
		render(<AppErrorView icon={<span />} title="Not found" testId="error" />);

		const alert = screen.getByRole('alert');
		expect(alert.getAttribute('aria-live')).toBe('assertive');
		expect(alert.textContent).toContain('Not found');
	});

	test.each([
		['404 — Not Found', 'neutral'],
		['401 — Unauthorized', 'warning'],
		['403 — Forbidden', 'warning'],
		['500 — Server Error', 'danger'],
	])('derives the %s tone from the visible code', (code, tone) => {
		render(
			<AppErrorView icon={<span />} title="Title" code={code} testId="error" />,
		);

		expect(
			screen
				.getByTestId('error')
				.querySelector('.publy-state-icon')
				?.getAttribute('data-tone'),
		).toBe(tone);
	});

	test('defaults an unknown error to the danger tone', () => {
		render(<AppErrorView icon={<span />} title="Title" testId="error" />);

		expect(
			screen
				.getByTestId('error')
				.querySelector('.publy-state-icon')
				?.getAttribute('data-tone'),
		).toBe('danger');
	});

	test('folds raw details under the technical-details disclosure', () => {
		render(
			<AppErrorView
				icon={<span />}
				title="Title"
				details="boom"
				detailsLabel="Technical details"
				testId="error"
			/>,
		);

		const disclosure = screen.getByTestId('error').querySelector('details');
		expect(disclosure?.hasAttribute('open')).toBe(false);
		expect(screen.getByText('Technical details')).toBeTruthy();
		expect(screen.getByText('boom')).toBeTruthy();
	});
});
