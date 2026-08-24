import { useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Form, FormPageLayout } from '~/components/field';
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import { useCreateStaffTenantMutation } from '~/lib/query/staff-tenants';

import { ACCOUNT_LEVEL_ENUM } from '@org/shared-ts/lib/constants';

import {
	useTenantLocaleOptions,
	useTenantTimezoneOptions,
} from './_tenant-form-shared';
import { TenantCreateConfirmDialog } from './_tenants-new-confirm';
import { buildTenantCreateSubmitter } from './_tenants-new-create-action';
import { useTenantMemberImport } from './_tenants-new-import';
import { TenantCreateMembersSection } from './_tenants-new-members-section';
import { TenantCreatePreviewCard } from './_tenants-new-preview';
import { buildCreateTenantSchema } from './_tenants-new-schema';
import {
	TenantCreateActionBar,
	TenantCreateDetailsSection,
	TenantCreateHeader,
	TenantCreateOrganizationSection,
	TenantCreateOwnersSection,
	TenantCreateRootError,
	TenantCreateSetupSection,
} from './_tenants-new-sections';
import { filterFilledEmails } from './_tenants-new-submit';
import {
	DEFAULT_VALUES,
	type TenantCreateFormValues,
} from './_tenants-new-types';
import { UnsavedChangesDialog } from './_unsaved-changes-dialog';
import { slugifyTenantNamePlaceholder } from './tenants-new-helpers';
import { getWebsiteHostname } from './tenants/tenant-organization-profile-fields';

export const TenantCreateForm = ({
	navigate,
}: {
	navigate: (options: {
		to: string;
		params?: Record<string, string>;
	}) => Promise<void>;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [pendingCreateValues, setPendingCreateValues] =
		useState<TenantCreateFormValues | null>(null);
	const createTenant = useCreateStaffTenantMutation();
	const hasCreatedRef = useRef(false);

	// Always-fresh ref so the memoized resolver's max-seats check can see the
	// latest CSV import count without rebuilding on every parse.
	const parsedMembersCountRef = useRef(0);

	// Language-keyed resolver: rebuilds when translations change so error
	// messages stay localized; see use-language-keyed-zod-resolver. The
	// max-seats check stays live through the ref-getter closed over here.
	const resolver = useLanguageKeyedZodResolver<TenantCreateFormValues>(
		(schemaT) =>
			buildCreateTenantSchema(schemaT, () => parsedMembersCountRef.current),
		'common',
	);

	const methods = useForm<TenantCreateFormValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});
	const {
		control,
		formState: { isDirty, isSubmitting, errors },
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

	const localeOptions = useTenantLocaleOptions(t);
	const timezoneOptions = useTenantTimezoneOptions(t);

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

	const memberImport = useTenantMemberImport({ t, owners, manualMembers });
	const { parsedValidMembers } = memberImport;

	useEffect(() => {
		parsedMembersCountRef.current = parsedValidMembers.length;
	}, [parsedValidMembers.length]);

	// tenants-r6-F3: `isDirty` only tracks RHF-registered fields — the CSV
	// import populates `parsedFile`, state that lives OUTSIDE the form, so a
	// populated import with an otherwise-pristine form used to leave silently
	// through the blocker. `parsedFile !== null` closes that gap.
	const blocker = useBlocker({
		shouldBlockFn: () =>
			(isDirty || memberImport.parsedFile !== null) && !hasCreatedRef.current,
		withResolver: true,
	});

	const filledManualMembers = filterFilledEmails(manualMembers);
	const ownersCount = filterFilledEmails(owners).length;
	const membersCount = filledManualMembers.length + parsedValidMembers.length;
	// Owners, manual members and imported members all consume the same seats.
	const canAddSlot =
		ownerFields.length + manualMemberFields.length + parsedValidMembers.length <
		Math.max(1, maxUsers);

	const ownersRootError = errors.owners as
		| { message?: string; root?: { message?: string } }
		| undefined;

	const submitCreate = buildTenantCreateSubmitter({
		methods,
		t,
		queryClient,
		mutateAsync: createTenant.mutateAsync,
		parsedMembers: parsedValidMembers,
	});

	const performCreate = async (values: TenantCreateFormValues) => {
		const outcome = await submitCreate(values);
		setPendingCreateValues(null);

		if (outcome.kind === 'logout') {
			setShouldLogout(true);
			return;
		}
		if (outcome.kind !== 'created') {
			return;
		}

		hasCreatedRef.current = true;
		void navigate(
			outcome.tenantId
				? {
						to: '/staff/tenants/$tenantId',
						params: { tenantId: outcome.tenantId },
					}
				: { to: '/staff/tenants' },
		);
	};

	const onSubmit = methods.handleSubmit((values) => {
		methods.clearErrors('root.server');
		setPendingCreateValues(values);
	});

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<FormPageLayout width={960} data-testid="staff-tenant-create-page">
			<TenantCreateHeader t={t} />

			<Form methods={methods} onSubmit={onSubmit}>
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:gap-9">
					<div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
						<TenantCreateOrganizationSection
							t={t}
							isFormLocked={isFormLocked}
							name={name}
						/>
						<TenantCreateDetailsSection
							t={t}
							isFormLocked={isFormLocked}
							localeOptions={localeOptions}
							timezoneOptions={timezoneOptions}
						/>
						<TenantCreateOwnersSection
							t={t}
							isFormLocked={isFormLocked}
							ownerFields={ownerFields}
							ownersError={
								ownersRootError?.root?.message ?? ownersRootError?.message
							}
							canAddOwner={canAddSlot}
							onAddOwner={() => {
								appendOwner({ email: '' });
							}}
							onRemoveOwner={removeOwner}
						/>
						<TenantCreateMembersSection
							t={t}
							control={control}
							isFormLocked={isFormLocked}
							memberImport={memberImport}
							manualMemberFields={manualMemberFields}
							canAddManualMember={canAddSlot}
							onAddManualMember={() => {
								appendManualMember({
									email: '',
									accountLevel: ACCOUNT_LEVEL_ENUM.USER,
								});
							}}
							onRemoveManualMember={removeManualMember}
						/>
						<TenantCreateSetupSection
							t={t}
							isFormLocked={isFormLocked}
							seedDefaultProfileError={errors.seedDefaultProfile?.message}
						/>
					</div>

					<TenantCreatePreviewCard
						t={t}
						name={name}
						logoUrl={logoUrl}
						slugPreview={
							code.trim().length > 0
								? code.trim()
								: slugifyTenantNamePlaceholder(name)
						}
						websiteHostname={getWebsiteHostname(websiteUrl)}
						maxUsers={maxUsers}
						seedDefaultProfile={seedDefaultProfile}
						counts={{
							ownersCount,
							membersCount,
							totalFilled: ownersCount + membersCount,
							csvMembersCount: parsedValidMembers.length,
							manualMembersCount: filledManualMembers.length,
						}}
					/>
				</div>

				{errors.root?.server?.message ? (
					<TenantCreateRootError message={errors.root.server.message} />
				) : null}

				<TenantCreateActionBar
					t={t}
					isFormLocked={isFormLocked}
					ownersCount={ownersCount}
					membersCount={membersCount}
					onCancel={() => {
						void navigate({ to: '/staff/tenants' });
					}}
				/>
			</Form>

			<TenantCreateConfirmDialog
				t={t}
				values={pendingCreateValues}
				parsedMembersCount={parsedValidMembers.length}
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
			/>

			<UnsavedChangesDialog t={t} blocker={blocker} />
		</FormPageLayout>
	);
};
