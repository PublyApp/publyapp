import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconArrowLeft,
	IconCircle,
	IconCircleCheckFilled,
	IconFileCheck,
	IconFileSpreadsheet,
	IconPlus,
	IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form, FormActionBar, FormPageLayout } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { BrandTile } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '~/components/ui/select';
import { Switch } from '~/components/ui/switch';
import {
	STAFF_TENANTS_QUERY_KEY,
	useCreateStaffTenantMutation,
} from '~/lib/query/staff-tenants';
import { cn } from '~/lib/utils';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_MAX_USER_PER_TENANT,
} from '@org/shared-ts/lib/constants';

import {
	buildMemberImportOutcome,
	buildTenantMemberCsvTemplate,
	isValidTenantCode,
	mergeInitialUsers,
	parseCsv,
	slugifyTenantNamePlaceholder,
	type ImportedMember,
} from './tenants-new-helpers';
import { parseXlsxFile } from './tenants-new-xlsx';
import {
	getWebsiteHostname,
	isAbsoluteHttpUrl,
	isValidEmailAddress,
} from './tenants/tenant-organization-profile-fields';

type NewTenantAccountLevel =
	(typeof ACCOUNT_LEVEL_ENUM)[keyof typeof ACCOUNT_LEVEL_ENUM];

type OwnerSlotValues = {
	email: string;
};

type ManualMemberSlotValues = {
	email: string;
	accountLevel: NewTenantAccountLevel;
};

type TenantCreateFormValues = {
	name: string;
	code: string;
	maxUsers: number;
	owners: OwnerSlotValues[];
	manualMembers: ManualMemberSlotValues[];
	seedDefaultProfile: boolean;
	logoUrl: string;
	legalName: string;
	description: string;
	websiteUrl: string;
	billingEmail: string;
	supportEmail: string;
	defaultLocale: string;
	timezone: string;
	notes: string;
};

const DEFAULT_VALUES: TenantCreateFormValues = {
	name: '',
	code: '',
	maxUsers: DEFAULT_MAX_USER_PER_TENANT,
	owners: [{ email: '' }],
	manualMembers: [],
	seedDefaultProfile: true,
	logoUrl: '',
	legalName: '',
	description: '',
	websiteUrl: '',
	billingEmail: '',
	supportEmail: '',
	defaultLocale: '',
	timezone: '',
	notes: '',
};

const USER_ROLE_OPTIONS = [
	ACCOUNT_LEVEL_ENUM.ADMIN,
	ACCOUNT_LEVEL_ENUM.USER,
] as const;

/**
 * Name length mirrors the backend rule (`MustBeRequiredStringWithLength`,
 * min 5) so the client never accepts a name the server will reject. The
 * `parsedMembersCount` closure lets the max-seats check account for members
 * detected from an uploaded CSV/Excel file, which live outside RHF state.
 */
const buildCreateTenantSchema = (
	t: (key: string) => string,
	getParsedMembersCount: () => number,
) =>
	z
		.object({
			name: z.string().trim().min(5),
			code: z
				.string()
				.trim()
				.refine((value) => value.length === 0 || isValidTenantCode(value), {
					message: t('workspace-slug-invalid'),
				}),
			maxUsers: z.coerce.number().int().min(1),
			owners: z
				.array(
					z.object({
						email: z.string().trim().email(),
					}),
				)
				.min(1),
			manualMembers: z.array(
				z.object({
					email: z.string().trim().email(),
					accountLevel: z.enum(USER_ROLE_OPTIONS),
				}),
			),
			seedDefaultProfile: z.boolean(),
			logoUrl: z.string().trim().max(2048),
			legalName: z.string().trim().max(256),
			description: z.string().trim().max(1024),
			websiteUrl: z
				.string()
				.trim()
				.max(2048)
				.refine((value) => !value || isAbsoluteHttpUrl(value), {
					message: t('website-url-invalid'),
				}),
			billingEmail: z
				.string()
				.trim()
				.max(320)
				.refine((value) => !value || isValidEmailAddress(value), {
					message: t('invalid-email-address'),
				}),
			supportEmail: z
				.string()
				.trim()
				.max(320)
				.refine((value) => !value || isValidEmailAddress(value), {
					message: t('invalid-email-address'),
				}),
			defaultLocale: z.string().trim(),
			timezone: z.string().trim(),
			notes: z.string().trim().max(4000),
		})
		.superRefine((values, context) => {
			const totalCount =
				values.owners.length +
				values.manualMembers.length +
				getParsedMembersCount();
			if (totalCount > values.maxUsers) {
				context.addIssue({
					code: 'custom',
					path: ['owners'],
					message: t('max-users-reached'),
				});
			}

			const emails = [
				...values.owners.map((owner) => owner.email.toLowerCase()),
				...values.manualMembers.map((member) => member.email.toLowerCase()),
			];
			if (new Set(emails).size !== emails.length) {
				context.addIssue({
					code: 'custom',
					path: ['owners'],
					message: t('each-user-must-have-a-unique-email'),
				});
			}
		});

const getUserLevel = (value: string | undefined): NewTenantAccountLevel =>
	value === ACCOUNT_LEVEL_ENUM.USER
		? ACCOUNT_LEVEL_ENUM.USER
		: ACCOUNT_LEVEL_ENUM.ADMIN;

/** Compact select styled as the honesty-override "Admin → amber, User →
 * neutral" chip (reuses the same tone classes as the Users-tab role chip). */
const MemberLevelSelect = ({
	name,
	value,
	onChange,
	onBlur,
	disabled,
	ariaLabel,
	t,
}: {
	name: string;
	value: NewTenantAccountLevel;
	onChange: (value: NewTenantAccountLevel) => void;
	onBlur: () => void;
	disabled?: boolean;
	ariaLabel: string;
	t: (key: string) => string;
}) => (
	<Select
		id={name}
		aria-label={ariaLabel}
		value={value}
		onValueChange={(nextValue) => {
			if (typeof nextValue === 'string') {
				onChange(getUserLevel(nextValue));
			}
		}}
		disabled={disabled}
	>
		<SelectTrigger
			onBlur={onBlur}
			size="sm"
			className={cn(
				'w-full justify-center gap-1 border px-2 text-[11px] font-medium shadow-none',
				value === ACCOUNT_LEVEL_ENUM.ADMIN
					? 'border-(--publy-chip-pending-border) bg-(--publy-chip-pending-bg) text-(--publy-chip-pending-text)'
					: 'border-border bg-background text-foreground',
			)}
		>
			<span data-slot="select-value">
				{value === ACCOUNT_LEVEL_ENUM.ADMIN ? t('admin') : t('user')}
			</span>
		</SelectTrigger>
		<SelectContent>
			{USER_ROLE_OPTIONS.map((option) => (
				<SelectItem key={option} value={option}>
					{option === ACCOUNT_LEVEL_ENUM.ADMIN ? t('admin') : t('user')}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
);

const ChecklistRow = ({
	checked,
	tone = 'default',
	children,
	testId,
}: {
	checked: boolean;
	tone?: 'default' | 'warning';
	children: ReactNode;
	testId: string;
}) => (
	<li
		className="flex items-start gap-2 text-xs"
		data-testid={testId}
		data-checked={checked}
	>
		{checked ? (
			<IconCircleCheckFilled
				aria-hidden="true"
				className="mt-px size-3.5 shrink-0 text-(--publy-success)"
			/>
		) : (
			<IconCircle
				aria-hidden="true"
				className={cn(
					'mt-px size-3.5 shrink-0',
					tone === 'warning'
						? 'text-(--publy-danger)'
						: 'text-muted-foreground',
				)}
			/>
		)}
		<span
			className={tone === 'warning' && !checked ? 'text-(--publy-danger)' : ''}
		>
			{children}
		</span>
	</li>
);

/** Workspace slug field: a muted `publyapp.com/` prefix + mono slug input
 * inside a single bordered container, matching the design's path-segment
 * treatment. Optional — an empty value lets the server generate a code. */
const SlugField = ({
	isDisabled,
	label,
	hint,
	t,
}: {
	isDisabled?: boolean;
	label: string;
	hint: string;
	t: (key: string) => string;
}) => {
	const fieldId = 'tenant-create-code';
	const helperId = `${fieldId}-helper`;

	return (
		<Controller
			name="code"
			render={({ field, fieldState: { error } }) => (
				<div className="space-y-1.5">
					<label
						htmlFor={fieldId}
						className="flex items-center gap-2 text-[13px] leading-none font-medium"
					>
						{label}
					</label>
					<div
						className={cn(
							'flex h-9 items-center gap-0 rounded-[var(--publy-radius-input)] border border-border bg-input/35 px-3.5 shadow-[var(--publy-shadow-input)]',
							error && 'border-destructive',
						)}
					>
						<span className="shrink-0 font-mono text-[13px] text-muted-foreground">
							publyapp.com/
						</span>
						<input
							id={fieldId}
							aria-label={label}
							aria-invalid={Boolean(error) || undefined}
							aria-describedby={helperId}
							className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-muted-foreground"
							value={field.value}
							onChange={(event) => {
								field.onChange(event.target.value);
							}}
							onBlur={field.onBlur}
							disabled={isDisabled}
							autoComplete="off"
							placeholder={t('assigned-after-creation')}
						/>
					</div>
					<p
						id={helperId}
						data-slot={error ? 'field-error' : 'field-helper'}
						className={error ? 'publy-field-error' : 'publy-field-helper'}
					>
						{error?.message ?? hint}
					</p>
				</div>
			)}
		/>
	);
};

const downloadTemplateCsv = () => {
	const blob = new Blob([buildTenantMemberCsvTemplate()], {
		type: 'text/csv;charset=utf-8',
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'tenant-members-template.csv';
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
};

export const Route = createFileRoute('/_authed-layout/staff/tenants/new')({
	component: StaffTenantCreateRoute,
});

function StaffTenantCreateRoute() {
	const navigate = Route.useNavigate();
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');
	const [pendingCreateValues, setPendingCreateValues] =
		useState<TenantCreateFormValues | null>(null);
	const [parsedFile, setParsedFile] = useState<{
		fileName: string;
		rows: ReturnType<typeof parseCsv>;
	} | null>(null);
	const [importError, setImportError] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);
	const createTenant = useCreateStaffTenantMutation();

	// Always-fresh ref so the memoized resolver's max-seats check can see the
	// latest CSV/Excel import count without rebuilding on every parse.
	const parsedMembersCountRef = useRef(0);

	const resolver = useMemo(
		() =>
			zodResolver(
				buildCreateTenantSchema(t, () => parsedMembersCountRef.current),
			),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on language change so messages stay localized
		[i18n.language],
	);

	const methods = useForm<TenantCreateFormValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});
	const {
		control,
		formState: { isSubmitting, errors },
	} = methods;
	const isFormLocked = isSubmitting || createTenant.isPending;
	const name = useWatch({ control, name: 'name' }) ?? '';
	const code = useWatch({ control, name: 'code' }) ?? '';
	const maxUsers = useWatch({ control, name: 'maxUsers' }) ?? 0;
	const owners = useWatch({ control, name: 'owners' }) ?? DEFAULT_VALUES.owners;
	const manualMembers =
		useWatch({ control, name: 'manualMembers' }) ??
		DEFAULT_VALUES.manualMembers;
	const seedDefaultProfile =
		useWatch({ control, name: 'seedDefaultProfile' }) ?? true;
	const websiteUrl = useWatch({ control, name: 'websiteUrl' }) ?? '';
	const logoUrl = useWatch({ control, name: 'logoUrl' }) ?? '';

	const localeOptions = useMemo(
		() => [
			{ value: '', label: t('not-set') },
			{ value: 'en', label: 'English' },
			{ value: 'fr', label: 'Français' },
		],
		[t],
	);

	const timezoneOptions = useMemo(() => {
		const zones =
			typeof Intl.supportedValuesOf === 'function'
				? Intl.supportedValuesOf('timeZone')
				: [];

		return [
			{ value: '', label: t('not-set') },
			...zones.map((zone) => ({ value: zone, label: zone })),
		];
	}, [t]);

	const {
		fields: ownerFields,
		append: appendOwner,
		remove: removeOwner,
	} = useFieldArray({ control, name: 'owners' });
	const {
		fields: manualMemberFields,
		append: appendManualMember,
		remove: removeManualMember,
	} = useFieldArray({ control, name: 'manualMembers' });

	const filledOwners = owners.filter((owner) => owner.email.trim().length > 0);
	const filledManualMembers = manualMembers.filter(
		(member) => member.email.trim().length > 0,
	);

	const existingEmails = useMemo(
		() => [
			...owners.map((owner) => owner.email),
			...manualMembers.map((member) => member.email),
		],
		[owners, manualMembers],
	);

	const parsedOutcome = useMemo(() => {
		if (!parsedFile) {
			return null;
		}

		return buildMemberImportOutcome({
			rows: parsedFile.rows,
			existingEmails,
		});
	}, [parsedFile, existingEmails]);

	const parsedValidMembers: ImportedMember[] = parsedOutcome?.valid ?? [];
	parsedMembersCountRef.current = parsedValidMembers.length;

	const ownersCount = filledOwners.length;
	const membersCount = filledManualMembers.length + parsedValidMembers.length;
	const totalFilled = ownersCount + membersCount;

	const slugPreview =
		code.trim().length > 0 ? code.trim() : slugifyTenantNamePlaceholder(name);
	const previewWebsiteHostname = getWebsiteHostname(websiteUrl);

	const ownersRootError = errors.owners as
		| { message?: string; root?: { message?: string } }
		| undefined;
	const ownersError =
		ownersRootError?.root?.message ?? ownersRootError?.message;

	const canAddOwner = ownerFields.length < Math.max(1, maxUsers);
	const canAddManualMember =
		ownerFields.length + manualMemberFields.length < Math.max(1, maxUsers);

	const handleFiles = async (fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) {
			return;
		}

		setImportError('');
		try {
			const isSpreadsheet = /\.xlsx?$/i.test(file.name);
			const rows = isSpreadsheet
				? await parseXlsxFile(file)
				: parseCsv(await file.text());
			setParsedFile({ fileName: file.name, rows });
		} catch {
			setImportError(t('import-file-parse-failed'));
		}
	};

	const performCreate = async (values: TenantCreateFormValues) => {
		setServerError('');

		const trimmedCode = values.code.trim();
		const initialUsers = mergeInitialUsers({
			owners: values.owners,
			parsedMembers: parsedValidMembers,
			manualMembers: values.manualMembers,
		});
		const optionalField = (value: string): string | undefined => {
			const trimmed = value.trim();
			return trimmed.length > 0 ? trimmed : undefined;
		};

		try {
			const result = await createTenant.mutateAsync({
				name: values.name.trim(),
				maxUsers: values.maxUsers,
				...(trimmedCode.length > 0 ? { code: trimmedCode } : {}),
				seedDefaultProfile: values.seedDefaultProfile,
				initialUsers,
				logoUrl: optionalField(values.logoUrl),
				legalName: optionalField(values.legalName),
				description: optionalField(values.description),
				websiteUrl: optionalField(values.websiteUrl),
				billingEmail: optionalField(values.billingEmail),
				supportEmail: optionalField(values.supportEmail),
				defaultLocale: optionalField(values.defaultLocale),
				timezone: optionalField(values.timezone),
				notes: optionalField(values.notes),
			});

			const tenantId = result?.id?.toString().trim();

			await queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANTS_QUERY_KEY],
			});
			setPendingCreateValues(null);

			if (tenantId) {
				void navigate({
					to: '/staff/tenants/$tenantId',
					params: {
						tenantId,
					},
				});

				return;
			}

			void navigate({
				to: '/staff/tenants',
			});
		} catch (error) {
			setPendingCreateValues(null);

			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			const failure = toApiFailure(error);
			if (
				failure.kind === 'validation' &&
				(failure.fieldErrors.code?.length ?? 0) > 0
			) {
				methods.setError('code', {
					type: 'server',
					message: getFailureMessage(failure, {
						fallback: t('tenant-create-failed'),
					}),
				});
				return;
			}

			setServerError(
				getFailureMessage(failure, {
					fallback: t('tenant-create-failed'),
				}),
			);
		}
	};

	const onSubmit = methods.handleSubmit((values) => {
		setPendingCreateValues(values);
	});

	const pendingOwnersCount = pendingCreateValues
		? pendingCreateValues.owners.filter(
				(owner) => owner.email.trim().length > 0,
			).length
		: 0;
	const pendingMembersCount = pendingCreateValues
		? pendingCreateValues.manualMembers.filter(
				(member) => member.email.trim().length > 0,
			).length + parsedValidMembers.length
		: 0;
	const pendingSlugDisplay =
		pendingCreateValues && pendingCreateValues.code.trim().length > 0
			? pendingCreateValues.code.trim()
			: t('assigned-after-creation');

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<FormPageLayout width={960} data-testid="staff-tenant-create-page">
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

			<Form methods={methods} onSubmit={onSubmit}>
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:gap-9">
					<div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
						<section className="flex flex-col gap-4">
							<p className="publy-type-eyebrow">{t('organization')}</p>
							<Field.Text
								name="name"
								label={t('organization-name')}
								placeholder="Acme Corporation"
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

						<section className="flex flex-col gap-4">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="publy-type-eyebrow">
									{t('organization-details')}
								</p>
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
												removeOwner(index);
											}}
											aria-label={t('remove-owner')}
										>
											<IconX aria-hidden="true" className="size-4" />
										</Button>
									</div>
								))}
							</div>

							{ownersError ? (
								<p className="publy-field-error">{ownersError}</p>
							) : null}

							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isFormLocked || !canAddOwner}
								onClick={() => {
									appendOwner({ email: '' });
								}}
								className="w-fit border-dashed border-(--publy-border-strong) bg-transparent"
							>
								<IconPlus aria-hidden="true" className="size-3.5" />
								{t('add-owner')}
							</Button>
						</section>

						<section className="flex flex-col gap-4">
							<p className="publy-type-eyebrow">
								{t('initial-members-optional')}
							</p>

							<div
								className="flex flex-col items-center gap-1.5 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-dashed border-(--publy-border-strong) bg-(--publy-surface-muted) px-4 py-6 text-center"
								data-testid="tenant-member-dropzone"
								onDragOver={(event) => {
									event.preventDefault();
								}}
								onDrop={(event) => {
									event.preventDefault();
									void handleFiles(event.dataTransfer.files);
								}}
							>
								<IconFileSpreadsheet
									aria-hidden="true"
									className="size-6 text-muted-foreground"
								/>
								<label
									htmlFor="tenant-member-file-input"
									className="cursor-pointer text-[13px] font-medium text-foreground"
								>
									{t('drag-csv-or-excel-file')}
								</label>
								<p className="publy-type-helper">
									{t('csv-excel-columns-hint')}
									{' · '}
									<a
										href="#download-template"
										onClick={(event) => {
											event.preventDefault();
											downloadTemplateCsv();
										}}
										className="underline"
									>
										{t('download-template')}
									</a>
								</p>
								<input
									ref={fileInputRef}
									id="tenant-member-file-input"
									type="file"
									accept=".csv,.xlsx,.xls"
									aria-label={t('drag-csv-or-excel-file')}
									className="sr-only"
									onChange={(event) => {
										void handleFiles(event.target.files);
										event.target.value = '';
									}}
								/>
							</div>

							{importError ? (
								<p className="publy-field-error">{importError}</p>
							) : null}

							{parsedFile && parsedOutcome ? (
								<div
									className="flex items-center justify-between gap-3 rounded-[var(--publy-radius-medium-control)] border border-(--publy-chip-active-border) bg-(--publy-chip-active-bg) px-3.5 py-2.5"
									data-testid="tenant-member-parsed-summary"
								>
									<div className="flex min-w-0 items-center gap-2">
										<IconFileCheck
											aria-hidden="true"
											className="size-4 shrink-0 text-(--publy-chip-active-text)"
										/>
										<div className="min-w-0 text-[13px]">
											<p className="truncate font-medium text-foreground">
												{parsedFile.fileName}
											</p>
											<p className="publy-type-helper">
												{t('parsed-file-summary', {
													detected: parsedOutcome.detectedCount,
													valid: parsedOutcome.valid.length,
												})}
											</p>
											{parsedOutcome.invalidCount > 0 ? (
												<p className="publy-type-helper text-(--publy-danger)">
													{t('parsed-file-invalid-rows', {
														count: parsedOutcome.invalidCount,
													})}
												</p>
											) : null}
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => {
											setParsedFile(null);
										}}
									>
										{t('remove')}
									</Button>
								</div>
							) : null}

							<div className="flex items-center gap-3">
								<span className="h-px flex-1 bg-(--publy-row-border)" />
								<span className="publy-type-helper shrink-0">
									{t('or-add-manually')}
								</span>
								<span className="h-px flex-1 bg-(--publy-row-border)" />
							</div>

							<div className="flex flex-col gap-3">
								{manualMemberFields.map((field, index) => (
									<div
										key={field.id}
										className="grid grid-cols-[1fr_96px_32px] items-center gap-2"
									>
										<Field.Email
											name={`manualMembers.${index}.email`}
											label={t('email')}
											placeholder="user@example.com"
											isDisabled={isFormLocked}
										/>
										<Controller
											control={control}
											name={`manualMembers.${index}.accountLevel`}
											render={({ field: levelField }) => (
												<MemberLevelSelect
													name={`manualMembers.${index}.accountLevel`}
													value={getUserLevel(levelField.value)}
													onChange={levelField.onChange}
													onBlur={levelField.onBlur}
													disabled={isFormLocked}
													ariaLabel={t('account-level')}
													t={t}
												/>
											)}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											disabled={isFormLocked}
											onClick={() => {
												removeManualMember(index);
											}}
											aria-label={t('remove-member')}
										>
											<IconX aria-hidden="true" className="size-4" />
										</Button>
									</div>
								))}
							</div>

							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isFormLocked || !canAddManualMember}
								onClick={() => {
									appendManualMember({
										email: '',
										accountLevel: ACCOUNT_LEVEL_ENUM.USER,
									});
								}}
								className="w-fit border-dashed border-(--publy-border-strong) bg-transparent"
							>
								<IconPlus aria-hidden="true" className="size-3.5" />
								{t('add-member')}
							</Button>
						</section>

						<section className="flex flex-col divide-y divide-(--publy-row-border)">
							<p className="publy-type-eyebrow pb-3">{t('setup')}</p>
							<Field.Switch
								name="seedDefaultProfile"
								label={t('seed-default-profiles')}
								isDisabled={isFormLocked}
							/>
							<div
								data-slot="field-switch-row"
								className="publy-field-switch-row"
							>
								<div className="flex min-w-0 flex-col gap-px">
									<span className="publy-field-switch-title">
										{t('require-sso')}
									</span>
									<span className="publy-field-switch-description">
										{t('require-sso-hint')}
									</span>
								</div>
								<Switch
									checked={false}
									disabled
									aria-label={t('require-sso')}
								/>
							</div>
						</section>
					</div>

					<aside className="order-1 lg:order-2">
						<Card
							className="gap-0 py-0 lg:sticky lg:top-5"
							data-testid="staff-tenant-create-preview"
						>
							<div className="publy-card-header">
								<span className="publy-type-eyebrow">{t('preview')}</span>
							</div>

							<div className="flex items-center gap-3 px-[18px] py-4">
								<BrandTile
									name={name || t('untitled-organization')}
									logoUrl={logoUrl.trim().length > 0 ? logoUrl.trim() : null}
									className="size-11 rounded-[12px] text-base"
								/>
								<div className="min-w-0">
									<p className="truncate text-[15px] font-semibold text-foreground">
										{name.trim().length > 0 ? name : t('untitled-organization')}
									</p>
									<p className="publy-tenant-identity-meta">
										<span className="publy-tenant-identity-meta-prefix">
											publyapp.com/
										</span>
										<span
											className={cn(
												'italic',
												slugPreview.length > 0 && 'not-italic',
											)}
										>
											{slugPreview.length > 0
												? slugPreview
												: t('assigned-after-creation')}
										</span>
									</p>
									{previewWebsiteHostname ? (
										<p className="truncate text-xs text-muted-foreground">
											{previewWebsiteHostname}
										</p>
									) : null}
								</div>
							</div>

							<div className="mx-[18px] h-px bg-(--publy-row-border)" />

							<div className="flex flex-col divide-y divide-(--publy-row-border) px-[18px]">
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('status')}</span>
									<StatusPill tone="success">{t('active')}</StatusPill>
								</div>
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('seats')}</span>
									<span
										className="font-medium text-foreground"
										data-testid="preview-seats"
									>
										{totalFilled} / {maxUsers}
									</span>
								</div>
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('owners')}</span>
									<span
										className="font-medium text-foreground"
										data-testid="preview-owners"
									>
										{ownersCount}
									</span>
								</div>
								<div className="flex items-center justify-between py-2.5 text-[13px]">
									<span className="text-muted-foreground">{t('members')}</span>
									<span
										className="font-medium text-foreground"
										data-testid="preview-members"
									>
										{membersCount}
									</span>
								</div>
							</div>

							<div className="mx-[18px] h-px bg-(--publy-row-border)" />

							<ul className="flex flex-col gap-2 px-[18px] py-4">
								<ChecklistRow
									checked={ownersCount > 0}
									testId="preview-checklist-owners"
								>
									{t('preview-owners-checklist', { count: ownersCount })}
								</ChecklistRow>
								<ChecklistRow
									checked={membersCount > 0}
									testId="preview-checklist-members"
								>
									{t('preview-members-checklist-detailed', {
										count: membersCount,
										csv: parsedValidMembers.length,
										manual: filledManualMembers.length,
									})}
								</ChecklistRow>
								<ChecklistRow
									checked={seedDefaultProfile}
									testId="preview-checklist-profile"
								>
									{t('preview-default-profile-checklist')}
								</ChecklistRow>
								<ChecklistRow checked={false} testId="preview-checklist-sso">
									{t('preview-sso-not-required')}
								</ChecklistRow>
							</ul>
						</Card>
					</aside>
				</div>

				{serverError ? (
					<p className="text-sm text-destructive">{serverError}</p>
				) : null}

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
						onClick={() => {
							void navigate({ to: '/staff/tenants' });
						}}
					>
						{t('cancel')}
					</Button>
					<Button type="submit" disabled={isFormLocked}>
						{t('create-tenant')}
					</Button>
				</FormActionBar>
			</Form>

			<ConfirmDialog
				isOpen={pendingCreateValues !== null}
				title={t('confirm-create-tenant-title')}
				description={t('confirm-create-tenant-description')}
				confirmLabel={t('create-tenant')}
				cancelLabel={t('cancel')}
				tone="primary"
				isPending={createTenant.isPending}
				onConfirm={() => {
					if (pendingCreateValues) {
						void performCreate(pendingCreateValues);
					}
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setPendingCreateValues(null);
					}
				}}
			>
				<div
					className="flex flex-col divide-y divide-(--publy-row-border) text-[13px]"
					data-testid="confirm-create-tenant-summary"
				>
					<div className="flex items-center justify-between py-2">
						<span className="text-muted-foreground">{t('organization')}</span>
						<span className="max-w-[220px] truncate font-medium text-foreground">
							{pendingCreateValues?.name}
						</span>
					</div>
					<div className="flex items-center justify-between py-2">
						<span className="text-muted-foreground">{t('workspace-slug')}</span>
						<span className="font-mono font-medium text-foreground">
							{pendingSlugDisplay}
						</span>
					</div>
					<div className="flex items-center justify-between py-2">
						<span className="text-muted-foreground">{t('seats')}</span>
						<span className="font-medium text-foreground">
							{pendingCreateValues?.maxUsers}
						</span>
					</div>
					<div className="flex items-center justify-between py-2">
						<span className="text-muted-foreground">{t('owners')}</span>
						<span
							className="font-medium text-foreground"
							data-testid="confirm-create-tenant-owners"
						>
							{pendingOwnersCount}
						</span>
					</div>
					<div className="flex items-center justify-between py-2">
						<span className="text-muted-foreground">
							{t('members-to-invite')}
						</span>
						<span
							className="font-medium text-foreground"
							data-testid="confirm-create-tenant-members"
						>
							{pendingMembersCount}
						</span>
					</div>
				</div>
			</ConfirmDialog>
		</FormPageLayout>
	);
}
