import type { SubmitEventHandler } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Field, Form } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

import type { SettingsGeneralValues } from './_settings-general-schema';

type Translate = (key: string) => string;

type SettingsGeneralIdentityCardProps = {
	t: Translate;
	serverError: string;
	methods: UseFormReturn<SettingsGeneralValues>;
	onSubmit: SubmitEventHandler<HTMLFormElement>;
	isSubmittingForm: boolean;
};

export const SettingsGeneralIdentityCard = ({
	t,
	serverError,
	methods,
	onSubmit,
	isSubmittingForm,
}: SettingsGeneralIdentityCardProps) => (
	<Card>
		<CardHeader>
			<CardTitle>{t('common:organization-details')}</CardTitle>
		</CardHeader>
		<CardContent>
			{serverError ? (
				<p
					role="alert"
					className="mb-4 rounded-[var(--publy-radius-input)] bg-destructive/10 px-3 py-2 text-sm text-destructive"
				>
					{serverError}
				</p>
			) : null}

			<Form methods={methods} onSubmit={onSubmit}>
				<div className="grid gap-4 md:grid-cols-2">
					<Field.Text
						name="name"
						label={t('common:name')}
						placeholder={t('common:name')}
						isDisabled={isSubmittingForm}
					/>
					<Field.Text
						name="logoUrl"
						label={t('common:logo')}
						helperText={t('common:logo-description')}
						placeholder="https://example.com/logo.png"
						isDisabled={isSubmittingForm}
					/>
					<Field.Text
						name="legalName"
						label={t('common:legal-name')}
						placeholder={t('common:legal-name')}
						isDisabled={isSubmittingForm}
					/>
					<Field.Text
						name="websiteUrl"
						label={t('common:website')}
						placeholder="https://example.com"
						isDisabled={isSubmittingForm}
					/>
				</div>
				<Field.Textarea
					name="description"
					label={t('common:description')}
					placeholder={t('common:description')}
					isDisabled={isSubmittingForm}
				/>

				<div className="flex items-center gap-3 pt-2">
					<Button type="submit" variant="default" disabled={isSubmittingForm}>
						{t('common:save-changes')}
					</Button>
				</div>
			</Form>
		</CardContent>
	</Card>
);
