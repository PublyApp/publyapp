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
import { toastVariantClassNames } from '~/components/ui/toast-variants';
import { FEATURES } from '~/lib/flags';
import { useHydrated } from '~/lib/hooks/use-hydrated';
import { toastLocalMutationResult } from '~/lib/mutation-toast';

type FieldValidationValues = {
	email: string;
	statusEnabled: boolean;
};

/** Every toast the product can raise except the loading spinner, whose
 * message-bearing siblings the contrast fixture already covers. Derived from
 * the product's variant class names so a new variant appears here the moment
 * it appears in `toast-variants.ts`. */
const toastContrastFixtures = (
	Object.keys(toastVariantClassNames) as Array<
		keyof typeof toastVariantClassNames
	>
).filter((type) => type !== 'loading');

const FieldValidationRoute = () => {
	const { t } = useTranslation('common');
	const isHydrated = useHydrated();
	const resolver = zodResolver(
		z.object({
			email: z.email(),
			statusEnabled: z.boolean(),
		}),
	);

	const methods = useForm<FieldValidationValues>({
		resolver,
		defaultValues: {
			email: '',
			statusEnabled: true,
		},
	});
	const [status, setStatus] = useState('');
	const showToastContrastFixture = (
		type: (typeof toastContrastFixtures)[number],
	): void => {
		toastLocalMutationResult[type](t('active'), t('description'));
	};

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
			<Card
				className="space-y-3 p-4"
				data-testid="toast-contrast-fixture"
				data-hydrated={isHydrated || undefined}
			>
				<p className="text-sm font-medium">{t('field-validation-demo')}</p>
				<div className="flex flex-wrap gap-2">
					{toastContrastFixtures.map((type) => (
						<Button
							key={type}
							type="button"
							variant="outline"
							data-testid={`toast-contrast-${type}`}
							onClick={() => showToastContrastFixture(type)}
						>
							{type}
						</Button>
					))}
				</div>
			</Card>
			<Card className="space-y-4 p-4">
				<Form methods={methods} onSubmit={methods.handleSubmit(onSubmit)}>
					<Field.Email
						name="email"
						label={t('email')}
						placeholder={t('email-placeholder')}
						required
					/>
					{/* E2E fixture (round 5 M12): this Field.Switch exists so the
					    drawer-contrast browser spec can measure a real
					    `.publy-field-switch-description` element. It is also a
					    legitimate demo of the switch-field pattern, so it earns
					    its place in this dev-only route — but the route is
					    forced on for the e2e image, so keep this block's
					    description text real (not placeholder copy). */}
					<Field.Switch
						name="statusEnabled"
						label={t('status')}
						description={t('description')}
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
					<Label htmlFor="outline-input">{t('name')}</Label>
					<Input
						id="outline-input"
						data-testid="outline-input"
						defaultValue="Input value"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="outline-textarea">{t('description')}</Label>
					<Textarea
						id="outline-textarea"
						data-testid="outline-textarea"
						defaultValue="Textarea value"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="outline-select">{t('status')}</Label>
					<Select defaultValue="alpha">
						<SelectTrigger
							id="outline-select"
							className="w-full"
							data-testid="outline-select"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="alpha">{t('active')}</SelectItem>
							<SelectItem value="beta">{t('inactive')}</SelectItem>
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
	staticData: { crumbs: 'shell' },
	// Dev-only scaffolding — never a publicly reachable production route
	// (r3-shell-F14). No conditional hook calls: the whole component swaps at
	// module-eval time, not inside a render.
	component: FEATURES.dev.fieldValidationDemoEnabled
		? FieldValidationRoute
		: View404,
});
