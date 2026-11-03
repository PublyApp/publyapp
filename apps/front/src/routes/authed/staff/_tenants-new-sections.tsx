import {
	IconArrowLeft,
	IconChevronDown,
	IconPlus,
	IconX,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
	Field,
	FormActionBar,
	type FieldSelectOption,
} from '~/components/field';
import { Button } from '~/components/ui/button';
import { Collapse } from '~/components/ui/collapse';
import { Segmented } from '~/components/ui/segmented';
import { cn } from '~/lib/utils';

import { type TranslateFn } from './_tenant-form-shared';
import { SlugField } from './_tenants-new-fields';
import {
	type TenantCreateSeatsValue,
	SEAT_OPTIONS,
} from './_tenants-new-types';

export const TenantCreateHeader = ({ t }: { t: TranslateFn }) => (
	<div className="space-y-2">
		<Link to="/staff/tenants" className="publy-back-link">
			<IconArrowLeft aria-hidden="true" className="size-3" />
			{t('back-to-staff-tenants')}
		</Link>
		<h1 className="publy-type-page-title">{t('create-tenant')}</h1>
		<p className="text-sm text-muted-foreground">
			{t('create-tenant-description')}
		</p>
	</div>
);

export const TenantCreateOrganizationSection = ({
	t,
	isFormLocked,
	name,
	seatsValue,
	customSeats,
	onSeatsChange,
	onCustomSeatsChange,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	name: string;
	seatsValue: TenantCreateSeatsValue;
	customSeats: string;
	onSeatsChange: (value: TenantCreateSeatsValue) => void;
	onCustomSeatsChange: (value: string) => void;
}) => (
	<section className="flex flex-col gap-4">
		<div className="space-y-1">
			<p className="publy-type-eyebrow">{t('organization')}</p>
			<p className="publy-type-helper">{t('organization-section-hint')}</p>
		</div>
		<Field.Text
			name="name"
			label={t('organization-name')}
			placeholder={t('organization-name-placeholder')}
			fullWidth
			isDisabled={isFormLocked}
		/>
		<SlugField
			label={t('workspace-slug')}
			hint={t('workspace-slug-hint')}
			isDisabled={isFormLocked}
			t={t}
		/>
		<div className="flex flex-col gap-2">
			<span className="text-[13px] leading-none font-medium">{t('seats')}</span>
			<div className="flex flex-wrap items-center gap-2">
				<Segmented
					value={seatsValue}
					options={SEAT_OPTIONS}
					label={(value) => (value === 'custom' ? t('seats-custom') : value)}
					onChange={onSeatsChange}
					ariaLabel={t('seats')}
					className="w-fit"
					itemClassName="min-w-9"
				/>
				{seatsValue === 'custom' ? (
					<input
						type="text"
						inputMode="numeric"
						value={customSeats}
						placeholder={t('seats-custom-placeholder')}
						disabled={isFormLocked}
						onChange={(event) => {
							onCustomSeatsChange(event.target.value.replace(/\D/g, ''));
						}}
						className="h-9 w-28 rounded-[var(--publy-radius-input)] border border-border bg-input/50 px-3 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
					/>
				) : null}
			</div>
		</div>
		<Field.ImageUpload
			name="logoUrl"
			label={t('logo')}
			previewName={name || t('untitled-organization')}
			isDisabled={isFormLocked}
		/>
	</section>
);

export const TenantCreateDetailsFold = ({
	t,
	isFormLocked,
	localeOptions,
	timezoneOptions,
	summary,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	localeOptions: FieldSelectOption[];
	timezoneOptions: FieldSelectOption[];
	summary: string;
}) => {
	const [open, setOpen] = useState(false);
	return (
		<div className="flex flex-col gap-2.5">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex items-center gap-2 rounded-[14px] border bg-background px-3.5 py-3 text-left hover:bg-card"
			>
				<span className="text-sm font-medium">{t('organization-details')}</span>
				<span className="truncate text-xs text-muted-foreground">
					{summary}
				</span>
				<span className="ml-1 shrink-0 text-xs text-muted-foreground">
					{t('optional')}
				</span>
				<IconChevronDown
					aria-hidden="true"
					className={cn(
						'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
						open && 'rotate-180',
					)}
				/>
			</button>
			<Collapse axis="y" open={open}>
				<div className="flex flex-col gap-4 pt-2">
					<p className="publy-type-helper">
						{t('organization-details-optional-hint')}
					</p>
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
				</div>
			</Collapse>
		</div>
	);
};

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
