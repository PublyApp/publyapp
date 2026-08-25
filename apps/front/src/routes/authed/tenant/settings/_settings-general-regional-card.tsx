import type { SubmitEventHandler } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Field, Form, type FieldSelectOption } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

import type { SettingsGeneralValues } from './_settings-general-schema';

type Translate = (key: string) => string;

type SettingsGeneralRegionalCardProps = {
	t: Translate;
	methods: UseFormReturn<SettingsGeneralValues>;
	onSubmit: SubmitEventHandler<HTMLFormElement>;
	isSubmittingForm: boolean;
	localeOptions: FieldSelectOption[];
	timezoneOptions: FieldSelectOption[];
};

export const SettingsGeneralRegionalCard = ({
	t,
	methods,
	onSubmit,
	isSubmittingForm,
	localeOptions,
	timezoneOptions,
}: SettingsGeneralRegionalCardProps) => (
	<Card>
		<CardHeader>
			<CardTitle>{t('settings:regional-and-contact-settings')}</CardTitle>
		</CardHeader>
		<CardContent>
			<Form methods={methods} onSubmit={onSubmit}>
				<div className="grid gap-4 md:grid-cols-2">
					<Field.Select
						name="defaultLocale"
						label={t('common:default-locale')}
						options={localeOptions}
						isDisabled={isSubmittingForm}
					/>
					<Field.Select
						name="timezone"
						label={t('common:timezone')}
						options={timezoneOptions}
						isDisabled={isSubmittingForm}
					/>
					<Field.Email
						name="billingEmail"
						label={t('common:billing-email')}
						placeholder="billing@example.com"
						isDisabled={isSubmittingForm}
					/>
					<Field.Email
						name="supportEmail"
						label={t('common:support-email')}
						placeholder="support@example.com"
						isDisabled={isSubmittingForm}
					/>
				</div>

				<div className="flex items-center gap-3 pt-2">
					<Button type="submit" variant="default" disabled={isSubmittingForm}>
						{t('common:save-changes')}
					</Button>
				</div>
			</Form>
		</CardContent>
	</Card>
);
