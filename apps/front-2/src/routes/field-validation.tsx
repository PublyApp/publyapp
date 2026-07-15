import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { View404 } from '~/components/error-views/View404';
import { Form, Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { FEATURES } from '~/lib/flags';

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
			<Card
				className="space-y-4 p-4"
				data-testid="form-control-outline-fixture"
			>
				<div className="space-y-1.5">
					<Label htmlFor="outline-input">Outline input</Label>
					<Input
						id="outline-input"
						data-testid="outline-input"
						defaultValue="Input value"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="outline-textarea">Outline textarea</Label>
					<Textarea
						id="outline-textarea"
						data-testid="outline-textarea"
						defaultValue="Textarea value"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="outline-select">Outline select</Label>
					<Select defaultValue="alpha">
						<SelectTrigger
							id="outline-select"
							className="w-full"
							data-testid="outline-select"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="alpha">Alpha</SelectItem>
							<SelectItem value="beta">Beta</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</Card>
			<div
				aria-hidden="true"
				className="pointer-events-none fixed size-px border border-ring bg-input/50 opacity-0 shadow-[var(--publy-shadow-input)] ring-3 ring-ring/30"
				data-testid="outline-expected-focus"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none fixed size-px border border-destructive bg-input/50 opacity-0 shadow-[var(--publy-shadow-input)] ring-3 ring-destructive/20 dark:ring-destructive/40"
				data-testid="outline-expected-invalid-focus"
			/>
		</div>
	);
};

export const Route = createFileRoute('/field-validation')({
	// Dev-only scaffolding — never a publicly reachable production route
	// (r3-shell-F14). No conditional hook calls: the whole component swaps at
	// module-eval time, not inside a render.
	component: FEATURES.dev.fieldValidationDemoEnabled
		? FieldValidationRoute
		: View404,
});
