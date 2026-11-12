/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { LocalizedTimeInput } from './localized-time-input';

afterEach(cleanup);

const renderInput = (locale: string, onInvalid = vi.fn()) =>
	render(
		<LocalizedTimeInput
			locale={locale}
			value="22:30"
			ariaLabel="Time"
			errorMessage="Invalid time"
			testId="time"
			onChange={vi.fn()}
			onInvalid={onInvalid}
		/>,
	);

describe('LocalizedTimeInput (#2410)', () => {
	test('shows 24 h in French and 12 h in English', () => {
		renderInput('fr');
		expect((screen.getByTestId('time') as HTMLInputElement).value).toBe(
			'22:30',
		);
		cleanup();
		renderInput('en');
		expect((screen.getByTestId('time') as HTMLInputElement).value).toBe(
			'10:30 PM',
		);
	});

	test('an invalid entry shows its message and calls onInvalid', () => {
		const onInvalid = vi.fn();
		renderInput('fr', onInvalid);
		const field = screen.getByTestId('time');
		fireEvent.change(field, { target: { value: '25:99' } });
		fireEvent.blur(field);
		expect(onInvalid).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('alert').textContent).toContain('Invalid time');
	});
});
