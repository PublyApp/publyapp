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

import sharedEn from '@org/shared-ts/lib/i18n/locales/en';
import sharedFr from '@org/shared-ts/lib/i18n/locales/fr';
import InterZod from '@org/shared-ts/lib/zod/InterZod';

import { Field } from './fields';
import { Form } from './form';

const zodResources = { en: sharedEn.zod, fr: sharedFr.zod } as const;

const configureInterZodLocale = (locale: 'en' | 'fr') => {
	const i18n = createI18nFromResources(locale, ['zod'], {
		[locale]: { zod: zodResources[locale] },
	});
	const interZod = new InterZod({
		i18n: {
			getFixedT: i18n.getFixedT.bind(i18n),
			t: i18n.t.bind(i18n),
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

describe('Field error and helper line contracts (handoff 2d)', () => {
	afterEach(() => {
		cleanup();
	});

	const HelperAndErrorForm = () => {
		const methods = useForm({
			resolver: zodResolver(
				z.object({
					email: z.string().email(),
					name: z.string(),
				}),
			),
			defaultValues: { email: '', name: '' },
		});

		return (
			<Form methods={methods} onSubmit={methods.handleSubmit(() => undefined)}>
				<Field.Text name="email" label="Email" required />
				<Field.Text name="name" label="Name" helperText="Shown on invoices" />
				<button type="submit">Submit</button>
			</Form>
		);
	};

	test('invalid field renders an iconed error line, valid helper stays muted', async () => {
		render(<HelperAndErrorForm />);

		const helper = screen.getByText('Shown on invoices');
		expect(helper.getAttribute('data-slot')).toBe('field-helper');
		expect(helper.querySelector('svg')).toBeNull();

		fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
			target: { value: 'not-an-email' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const errorLine = await waitFor(() => {
			const line = document.querySelector('[data-slot="field-error"]');
			if (!line) {
				throw new Error('field error line not rendered');
			}
			return line;
		});
		expect(errorLine.textContent).toMatch(/Invalid email|e-mail non valide/);
		expect(errorLine.querySelector('svg')).not.toBeNull();
	});
});

describe('Field.Switch (handoff switch rows)', () => {
	afterEach(() => {
		cleanup();
	});

	const SwitchForm = ({
		onSubmitValues,
	}: {
		onSubmitValues: (values: { requireSso: boolean }) => void;
	}) => {
		const methods = useForm({
			defaultValues: { requireSso: false },
		});

		return (
			<Form
				methods={methods}
				onSubmit={methods.handleSubmit((values) => {
					onSubmitValues(values);
				})}
			>
				<Field.Switch
					name="requireSso"
					label="Require SSO"
					description="Members must sign in with your identity provider."
				/>
				<button type="submit">Submit</button>
			</Form>
		);
	};

	test('renders a switch row and writes the toggled value into the form', async () => {
		const submitted: Array<{ requireSso: boolean }> = [];
		render(<SwitchForm onSubmitValues={(values) => submitted.push(values)} />);

		const row = document.querySelector('[data-slot="field-switch-row"]');
		expect(row).not.toBeNull();
		expect(
			screen.getByText('Members must sign in with your identity provider.'),
		).toBeTruthy();

		fireEvent.click(screen.getByRole('switch', { name: 'Require SSO' }));
		fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => {
			expect(submitted).toHaveLength(1);
		});
		expect(submitted[0]?.requireSso).toBe(true);
	});
});

describe('Field.Select (handoff select trigger)', () => {
	afterEach(() => {
		cleanup();
	});

	const SelectForm = () => {
		const methods = useForm({ defaultValues: { role: '' } });

		return (
			<Form methods={methods} onSubmit={methods.handleSubmit(() => undefined)}>
				<Field.Select
					name="role"
					label="Role"
					placeholder="Choose a role"
					options={[
						{ value: 'admin', label: 'Admin' },
						{ value: 'editor', label: 'Editor' },
					]}
				/>
			</Form>
		);
	};

	test('renders a labelled select trigger with placeholder', () => {
		render(<SelectForm />);

		const trigger = document.querySelector('[data-slot="select-trigger"]');
		expect(trigger).not.toBeNull();
		expect(screen.getByText('Role')).toBeTruthy();
		expect(screen.getByText('Choose a role')).toBeTruthy();
	});
});

describe('InterZod localization via zodResolver-compatible schema setup', () => {
	test('validates email with localized English message', async () => {
		configureInterZodLocale('en');

		const schema = z.object({
			email: z.string().email(),
		});

		const result = schema.safeParse({ email: 'not-an-email' });

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe('Invalid email');
	});

	test('validates email with localized French message', async () => {
		configureInterZodLocale('fr');

		const schema = z.object({
			email: z.string().email(),
		});

		const result = schema.safeParse({ email: 'not-an-email' });

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe('e-mail non valide');
	});
});
