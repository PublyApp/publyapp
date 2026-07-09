import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { z } from 'zod';
import { Form, Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';

type FieldValidationValues = {
	email: string;
};

const FieldValidationRoute = () => {
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
					<Field.Email
						name="email"
						label="Email"
						placeholder="name@company.com"
						required
					/>
					<Button
						type="submit"
						variant="default"
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
