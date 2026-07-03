import { zodResolver } from '@hookform/resolvers/zod';
/**
 * @vitest-environment jsdom
 */
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
import { createI18nFromResources } from '~/lib/i18n.shared';
import { buildI18nResources } from '~/lib/i18n.shared';

import InterZod from '@org/shared-ts/lib/zod/InterZod';

import { Field } from './fields';
import { Form } from './form';

const configureInterZodLocale = async (locale: 'en' | 'fr') => {
	const resources = await buildI18nResources(locale);
	const i18n = createI18nFromResources(locale, resources);
	const interZod = new InterZod({
		i18n: {
			getFixedT: i18n.getFixedT.bind(i18n),
			t: i18n.t.bind(i18n) as never,
		},
		locale,
	});

	z.setErrorMap(interZod.getErrorMap());
};

describe('Field API', () => {
	test('exposes mirrored Field.Text and Field.Email helpers', () => {
		expect(Field.Text).toBeDefined();
		expect(typeof Field.Text).toBe('function');
		expect(Field.Email).toBeDefined();
		expect(typeof Field.Email).toBe('function');
	});
});

describe('Field Text components wire error text to aria-describedby', () => {
	afterEach(() => {
		cleanup();
	});

	const FieldTextWithRHF = ({
		useEmailComponent,
	}: {
		useEmailComponent: boolean;
	}) => {
		const methods = useForm({
			resolver: zodResolver(
				z.object({
					email: z.string().email(),
				}),
			),
			defaultValues: {
				email: '',
			},
		});

		return (
			<div>
				<Form
					methods={methods}
					onSubmit={methods.handleSubmit(() => undefined)}
				>
					{useEmailComponent ? (
						<Field.Email
							name="email"
							label="Email"
							placeholder="name@company.com"
							required
						/>
					) : (
						<Field.Text
							name="email"
							label="Email"
							placeholder="name@company.com"
							required
						/>
					)}
					<button type="submit">Submit</button>
				</Form>
			</div>
		);
	};

	test('FieldText exposes validation errors with RAC field context wiring', async () => {
		render(<FieldTextWithRHF useEmailComponent={false} />);

		const input = screen.getByRole('textbox', { name: 'Email' });
		const submitButton = screen.getByRole('button', { name: 'Submit' });

		fireEvent.change(input, { target: { value: 'invalid-email' } });
		fireEvent.click(submitButton);

		const errorText = await waitFor(() =>
			screen.getByText(/Invalid email|e-mail non valide/),
		);
		expect(errorText).toBeTruthy();
		expect(input.getAttribute('aria-invalid')).toBe('true');

		const describedBy = input.getAttribute('aria-describedby');
		expect(describedBy).toContain(errorText.id);
	});

	test('FieldEmail passes label through FieldText composition and shows validation error', async () => {
		render(<FieldTextWithRHF useEmailComponent />);

		const input = screen.getByRole('textbox', { name: 'Email' });
		const submitButton = screen.getByRole('button', { name: 'Submit' });

		fireEvent.change(input, { target: { value: 'invalid-email' } });
		fireEvent.click(submitButton);

		expect(input.getAttribute('autocomplete')).toBe('email');

		const errorText = await waitFor(() =>
			screen.getByText(/Invalid email|e-mail non valide/),
		);
		expect(errorText).toBeTruthy();
		expect(input.getAttribute('aria-describedby')).toContain(errorText.id);
	});
});

describe('InterZod localization via zodResolver-compatible schema setup', () => {
	test('validates email with localized English message', async () => {
		await configureInterZodLocale('en');

		const schema = z.object({
			email: z.string().email(),
		});

		const result = schema.safeParse({ email: 'not-an-email' });

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe('Invalid email');
	});

	test('validates email with localized French message', async () => {
		await configureInterZodLocale('fr');

		const schema = z.object({
			email: z.string().email(),
		});

		const result = schema.safeParse({ email: 'not-an-email' });

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe('e-mail non valide');
	});
});
