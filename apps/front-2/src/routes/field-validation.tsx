import { Button, Card } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import * as React from 'react';
import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Form, Field } from '~/components/field';
import { isSupportedLanguage, type SupportedLanguage } from '~/lib/i18n.shared';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import InterZod from '@org/shared-ts/lib/zod/InterZod';

type FieldValidationValues = {
	email: string;
};

const resolveLocale = (value: string | undefined | null): SupportedLanguage =>
	isSupportedLanguage(value) ? value : 'en';

const getLocaleFromCookie = (value: string | undefined): SupportedLanguage => {
	const cookieValue = (value ?? '')
		.split(';')
		.map((row) => row.trim())
		.find((row) => row.startsWith(`${LOCALE_COOKIE_KEY}=`))
		?.split('=')
		.at(-1);

	return resolveLocale(cookieValue);
};

const FieldValidationRoute = () => {
	const { i18n } = useTranslation();
	const cookieLocale =
		typeof document === 'undefined' ? undefined : document.cookie;
	const activeLocale = resolveLocale(
		typeof document === 'undefined'
			? undefined
			: getLocaleFromCookie(cookieLocale) ||
					document.documentElement.lang ||
					i18n.resolvedLanguage,
	);
	const resolver = React.useMemo(() => {
		const interZod = new InterZod({
			i18n: {
				getFixedT: i18n.getFixedT.bind(i18n),
				t: i18n.getFixedT(activeLocale) as never,
			},
			locale: activeLocale,
		});
		const schema = z.object({
			email: interZod.string().email(),
		});

		return zodResolver(schema);
	}, [activeLocale, i18n]);

	const methods = useForm<FieldValidationValues>({
		resolver,
		defaultValues: {
			email: '',
		},
	});
	const [status, setStatus] = useState('');

	const onSubmit: SubmitHandler<FieldValidationValues> = (values) => {
		setStatus(`Submitted: ${values.email}`);
	};

	return (
		<div className="mx-auto w-full max-w-lg space-y-4 px-4">
			<h1
				className="text-2xl font-semibold"
				data-testid="field-validation-title"
			>
				Field validation demo
			</h1>
			<Card className="space-y-4 p-4">
				<Form methods={methods} onSubmit={methods.handleSubmit(onSubmit)}>
					<div className="space-y-1">
						<label
							htmlFor="field-validation-email"
							className="text-sm font-medium"
						>
							Email
						</label>
						<Field.Email
							name="email"
							id="field-validation-email"
							placeholder="name@company.com"
							required
						/>
					</div>
					<Button
						type="submit"
						variant="primary"
						className="w-full"
						data-testid="field-validation-submit"
					>
						Submit
					</Button>
				</Form>
				<p className="text-sm text-foreground-600" data-testid="submit-status">
					{status}
				</p>
			</Card>
		</div>
	);
};

export const Route = createFileRoute('/field-validation')({
	component: FieldValidationRoute,
});
