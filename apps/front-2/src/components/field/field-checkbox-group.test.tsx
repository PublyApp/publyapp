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
					profileIds: z.array(z.string()).min(1, 'Pick at least one profile'),
				}),
			),
			defaultValues: {
				profileIds: [],
			},
		});

		return (
			<Form methods={methods} onSubmit={methods.handleSubmit(() => undefined)}>
				<Field.CheckboxGroup
					name="profileIds"
					label="Profiles"
					options={[
						{ value: 'admin', label: 'Admin' },
						{ value: 'editor', label: 'Editor' },
					]}
				/>
				<button type="submit">Submit</button>
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
			expect(screen.getByText('Pick at least one profile')).toBeTruthy();
		});
	});
});
