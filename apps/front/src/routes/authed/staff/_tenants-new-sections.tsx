import { IconArrowLeft, IconPlus, IconX } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import {
	Field,
	FormActionBar,
	type FieldSelectOption,
} from '~/components/field';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

import { type TranslateFn } from './_tenant-form-shared';
import { SlugField } from './_tenants-new-fields';

export const TenantCreateHeader = ({ t }: { t: TranslateFn }) => (
	<div className="space-y-2">
		<Link to="/staff/tenants" className="publy-back-link">
			<IconArrowLeft aria-hidden="true" className="size-3" />
			{t('back-to-staff-tenants')}
		</Link>
		<h1 className="text-xl font-semibold tracking-[-0.01em]">
			{t('create-tenant')}
		</h1>
		<p className="text-sm text-muted-foreground">
			{t('create-tenant-description')}
		</p>
	</div>
);

export const TenantCreateOrganizationSection = ({
	t,
	isFormLocked,
	name,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	name: string;
}) => (
	<section className="flex flex-col gap-4">
		<p className="publy-type-eyebrow">{t('organization')}</p>
		<Field.Text
			name="name"
			label={t('organization-name')}
			placeholder={t('organization-name-placeholder')}
			fullWidth
			isDisabled={isFormLocked}
		/>
		<div className="grid grid-cols-[1fr_128px] items-start gap-3">
			<SlugField
				label={t('workspace-slug')}
				hint={t('workspace-slug-hint')}
				isDisabled={isFormLocked}
				t={t}
			/>
			<Field.Text
				name="maxUsers"
				type="number"
				min={1}
				label={t('seats')}
				isDisabled={isFormLocked}
			/>
		</div>
		<Field.ImageUpload
			name="logoUrl"
			label={t('logo')}
			previewName={name || t('untitled-organization')}
			isDisabled={isFormLocked}
		/>
	</section>
);

export const TenantCreateDetailsSection = ({
	t,
	isFormLocked,
	localeOptions,
	timezoneOptions,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	localeOptions: FieldSelectOption[];
	timezoneOptions: FieldSelectOption[];
}) => (
	<section className="flex flex-col gap-4">
		<div className="flex flex-wrap items-center justify-between gap-2">
			<p className="publy-type-eyebrow">{t('organization-details')}</p>
			<p className="publy-type-helper">
				{t('organization-details-optional-hint')}
			</p>
		</div>
		<Field.Text
			name="legalName"
			label={t('legal-name')}
			fullWidth
			isDisabled={isFormLocked}
		/>
		<Field.Textarea
			name="description"
			label={t('description')}
			rows={3}
			isDisabled={isFormLocked}
		/>
		<Field.Text
			name="websiteUrl"
			label={t('website-url')}
			placeholder="https://example.com"
			fullWidth
			isDisabled={isFormLocked}
		/>
		<div className="grid grid-cols-2 gap-3">
			<Field.Email
				name="billingEmail"
				label={t('billing-email')}
				isDisabled={isFormLocked}
			/>
			<Field.Email
				name="supportEmail"
				label={t('support-email')}
				isDisabled={isFormLocked}
			/>
		</div>
		<div className="grid grid-cols-2 gap-3">
			<Field.Select
				name="defaultLocale"
				label={t('default-locale')}
				options={localeOptions}
				isDisabled={isFormLocked}
			/>
			<Field.Select
				name="timezone"
				label={t('timezone')}
				options={timezoneOptions}
				isDisabled={isFormLocked}
			/>
		</div>
		<Field.Textarea
			name="notes"
			label={t('internal-notes')}
			helperText={t('internal-notes-hint')}
			rows={3}
			isDisabled={isFormLocked}
		/>
	</section>
);

export const TenantCreateOwnersSection = ({
	t,
	isFormLocked,
	ownerFields,
	ownersError,
	canAddOwner,
	onAddOwner,
	onRemoveOwner,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	ownerFields: { id: string }[];
	ownersError: string | undefined;
	canAddOwner: boolean;
	onAddOwner: () => void;
	onRemoveOwner: (index: number) => void;
}) => (
	<section className="flex flex-col gap-4">
		<div className="flex flex-wrap items-center justify-between gap-2">
			<p className="publy-type-eyebrow">{t('owners')}</p>
			<p className="publy-type-helper">{t('owners-hint')}</p>
		</div>

		<div className="flex flex-col gap-3">
			{ownerFields.map((field, index) => (
				<div
					key={field.id}
					className="grid grid-cols-[1fr_96px_32px] items-center gap-2"
				>
					<Field.Email
						name={`owners.${index}.email`}
						label={t('email')}
						placeholder="user@example.com"
						isDisabled={isFormLocked}
					/>
					<span
						className={cn(
							'publy-detail-chip justify-center',
							index === 0
								? 'publy-detail-chip--amber'
								: 'publy-detail-chip--outline',
						)}
					>
						{index === 0 ? t('primary') : t('owner-chip-label')}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={isFormLocked || ownerFields.length <= 1}
						onClick={() => {
							onRemoveOwner(index);
						}}
						aria-label={t('remove-owner')}
					>
						<IconX aria-hidden="true" className="size-4" />
					</Button>
				</div>
			))}
		</div>

		{ownersError ? <p className="publy-field-error">{ownersError}</p> : null}

		<Button
			type="button"
			variant="outline"
			size="sm"
			disabled={isFormLocked || !canAddOwner}
			onClick={onAddOwner}
			className="w-fit border-dashed border-(--publy-border-strong) bg-transparent"
		>
			<IconPlus aria-hidden="true" className="size-3.5" />
			{t('add-owner')}
		</Button>
	</section>
);

export const TenantCreateSetupSection = ({
	t,
	isFormLocked,
	seedDefaultProfileError,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	seedDefaultProfileError: string | undefined;
}) => (
	<section className="flex flex-col divide-y divide-(--publy-row-border)">
		<p className="publy-type-eyebrow pb-3">{t('setup')}</p>
		<Field.Switch
			name="seedDefaultProfile"
			label={t('seed-default-profiles')}
			isDisabled={isFormLocked}
		/>
		{seedDefaultProfileError ? (
			<p className="publy-field-error">{seedDefaultProfileError}</p>
		) : null}
	</section>
);

export const TenantCreateActionBar = ({
	t,
	isFormLocked,
	ownersCount,
	membersCount,
	onCancel,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	ownersCount: number;
	membersCount: number;
	onCancel: () => void;
}) => (
	<FormActionBar
		status={
			<span data-testid="create-tenant-summary">
				{t('create-tenant-summary-owners', { count: ownersCount })}
				{' · '}
				{t('create-tenant-summary-members', { count: membersCount })}{' '}
				{t('create-tenant-summary-suffix')}
			</span>
		}
	>
		<Button
			type="button"
			variant="ghost"
			disabled={isFormLocked}
			onClick={onCancel}
		>
			{t('cancel')}
		</Button>
		<Button type="submit" disabled={isFormLocked}>
			{t('create-tenant')}
		</Button>
	</FormActionBar>
);

export const TenantCreateRootError = ({ message }: { message: string }) => (
	<p className="publy-field-error" role="alert" aria-label={message}>
		{message}
	</p>
);
