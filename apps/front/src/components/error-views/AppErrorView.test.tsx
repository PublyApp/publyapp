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
});
