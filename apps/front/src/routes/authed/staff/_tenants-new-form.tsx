import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { FieldGroup, Form, FormPageLayout } from '~/components/field';

import { TenantCreateConfirmDialog } from './_tenants-new-confirm';
import { useTenantCreateFormState } from './_tenants-new-form-state';
import { TenantCreateMembersRow } from './_tenants-new-members-section';
import { TenantCreatePreviewCard } from './_tenants-new-preview';
import {
	TenantCreateActionBar,
	TenantCreateConfigGroup,
	TenantCreateDetailsFold,
	TenantCreateHeader,
	TenantCreateOrganizationGroup,
	TenantCreateOwnersRow,
	TenantCreateRootError,
} from './_tenants-new-sections';
import { UnsavedChangesDialog } from './_unsaved-changes-dialog';
import { slugifyTenantNamePlaceholder } from './tenants-new-helpers';

/**
 * `/staff/tenants/new`, in the prototype's « Essentiel » layout: the boxed
 * page (back link, title, description), the grouped rows on the left, the
 * live preview on the right, and the sticky action bar inside the form
 * column. The state lives in `useTenantCreateFormState`.
 */
export const TenantCreateForm = ({
	navigate,
}: {
	navigate: (options: {
		to: string;
		params?: Record<string, string>;
	}) => Promise<void>;
}) => {
	const form = useTenantCreateFormState(navigate);

	if (form.shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<FormPageLayout
			width={1080}
			className="gap-6"
			data-testid="staff-tenant-create-page"
		>
			<TenantCreateHeader t={form.t} />

			<Form
				methods={form.methods}
				onSubmit={form.onSubmit}
				slotProps={{
					form: {
						className:
							'space-y-0 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]',
					},
				}}
			>
				<div className="flex min-w-0 flex-col gap-6">
					<TenantCreateOrganizationGroup
						t={form.t}
						isFormLocked={form.isFormLocked}
						name={form.name}
						seatsValue={form.seats}
						customSeats={form.customSeats}
						onSeatsChange={form.setSeats}
						onCustomSeatsChange={form.setCustomSeats}
					/>

					<FieldGroup
						title={form.t('owners-and-members')}
						note={form.t('owners-and-members-note')}
					>
						<TenantCreateOwnersRow
							t={form.t}
							isFormLocked={form.isFormLocked}
							ownerFields={form.ownerFields}
							ownersError={
								form.ownersRootError?.root?.message ??
								form.ownersRootError?.message
							}
							canAddOwner={form.canAddSlot}
							onAddOwner={() => {
								form.appendOwner({ email: '' });
							}}
							onRemoveOwner={form.removeOwner}
						/>
						<TenantCreateMembersRow
							t={form.t}
							control={form.control}
							isFormLocked={form.isFormLocked}
							memberImport={form.memberImport}
							manualMemberFields={form.manualMemberFields}
							canAddManualMember={form.canAddSlot}
							onAddManualMember={() => {
								form.appendManualMember({
									email: '',
									accountLevel: form.accountLevelUser,
								});
							}}
							onRemoveManualMember={form.removeManualMember}
						/>
					</FieldGroup>

					<TenantCreateDetailsFold
						t={form.t}
						isFormLocked={form.isFormLocked}
						localeOptions={form.localeOptions}
						timezoneOptions={form.timezoneOptions}
						summary={form.detailsSummary}
					/>

					<TenantCreateConfigGroup
						t={form.t}
						isFormLocked={form.isFormLocked}
					/>

					{form.errors.root?.server?.message ? (
						<TenantCreateRootError message={form.errors.root.server.message} />
					) : null}

					<TenantCreateActionBar
						t={form.t}
						isFormLocked={form.isFormLocked}
						summary={form.creationSummary}
						onCancel={form.goToTenants}
					/>
				</div>

				<TenantCreatePreviewCard
					t={form.t}
					name={form.name}
					logoUrl={form.logoUrl}
					slugPreview={
						form.code.trim().length > 0
							? form.code.trim()
							: slugifyTenantNamePlaceholder(form.name)
					}
					websiteHostname={form.websiteHostname}
					maxUsers={form.maxUsers}
					counts={{
						ownersCount: form.ownersCount,
						membersCount: form.membersCount,
						totalFilled: form.ownersCount + form.membersCount,
						csvMembersCount: form.parsedValidMembers.length,
						manualMembersCount: form.filledManualMembers.length,
					}}
				/>
			</Form>

			<TenantCreateConfirmDialog
				t={form.t}
				values={form.pendingCreateValues}
				parsedMembersCount={form.parsedValidMembers.length}
				isPending={form.createTenant.isPending}
				onConfirm={() => {
					if (form.pendingCreateValues) {
						void form.performCreate(form.pendingCreateValues);
					}
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						form.setPendingCreateValues(null);
					}
				}}
			/>

			<UnsavedChangesDialog t={form.t} blocker={form.blocker} />
		</FormPageLayout>
	);
};
