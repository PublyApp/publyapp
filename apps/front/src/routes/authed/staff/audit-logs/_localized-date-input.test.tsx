/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { LocalizedDateInput } from './_localized-date-input';

const ERROR_MESSAGE = 'Saisissez une date valide.';

const Harness = ({
	onChange,
	initialValue = '2026-11-02',
	max,
}: {
	onChange: (value: string | undefined) => void;
	initialValue?: string;
	max?: string;
}) => {
	const [value, setValue] = useState<string | undefined>(initialValue);

	return (
		<LocalizedDateInput
			locale="fr"
			ariaLabel="Date de début"
			errorMessage={ERROR_MESSAGE}
			testId="date-input"
			value={value}
			max={max}
			onChange={(next) => {
				onChange(next);
				setValue(next);
			}}
		/>
	);
};

const getInput = (): HTMLInputElement =>
	screen.getByTestId('date-input') as HTMLInputElement;

afterEach(cleanup);

describe('LocalizedDateInput (#2291 M8)', () => {
	test('keeps focus in the field when clearing the value', () => {
		const onChange = vi.fn();
		render(<Harness onChange={onChange} />);

		const input = getInput();
		input.focus();
		expect(document.activeElement).toBe(input);

		fireEvent.change(input, { target: { value: '' } });

		expect(onChange).toHaveBeenLastCalledWith(undefined);
		expect(getInput()).toBe(input);
		expect(document.activeElement).toBe(input);
	});

	test('shows a visible, associated error for an unparseable date', () => {
		const onChange = vi.fn();
		render(<Harness onChange={onChange} />);

		const input = getInput();
		fireEvent.change(input, { target: { value: '31/02/2026' } });
		fireEvent.blur(input);

		expect(onChange).not.toHaveBeenCalled();
		expect(input.getAttribute('aria-invalid')).toBe('true');
		const errorId = input.getAttribute('aria-errormessage');
		expect(errorId).toBeTruthy();
		expect(document.getElementById(errorId ?? '')).toBeTruthy();
		expect(screen.getByText(ERROR_MESSAGE)).toBeTruthy();
	});

	test('shows the same error for an out-of-range date', () => {
		const onChange = vi.fn();
		render(<Harness onChange={onChange} max="2026-11-02" />);

		const input = getInput();
		fireEvent.change(input, { target: { value: '03/11/2026' } });
		fireEvent.blur(input);

		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByText(ERROR_MESSAGE)).toBeTruthy();
	});

	test('follows an external value change instead of keeping a stale draft', () => {
		const { rerender } = render(
			<LocalizedDateInput
				locale="fr"
				ariaLabel="Date de début"
				errorMessage={ERROR_MESSAGE}
				testId="date-input"
				value="2026-11-02"
				onChange={() => undefined}
			/>,
		);

		rerender(
			<LocalizedDateInput
				locale="fr"
				ariaLabel="Date de début"
				errorMessage={ERROR_MESSAGE}
				testId="date-input"
				value="2026-12-24"
				onChange={() => undefined}
			/>,
		);

		expect(getInput().value).toBe('24/12/2026');
	});

	test('commits a valid locale date to ISO and clears the error', () => {
		const onChange = vi.fn();
		render(<Harness onChange={onChange} />);

		const input = getInput();
		fireEvent.change(input, { target: { value: '03/11/2026' } });
		fireEvent.blur(input);

		expect(onChange).toHaveBeenCalledWith('2026-11-03');
		expect(getInput().value).toBe('03/11/2026');
		expect(screen.queryByText(ERROR_MESSAGE)).toBeNull();
	});
});
