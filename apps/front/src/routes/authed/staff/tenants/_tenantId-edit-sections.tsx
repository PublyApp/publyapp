import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import {
	Field,
	FormActionBar,
	type FieldSelectOption,
} from '~/components/field';
import { Button } from '~/components/ui/button';

import { type TranslateFn } from '../_tenant-form-shared';
import { ReadOnlySlugField } from './_tenantId-edit-fields';

export const TenantEditHeader = ({
	t,
	tenantId,
}: {
	t: TranslateFn;
	tenantId: string;
}) => (
	<div className="space-y-2">
		<Link
			to="/staff/tenants/$tenantId"
			params={{ tenantId }}
			className="publy-back-link"
		>
			<IconArrowLeft aria-hidden="true" className="size-3" />
			{t('back-to-tenant')}
		</Link>
		<h1 className="text-xl font-semibold tracking-[-0.01em]">
			{t('edit-item', { item: t('tenant') })}
		</h1>
		<p className="text-sm text-muted-foreground">
			{t('edit-tenant-description')}
		</p>
	</div>
);

export const TenantEditOrganizationSection = ({
	t,
	isPending,
	code,
	previewName,
	usersCount,
	previewMaxUsers,
}: {
	t: TranslateFn;
	isPending: boolean;
	code: string;
	previewName: string;
	usersCount: number;
	previewMaxUsers: number;
}) => {
	const seatMeterPercent =
		previewMaxUsers > 0
			? Math.min((usersCount / previewMaxUsers) * 100, 100)
			: 0;

	return (
		<section className="flex flex-col gap-4">
			<p className="publy-type-eyebrow">{t('organization')}</p>
			<Field.Text
				name="name"
				label={t('organization-name')}
				fullWidth
				isDisabled={isPending}
			/>
			<div className="grid grid-cols-[1fr_128px] items-start gap-3">
				<ReadOnlySlugField
					code={code}
					label={t('workspace-slug')}
					hint={t('workspace-slug-immutable-hint')}
				/>
				<div className="flex flex-col gap-1.5">
					<Field.Text
						name="maxUsers"
						type="number"
						min={1}
						label={t('seats')}
						isDisabled={isPending}
					/>
					<div className="publy-stat-meter">
						<div
							className="publy-stat-meter-fill"
							style={{ width: `${seatMeterPercent}%` }}
						/>
					</div>
				</div>
			</div>
			{previewMaxUsers < usersCount ? (
				<p
					className="publy-field-helper text-(--publy-chip-pending-text)"
					data-testid="edit-tenant-seats-warning"
				>
					<IconAlertCircle aria-hidden="true" />
					{t('seats-below-current-members-warning', { count: usersCount })}
				</p>
			) : null}
			<Field.ImageUpload
				name="logoUrl"
				label={t('logo')}
				previewName={previewName}
				isDisabled={isPending}
			/>
		</section>
	);
};

export const TenantEditIdentitySection = ({
	t,
	isPending,
}: {
	t: TranslateFn;
	isPending: boolean;
}) => (
	<section className="flex flex-col gap-4">
		<p className="publy-type-eyebrow">{t('identity')}</p>
		<Field.Text
			name="legalName"
			label={t('legal-name')}
			fullWidth
			isDisabled={isPending}
		/>
		<Field.Textarea
			name="description"
			label={t('description')}
			rows={3}
			isDisabled={isPending}
		/>
		<Field.Text
			name="websiteUrl"
			label={t('website-url')}
			placeholder="https://example.com"
			fullWidth
			isDisabled={isPending}
		/>
	</section>
);

export const TenantEditContactSection = ({
	t,
	isPending,
}: {
	t: TranslateFn;
	isPending: boolean;
}) => (
	<section className="flex flex-col gap-4">
		<p className="publy-type-eyebrow">{t('contact')}</p>
		<div className="grid grid-cols-2 gap-3">
			<Field.Email
				name="billingEmail"
				label={t('billing-email')}
				isDisabled={isPending}
			/>
			<Field.Email
				name="supportEmail"
				label={t('support-email')}
				isDisabled={isPending}
			/>
		</div>
	</section>
);

export const TenantEditRegionalSection = ({
	t,
	isPending,
	localeOptions,
	timezoneOptions,
}: {
	t: TranslateFn;
	isPending: boolean;
	localeOptions: FieldSelectOption[];
	timezoneOptions: FieldSelectOption[];
}) => (
	<section className="flex flex-col gap-4">
		<p className="publy-type-eyebrow">{t('regional')}</p>
		<div className="grid grid-cols-2 gap-3">
			<Field.Select
				name="defaultLocale"
				label={t('default-locale')}
				options={localeOptions}
				isDisabled={isPending}
			/>
			<Field.Select
				name="timezone"
				label={t('timezone')}
				options={timezoneOptions}
				isDisabled={isPending}
			/>
		</div>
	</section>
);

export const TenantEditNotesSection = ({
	t,
	isPending,
}: {
	t: TranslateFn;
	isPending: boolean;
}) => (
	<section className="flex flex-col gap-2 rounded-[var(--publy-radius-medium-control)] border border-(--publy-alert-warning-border) bg-(--publy-alert-warning-bg) p-4">
		<Field.Textarea
			name="notes"
			label={t('internal-notes')}
			helperText={t('internal-notes-hint')}
			rows={4}
			isDisabled={isPending}
		/>
	</section>
);

export const TenantEditActionBar = ({
	t,
	isPending,
	isDirty,
	onReset,
	onCancel,
}: {
	t: TranslateFn;
	isPending: boolean;
	isDirty: boolean;
	onReset: () => void;
	onCancel: () => void;
}) => (
	<FormActionBar
		status={
			isDirty ? (
				<span data-testid="edit-tenant-dirty-hint">{t('unsaved-changes')}</span>
			) : undefined
		}
	>
		{isDirty ? (
			<Button
				type="button"
				variant="ghost"
				disabled={isPending}
				onClick={onReset}
			>
				{t('reset-to-saved')}
			</Button>
		) : null}
		<Button
			type="button"
			variant="ghost"
			disabled={isPending}
			onClick={onCancel}
		>
			{t('cancel')}
		</Button>
		<Button type="submit" disabled={isPending || !isDirty}>
			{t('save-changes')}
		</Button>
	</FormActionBar>
);
