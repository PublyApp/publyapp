/**
 * @vitest-environment jsdom
 */
import { zodResolver } from '@hookform/resolvers/zod';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { Field } from './fields';
import { Form } from './form';

describe('Field.CheckboxGroup', () => {
	afterEach(() => {
		cleanup();
	});

	const CheckboxGroupWithRHF = () => {
		const methods = useForm({
			resolver: zodResolver(
				z.object({
					roleIds: z.array(z.string()).min(1, 'Pick at least one role'),
				}),
			),
			defaultValues: {
				roleIds: [],
			},
		});

		return (
			<Form methods={methods} onSubmit={methods.handleSubmit(() => undefined)}>
				<Field.CheckboxGroup
					name="roleIds"
					label="Roles"
					options={[
						{ value: 'admin', label: 'Admin' },
						{ value: 'editor', label: 'Editor' },
					]}
				/>
				<button type="submit">Submit</button>
				<output data-testid="selected-role-ids">
					{methods.watch('roleIds').join(',')}
				</output>
			</Form>
		);
	};

	test('shows the field error after submit and renders each option label', async () => {
		render(<CheckboxGroupWithRHF />);

		expect(screen.getByText('Admin')).toBeTruthy();
		expect(screen.getByText('Editor')).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: 'Admin' })).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: 'Editor' })).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => {
			expect(screen.getByText('Pick at least one role')).toBeTruthy();
		});
	});

	test('toggles an option on and off in the RHF array value', async () => {
		render(<CheckboxGroupWithRHF />);

		const adminOption = screen.getByRole('checkbox', { name: 'Admin' });

		fireEvent.click(adminOption);

		await waitFor(() => {
			expect(screen.getByTestId('selected-role-ids').textContent).toBe('admin');
		});

		fireEvent.click(adminOption);

		await waitFor(() => {
			expect(screen.getByTestId('selected-role-ids').textContent).toBe('');
		});
	});

	// shell-r5-F4: the group used to forward no `field.ref`, so RHF's
	// submit-time `setFocus` had nowhere to land, and the group's label was
	// an unrelated `<p>` with no `role`/`aria-labelledby` tying it to the
	// choices or the error text.
	test('RHF focuses the first checkbox on a submit-time validation error', async () => {
		render(<CheckboxGroupWithRHF />);

		fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => {
			expect(document.activeElement).toBe(
				screen.getByRole('checkbox', { name: 'Admin' }),
			);
		});
	});

	test('exposes an accessible group with a name and error association', async () => {
		render(<CheckboxGroupWithRHF />);

		fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const group = await screen.findByRole('group', { name: 'Roles' });
		const error = await screen.findByText('Pick at least one role');

		expect(group.getAttribute('aria-describedby')).toBe(error.id);
		expect(group.getAttribute('aria-invalid')).toBe('true');
	});
});
