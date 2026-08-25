import { IconArrowLeft } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Field, Form } from '~/components/field';
import type { FieldSelectOption } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';

import type { TenantUserEditValues } from './_edit-schema';

export const TenantUserEditHeader = ({
	tenantId,
	userId,
}: {
	tenantId: string;
	userId: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<Link
					to="/staff/tenants/$tenantId/users/$userId"
					params={{ tenantId, userId }}
					className="publy-back-link"
				>
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-user')}
				</Link>
				<h2 className="text-2xl font-semibold text-foreground">
					{t('edit-tenant-user')}
				</h2>
			</div>
			<p className="text-sm text-muted-foreground">
				{t('edit-tenant-user-description')}
			</p>
		</div>
	);
};

export const TenantUserEditFormCard = ({
	methods,
	onSubmit,
	accountLevelOptions,
	isSubmittingForm,
	rootValidationError,
	saveDisabled,
}: {
	methods: UseFormReturn<TenantUserEditValues>;
	onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
	accountLevelOptions: FieldSelectOption[];
	isSubmittingForm: boolean;
	rootValidationError: string;
	saveDisabled: boolean;
}) => {
	const { t } = useTranslation('common');

	return (
		<Card className="space-y-4 p-5">
			<Form methods={methods} onSubmit={onSubmit}>
				<Field.Text
					name="firstName"
					label={t('first-name')}
					fullWidth
					isDisabled={isSubmittingForm}
				/>
				<Field.Text
					name="lastName"
					label={t('last-name')}
					fullWidth
					isDisabled={isSubmittingForm}
				/>
				<Field.Text
					name="avatarUrl"
					label={t('avatar-url')}
					fullWidth
					isDisabled={isSubmittingForm}
				/>
				<Field.Select
					name="accountLevel"
					label={t('account-level')}
					options={accountLevelOptions}
					isDisabled={isSubmittingForm}
				/>

				{rootValidationError ? (
					<p className="text-sm text-destructive" role="alert">
						{rootValidationError}
					</p>
				) : null}

				<div className="flex justify-end">
					<Button type="submit" variant="default" disabled={saveDisabled}>
						{t('save-changes')}
					</Button>
				</div>
			</Form>
		</Card>
	);
};
