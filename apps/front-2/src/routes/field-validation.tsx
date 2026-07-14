import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Form, Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';

type FieldValidationValues = {
	email: string;
};

const FieldValidationRoute = () => {
	const { t } = useTranslation('common');
	const resolver = zodResolver(
		z.object({
			email: z.string().email(),
		}),
	);

	const methods = useForm<FieldValidationValues>({
		resolver,
		defaultValues: {
			email: '',
		},
	});
	const [status, setStatus] = useState('');

	const onSubmit: SubmitHandler<FieldValidationValues> = (values) => {
		setStatus(t('field-validation-submitted-value', { email: values.email }));
	};

	return (
		<div className="mx-auto w-full max-w-lg space-y-4 px-4">
			<h1
				className="text-2xl font-semibold"
				data-testid="field-validation-title"
			>
				{t('field-validation-demo')}
			</h1>
			<Card className="space-y-4 p-4">
				<Form methods={methods} onSubmit={methods.handleSubmit(onSubmit)}>
					<Field.Email
						name="email"
						label={t('email')}
						placeholder={t('email-placeholder')}
						required
					/>
					<Button
						type="submit"
						variant="default"
						className="w-full"
						data-testid="field-validation-submit"
					>
						{t('submit')}
					</Button>
				</Form>
				<p
					className="text-sm text-muted-foreground"
					data-testid="submit-status"
				>
					{status}
				</p>
			</Card>
		</div>
	);
};

export const Route = createFileRoute('/field-validation')({
	component: FieldValidationRoute,
});
