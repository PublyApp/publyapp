/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, test } from 'vitest';

import { FieldSwitch } from './field-switch';
import { Form } from './form';

const SwitchHarness = () => {
	const methods = useForm({ defaultValues: { enabled: false } });

	return (
		<Form methods={methods} onSubmit={methods.handleSubmit(() => undefined)}>
			<FieldSwitch name="enabled" label="Enabled" />
			<button type="button" onClick={() => methods.setFocus('enabled')}>
				Focus enabled
			</button>
		</Form>
	);
};

describe('FieldSwitch', () => {
	afterEach(() => {
		cleanup();
	});

	// r4-shell-F6: FieldSwitch wired onCheckedChange/onBlur but never forwarded
	// field.ref/field.name to the underlying Switch, so RHF's setFocus() (used
	// to move focus to the first invalid field on submit) had no DOM node to
	// focus.
	test('forwards field.ref so RHF setFocus() actually moves focus to the switch', () => {
		render(<SwitchHarness />);

		const toggle = screen.getByRole('switch');
		expect(document.activeElement).not.toBe(toggle);

		act(() => {
			screen.getByRole('button', { name: 'Focus enabled' }).click();
		});

		expect(document.activeElement).toBe(toggle);
	});

	test('forwards field.name onto the switch (or its native form input)', () => {
		const { container } = render(<SwitchHarness />);

		const named = container.querySelector('[name="enabled"]');
		expect(named).not.toBeNull();
	});
});
