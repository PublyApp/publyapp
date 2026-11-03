import {
	IconArrowLeft,
	IconCheck,
	IconChevronDown,
	IconPlus,
	IconX,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Field } from '~/components/field';
import { FieldGroup, GroupRow } from '~/components/field/field-group';
import { Button } from '~/components/ui/button';
import { Collapse } from '~/components/ui/collapse';
import { Input } from '~/components/ui/input';
import { StatusPill } from '~/components/ui/product-page';
import { Segmented } from '~/components/ui/segmented';
import { Switch } from '~/components/ui/switch';
import { cn } from '~/lib/utils';

import { type TranslateFn } from './_tenant-form-shared';
import {
	CodeSelectRow,
	ROW_CONTROL,
	SlugRow,
	TextRow,
	TextareaRow,
} from './_tenants-new-fields';
import {
	SEAT_OPTIONS,
	type TenantCreateFormValues,
	type TenantCreateSeatsValue,
} from './_tenants-new-types';

const optionalBadge = (t: TranslateFn) => (
	<span className="text-xs text-muted-foreground">{t('optional')}</span>
);

/** The boxed page's frame (`Boxed` in the prototype): back link, title, the
 * one-line description, then the form column and the preview. */
export const TenantCreateHeader = ({ t }: { t: TranslateFn }) => (
	<>
		<Link
			to="/staff/tenants"
			className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<IconArrowLeft aria-hidden="true" className="size-4" />
			{t('create-tenant-back')}
		</Link>
		<h1 className="publy-type-page-title leading-normal">
			{t('new-organization')}
		</h1>
		<p className="-mt-4 text-sm text-muted-foreground">
			{t('create-tenant-description')}
		</p>
	</>
);

/** `Organisation`: name, identifier, seats, logo — one bordered group. */
export const TenantCreateOrganizationGroup = ({
	t,
	isFormLocked,
	seatsValue,
	customSeats,
	onSeatsChange,
	onCustomSeatsChange,
	name,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	seatsValue: TenantCreateSeatsValue;
	customSeats: string;
	onSeatsChange: (value: TenantCreateSeatsValue) => void;
	onCustomSeatsChange: (value: string) => void;
	name: string;
}) => (
	<FieldGroup title={t('organization')} note={t('organization-section-hint')}>
		<TextRow
			name="name"
			label={t('create-tenant-name')}
			placeholder={t('create-tenant-name-placeholder')}
			isDisabled={isFormLocked}
		/>
		<SlugRow
			label={t('create-tenant-slug')}
			placeholder={t('create-tenant-slug-placeholder')}
			generatedLabel={t('slug-generated-from-name')}
			isDisabled={isFormLocked}
		/>
		<GroupRow label={t('seats')}>
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
					<Input
						inputMode="numeric"
						value={customSeats}
						placeholder={t('seats-custom-placeholder')}
						disabled={isFormLocked}
						onChange={(event) => {
							onCustomSeatsChange(event.target.value.replace(/\D/g, ''));
						}}
						className={cn(ROW_CONTROL, 'w-28')}
					/>
				) : null}
			</div>
		</GroupRow>
		<GroupRow label={t('logo')} badge={optionalBadge(t)}>
			<Field.ImageUpload
				name="logoUrl"
				label={t('logo')}
				previewName={name || t('untitled-organization')}
				isDisabled={isFormLocked}
				hideLabel
			/>
		</GroupRow>
	</FieldGroup>
);

/** The `Propriétaires` row of the people group: one email per owner, the
 * first one flagged « Principal », and the add button. */
export const TenantCreateOwnersRow = ({
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
}) => {
	const { control } = useFormContext<TenantCreateFormValues>();

	return (
		<GroupRow label={t('owners')}>
			<div className="flex flex-col gap-2">
				{ownerFields.map((field, index) => (
					<div key={field.id} className="flex items-center gap-2">
						<Controller
							name={`owners.${index}.email`}
							control={control}
							render={({ field: emailField, fieldState: { error } }) => (
								<Input
									type="email"
									value={emailField.value}
									placeholder={t('member-email-placeholder')}
									disabled={isFormLocked}
									onBlur={emailField.onBlur}
									onChange={(event) => {
										emailField.onChange(event.target.value);
									}}
									aria-label={t('email')}
									aria-invalid={Boolean(error) || undefined}
									className={ROW_CONTROL}
								/>
							)}
						/>
						{index === 0 ? (
							<StatusPill tone="warning">{t('primary')}</StatusPill>
						) : null}
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="rounded-[var(--publy-radius-control)]"
							disabled={isFormLocked || ownerFields.length <= 1}
							onClick={() => {
								onRemoveOwner(index);
							}}
							aria-label={t('remove-owner')}
						>
							<IconX aria-hidden="true" />
						</Button>
					</div>
				))}
			</div>

			{ownersError ? (
				<p className="text-xs text-destructive">{ownersError}</p>
			) : null}

			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={isFormLocked || !canAddOwner}
				onClick={onAddOwner}
				className="w-fit rounded-[var(--publy-radius-control)] border-transparent shadow-[var(--publy-shadow-ring)]"
			>
				<IconPlus data-icon="inline-start" />
				{t('add-owner')}
			</Button>
		</GroupRow>
	);
};

/** A section folded to one line saying what it holds (`Fold` in the
 * prototype); opens in place. */
export const Fold = ({
	title,
	summary,
	children,
	open: initial = false,
}: {
	title: string;
	summary: string;
	children: ReactNode;
	open?: boolean;
}) => {
	const [open, setOpen] = useState(initial);
	return (
		<div className="flex flex-col gap-2.5">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				className="flex items-center gap-2 rounded-[var(--publy-radius-control)] border bg-background px-3.5 py-3 text-left hover:bg-card"
			>
				<span className="text-sm font-medium">{title}</span>
				<span className="truncate text-xs text-muted-foreground">
					{summary}
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
				{children}
			</Collapse>
		</div>
	);
};

/** The prototype's « Plus tard, ou maintenant » fold around the details. */
export const TenantCreateDetailsFold = ({
	t,
	isFormLocked,
	localeOptions,
	timezoneOptions,
	summary,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	localeOptions: readonly { value: string; label: string }[];
	timezoneOptions: readonly { value: string; label: string }[];
	summary: string;
}) => {
	const { control } = useFormContext<TenantCreateFormValues>();

	return (
		<>
			<p className="-mb-2 font-mono text-sm font-medium text-muted-foreground opacity-80">
				{t('later-or-now')}
			</p>
			<Fold title={t('organization-details')} summary={summary}>
				<FieldGroup
					title={t('organization-details')}
					badge={optionalBadge(t)}
					note={t('organization-details-optional-hint')}
				>
					<TextRow
						name="legalName"
						label={t('legal-name')}
						placeholder={t('legal-name-placeholder')}
						isDisabled={isFormLocked}
					/>
					<TextareaRow
						name="description"
						label={t('description')}
						placeholder={t('description-placeholder')}
						isDisabled={isFormLocked}
					/>
					<TextRow
						name="websiteUrl"
						label={t('website')}
						placeholder={t('website-placeholder')}
						isDisabled={isFormLocked}
					/>
					<TextRow
						name="billingEmail"
						label={t('create-tenant-billing-email')}
						placeholder={t('billing-email-placeholder')}
						type="email"
						isDisabled={isFormLocked}
					/>
					<TextRow
						name="supportEmail"
						label={t('create-tenant-support-email')}
						placeholder={t('support-email-placeholder')}
						type="email"
						isDisabled={isFormLocked}
					/>
					<GroupRow label={t('default-locale')}>
						<Controller
							name="defaultLocale"
							control={control}
							render={({ field }) => (
								<Segmented
									value={typeof field.value === 'string' ? field.value : ''}
									options={localeOptions.map((option) => option.value)}
									label={(value) =>
										localeOptions.find((option) => option.value === value)
											?.label ?? value
									}
									onChange={field.onChange}
									ariaLabel={t('default-locale')}
									className="w-fit"
								/>
							)}
						/>
					</GroupRow>
					<CodeSelectRow
						name="timezone"
						label={t('timezone')}
						options={timezoneOptions}
						isDisabled={isFormLocked}
					/>
					<TextareaRow
						name="notes"
						label={t('internal-notes')}
						placeholder={t('create-tenant-notes-placeholder')}
						help={t('create-tenant-notes-hint')}
						isDisabled={isFormLocked}
					/>
				</FieldGroup>
			</Fold>
		</>
	);
};

/** `Configuration`: the default-profile switch, in the same row language. */
export const TenantCreateConfigGroup = ({
	t,
	isFormLocked,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
}) => {
	const { control } = useFormContext<TenantCreateFormValues>();

	return (
		<FieldGroup title={t('configuration')}>
			<Controller
				name="seedDefaultProfile"
				control={control}
				render={({ field }) => (
					<GroupRow label={t('default-profile')}>
						<label className="flex items-center justify-between gap-3 text-sm">
							<span className="text-muted-foreground">
								{t('default-profile-hint')}
							</span>
							<Switch
								checked={Boolean(field.value)}
								onCheckedChange={field.onChange}
								onBlur={field.onBlur}
								disabled={isFormLocked}
								aria-label={t('default-profile')}
							/>
						</label>
					</GroupRow>
				)}
			/>
		</FieldGroup>
	);
};

/** The sticky action bar: what creation will do, « Annuler », then the CTA. */
export const TenantCreateActionBar = ({
	t,
	isFormLocked,
	summary,
	onCancel,
}: {
	t: TranslateFn;
	isFormLocked: boolean;
	summary: string;
	onCancel: () => void;
}) => (
	<div className="sticky -bottom-8 z-(--publy-z-raised) flex items-center justify-end gap-2 border-t bg-background pt-4 pb-6">
		<span className="publy-form-action-bar-status mr-auto text-muted-foreground">
			<span data-testid="create-tenant-summary">{summary}</span>
		</span>
		<Button
			type="button"
			variant="outline"
			disabled={isFormLocked}
			onClick={onCancel}
			className="rounded-[var(--publy-radius-control)] border-transparent shadow-[var(--publy-shadow-ring)]"
		>
			{t('cancel')}
		</Button>
		<Button
			type="submit"
			disabled={isFormLocked}
			className="rounded-[var(--publy-radius-control)]"
		>
			<IconCheck data-icon="inline-start" />
			{t('create-tenant-cta')}
		</Button>
	</div>
);

export const TenantCreateRootError = ({ message }: { message: string }) => (
	<p className="publy-field-error" role="alert" aria-label={message}>
		{message}
	</p>
);
