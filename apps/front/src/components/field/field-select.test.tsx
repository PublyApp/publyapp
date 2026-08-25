/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => (key === 'select-placeholder' ? 'Select…' : key),
	}),
}));

import { FieldSelect } from './field-select';
import { Form } from './form';

const OPTIONS = [
	{ value: 'a', label: 'Option A' },
	{ value: 'b', label: 'Option B' },
];

const SelectHarness = () => {
	const methods = useForm({ defaultValues: { choice: '' } });

	return (
		<Form methods={methods} onSubmit={methods.handleSubmit(() => undefined)}>
			<FieldSelect name="choice" label="Choice" options={OPTIONS} />
			<button type="button" onClick={() => methods.setFocus('choice')}>
				Focus choice
			</button>
		</Form>
	);
};

describe('FieldSelect', () => {
	afterEach(() => {
		cleanup();
	});

	// r4-shell-F6: FieldSelect wired onBlur but never forwarded field.ref/
	// field.name to its focusable trigger, so RHF's setFocus() (used to move
	// focus to the first invalid field on submit) had no DOM node to focus.
	test('forwards field.ref so RHF setFocus() actually moves focus to the trigger', async () => {
		render(<SelectHarness />);

		const trigger = screen.getByRole('combobox');
		expect(document.activeElement).not.toBe(trigger);

		act(() => {
			screen.getByRole('button', { name: 'Focus choice' }).click();
		});

		// RHF 7.85's setFocus() defers the actual .focus() to a setTimeout(0)
		// macrotask, so the focus lands after the act() above returns — flush
		// one macrotask before asserting (behaviour change vs 7.54, which
		// focused synchronously).
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(document.activeElement).toBe(trigger);
	});

	test('forwards field.name onto the trigger element', () => {
		render(<SelectHarness />);

		expect(screen.getByRole('combobox').getAttribute('name')).toBe('choice');
	});

	test('resolves an undefined placeholder to the localized default', () => {
		render(<SelectHarness />);

		expect(screen.getByText('Select…')).toBeTruthy();
	});
});
